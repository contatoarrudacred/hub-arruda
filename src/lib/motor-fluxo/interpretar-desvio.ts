// Interpretador de desvio — spec docs/superpowers/plans/2026-08-21-desvio-escalar-quando-nao-sabe.md,
// estendido em 21/08/2026 pra ligar o banco de objeções de verdade (achado do Luiz assistindo
// conversas reais pela Tela de Atendimento: a Malala ignorava qualquer objeção/hesitação e só
// empurrava o roteiro adiante — indistinguível de um bot de árvore de decisão, já que o banco de
// objeções da persona, seção 8, nunca tinha sido ligado a nenhum código).
//
// Só roda quando o InterpretadorIA genérico (interpretacao-ia.ts) não reconheceu a resposta do lead
// como sendo sobre o checkpoint atual. 2 chamadas de IA, papéis bem diferentes:
//   1) Classificação (Haiku, tool-use, barato) — decide faq/objecao/escalar/ambiguo.
//   2) Geração (Sonnet, texto livre, com a voz completa da persona) — só quando faq/objecao, produz a
//      mensagem final já com a regra de desvio aplicada (responde + retoma a pergunta pendente).
// Nunca inventa fato: pra FAQ, o texto oficial é fonte da verdade (a IA só reformula, não muda
// conteúdo); pra objeção, `como_lidar` é ORIENTAÇÃO/técnica (mesma ressalva de detector-objecao.ts),
// nunca uma resposta pronta pra decorar.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { resolverRespostaDesvio, type RespostaBrutaDesvio } from "./interpretar-desvio-validacao";
import type {
  ConteudoExtraDetectado,
  FaqParaDesvio,
  GeradorConteudoExtra,
  InterpretadorDesvio,
  ObjecaoParaDesvio,
  ResultadoDesvio,
} from "./tipos";

const MODELO_CLASSIFICACAO = "claude-haiku-4-5-20251001";
const MODELO_GERACAO = "claude-sonnet-5";

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

// --- Classificação (Haiku) -----------------------------------------------------------------------

function ferramentaClassificacao(qtdFaqs: number, qtdObjecoes: number) {
  return {
    name: "interpretar_desvio",
    description: "Registra se a pergunta do lead já tem resposta numa FAQ, se é uma objeção/hesitação cadastrada, se precisa escalar pra um humano, ou se é ambígua demais pras três coisas.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["faq", "objecao", "escalar", "ambiguo"],
          description:
            "'faq' só quando a pergunta do lead bate claramente com uma das FAQs listadas — pergunta factual sobre a empresa/processo/serviço. 'objecao' quando o lead demonstra resistência/hesitação real à contratação (medo, achar caro, querer adiar, pedir desconto) que bate com uma das objeções listadas — dúvida factual neutra NÃO é objeção, é 'faq'. 'escalar' SÓ quando você tem certeza real de que é outro assunto/negócio que a empresa não atende, ou o lead pediu explicitamente falar com um humano. 'ambiguo' é o padrão pra qualquer outra coisa: uma tentativa (mesmo mal formulada) de responder a própria pergunta pendente, uma objeção sem match claro no banco, ou qualquer dúvida sem FAQ correspondente — sempre a escolha mais segura quando você não tem certeza absoluta, porque só faz o sistema repetir a pergunta, sem tirar o lead do automatizado.",
        },
        indice_faq: {
          type: "number",
          description: `Número da FAQ que responde a pergunta, de 1 a ${qtdFaqs} — só preencher com certeza quando status=faq.`,
        },
        indice_objecao: {
          type: "number",
          description: `Número da objeção cadastrada que corresponde, de 1 a ${qtdObjecoes} — só preencher com certeza quando status=objecao.`,
        },
      },
      required: ["status", "indice_faq", "indice_objecao"],
    },
  };
}

function montarPromptClassificacao(params: {
  perguntaPendente: string;
  respostaLead: string;
  faqsAtivas: FaqParaDesvio[];
  objecoesAtivas: ObjecaoParaDesvio[];
}): string {
  const { perguntaPendente, respostaLead, faqsAtivas, objecoesAtivas } = params;
  const listaFaqs = faqsAtivas.map((f, i) => `${i + 1}. P: ${f.pergunta}\n   R: ${f.resposta}`).join("\n");
  const listaObjecoes = objecoesAtivas.map((o, i) => `${i + 1}. ${o.objecao}`).join("\n");

  return [
    "Você ajuda a atender leads num script automatizado de WhatsApp (ArrudaCred, empresa de limpeza de nome/crédito). O lead respondeu algo que o checkpoint atual não reconheceu como resposta válida — pode ser uma pergunta lateral genuína, uma objeção/hesitação, uma tentativa de resposta mal interpretada, ou algo realmente fora do assunto.",
    "",
    `Pergunta que a Malala tinha feito (ainda pendente):\n"""\n${perguntaPendente}\n"""`,
    "",
    `Resposta do lead: "${respostaLead}"`,
    "",
    `FAQs cadastradas (perguntas factuais já respondidas oficialmente):\n${listaFaqs || "(nenhuma FAQ cadastrada)"}`,
    "",
    `Objeções cadastradas (resistência/hesitação — diferente de dúvida factual):\n${listaObjecoes || "(nenhuma objeção cadastrada)"}`,
    "",
    "Use a ferramenta pra registrar o resultado. REGRA DE CERTEZA: nunca marque 'faq' ou 'objecao' só porque parece relacionado — só quando bate de verdade com um item listado. 'escalar' é uma decisão forte (tira o lead do atendimento automatizado) — só use com certeza real de outro assunto/negócio ou pedido explícito de humano. Pra QUALQUER outra situação sem certeza, marque 'ambiguo' — é sempre mais seguro do que escalar ou forçar uma correspondência fraca.",
  ].join("\n");
}

async function classificarDesvio(params: {
  perguntaPendente: string;
  respostaLead: string;
  faqsAtivas: FaqParaDesvio[];
  objecoesAtivas: ObjecaoParaDesvio[];
}): Promise<RespostaBrutaDesvio> {
  const { faqsAtivas, objecoesAtivas } = params;
  const cliente = obterCliente();
  const resposta = await cliente.messages.create({
    model: MODELO_CLASSIFICACAO,
    max_tokens: 300,
    tools: [ferramentaClassificacao(faqsAtivas.length, objecoesAtivas.length)],
    tool_choice: { type: "tool", name: "interpretar_desvio" },
    messages: [{ role: "user", content: montarPromptClassificacao(params) }],
  });

  const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
  if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") {
    return { status: "ambiguo", indice_faq: 0, indice_objecao: 0 };
  }
  return blocoFerramenta.input as RespostaBrutaDesvio;
}

// --- Geração (Sonnet, voz completa da persona) ---------------------------------------------------

function montarPromptGeracao(params: {
  tipo: "faq" | "objecao";
  conteudo: string;
  respostaLead: string;
  perguntaPendente: string;
  nomeLead: string | null;
}): string {
  const { tipo, conteudo, respostaLead, perguntaPendente, nomeLead } = params;

  const instrucao =
    tipo === "faq"
      ? `O lead fez uma pergunta lateral com resposta OFICIAL já aprovada — use-a como fonte da verdade absoluta, sem mudar nem inventar nenhum fato, só reformulando numa frase natural, no seu tom:\n"""\n${conteudo}\n"""`
      : `O lead expressou uma objeção/hesitação. A orientação abaixo é TÉCNICA/raciocínio pra lidar com ela — não é uma resposta pronta pra decorar. Siga o princípio de tratamento de objeção da sua persona (ACOLHER → DIAGNOSTICAR → RESPONDER → REDUZIR RISCO/RESOLVER BARREIRA → RECUPERAR A DOR quando fizer sentido → PEDIR AVANÇO):\n"""\n${conteudo}\n"""`;

  return [
    instrucao,
    "",
    `Resposta do lead: "${respostaLead}"`,
    "",
    `Depois de tratar isso, retome (na MESMA mensagem) a pergunta que ainda está pendente — não precisa repetir palavra por palavra, mas precisa deixar claro que precisa dessa resposta pra continuar:\n"""\n${perguntaPendente}\n"""`,
    "",
    nomeLead
      ? `O nome do lead é "${nomeLead}" — use SÓ esse nome se for chamá-lo por nome (nem sempre precisa). NUNCA invente ou use outro nome.`
      : "O nome do lead ainda não é conhecido nesta conversa — NUNCA invente um nome, escreva sem chamá-lo por nome nenhum.",
    "",
    "Escreva só a mensagem final, pronta pra mandar pro lead pelo WhatsApp — sem aspas ao redor, sem comentário sobre a escolha.",
  ].join("\n");
}

/** Retorna null em qualquer falha — quem chama trata como "ambiguo" (cai no comportamento seguro de repetir a pergunta), nunca deixa a conversa sem resposta. */
async function gerarMensagemDesvio(params: {
  tipo: "faq" | "objecao";
  conteudo: string;
  respostaLead: string;
  perguntaPendente: string;
  nomeLead: string | null;
  personaTexto: string;
}): Promise<string | null> {
  try {
    const cliente = obterCliente();
    const resposta = await cliente.messages.create({
      model: MODELO_GERACAO,
      max_tokens: 500,
      system: params.personaTexto,
      messages: [{ role: "user", content: montarPromptGeracao(params) }],
    });

    const bloco = resposta.content.find((b) => b.type === "text");
    if (!bloco || bloco.type !== "text") return null;
    const texto = bloco.text.trim();
    return texto || null;
  } catch (e) {
    console.error("[interpretar-desvio] erro ao gerar mensagem:", e);
    return null;
  }
}

// --- Fábrica ---------------------------------------------------------------------------------------

/** FAQs, objeções ativas e o texto da persona capturados por closure (mesmo padrão de `criarInterpretadorFaixasDocumentos`) — carregados uma vez por dependências do motor, não a cada turno. */
export function criarInterpretadorDesvio(faqsAtivas: FaqParaDesvio[], objecoesAtivas: ObjecaoParaDesvio[], personaTexto: string | null): InterpretadorDesvio {
  return async ({ respostaLead, perguntaPendente, nomeLead }) => {
    if (faqsAtivas.length === 0 && objecoesAtivas.length === 0) return { status: "ambiguo" };

    let bruta: RespostaBrutaDesvio;
    try {
      bruta = await classificarDesvio({ perguntaPendente, respostaLead, faqsAtivas, objecoesAtivas });
    } catch (e) {
      console.error("[interpretar-desvio] erro ao classificar:", e);
      return { status: "ambiguo" };
    }

    const resolucao = resolverRespostaDesvio(bruta, faqsAtivas, objecoesAtivas);

    if (resolucao.status === "escalar") return { status: "escalar" } satisfies ResultadoDesvio;
    if (resolucao.status === "ambiguo") return { status: "ambiguo" } satisfies ResultadoDesvio;

    // faq ou objecao: sem persona configurada não dá pra gerar com a voz certa — mais seguro cair em
    // ambiguo (repete a pergunta) do que mandar uma mensagem genérica sem a nuance da Malala.
    if (!personaTexto) return { status: "ambiguo" };

    const conteudo = resolucao.status === "faq" ? resolucao.faq.resposta : resolucao.objecao.comoLidar;
    const mensagem = await gerarMensagemDesvio({
      tipo: resolucao.status,
      conteudo,
      respostaLead,
      perguntaPendente,
      nomeLead,
      personaTexto,
    });
    if (!mensagem) return { status: "ambiguo" };

    return resolucao.status === "faq" ? { status: "faq", mensagem } : { status: "objecao", mensagem };
  };
}

/**
 * Gera a mensagem que endereça um `ConteudoExtraDetectado` (FAQ ou objeção embutida numa resposta
 * já reconhecida por um dos 4 interpretadores — achado 22/08/2026). Reaproveita a MESMA geração com
 * a voz da persona já usada por `criarInterpretadorDesvio` (`gerarMensagemDesvio`) — a diferença é
 * só de onde vem a classificação: aqui já chega resolvida (o interpretador que reconheceu a
 * resposta já fez a detecção na mesma chamada de IA, ver `resolverConteudoExtra`), então não há
 * classificação nem resolução de índice pra fazer aqui, só geração.
 */
export function criarGeradorConteudoExtra(personaTexto: string | null): GeradorConteudoExtra {
  return async ({ conteudoExtra, respostaLead, perguntaPendente, nomeLead }) => {
    if (!conteudoExtra || !personaTexto) return null;

    const tipo = conteudoExtra.tipo;
    const conteudo = tipo === "faq" ? conteudoExtra.faq.resposta : conteudoExtra.objecao.comoLidar;

    return gerarMensagemDesvio({ tipo, conteudo, respostaLead, perguntaPendente, nomeLead, personaTexto });
  };
}

export type { ConteudoExtraDetectado };
