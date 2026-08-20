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
import { enviarImagemStorage } from "./imagens/armazenamento";
import { gerarCapa } from "./imagens/capa";
import { gerarImagensSecundarias, type ImagemSecundaria } from "./imagens/secundarias";
import { inserirLinksInternos } from "./links";
import { extrairLinksExternos, verificarLinksExternos } from "./links-externos";
import { montarSchemaArticle, montarSchemaOrganization } from "./schema-estruturado";
import { sanitizarConteudoHtml } from "./sanitizar-html";
import {
  atualizarStatusPost,
  carregarChecklistAtivo,
  carregarImagensPostAnterior,
  carregarPersona,
  carregarPostProntoParaPublicar,
  carregarPostsRecentes,
  carregarPropriedade,
  contarPostsPublicadosDesde,
  criarPost,
  marcarPautaBloqueada,
  marcarPautaPublicada,
  registrarEtapa,
  registrarReprovacaoPauta,
  salvarRascunho,
  type ImagensExistentesPost,
} from "./repositorio";
import type { ConteudoGerado, JanelaPublicacao, PautaCarregada, PersonaCarregada, PropriedadeCarregada, UsageTokens } from "./tipos";

const FUSO_SAO_PAULO = "America/Sao_Paulo";

/** Quantos posts recentes (título + ângulo) o Revisor vê pra julgar originalidade_adequada — spec
 * Fase 4a seção 3.1, "últimos ~10 posts publicados". Ver carregarPostsRecentes em repositorio.ts. */
const LIMITE_POSTS_RECENTES = 10;

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

// ---------------------------------------------------------------------------
// Geração + upload de imagens (Task 10, Fase 4a+4b, 19/08/2026) — conecta capa.ts (Task 7),
// secundarias.ts (Task 8) e wordpress.ts/enviarMidia (Task 9) na sequência real do pipeline. Roda
// depois de "sanitizar" e antes de "publicar" (spec seção 4.7): só com o HTML final fechado é que
// faz sentido gerar imagens sobre ele. Sequência corrigida em relação à ordem literal do brief
// ("sanitizar → gerarCapa → gerarImagensSecundarias → montarSchemaArticle → enviarMidia →
// criarRascunho"): montarSchemaArticle só pode rodar DEPOIS de enviarMidia, porque o campo `image`
// do schema precisa de uma URL pública de verdade — gerarCapa/gerarImagensSecundarias devolvem
// data URLs (base64) da OpenAI, inúteis pra um crawler dentro de um JSON-LD.
// ---------------------------------------------------------------------------

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Erro desconhecido.";
}

// Mesmo princípio de escaparHtml em links.ts (repetido aqui, não extraído: links.ts escapa texto
// dentro de <li>/<a>, este escapa dentro de atributo `alt`/`figcaption` — mesmo conjunto de
// caracteres perigosos, contextos de uso diferentes o bastante pra não forçar um util
// cross-arquivo por 5 linhas).
function escaparAtributoHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function somarUsageTokens(a: UsageTokens, b: UsageTokens): UsageTokens {
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens };
}

/**
 * Heurística de inserção das imagens secundárias no HTML (subtlety #2 do brief da Task 10 — nem a
 * spec nem nenhum código existente definem um mecanismo pra isso; `posicaoAposSecao` é texto livre
 * gerado pelo Claude na Etapa 1 de secundarias.ts, ex.: "depois da seção que explica os documentos
 * necessários", não uma posição de DOM precisa).
 *
 * Estratégia escolhida: casa `posicaoAposSecao` contra o texto de cada `<h2>` do HTML por
 * sobreposição de palavras significativas (>=4 letras, sem acento/pontuação/HTML) — a seção cujo
 * título tem mais palavras em comum "ganha", e a imagem entra no FIM daquela seção (imediatamente
 * antes do próximo `<h2>`, ou no fim do documento se for a última seção — não logo após a
 * abertura do heading, que inseriria a imagem antes do próprio parágrafo introdutório da seção).
 *
 * Fallback documentado: sem nenhuma palavra em comum com nenhum `<h2>` (post sem H2, ou
 * `posicaoAposSecao` genérico demais pra casar), a imagem é anexada ao final do corpo do artigo —
 * resultado aceitável e não uma falha: a imagem não é perdida, só não fica na seção mais precisa.
 * Nunca lança.
 */
function normalizarTexto(texto: string): string {
  return texto
    .replace(/<[^>]+>/g, " ")
    .normalize("NFD")
    // Remove marcas diacríticas combinantes (acentos) depois do normalize("NFD") — intervalo
    // Unicode U+0300-U+036F ("Combining Diacritical Marks"), escrito como escape pra não depender
    // de caracteres não-imprimíveis literais no arquivo-fonte.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");
}

function palavrasSignificativas(textoNormalizado: string): string[] {
  return textoNormalizado.split(/\s+/).filter((palavra) => palavra.length >= 4);
}

type SecaoHtml = { fim: number; palavras: string[] };

function extrairSecoesH2(html: string): SecaoHtml[] {
  const regexH2 = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  const posicoes: { titulo: string; inicioTag: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regexH2.exec(html)) !== null) {
    posicoes.push({ titulo: match[1], inicioTag: match.index });
  }
  return posicoes.map((posicao, indice) => ({
    // Fim da seção = início da próxima tag <h2> (ou fim do documento, na última seção) — não o
    // fim da própria tag <h2> desta seção, que colocaria a imagem antes do parágrafo introdutório.
    fim: indice + 1 < posicoes.length ? posicoes[indice + 1].inicioTag : html.length,
    palavras: palavrasSignificativas(normalizarTexto(posicao.titulo)),
  }));
}

function encontrarPosicaoInsercao(html: string, posicaoSugerida: string): number | null {
  const secoes = extrairSecoesH2(html);
  const palavrasAlvo = new Set(palavrasSignificativas(normalizarTexto(posicaoSugerida)));
  if (secoes.length === 0 || palavrasAlvo.size === 0) return null;

  let melhorIndice = -1;
  let melhorPontuacao = 0;
  secoes.forEach((secao, indice) => {
    const pontuacao = secao.palavras.filter((palavra) => palavrasAlvo.has(palavra)).length;
    if (pontuacao > melhorPontuacao) {
      melhorPontuacao = pontuacao;
      melhorIndice = indice;
    }
  });

  return melhorIndice >= 0 ? secoes[melhorIndice].fim : null;
}

// Achado real de teste em produção (19/08/2026, pedido do Luiz): a capa só era enviada ao
// WordPress como `featured_media` (miniatura do post), nunca embutida no HTML do corpo — o tema
// do site não renderiza o featured_media dentro da página do post, então a capa não aparecia em
// lugar nenhum pro leitor. Embutida aqui como a PRIMEIRA tag do corpo (antes até do parágrafo de
// introdução) — como o corpo não tem mais <h1> próprio (ver Regra estrutural de título/H1 em
// escritor.ts), o resultado visual é: título (H1 automático do WordPress) → capa → introdução.
function construirFiguraCapa(url: string | null, alt: string): string {
  if (!url) return "";
  return `<figure><img src="${url}" alt="${escaparAtributoHtml(alt)}"></figure>\n`;
}

function inserirImagensSecundariasNoHtml(html: string, imagens: ImagemSecundaria[]): string {
  return imagens.reduce((htmlAtual, imagem) => {
    const figura = `\n<figure><img src="${imagem.url}" alt="${escaparAtributoHtml(imagem.alt)}"><figcaption>${escaparAtributoHtml(imagem.legenda)}</figcaption></figure>\n`;
    const posicao = encontrarPosicaoInsercao(htmlAtual, imagem.posicaoAposSecao);
    return posicao !== null ? `${htmlAtual.slice(0, posicao)}${figura}${htmlAtual.slice(posicao)}` : `${htmlAtual}${figura}`;
  }, html);
}

type ResultadoGeracaoImagens = {
  corpoHtmlFinal: string;
  capaMediaId: string | undefined;
  imagemDestaqueUrl: string | null;
  imagemDestaqueAlt: string | null;
  imagemDestaqueSlug: string | null;
  // Follow-up 19/08/2026 (pedido do Luiz): cópia arquivada no Supabase Storage, "possível uso
  // futuro" — estritamente aditiva, nunca lida por mais nada neste pipeline hoje. Independente de
  // imagemDestaqueUrl/Alt/Slug: aqueles 3 vêm do upload ao WORDPRESS, este vem de um upload ao
  // STORAGE separado (ver enviarImagemStorage), que só é tentado depois que o upload ao WordPress
  // já teve sucesso (ver gerarEEmbutirImagens abaixo) — mas o próprio upload ao Storage tem seu
  // try/catch independente, então pode ficar null mesmo quando a capa foi publicada com sucesso.
  imagemDestaqueStorageUrl: string | null;
  imagensSecundariasPersistir: ImagemSecundaria[];
  usage: UsageTokens;
  detalhesLog: string | undefined;
  // Custo real da OpenAI (19/08/2026, pedido do Luiz) — soma capa + secundárias, 0 quando as
  // imagens foram reaproveitadas de uma tentativa anterior (ver bloco `if (imagensExistentes)`
  // acima) ou quando nenhuma geração de imagem chegou a rodar. Alimenta o `custo_usd` da etapa
  // "gerar_imagens" via `extrairCustoAdicionalUsd` em registrarEtapa (repositorio.ts).
  custoUsdOpenAi: number;
};

/**
 * Sequência real desta task (corrigida em relação à ordem literal do brief, ver comentário de
 * cabeçalho da seção): gerarCapa + gerarImagensSecundarias (data URLs) → enviarMidia de cada uma
 * que teve sucesso (URL pública de verdade, cada upload com try/catch PRÓPRIO — uma falha de
 * upload não pode derrubar as outras imagens nem a publicação) → SÓ ENTÃO montarSchemaArticle
 * (precisa da URL pública da capa, não da data URL) + montarSchemaOrganization → embute
 * secundárias (heurística acima) + os dois blocos de schema no HTML sanitizado.
 *
 * Global Constraint (plano mestre): esta função NUNCA lança. `gerarCapa`/`gerarImagensSecundarias`
 * já não lançam por contrato próprio (Tasks 7/8); `enviarMidia` (Task 9) lança de propósito em
 * falha de rede/API, então cada chamada tem seu próprio try/catch; o try/catch externo cobre
 * qualquer falha inesperada fora desses pontos conhecidos (bug na montagem do schema, na inserção
 * no HTML) — degrada pro HTML sanitizado sem nenhuma imagem/schema, nunca propaga pro chamador.
 */
async function gerarEEmbutirImagens(
  pauta: PautaCarregada,
  conteudo: ConteudoGerado,
  persona: PersonaCarregada | null,
  propriedade: PropriedadeCarregada,
  corpoHtmlSanitizado: string,
  adaptador: ReturnType<typeof criarAdaptadorWordPress>,
  imagensExistentes: ImagensExistentesPost | null,
): Promise<ResultadoGeracaoImagens> {
  let usage: UsageTokens = { inputTokens: 0, outputTokens: 0 };
  const detalhes: string[] = [];

  // Reaproveitamento entre tentativas (19/08/2026, pedido do Luiz) — quando já existem imagens de
  // uma tentativa anterior desta pauta, reaproveita direto em vez de gerar (e pagar) tudo de novo:
  // uma correção cirúrgica de texto (ex.: trocar 1 link, ajustar o meta title) não muda o
  // tema/ângulo do post o suficiente pra invalidar a capa/secundárias já aprovadas. Só remonta o
  // schema + a inserção das secundárias no HTML NOVO (texto pode ter mudado), sem chamar
  // gerarCapa/gerarImagensSecundarias/enviarMidia de novo — zero custo de IA/upload aqui.
  if (imagensExistentes) {
    const agora = new Date();
    const schemaArticle = montarSchemaArticle(
      { titulo: conteudo.titulo, slug: conteudo.slug, urlBase: propriedade.urlBase, imagemDestaqueUrl: imagensExistentes.imagemDestaqueUrl },
      { autoria: propriedade.autoria, nome: propriedade.nome, urlBase: propriedade.urlBase },
      { publicadoEm: agora, atualizadoEm: agora },
    );
    const schemaOrganization = montarSchemaOrganization({ nome: propriedade.nome, urlBase: propriedade.urlBase });
    const htmlComSecundarias = inserirImagensSecundariasNoHtml(corpoHtmlSanitizado, imagensExistentes.imagensSecundarias);
    const capaEmbutida = construirFiguraCapa(imagensExistentes.imagemDestaqueUrl, imagensExistentes.imagemDestaqueAlt ?? conteudo.titulo);
    const corpoHtmlFinal = `${capaEmbutida}${htmlComSecundarias}\n${schemaArticle}\n${schemaOrganization}`;

    return {
      corpoHtmlFinal,
      capaMediaId: imagensExistentes.imagemDestaqueMediaId ?? undefined,
      imagemDestaqueUrl: imagensExistentes.imagemDestaqueUrl,
      imagemDestaqueAlt: imagensExistentes.imagemDestaqueAlt,
      imagemDestaqueSlug: imagensExistentes.imagemDestaqueSlug,
      imagemDestaqueStorageUrl: imagensExistentes.imagemDestaqueStorageUrl,
      imagensSecundariasPersistir: imagensExistentes.imagensSecundarias,
      usage,
      detalhesLog: "imagens reaproveitadas de uma tentativa anterior desta pauta (correção cirúrgica de texto, sem custo novo de geração)",
      custoUsdOpenAi: 0,
    };
  }

  let custoUsdOpenAi = 0;

  try {
    const capa = await gerarCapa(pauta, conteudo, persona);
    usage = somarUsageTokens(usage, capa.usage);
    custoUsdOpenAi += capa.custoUsdOpenAi;

    const secundarias = await gerarImagensSecundarias(conteudo);
    usage = somarUsageTokens(usage, secundarias.usage);
    custoUsdOpenAi += secundarias.custoUsdOpenAi;

    let capaMediaId: string | undefined;
    let capaUrlPublica: string | null = null;
    // Follow-up 19/08/2026 (arquivamento no Storage) — null até prova em contrário; só é preenchida
    // dentro do try/catch de upload ao WordPress, e só quando ele já teve sucesso (ver comentário
    // no cabeçalho de ResultadoGeracaoImagens).
    let capaStorageUrl: string | null = null;
    if (capa.resultado) {
      try {
        const midia = await adaptador.enviarMidia(capa.resultado.url, `${capa.resultado.slug}.png`, capa.resultado.alt);
        capaMediaId = midia.idRemoto;
        capaUrlPublica = midia.url;

        // Upload ao Storage — try/catch PRÓPRIO, separado do upload ao WordPress acima: uma falha
        // aqui é uma cópia de arquivo que não foi feita, nunca deve derrubar a capa que JÁ subiu
        // com sucesso ao WordPress (capaMediaId/capaUrlPublica já estão preenchidos nesta altura,
        // e continuam preenchidos independente do que acontecer daqui pra baixo). Fonte é a data
        // URL ORIGINAL da OpenAI (capa.resultado.url), não capaUrlPublica (que já é um link http,
        // não uma data URL — teria que baixar de novo por HTTP, desnecessário).
        try {
          const storage = await enviarImagemStorage(capa.resultado.url, `${propriedade.id}/${pauta.id}/capa-${capa.resultado.slug}.png`);
          capaStorageUrl = storage.url;
        } catch (erroStorage) {
          detalhes.push(`capa: upload ao Storage falhou (${mensagemErro(erroStorage)})`);
        }
      } catch (erro) {
        detalhes.push(`capa: upload ao WordPress falhou (${mensagemErro(erro)})`);
      }
    } else {
      detalhes.push("capa: geração não produziu resultado (reprovada ou falha de infra — degradação aceitável)");
    }

    const secundariasEmbutidas: ImagemSecundaria[] = [];
    for (let indice = 0; indice < secundarias.resultado.length; indice++) {
      const imagem = secundarias.resultado[indice];
      try {
        const midia = await adaptador.enviarMidia(imagem.url, `${imagem.slug}.png`, imagem.alt);

        // `let` DENTRO do corpo do loop (não fora, antes do `for`) — cada iteração ganha sua
        // própria variável; sem isso, uma URL de Storage de uma imagem vazaria pra outra candidata
        // no array final (a mesma armadilha de reusar `imagem` entre iterações, mas para esta
        // variável nova). Mesmo padrão de try/catch próprio e mesma fonte (data URL original, não
        // midia.url) da capa acima.
        let storageUrlSecundaria: string | null = null;
        try {
          const storage = await enviarImagemStorage(imagem.url, `${propriedade.id}/${pauta.id}/secundaria-${imagem.slug}.png`);
          storageUrlSecundaria = storage.url;
        } catch (erroStorage) {
          detalhes.push(`imagem secundária ${indice + 1} (${imagem.slug}): upload ao Storage falhou (${mensagemErro(erroStorage)})`);
        }

        secundariasEmbutidas.push({ ...imagem, url: midia.url, storageUrl: storageUrlSecundaria });
      } catch (erro) {
        detalhes.push(`imagem secundária ${indice + 1} (${imagem.slug}): upload ao WordPress falhou (${mensagemErro(erro)})`);
      }
    }
    if (secundarias.resultado.length === 0) {
      detalhes.push("secundárias: nenhuma oportunidade aprovada nesta geração (resultado válido/esperado, não é falha)");
    }

    // datePublished/dateModified: o instante real de publicação no WordPress só acontece depois
    // deste passo (etapa "publicar", mais adiante) — usa "agora" pras duas datas, o mais próximo
    // possível do momento real sem reestruturar o pipeline pra saber a hora exata do WordPress
    // antes de sequer ter enviado a requisição de criação do rascunho.
    const agora = new Date();
    const schemaArticle = montarSchemaArticle(
      { titulo: conteudo.titulo, slug: conteudo.slug, urlBase: propriedade.urlBase, imagemDestaqueUrl: capaUrlPublica },
      { autoria: propriedade.autoria, nome: propriedade.nome, urlBase: propriedade.urlBase },
      { publicadoEm: agora, atualizadoEm: agora },
    );
    // Emite TAMBÉM um bloco Organization avulso, além do objeto Organization já aninhado em
    // `publisher` dentro do Article (schema-estruturado.ts, montarSchemaArticle) — decisão
    // deliberada (subtlety #1 do brief da Task 10): múltiplos blocos JSON-LD co-localizados
    // descrevendo entidades sobrepostas são válidos e comuns em schema.org, e reforçam o sinal de
    // E-E-A-T da Organization como entidade própria (não só como propriedade aninhada de outro
    // tipo) — não é redundância acidental, é a escolha deliberada de robustez que o comentário de
    // cabeçalho de schema-estruturado.ts deixou em aberto pra esta task decidir.
    const schemaOrganization = montarSchemaOrganization({ nome: propriedade.nome, urlBase: propriedade.urlBase });

    const htmlComSecundarias = inserirImagensSecundariasNoHtml(corpoHtmlSanitizado, secundariasEmbutidas);
    const capaEmbutida = construirFiguraCapa(capaUrlPublica, capa.resultado?.alt ?? conteudo.titulo);
    const corpoHtmlFinal = `${capaEmbutida}${htmlComSecundarias}\n${schemaArticle}\n${schemaOrganization}`;

    // alt/slug só acompanham a URL quando o upload de fato teve sucesso (capaUrlPublica !== null)
    // — não basta gerarCapa ter produzido um resultado: se o upload falhou, persistir alt/slug sem
    // URL deixaria um metadado órfão (referência a uma imagem que não existe em lugar nenhum
    // público). Upload falho é tratado exatamente como "sem capa" pra tudo que vem depois, ver
    // subtlety #1 do brief da Task 10.
    return {
      corpoHtmlFinal,
      capaMediaId,
      imagemDestaqueUrl: capaUrlPublica,
      imagemDestaqueAlt: capaUrlPublica ? (capa.resultado?.alt ?? null) : null,
      imagemDestaqueSlug: capaUrlPublica ? (capa.resultado?.slug ?? null) : null,
      imagemDestaqueStorageUrl: capaStorageUrl,
      imagensSecundariasPersistir: secundariasEmbutidas,
      usage,
      detalhesLog: detalhes.length > 0 ? detalhes.join(" | ") : undefined,
      custoUsdOpenAi,
    };
  } catch (erro) {
    detalhes.push(`falha inesperada na geração/montagem de imagens (${mensagemErro(erro)})`);
    return {
      corpoHtmlFinal: corpoHtmlSanitizado,
      capaMediaId: undefined,
      imagemDestaqueUrl: null,
      imagemDestaqueAlt: null,
      imagemDestaqueSlug: null,
      imagemDestaqueStorageUrl: null,
      imagensSecundariasPersistir: [],
      custoUsdOpenAi,
      usage,
      detalhesLog: detalhes.join(" | "),
    };
  }
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
    // Reaproveitamento entre tentativas (19/08/2026, pedido do Luiz) — achado real de teste em
    // produção: uma falha técnica na publicação (ex.: credencial de WordPress inválida) descartava
    // um texto já aprovado e imagens já geradas (custando $ real de Anthropic + OpenAI), forçando a
    // próxima tentativa a recomeçar do zero: Escritor, Revisor e geração de imagens de novo. Se já
    // existe um post "pronto_para_publicar" pra esta pauta (gravado logo após "gerar_imagens" rodar
    // com sucesso, ver mais abaixo), pula TODA a geração — direto pra "publicar" com o material que
    // já está pronto. Isso só é seguro porque "pronto_para_publicar" só fica true depois que o
    // Revisor JÁ aprovou o conteúdo (o problema anterior era só técnico, não de conteúdo).
    const postPronto = await carregarPostProntoParaPublicar(pauta.id);

    // Adaptador criado uma única vez, usado tanto por "gerar_imagens" (upload de mídia) quanto por
    // "publicar" — precisa existir nos dois caminhos (reaproveitado ou gerado do zero).
    const adaptador = criarAdaptadorWordPress(propriedade.urlBase, credenciaisWordPressDaPropriedade(propriedade));

    let postId: string;
    let corpoHtmlParaPublicar: string;
    let dadosConteudo: { titulo: string; slug: string; metaTitle: string; metaDescription: string };
    let imagemDestacadaId: string | undefined;

    if (postPronto) {
      postId = postPronto.id;
      corpoHtmlParaPublicar = postPronto.conteudoHtml;
      dadosConteudo = { titulo: postPronto.titulo, slug: postPronto.slug, metaTitle: postPronto.metaTitle, metaDescription: postPronto.metaDescription };
      imagemDestacadaId = postPronto.imagemDestaqueMediaId ?? undefined;
    } else {
      // Cada etapa é envolvida por registrarEtapa (Task 3) — grava início/fim/sucesso em
      // pautas_execucao_log, alimentando o Monitor de execução e o Painel de Custo (spec seção 6).
      // Etapas gerar_conteudo/revisar passam um extrator de tokens porque Escritor/Revisor
      // retornam `usage` junto do resultado de negócio (mudança desta mesma task).
      const checklist = await registrarEtapa(pauta.id, "buscar_checklist", () => carregarChecklistAtivo(propriedadeId));

      // Fase 3 (personas ricas), Task 5, spec seção 7 — pauta.personaId só existe quando a pauta
      // nasceu do terceiro caminho do Estrategista (persona sorteada, Task 4); pautas antigas/
      // manuais (pendente/reclaim) têm personaId null e não pagam o custo de uma query extra aqui —
      // sem carregarPersona nesse caso, `persona` fica null e o Escritor mantém o prompt de antes
      // desta task (ver escritor.ts).
      const persona = pauta.personaId ? await carregarPersona(pauta.personaId) : null;

      // extrairDetalhes: relatório do Escritor (19/08/2026, pedido do Luiz) — espelha o motivo do
      // Revisor na etapa "revisar" logo abaixo, pra dar pra cruzar "o que foi pedido" com "o que o
      // Escritor diz ter feito" no Monitor de execução.
      const { resultado: conteudo } = await registrarEtapa(
        pauta.id,
        "gerar_conteudo",
        () => gerarConteudo(pauta, checklist, persona, propriedade),
        (r) => ({ tokensEntrada: r.usage.inputTokens, tokensSaida: r.usage.outputTokens }),
        (r) => r.resultado.relatorio,
      );

      // Salva o rascunho ANTES de saber se o Revisor vai aprovar (achado do teste real de ponta a
      // ponta, 19/08/2026) — se reprovar, a próxima tentativa desta pauta encontra o texto aqui
      // (pauta.ultimoRascunho) e revisa em vez de reescrever do zero (ver montarPrompt, escritor.ts).
      // Fora do registrarEtapa de cima de propósito: não é parte do custo/tempo da geração em si.
      await salvarRascunho(pauta.id, conteudo);

      // Verificação de links externos (19/08/2026, pedido do Luiz) — achado real de teste em
      // produção: o Revisor gastava uma tentativa INTEIRA reprovando por "fonte específica" quando
      // o link nem sequer existia (ex.: uma URL do BACEN saiu com o caminho duplicado,
      // "supervisaosupervisao"). Confere com um request HTTP real ANTES de chegar no Revisor — só 1
      // tentativa extra de correção (não um loop), pra manter custo/latência previsíveis; se
      // continuar quebrado mesmo assim, segue pro Revisor do jeito que está (ele tende a pegar via
      // fontes_especificas de qualquer forma — Global Constraint do plano mestre: esta etapa nunca
      // trava o pipeline, só tenta uma vez consertar mais barato do que um ciclo de revisão).
      let conteudoFinal = conteudo;
      await registrarEtapa(
        pauta.id,
        "verificar_links",
        async () => {
          const links = extrairLinksExternos(conteudoFinal.conteudoHtml);
          const quebrados = links.length > 0 ? (await verificarLinksExternos(links)).filter((r) => !r.ok) : [];
          if (quebrados.length === 0) return { quebrados, usage: { inputTokens: 0, outputTokens: 0 } };

          const motivoLinks = quebrados
            .map(
              (l, i) =>
                `${i + 1}) O link "${l.url}" não respondeu (${l.motivo}) — use a ferramenta de busca na internet pra achar uma URL real e específica que sustente a mesma afirmação do texto, e substitua só esse href. Não altere mais nada do HTML.`,
            )
            .join("\n");
          const { resultado: corrigido, usage } = await gerarConteudo(
            { ...pauta, motivoUltimaReprovacao: motivoLinks, ultimoRascunho: conteudoFinal },
            checklist,
            persona,
            propriedade,
          );
          conteudoFinal = corrigido;
          await salvarRascunho(pauta.id, conteudoFinal);
          return { quebrados, usage };
        },
        (r) => ({ tokensEntrada: r.usage.inputTokens, tokensSaida: r.usage.outputTokens }),
        (r) => (r.quebrados.length > 0 ? `Link(s) quebrado(s) encontrado(s) e enviado(s) pro Escritor corrigir: ${r.quebrados.map((l) => `${l.url} (${l.motivo})`).join("; ")}` : undefined),
      );

      // extrairDetalhes: uma reprovação por score baixo não lança exceção (é decisão de negócio,
      // não erro técnico — ver comentário na etapa "publicar" abaixo), então sem isto a linha de
      // log ficaria sucesso: true, detalhes: null, indistinguível de uma revisão realmente
      // aprovada. Só grava o motivo quando reprovado; aprovado devolve undefined (não escreve nada
      // em detalhes). postsRecentes (títulos+ângulos dos últimos posts publicados desta
      // propriedade, pro Revisor julgar originalidade_adequada — spec Fase 4a seção 3.1) —
      // resolvido na Task 3 via carregarPostsRecentes (repositorio.ts), função dedicada porque
      // listarPostsPublicados não carrega `angulo` (vive em `pautas`, não em `posts`).
      // LIMITE_POSTS_RECENTES = 10, "últimos ~10 posts publicados" da spec.
      const postsRecentes = await carregarPostsRecentes(propriedade.id, LIMITE_POSTS_RECENTES);

      const { resultado: revisao } = await registrarEtapa(
        pauta.id,
        "revisar",
        // pauta.tentativas conta as tentativas já ESGOTADAS antes desta rodada (0 na 1ª geração) —
        // +1 dá o número desta revisão em si (1 na primeira, 2+ a partir da 1ª correção), o que
        // "Reprovação só por motivo real" (revisor.ts) usa pra saber quando aplicar a leniência
        // reforçada pedida pelo Luiz.
        () => revisarConteudo(conteudoFinal, checklist, propriedade, postsRecentes, pauta.tentativas + 1),
        (r) => ({ tokensEntrada: r.usage.inputTokens, tokensSaida: r.usage.outputTokens }),
        (r) => (r.resultado.aprovado ? undefined : (r.resultado.motivo ?? undefined)),
      );

      if (!revisao.aprovado) {
        await registrarReprovacaoPauta(pauta.id, revisao.motivo ?? "Reprovado sem motivo detalhado.");
        return { status: "reprovado" as const, pautaId: pauta.id };
      }

      const post = await criarPost({ pautaId: pauta.id, propriedadeId, conteudo: conteudoFinal, scoreQa: revisao.score });
      // Links (item 7) roda só depois da revisão aprovar — não faz sentido gastar um ciclo de
      // revisão validando um HTML que ainda vai ganhar uma seção nova — e antes da sanitização
      // (item 5) e da publicação, pra sanitizar o HTML final que de fato vai pro ar.
      const conteudoComLinks = await registrarEtapa(pauta.id, "inserir_links", () =>
        inserirLinksInternos(conteudoFinal.conteudoHtml, propriedadeId, post.id),
      );
      const corpoHtmlSanitizado = await registrarEtapa(pauta.id, "sanitizar", async () => sanitizarConteudoHtml(conteudoComLinks));

      // Reaproveitamento entre tentativas (19/08/2026, pedido do Luiz) — se uma tentativa anterior
      // desta pauta já gerou imagens (mesmo que a publicação em si nunca tenha chegado a rodar,
      // como no caso de reprovação de CONTEÚDO que exigiu correção cirúrgica do texto), reaproveita
      // em vez de gerar de novo. As imagens dependem do tema/ângulo geral do post, não de detalhes
      // pontuais como um link — uma correção cirúrgica não deveria invalidá-las.
      const imagensExistentes = await carregarImagensPostAnterior(pauta.id);

      // Etapa "gerar_imagens" (Task 10, Fase 4a+4b) — capa + imagens secundárias + upload
      // WordPress + schema Article/Organization embutidos no HTML, entre "sanitizar" e "publicar"
      // (spec seção 4.7). gerarEEmbutirImagens NUNCA lança (Global Constraint do plano mestre:
      // falha de imagem não pode bloquear a publicação do texto) — por isso esta etapa sempre é
      // registrada como sucesso: true; extrairDetalhes grava o que faltou/degradou (capa
      // reprovada, upload que falhou, zero secundárias aprovadas) na mesma coluna `detalhes` que
      // as outras etapas usam pra rejeição de negócio, pra não ficar indistinguível de execução
      // perfeita no log.
      const resultadoImagens = await registrarEtapa(
        pauta.id,
        "gerar_imagens",
        () => gerarEEmbutirImagens(pauta, conteudoFinal, persona, propriedade, corpoHtmlSanitizado, adaptador, imagensExistentes),
        (r) => ({ tokensEntrada: r.usage.inputTokens, tokensSaida: r.usage.outputTokens }),
        (r) => r.detalhesLog,
        (r) => r.custoUsdOpenAi,
      );

      // Persiste o post como PRONTO ASSIM QUE as imagens são geradas, ANTES de tentar publicar —
      // achado real do teste de ponta a ponta (19/08/2026, pedido do Luiz): antes desta mudança, o
      // resultado de "gerar_imagens" só era gravado no banco dentro do bloco de sucesso de
      // "publicar" — se a publicação falhasse por qualquer motivo (visto na prática: credencial
      // WordPress inválida, 401), as imagens já geradas com sucesso e já enviadas ao
      // WordPress/Storage eram descartadas, e a próxima tentativa as regenerava do zero.
      // pronto_para_publicar: true é o que permite `carregarPostProntoParaPublicar` (topo desta
      // função) encontrar este post numa tentativa futura e pular a geração inteira. `post` já
      // existe neste ponto (criado logo após a aprovação do Revisor). Try/catch próprio, não pode
      // propagar: falha em persistir é só uma degradação de "reaproveitamento futuro", não pode
      // derrubar a tentativa de publicação que vem a seguir.
      try {
        await atualizarStatusPost(post.id, post.status, {
          conteudoHtml: resultadoImagens.corpoHtmlFinal,
          imagemDestaqueUrl: resultadoImagens.imagemDestaqueUrl ?? undefined,
          imagemDestaqueAlt: resultadoImagens.imagemDestaqueAlt ?? undefined,
          imagemDestaqueSlug: resultadoImagens.imagemDestaqueSlug ?? undefined,
          imagemDestaqueStorageUrl: resultadoImagens.imagemDestaqueStorageUrl ?? undefined,
          imagensSecundarias: resultadoImagens.imagensSecundariasPersistir,
          imagemDestaqueMediaId: resultadoImagens.capaMediaId,
          prontoParaPublicar: true,
        });
      } catch (erroPersistirImagens) {
        console.error(`Pauta ${pauta.id}: falha ao persistir post pronto antes de publicar (não bloqueia a publicação):`, erroPersistirImagens);
      }

      postId = post.id;
      corpoHtmlParaPublicar = resultadoImagens.corpoHtmlFinal;
      dadosConteudo = { titulo: conteudoFinal.titulo, slug: conteudoFinal.slug, metaTitle: conteudoFinal.metaTitle, metaDescription: conteudoFinal.metaDescription };
      imagemDestacadaId = resultadoImagens.capaMediaId;
    }

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
        // corpoHtml e imagemDestacadaId (Task 10) vêm do resultado de "gerar_imagens" — HTML com
        // imagens secundárias + schema já embutidos, e o id de mídia da capa já enviada ao
        // WordPress (undefined quando a capa não gerou/não subiu, e criarRascunho trata isso como
        // "sem imagem destacada", ver canais/wordpress.ts).
        const rascunho = await adaptador.criarRascunho(
          {
            titulo: dadosConteudo.titulo,
            corpoHtml: corpoHtmlParaPublicar,
            slug: dadosConteudo.slug,
            metaTitle: dadosConteudo.metaTitle,
            metaDescription: dadosConteudo.metaDescription,
          },
          imagemDestacadaId,
        );

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
      await atualizarStatusPost(postId, "falhou");
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

      // Metadados do post local (canais/publicado_em/HTML final, Task 10) são secundários — a
      // pauta já está marcada como publicada acima, então uma falha aqui não reabre risco de
      // duplicidade. Só logamos. conteudoHtml é corpoHtmlParaPublicar (não mais corpoHtmlSanitizado
      // puro): o que de fato foi publicado, com imagens secundárias + schema Article/Organization
      // já embutidos (seja gerado agora ou reaproveitado de uma tentativa anterior). Campos de
      // imagem NÃO repetidos aqui (mudança de 19/08/2026, pedido do Luiz): já foram persistidos
      // logo após "gerar_imagens" (ou já vinham prontos do reaproveitamento) — reescrever os
      // mesmos valores aqui seria só uma duplicação redundante, não uma correção de nada.
      try {
        await atualizarStatusPost(postId, "publicado", {
          canais: { wordpress: { rascunho_id: rascunho.idRemoto, status: "publicado", url: publicado.urlPublicada } },
          publicadoEm: new Date().toISOString(),
          conteudoHtml: corpoHtmlParaPublicar,
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
