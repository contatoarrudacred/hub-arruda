// src/lib/marketing/imagens/secundarias.ts
// Orquestrador de imagens secundárias (Fase 4b, spec seção 4.3; fluxo detalhado em
// docs/insumos-externos/especificacao_automacao_imagens_secundarias_post.md) — diferente da capa
// (capa.ts, função emocional/identificação), as imagens secundárias têm função informativa/
// editorial: só existem quando ensinam, esclarecem, organizam, comparam, resumem ou tornam uma
// informação complexa mais fácil de compreender (spec seção 1). ZERO imagens é uma resposta válida
// e desejável (spec seção 1, 9, 21) — o filtro é deliberadamente rígido e este arquivo não o
// afrouxa pra "conseguir gerar alguma imagem" (aviso explícito do brief da Task 8).
//
// Duas etapas (spec seção 3/20):
//   ETAPA 1 — Identificação (1 chamada Claude, "Prompt 1" da spec seção 4): lê o post inteiro,
//     propõe até 3 candidatas, e AUTORREPORTA 4 notas de 0-10 (ganho de compreensão, densidade
//     informacional, adequação visual, relevância pro argumento — spec seção 6) mais os metadados
//     (alt/slug/legenda, já derivados do mesmo trecho-fonte, spec núcleo seção 4.5) na MESMA
//     chamada — mesmo raciocínio de capa.ts (etapa 4 dobra metadados na chamada que já tem o
//     contexto certo). A APROVAÇÃO NÃO é decidida pelo modelo: como em revisor.ts
//     (calcularAprovacao) e revisor-imagem.ts, o modelo só pode autorreportar números plausíveis
//     por trecho — quem decide se `NOTA_TOTAL >= 30 E ganho_de_compreensão >= 8` é o código
//     (calcularAprovacaoCandidato abaixo), não um campo booleano que o próprio modelo preenche.
//     Isso é o que o brief pede: "força o modelo a autorreportar uma nota checável", igual ao
//     padrão já usado em revisor.ts/revisor-imagem.ts pros seus próprios gates.
//   ETAPA 2 — por candidata aprovada (0 a 3 iterações): geração (OpenAI) + revisão (Claude com
//     visão, Task 6) com retry, mesmo padrão do capa.ts.
//
// Decisão de implementação: "Prompt 2" da spec (seção 10, "Geração da imagem secundária") NÃO
// vira uma segunda chamada Claude por candidata. Diferente do capa.ts (onde a etapa 4 exige
// SÍNTESE CRIATIVA — cruzar resumo do post + resumo da persona numa cena única, uma cadeia de
// raciocínio que só um LLM resolve), o Prompt 2 da spec de secundárias é, na prática, um TEMPLATE
// de preenchimento: todas as variáveis que ele usa (tipo_visual, título_imagem, objetivo_didático,
// trecho_fonte_integral, informações_que_podem_aparecer, estrutura_visual_sugerida) já saem
// prontas e estruturadas da Etapa 1, sem mais raciocínio necessário. `montarPromptImagemSecundaria`
// abaixo renderiza esse template em código (função pura, testável sem mock de rede) — isso corta
// uma chamada Claude por candidata (até 3 chamadas a menos por post) sem abrir mão de nenhuma
// regra do "banco fechado" (spec seções 8/11, todas embutidas literalmente no template).
//
// Failure isolation (brief, Global Constraint por candidata): uma falha (OpenAI, revisor, ou
// limite de tentativas esgotado com reprovação) em UMA candidata não derruba as outras — o
// try/catch é por iteração do loop de candidatas aprovadas, não em volta do loop inteiro. Só uma
// falha na ETAPA 1 (a chamada de identificação em si) degrada a função inteira pra
// `{ resultado: [], usage }`, espelhando o contrato "nunca lança" do capa.ts.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ConteudoGerado, UsageTokens } from "../tipos";
import { gerarImagemOpenAI } from "./gerador-imagem-openai";
import { revisarImagem } from "./revisor-imagem";

const MODELO_SECUNDARIAS = "claude-sonnet-5";

// Limite de tentativas de geração de imagem por candidata — mesmo valor de capa.ts
// (LIMITE_TENTATIVAS_IMAGEM = 2), sem razão documentada pra divergir: é o mesmo tipo de operação
// (gerar imagem via OpenAI + revisar com Claude-visão), com o mesmo motivo de não estourar custo
// de imagem numa reprovação persistente (spec seção 4.4 do design doc: "menor que o do texto").
const LIMITE_TENTATIVAS_IMAGEM = 2;

// Limiares de aprovação — spec seção 6, "Critério de aprovação". Não afrouxar (brief da Task 8).
const NOTA_TOTAL_MINIMA = 30;
const GANHO_DE_COMPREENSAO_MINIMO = 8;

const MAX_CANDIDATAS = 3;

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

function somarUsage(acumulado: UsageTokens, novo: UsageTokens): UsageTokens {
  return {
    inputTokens: acumulado.inputTokens + novo.inputTokens,
    outputTokens: acumulado.outputTokens + novo.outputTokens,
  };
}

function usageDaResposta(resposta: Anthropic.Message): UsageTokens {
  return {
    inputTokens: resposta.usage?.input_tokens ?? 0,
    outputTokens: resposta.usage?.output_tokens ?? 0,
  };
}

// ETAPA 1 — identificação de oportunidades (spec seção 4, "Prompt 1") + pontuação (seção 6) +
// metadados (núcleo seção 4.5), tudo na mesma chamada/ferramenta.
const FERRAMENTA_IDENTIFICACAO = {
  name: "registrar_oportunidades_imagens_secundarias",
  description:
    "Registra de 0 a 3 oportunidades de imagens secundárias informativas identificadas no post, cada uma com trecho-fonte integral, pontuação de utilidade editorial autorreportada e metadados.",
  input_schema: {
    type: "object" as const,
    properties: {
      oportunidades: {
        type: "array",
        maxItems: MAX_CANDIDATAS,
        description:
          "0 a 3 oportunidades. ZERO é uma resposta válida e desejável quando nenhum trecho do post tiver ganho real de compreensão visual — não force a existência de oportunidades pra preencher este array.",
        items: {
          type: "object",
          properties: {
            tipo_visual: {
              type: "string",
              description:
                "Formato escolhido (spec seção 5): infográfico simples, fluxograma, esquema visual, comparativo visual, linha do tempo, diagrama, passo a passo visual, quadro-resumo, mapa conceitual, visualização de dados, ou outro formato claramente superior (explique brevemente a escolha).",
            },
            titulo_imagem: {
              type: "string",
              description: "Título curto, informativo e estritamente sustentado pelo trecho-fonte.",
            },
            objetivo_didatico: {
              type: "string",
              description: "Uma frase: o que esta imagem fará o leitor compreender melhor do que só lendo o texto.",
            },
            trecho_fonte_integral: {
              type: "string",
              description:
                "Cole EXATAMENTE a parte necessária do post (spec seção 8) — deve conter todas as informações que poderão aparecer na imagem, preservar o significado original, ter contexto suficiente e não incluir partes irrelevantes. Este trecho vira o banco fechado da geração de imagem: nada fora dele pode aparecer.",
            },
            informacoes_que_podem_aparecer: {
              type: "string",
              description: "Lista fechada contendo somente fatos/conceitos presentes literalmente no trecho-fonte.",
            },
            estrutura_visual_sugerida: {
              type: "string",
              description: "Como organizar visualmente a informação, sem inventar conteúdo.",
            },
            posicao_sugerida: {
              type: "string",
              description: "Depois de qual seção, subtítulo ou trecho do artigo esta imagem deve entrar.",
            },
            alt: {
              type: "string",
              description:
                "ALT text derivado exclusivamente do trecho_fonte_integral e do titulo_imagem (banco fechado) — descreve o conteúdo da imagem planejada, sem inventar elementos.",
            },
            slug: {
              type: "string",
              description: "Slug de arquivo em kebab-case, sem acentos, com palavra-chave relevante — nunca um hash aleatório.",
            },
            legenda: {
              type: "string",
              description:
                "Legenda curta adequada para um <figcaption>, sustentada apenas pelo trecho_fonte_integral — sem repetir o título ao pé da letra, sem acrescentar informação que o trecho não contenha.",
            },
            ganho_de_compreensao: {
              type: "number",
              description:
                "Nota HONESTA de 0 a 10: a imagem fará o leitor entender melhor do que somente lendo o texto? Este número (não uma decisão sua de 'aprovar') é usado pelo código pra calcular a aprovação final — não infle a nota pra forçar a aprovação de uma oportunidade fraca.",
            },
            densidade_informacional: {
              type: "number",
              description: "Nota HONESTA de 0 a 10: existe informação suficiente no trecho pra justificar uma representação visual?",
            },
            adequacao_visual: {
              type: "number",
              description: "Nota HONESTA de 0 a 10: a informação possui estrutura que realmente pode ser comunicada visualmente?",
            },
            relevancia_para_o_argumento: {
              type: "number",
              description: "Nota HONESTA de 0 a 10: o trecho é importante pra compreensão do artigo ou é só detalhe secundário?",
            },
          },
          required: [
            "tipo_visual",
            "titulo_imagem",
            "objetivo_didatico",
            "trecho_fonte_integral",
            "informacoes_que_podem_aparecer",
            "estrutura_visual_sugerida",
            "posicao_sugerida",
            "alt",
            "slug",
            "legenda",
            "ganho_de_compreensao",
            "densidade_informacional",
            "adequacao_visual",
            "relevancia_para_o_argumento",
          ],
        },
      },
    },
    required: ["oportunidades"],
  },
};

type CandidatoBruto = {
  tipo_visual: string;
  titulo_imagem: string;
  objetivo_didatico: string;
  trecho_fonte_integral: string;
  informacoes_que_podem_aparecer: string;
  estrutura_visual_sugerida: string;
  posicao_sugerida: string;
  alt: string;
  slug: string;
  legenda: string;
  ganho_de_compreensao: number;
  densidade_informacional: number;
  adequacao_visual: number;
  relevancia_para_o_argumento: number;
};

type Candidato = {
  tipoVisual: string;
  tituloImagem: string;
  objetivoDidatico: string;
  trechoFonteIntegral: string;
  informacoesQuePodemAparecer: string;
  estruturaVisualSugerida: string;
  posicaoSugerida: string;
  alt: string;
  slug: string;
  legenda: string;
  ganhoDeCompreensao: number;
  densidadeInformacional: number;
  adequacaoVisual: number;
  relevanciaParaOArgumento: number;
};

const CAMPOS_STRING_OBRIGATORIOS: Array<keyof CandidatoBruto> = [
  "tipo_visual",
  "titulo_imagem",
  "objetivo_didatico",
  "trecho_fonte_integral",
  "informacoes_que_podem_aparecer",
  "estrutura_visual_sugerida",
  "posicao_sugerida",
  "alt",
  "slug",
  "legenda",
];

const CAMPOS_NUMERO_OBRIGATORIOS: Array<keyof CandidatoBruto> = [
  "ganho_de_compreensao",
  "densidade_informacional",
  "adequacao_visual",
  "relevancia_para_o_argumento",
];

function validarESanearCandidato(bruto: CandidatoBruto, indice: number): Candidato {
  for (const campo of CAMPOS_STRING_OBRIGATORIOS) {
    if (typeof bruto[campo] !== "string" || (bruto[campo] as string).trim() === "") {
      throw new Error(`Imagens secundárias (identificação, oportunidade ${indice + 1}): campo obrigatório "${campo}" ausente ou vazio.`);
    }
  }
  for (const campo of CAMPOS_NUMERO_OBRIGATORIOS) {
    if (typeof bruto[campo] !== "number" || Number.isNaN(bruto[campo] as number)) {
      throw new Error(`Imagens secundárias (identificação, oportunidade ${indice + 1}): campo obrigatório "${campo}" ausente ou não-numérico.`);
    }
  }

  return {
    tipoVisual: bruto.tipo_visual,
    tituloImagem: bruto.titulo_imagem,
    objetivoDidatico: bruto.objetivo_didatico,
    trechoFonteIntegral: bruto.trecho_fonte_integral,
    informacoesQuePodemAparecer: bruto.informacoes_que_podem_aparecer,
    estruturaVisualSugerida: bruto.estrutura_visual_sugerida,
    posicaoSugerida: bruto.posicao_sugerida,
    alt: bruto.alt,
    slug: bruto.slug,
    legenda: bruto.legenda,
    ganhoDeCompreensao: bruto.ganho_de_compreensao,
    densidadeInformacional: bruto.densidade_informacional,
    adequacaoVisual: bruto.adequacao_visual,
    relevanciaParaOArgumento: bruto.relevancia_para_o_argumento,
  };
}

/**
 * Regra de aprovação (spec seção 6, "Critério de aprovação") — NÃO decidida pelo modelo: o modelo
 * só autorreporta 4 notas honestas, o código calcula. `NOTA_TOTAL >= 30` E
 * `GANHO_DE_COMPREENSÃO >= 8`, os dois ao mesmo tempo. Mesmo espírito da regra multiplicativa de
 * revisor.ts (calcularAprovacao) — um critério não compensa o outro.
 */
function calcularAprovacaoCandidato(c: Candidato): boolean {
  const notaTotal = c.ganhoDeCompreensao + c.densidadeInformacional + c.adequacaoVisual + c.relevanciaParaOArgumento;
  return notaTotal >= NOTA_TOTAL_MINIMA && c.ganhoDeCompreensao >= GANHO_DE_COMPREENSAO_MINIMO;
}

function montarPromptIdentificacao(titulo: string, conteudoHtml: string): string {
  return [
    "Você é um editor-chefe, especialista em comunicação visual, arquitetura da informação, UX editorial, SEO e produção de conteúdo didático.",
    "Sua tarefa é ler integralmente o artigo abaixo e identificar no máximo 3 oportunidades REALMENTE FORTES para criar imagens secundárias informativas dentro do post.",
    "",
    "PRINCÍPIO MAIS IMPORTANTE: não procure imagens para \"decorar\" o artigo. Uma imagem só deve ser recomendada quando transformar informação textual em uma representação visual que ofereça ganho real de compreensão. As seguintes justificativas NÃO são suficientes: deixar o post mais bonito; quebrar um bloco grande de texto; gerar engajamento visual; ilustrar genericamente o assunto; mostrar uma pessoa relacionada ao tema; repetir visualmente algo já extremamente simples de entender em texto; preencher espaço; aumentar artificialmente a quantidade de mídia da página.",
    "Se nenhuma oportunidade passar pelo filtro de utilidade, retorne um array vazio — ZERO imagens é uma resposta válida e desejável.",
    "",
    "O que procurar: processos ou sequências, etapas, relações de causa e efeito, comparações, diferenças entre conceitos, classificações, listas que ganhariam clareza visual, hierarquias, caminhos possíveis, cenários, erros versus condutas adequadas, relações entre sistemas ou conceitos, cronologias, dados, números, percentuais, tabelas, critérios, estruturas, decisões, perguntas e respostas organizáveis visualmente, conceitos abstratos que o próprio texto explique suficientemente pra serem representados sem adicionar informação externa.",
    "",
    "Tipos visuais possíveis: infográfico simples, fluxograma, esquema visual, comparativo visual, linha do tempo, diagrama, passo a passo visual, quadro-resumo, mapa conceitual, visualização de dados (somente quando o trecho-fonte contiver os números/dados necessários), ou outro formato quando claramente superior aos anteriores.",
    "",
    "Para cada candidata, atribua notas HONESTAS de 0 a 10 para: A) ganho de compreensão (a imagem fará o leitor entender melhor do que só lendo o texto?); B) densidade informacional (existe informação suficiente pra justificar uma representação visual?); C) adequação visual (a informação possui estrutura que realmente pode ser comunicada visualmente?); D) relevância pro argumento (o trecho é importante pra compreensão do artigo ou é só detalhe secundário?). Uma oportunidade só deve ser incluída no resultado quando A+B+C+D >= 30 E A >= 8 — não infle as notas pra forçar a aprovação de uma oportunidade fraca; não reduza o rigor pra conseguir chegar a 3 imagens. Quantidade não é objetivo, qualidade editorial é o objetivo.",
    "",
    "Regras para seleção final: máximo de 3 oportunidades; não selecione duas imagens que ensinem essencialmente a mesma coisa; distribua as imagens em partes diferentes do artigo quando isso ocorrer naturalmente; não selecione um trecho apenas porque contém uma lista; não crie visualização de dados sem dados presentes no texto; não adicione estatísticas, números, leis, prazos, conceitos ou informações externas; não use conhecimento próprio pra \"melhorar\" o conteúdo — o artigo é a única fonte factual; se houver dúvida sobre a fidelidade de uma informação, não a transforme em afirmação visual; não recomende uma imagem meramente emocional/fotográfica (essa função pertence à capa do post).",
    "",
    "Para cada oportunidade aprovada, extraia do artigo o TRECHO-FONTE INTEGRAL necessário pra produzir aquela imagem: deve conter todas as informações que poderão aparecer na imagem, preservar o significado original, ter contexto suficiente pra evitar interpretação equivocada, não ser resumido de forma que elimine qualificações importantes, e não incluir grandes partes irrelevantes do artigo. A futura IA de imagem receberá esse trecho como um universo factual fechado.",
    "",
    "Gere também, pra cada oportunidade aprovada, os metadados: ALT text (derivado exclusivamente do trecho-fonte e do título da imagem, sem inventar elementos), slug de arquivo (kebab-case, com palavra-chave, nunca hash aleatório) e legenda curta pra <figcaption> (sustentada apenas pelo trecho-fonte).",
    "",
    `TÍTULO DO POST:\n${titulo}`,
    "",
    `POST COMPLETO:\n${conteudoHtml}`,
    "",
    "Use a ferramenta para registrar o resultado (array vazio se nenhuma oportunidade for aprovada).",
  ].join("\n");
}

async function identificarOportunidades(titulo: string, conteudoHtml: string): Promise<{ candidatos: Candidato[]; usage: UsageTokens }> {
  const cliente = obterCliente();
  const prompt = montarPromptIdentificacao(titulo, conteudoHtml);

  const resposta = await cliente.messages.create({
    model: MODELO_SECUNDARIAS,
    max_tokens: 6000,
    tools: [FERRAMENTA_IDENTIFICACAO],
    tool_choice: { type: "tool", name: "registrar_oportunidades_imagens_secundarias" },
    messages: [{ role: "user", content: prompt }],
  });

  const bloco = resposta.content.find((b) => b.type === "tool_use");
  if (!bloco || bloco.type !== "tool_use") {
    throw new Error("Imagens secundárias (identificação): resposta sem bloco de ferramenta estruturado.");
  }

  const bruta = bloco.input as { oportunidades?: CandidatoBruto[] };
  const oportunidadesBrutas = Array.isArray(bruta.oportunidades) ? bruta.oportunidades : [];
  const candidatos = oportunidadesBrutas.map((c, indice) => validarESanearCandidato(c, indice));

  return { candidatos, usage: usageDaResposta(resposta) };
}

// ETAPA 2 — geração + revisão por candidata aprovada (spec seções 10-17). O prompt final é
// renderizado deterministicamente a partir dos campos já extraídos na Etapa 1 (ver nota de
// implementação no cabeçalho do arquivo) — sem chamada Claude adicional.
function montarPromptImagemSecundaria(c: Candidato): string {
  return [
    "Você é um diretor de arte editorial, designer de informação e especialista em comunicação visual didática.",
    "Sua tarefa é criar UMA imagem informativa para complementar um artigo de blog. A imagem deve ilustrar e organizar EXCLUSIVAMENTE informações já presentes no trecho-fonte fornecido — você não está autorizado a completar, corrigir, ampliar ou enriquecer factual ou conceitualmente o conteúdo com conhecimento próprio.",
    "",
    `TIPO DE REPRESENTAÇÃO VISUAL:\n${c.tipoVisual}`,
    "",
    `TÍTULO DA IMAGEM:\n${c.tituloImagem}`,
    "",
    `OBJETIVO DIDÁTICO:\n${c.objetivoDidatico}`,
    "",
    `ESTRUTURA VISUAL SUGERIDA:\n${c.estruturaVisualSugerida}`,
    "",
    `INFORMAÇÕES AUTORIZADAS (as únicas que podem aparecer na imagem):\n${c.informacoesQuePodemAparecer}`,
    "",
    `TRECHO-FONTE INTEGRAL (banco fechado — a imagem só pode representar o que está literalmente aqui):\n"""\n${c.trechoFonteIntegral}\n"""`,
    "",
    "REGRA DE FONTE FECHADA: trate o trecho-fonte e as informações autorizadas acima como um banco fechado de informações. Você PODE resumir visualmente, organizar, agrupar, hierarquizar, conectar, representar e transformar texto em elementos gráficos, reduzindo frases mantendo integralmente o significado. Você NÃO PODE acrescentar fatos, números, percentuais, prazos, leis, recomendações, causas, consequências, exceções, exemplos não fornecidos, opinião própria, conhecimento geral ou externo; não pode inferir uma afirmação que o texto não faça, transformar possibilidade em certeza, remover ressalvas que mudem o sentido, nem inventar fontes. Mesmo que você saiba que uma informação adicional é verdadeira, não a utilize. Se a informação não estiver sustentada pelo trecho-fonte, remova-a.",
    "",
    "Direção visual: clean, moderna, amigável, atrativa, instrutiva, didática, fácil de compreender, visualmente profissional, editorial, organizada, adequada a um artigo de blog, compreensível rapidamente. Use boa hierarquia visual, espaçamento generoso, poucos elementos por área, ícones simples quando úteis, formas e conectores claros, tipografia altamente legível, agrupamento lógico, contraste suficiente, leitura intuitiva. Evite aparência infantil, excessivamente corporativa, poluída, sensacionalista, de apresentação genérica tipo slide, de propaganda, de template barato, ou de imagem típica de IA.",
    "",
    "Título e layout: a imagem deve possuir um título curto, na região superior direita da composição, legível, com destaque suficiente sem dominar excessivamente a imagem, descrevendo corretamente o conteúdo, em português do Brasil.",
    "",
    "Idioma: todo texto visível deve estar em português do Brasil, com ortografia, acentuação e números corretos — não crie textos decorativos aleatórios nem palavras truncadas.",
    "",
    "Fontes e autoria: não invente fontes bibliográficas; se o trecho-fonte mencionar explicitamente uma fonte necessária à imagem, reproduza-a fielmente, caso contrário não inclua \"Fonte:\". Não inclua frases padrão como \"Conteúdo gerado por IA\".",
    "",
    "Formato: composição horizontal 16:9, conteúdo principal legível em desktop e mobile, sem informações essenciais coladas nas bordas.",
  ].join("\n");
}

export type ImagemSecundaria = {
  url: string;
  alt: string;
  slug: string;
  titulo: string;
  legenda: string;
  posicaoAposSecao: string;
};

/**
 * Global Constraint (plano mestre, mesmo contrato de capa.ts): esta função NUNCA lança.
 * - Falha na ETAPA 1 (identificação): degrada a função inteira pra `{ resultado: [], usage }` —
 *   sem candidatas identificadas, não há o que gerar.
 * - Falha por candidata na ETAPA 2 (OpenAI, revisor, limite de tentativas esgotado com
 *   reprovação): isola só aquela candidata (não incluída no array final); as demais candidatas
 *   seguem seu próprio fluxo normalmente.
 */
export async function gerarImagensSecundarias(conteudo: ConteudoGerado): Promise<{ resultado: ImagemSecundaria[]; usage: UsageTokens }> {
  let usage: UsageTokens = { inputTokens: 0, outputTokens: 0 };
  let candidatosAprovados: Candidato[] = [];

  try {
    const identificacao = await identificarOportunidades(conteudo.titulo, conteudo.conteudoHtml);
    usage = somarUsage(usage, identificacao.usage);
    candidatosAprovados = identificacao.candidatos.filter(calcularAprovacaoCandidato).slice(0, MAX_CANDIDATAS);
  } catch {
    // Falha de infraestrutura (Claude) na identificação — degradação aceitável: post sem imagens
    // secundárias, não um post que falha de publicar.
    return { resultado: [], usage };
  }

  const resultado: ImagemSecundaria[] = [];

  for (const candidato of candidatosAprovados) {
    try {
      const promptOriginal = montarPromptImagemSecundaria(candidato);
      let promptTentativa = promptOriginal;

      for (let tentativa = 1; tentativa <= LIMITE_TENTATIVAS_IMAGEM; tentativa++) {
        const geracao = await gerarImagemOpenAI(promptTentativa, "16:9");
        // custoUsd da OpenAI não faz parte de UsageTokens — mesma observação de capa.ts.

        const revisao = await revisarImagem(geracao.url, candidato.trechoFonteIntegral);
        usage = somarUsage(usage, revisao.usage);

        if (revisao.resultado.aprovada) {
          resultado.push({
            url: geracao.url,
            alt: candidato.alt,
            slug: candidato.slug,
            titulo: candidato.tituloImagem,
            legenda: candidato.legenda,
            posicaoAposSecao: candidato.posicaoSugerida,
          });
          break;
        }

        // Reprovada — dobra o motivo no prompt da próxima tentativa (mesmo padrão de capa.ts).
        promptTentativa = [
          promptOriginal,
          "",
          "CORREÇÃO OBRIGATÓRIA — a tentativa anterior foi reprovada pelo motivo abaixo. Gere novamente evitando especificamente esse problema:",
          revisao.resultado.motivo ?? "",
        ].join("\n");

        // Limite de tentativas esgotado sem aprovação — esta candidata é descartada
        // silenciosamente (não lança, não entra no array), o loop segue pra próxima candidata.
      }
    } catch {
      // Falha de infraestrutura (OpenAI ou revisor) nesta candidata específica — isolamento: as
      // demais candidatas seguem normalmente, só esta é descartada do resultado final.
      continue;
    }
  }

  return { resultado, usage };
}
