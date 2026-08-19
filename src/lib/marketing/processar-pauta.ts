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
import { inserirLinksInternos } from "./links";
import { sanitizarConteudoHtml } from "./sanitizar-html";
import {
  atualizarStatusPost,
  carregarChecklistAtivo,
  carregarPropriedade,
  contarPostsPublicadosDesde,
  criarPost,
  marcarPautaBloqueada,
  marcarPautaPublicada,
  registrarEtapa,
  registrarReprovacaoPauta,
} from "./repositorio";
import type { JanelaPublicacao } from "./tipos";

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

// Nome de variável de ambiente não aceita hífen, daí a troca por underscore. Cai pro par
// genérico WORDPRESS_USUARIO/WORDPRESS_SENHA_APP quando a propriedade ainda não tem credencial
// própria configurada (hoje só existe uma propriedade; o roadmap prevê um segundo site,
// vozdocredito.com.br, cuja senha não pode vazar pro host desta propriedade).
function credenciaisWordPressDaPropriedade(propriedadeId: string): CredenciaisWordPress {
  const sufixo = propriedadeId.replace(/-/g, "_");
  const usuario = process.env[`WORDPRESS_USUARIO_${sufixo}`];
  const senhaApp = process.env[`WORDPRESS_SENHA_APP_${sufixo}`];
  if (usuario && senhaApp) return { usuario, senhaApp };

  console.warn(
    `Propriedade ${propriedadeId} sem credencial WordPress própria (WORDPRESS_USUARIO_${sufixo}/WORDPRESS_SENHA_APP_${sufixo}); usando fallback genérico WORDPRESS_USUARIO/WORDPRESS_SENHA_APP.`,
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

    const { resultado: conteudo } = await registrarEtapa(
      pauta.id,
      "gerar_conteudo",
      () => gerarConteudo(pauta, checklist),
      (r) => ({ tokensEntrada: r.usage.inputTokens, tokensSaida: r.usage.outputTokens }),
    );

    // extrairDetalhes: uma reprovação por score baixo não lança exceção (é decisão de negócio, não
    // erro técnico — ver comentário na etapa "publicar" abaixo), então sem isto a linha de log
    // ficaria sucesso: true, detalhes: null, indistinguível de uma revisão realmente aprovada. Só
    // grava o motivo quando reprovado; aprovado devolve undefined (não escreve nada em detalhes).
    const { resultado: revisao } = await registrarEtapa(
      pauta.id,
      "revisar",
      () => revisarConteudo(conteudo, checklist),
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
        const adaptador = criarAdaptadorWordPress(propriedade.urlBase, credenciaisWordPressDaPropriedade(propriedadeId));
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
