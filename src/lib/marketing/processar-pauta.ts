// src/lib/marketing/processar-pauta.ts
// Processa uma tentativa completa (gerar → revisar → publicar) de uma pauta por matriz — ver
// docs/superpowers/specs/2026-08-17-pipeline-conteudo-marketing-design.md seção 3.1. Chamado uma
// vez por tick do cron (Task 9). Nada fica público até a publicação de verdade; reprovação em
// qualquer etapa volta a pauta pro status "pendente" (registrarReprovacaoPauta) — o próximo tick
// do cron re-seleciona a mesma pauta e tenta de novo, sem precisar de máquina de estados própria
// além do que já está no banco (status + tentativas).

import { selecionarPauta } from "./estrategista";
import { gerarConteudo } from "./escritor";
import { revisarConteudo } from "./revisor";
import { criarAdaptadorWordPress, type CredenciaisWordPress } from "./canais/wordpress";
import { decifrar } from "./criptografia";
import { inserirLinksInternos } from "./links";
import { sanitizarConteudoHtml } from "./sanitizar-html";
import {
  atualizarStatusPost,
  carregarChecklistAtivo,
  carregarPersona,
  carregarPropriedade,
  contarPostsPublicadosDesde,
  criarPost,
  marcarPautaBloqueada,
  marcarPautaPublicada,
  registrarEtapa,
  registrarReprovacaoPauta,
  salvarRascunho,
} from "./repositorio";
import type { JanelaPublicacao, PropriedadeCarregada } from "./tipos";

const FUSO_SAO_PAULO = "America/Sao_Paulo";

/**
 * Data/hora atual convertida pro fuso de Brasília, via Intl.DateTimeFormat (sem lib nova) — ver
 * spec seção 5, "Nota de fuso horário". Decisão: `janela_publicacao` é sempre configurada em
 * horário de Brasília, independente do fuso em que o servidor roda (Vercel roda em UTC por
 * padrão) — sem esta conversão, a comparação de horário usaria o fuso do servidor e o gating
 * ficaria incorreto sempre que os dois fusos divergissem. `hourCycle: "h23"` evita o "24:00" que
 * `hour12: false` produz pra meia-noite em algumas builds de ICU.
 */
function obterMomentoSaoPaulo(agora: Date): { horaMinuto: string; diaISO: string } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_SAO_PAULO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);

  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? "";
  return {
    diaISO: `${valor("year")}-${valor("month")}-${valor("day")}`,
    horaMinuto: `${valor("hour")}:${valor("minute")}`,
  };
}

/** Sem janela configurada = sem restrição de horário (comportamento da Fase 1). */
export function dentroDaJanela(janela: JanelaPublicacao | undefined, agora: Date = new Date()): boolean {
  if (!janela) return true;
  const { horaMinuto } = obterMomentoSaoPaulo(agora);
  return horaMinuto >= janela.inicio && horaMinuto <= janela.fim;
}

/**
 * Sem limite configurado = sem cota (comportamento da Fase 1). "Hoje" é o dia civil em horário de
 * Brasília (mesmo fuso da janela, por consistência) — Brasília não observa horário de verão desde
 * 2019, então o offset -03:00 é fixo e seguro de embutir aqui sem lib de fuso horário nova.
 */
export async function cotaDiariaAtingida(propriedadeId: string, limite: number | undefined, agora: Date = new Date()): Promise<boolean> {
  if (!limite) return false;
  const { diaISO } = obterMomentoSaoPaulo(agora);
  const totalPublicadoHoje = await contarPostsPublicadosDesde(propriedadeId, `${diaISO}T00:00:00-03:00`);
  return totalPublicadoHoje >= limite;
}

// Ordem: banco cifrado primeiro (propriedades_digitais.credenciais_canais, tela Propriedades
// Digitais — Fase 2), senão env var própria da propriedade, senão o par genérico
// WORDPRESS_USUARIO/WORDPRESS_SENHA_APP (comportamento original da Fase 1, mantido como último
// fallback pra não quebrar propriedade nenhuma configurada só por env). Nome de variável de
// ambiente não aceita hífen, daí a troca por underscore no nome da env própria.
export function credenciaisWordPressDaPropriedade(propriedade: PropriedadeCarregada): CredenciaisWordPress {
  // `usuario` checado explicitamente (não só a existência do objeto): a tela de Propriedades
  // Digitais permite salvar só a senha sem usuário preenchido (campo write-only, ver
  // salvarCredencialCanal) — sem esta checagem, esse caso silenciosamente publicaria com usuário
  // vazio e a senha real, pulando os dois fallbacks e o console.warn (achado da revisão desta
  // mesma correção).
  const credencialBanco = propriedade.credenciaisCanais?.wordpress;
  if (credencialBanco?.usuario && credencialBanco.senhaCifrada) {
    return { usuario: credencialBanco.usuario, senhaApp: decifrar(credencialBanco.senhaCifrada) };
  }

  const sufixo = propriedade.id.replace(/-/g, "_");
  const usuario = process.env[`WORDPRESS_USUARIO_${sufixo}`];
  const senhaApp = process.env[`WORDPRESS_SENHA_APP_${sufixo}`];
  if (usuario && senhaApp) return { usuario, senhaApp };

  console.warn(
    `Propriedade ${propriedade.id} sem credencial WordPress no banco nem em env própria (WORDPRESS_USUARIO_${sufixo}/WORDPRESS_SENHA_APP_${sufixo}); usando fallback genérico WORDPRESS_USUARIO/WORDPRESS_SENHA_APP.`,
  );
  return {
    usuario: process.env.WORDPRESS_USUARIO ?? "",
    senhaApp: process.env.WORDPRESS_SENHA_APP ?? "",
  };
}

export async function processarProximaPauta(matrizConteudoId: string, propriedadeId: string) {
  const propriedade = await carregarPropriedade(propriedadeId);

  // Gating de cota/janela (spec seção 5) — roda ANTES de selecionarPauta: se a propriedade está
  // fora do horário permitido ou já publicou a cota do dia, o tick inteiro é pulado sem tocar em
  // nenhuma pauta (nem seleção, nem incremento de tentativas). Curto-circuita a checagem de janela
  // (síncrona) antes da de cota (bate no banco) por ser mais barata.
  if (!dentroDaJanela(propriedade.janelaPublicacao) || (await cotaDiariaAtingida(propriedadeId, propriedade.postsPorDia))) {
    return { status: "fora_da_janela" as const };
  }

  const pauta = await selecionarPauta(matrizConteudoId, propriedade.id);
  if (!pauta) return { status: "sem_pauta" as const };

  if (pauta.tentativas >= propriedade.maxTentativas) {
    await marcarPautaBloqueada(pauta.id, pauta.motivoUltimaReprovacao ?? "Limite de tentativas esgotado.");
    return { status: "bloqueada" as const, pautaId: pauta.id };
  }

  try {
    // Cada etapa é envolvida por registrarEtapa (Task 3) — grava início/fim/sucesso em
    // pautas_execucao_log, alimentando o Monitor de execução e o Painel de Custo (spec seção 6).
    // Etapas gerar_conteudo/revisar passam um extrator de tokens porque Escritor/Revisor retornam
    // `usage` junto do resultado de negócio (mudança desta mesma task).
    const checklist = await registrarEtapa(pauta.id, "buscar_checklist", () => carregarChecklistAtivo(propriedadeId));

    // Fase 3 (personas ricas), Task 5, spec seção 7 — pauta.personaId só existe quando a pauta
    // nasceu do terceiro caminho do Estrategista (persona sorteada, Task 4); pautas antigas/
    // manuais (pendente/reclaim) têm personaId null e não pagam o custo de uma query extra aqui —
    // sem carregarPersona nesse caso, `persona` fica null e o Escritor mantém o prompt de antes
    // desta task (ver escritor.ts).
    const persona = pauta.personaId ? await carregarPersona(pauta.personaId) : null;

    const { resultado: conteudo } = await registrarEtapa(
      pauta.id,
      "gerar_conteudo",
      () => gerarConteudo(pauta, checklist, persona),
      (r) => ({ tokensEntrada: r.usage.inputTokens, tokensSaida: r.usage.outputTokens }),
    );

    // Salva o rascunho ANTES de saber se o Revisor vai aprovar (achado do teste real de ponta a
    // ponta, 19/08/2026) — se reprovar, a próxima tentativa desta pauta encontra o texto aqui
    // (pauta.ultimoRascunho) e revisa em vez de reescrever do zero (ver montarPrompt, escritor.ts).
    // Fora do registrarEtapa de cima de propósito: não é parte do custo/tempo da geração em si.
    await salvarRascunho(pauta.id, conteudo);

    // extrairDetalhes: uma reprovação por score baixo não lança exceção (é decisão de negócio, não
    // erro técnico — ver comentário na etapa "publicar" abaixo), então sem isto a linha de log
    // ficaria sucesso: true, detalhes: null, indistinguível de uma revisão realmente aprovada. Só
    // grava o motivo quando reprovado; aprovado devolve undefined (não escreve nada em detalhes).
    // postsRecentes (títulos+ângulos dos últimos ~10 posts publicados desta propriedade, pro
    // Revisor julgar originalidade_adequada — spec Fase 4a, seção 3.1) ainda não tem uma função de
    // repositório própria: `listarPostsPublicados` (repositorio.ts) devolve `PostAdmin[]`, que não
    // carrega `angulo` (esse campo vive em `pautas`, não em `posts` — exigiria um join que ainda
    // não existe). Construir esse join é trabalho da Task 3, não desta. Até lá, `[]` é seguro: com
    // a lista vazia o prompt do Revisor simplesmente não tem posts anteriores pra comparar, e
    // `checarOriginalidade` (default true) segue avaliando o que o modelo devolver normalmente —
    // não bloqueia nem quebra a Task 2.
    // TODO(Task 3): substituir por posts publicados reais desta propriedade (titulo + angulo).
    const postsRecentes: { titulo: string; angulo: string }[] = [];

    const { resultado: revisao } = await registrarEtapa(
      pauta.id,
      "revisar",
      () => revisarConteudo(conteudo, checklist, propriedade, postsRecentes),
      (r) => ({ tokensEntrada: r.usage.inputTokens, tokensSaida: r.usage.outputTokens }),
      (r) => (r.resultado.aprovado ? undefined : (r.resultado.motivo ?? undefined)),
    );

    if (!revisao.aprovado) {
      await registrarReprovacaoPauta(pauta.id, revisao.motivo ?? "Reprovado sem motivo detalhado.");
      return { status: "reprovado" as const, pautaId: pauta.id };
    }

    const post = await criarPost({ pautaId: pauta.id, propriedadeId, conteudo, scoreQa: revisao.score });
    // Links (item 7) roda só depois da revisão aprovar — não faz sentido gastar um ciclo de
    // revisão validando um HTML que ainda vai ganhar uma seção nova — e antes da sanitização
    // (item 5) e da publicação, pra sanitizar o HTML final que de fato vai pro ar.
    const conteudoComLinks = await registrarEtapa(pauta.id, "inserir_links", () =>
      inserirLinksInternos(conteudo.conteudoHtml, propriedadeId, post.id),
    );
    const corpoHtmlSanitizado = await registrarEtapa(pauta.id, "sanitizar", async () => sanitizarConteudoHtml(conteudoComLinks));

    // Etapa "publicar" envolve criar rascunho + verificar + aprovar/publicar como uma unidade só.
    // Decisão desta task: uma rejeição de negócio (verificacao.ok === false) não é uma exceção
    // técnica — não lança, só retorna um resultado discriminado (mesma escolha de design aplicada
    // à etapa "revisar" logo acima, ambas instrumentadas pela primeira vez nesta mesma task — não
    // é um padrão pré-existente sendo seguido, é uma decisão nova replicada nas duas). sucesso do
    // log reflete exceções de verdade (erro de rede/API do WordPress); extrairDetalhes abaixo grava
    // o motivo da rejeição de negócio na mesma coluna, senão a linha ficaria sucesso: true,
    // detalhes: null — indistinguível de uma publicação real pra quem lê o log.
    const resultadoPublicacao = await registrarEtapa(
      pauta.id,
      "publicar",
      async () => {
        const adaptador = criarAdaptadorWordPress(propriedade.urlBase, credenciaisWordPressDaPropriedade(propriedade));
        const rascunho = await adaptador.criarRascunho({
          titulo: conteudo.titulo,
          corpoHtml: corpoHtmlSanitizado,
          slug: conteudo.slug,
          metaTitle: conteudo.metaTitle,
          metaDescription: conteudo.metaDescription,
        });

        const verificacao = await adaptador.verificarRascunho(rascunho.idRemoto);
        if (!verificacao.ok) {
          return { sucesso: false as const, detalhes: verificacao.detalhes ?? "Rascunho não conforme no WordPress." };
        }

        const publicado = await adaptador.aprovarPublicar(rascunho.idRemoto);
        return { sucesso: true as const, rascunho, publicado };
      },
      undefined,
      (r) => (r.sucesso ? undefined : r.detalhes),
    );

    if (!resultadoPublicacao.sucesso) {
      await atualizarStatusPost(post.id, "falhou");
      await registrarReprovacaoPauta(pauta.id, resultadoPublicacao.detalhes);
      return { status: "reprovado" as const, pautaId: pauta.id };
    }

    const { rascunho, publicado } = resultadoPublicacao;

    // A partir daqui o post JÁ ESTÁ no ar no WordPress — nada aqui pode cair no catch externo/
    // registrarReprovacaoPauta: isso devolveria a pauta pra fila e geraria um segundo artigo
    // publicado no próximo ciclo (duplicidade real, ruim pra SEO). Por isso os dois passos abaixo
    // (marcarPautaPublicada/atualizarStatusPost) engolem suas próprias exceções por dentro do
    // fn() de registrarEtapa — nenhuma delas pode repropagar e ser tratada como reprovação.
    await registrarEtapa(pauta.id, "registrar_resultado", async () => {
      // marcarPautaPublicada roda sozinha e primeiro porque é o que efetivamente tira a pauta do
      // pool de reclaim (reclaim só seleciona status em_producao, ver repositorio.ts) — se ela
      // falhar e a pauta ficar em em_producao, o próprio reclaim (item 3) a re-selecionaria e
      // republicaria dali a 10 minutos, recriando exatamente a duplicidade que este bloco existe
      // pra evitar. Por isso, se falhar, forçamos "bloqueada" (exige revisão humana) em vez de
      // deixar a pauta recuperável via reclaim.
      try {
        await marcarPautaPublicada(pauta.id);
      } catch (erroMarcarPublicada) {
        console.error(
          `Pauta ${pauta.id} publicada em ${publicado.urlPublicada}, mas falhou ao marcar como publicada localmente — bloqueando para revisão manual:`,
          erroMarcarPublicada,
        );
        try {
          await marcarPautaBloqueada(
            pauta.id,
            `Publicado em ${publicado.urlPublicada} mas falhou ao registrar localmente — verificar manualmente.`,
          );
        } catch (erroBloqueio) {
          console.error(`Pauta ${pauta.id}: falha adicional ao tentar bloquear para revisão manual:`, erroBloqueio);
        }
        return;
      }

      // Metadados do post local (canais/publicado_em/HTML final) são secundários — a pauta já está
      // marcada como publicada acima, então uma falha aqui não reabre risco de duplicidade. Só logamos.
      try {
        await atualizarStatusPost(post.id, "publicado", {
          canais: { wordpress: { rascunho_id: rascunho.idRemoto, status: "publicado", url: publicado.urlPublicada } },
          publicadoEm: new Date().toISOString(),
          conteudoHtml: corpoHtmlSanitizado,
        });
      } catch (erroAtualizarPost) {
        console.error(
          `Pauta ${pauta.id} publicada em ${publicado.urlPublicada}, mas falhou ao atualizar o post local:`,
          erroAtualizarPost,
        );
      }
    });

    return { status: "publicado" as const, url: publicado.urlPublicada };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "Erro inesperado ao processar a pauta.";
    await registrarReprovacaoPauta(pauta.id, motivo);
    return { status: "reprovado" as const, pautaId: pauta.id };
  }
}
