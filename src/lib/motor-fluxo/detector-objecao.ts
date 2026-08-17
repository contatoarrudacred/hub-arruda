// Detector de objeção + resposta sugerida — Bloco C / Fase 5, item registrado em
// TELA_ATENDIMENTO_ARRUDACRED.md ("Badge de objeção detectada + resposta sugerida... cruza com o
// banco de objeções já existente"). Mesmo padrão de cliente/modelo de interpretacao-ia.ts (Haiku,
// tool-use, classificação/extração — não geração com a nuance da Malala).
//
// Importante (ver comentário de `objecoes.como_lidar` na migration 20260814170000): o campo
// `como_lidar` é ORIENTAÇÃO/TÉCNICA pro atendente, não uma resposta pronta pra mandar ao lead —
// por isso este módulo só sugere, nunca insere `comoLidar` direto no composer como se fosse a
// mensagem a enviar.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const MODELO_DETECTOR = "claude-haiku-4-5-20251001";

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

export type ObjecaoParaDetector = { id: string; objecao: string; comoLidar: string };

export type ObjecaoDetectada = { id: string; objecao: string; comoLidar: string };

const FERRAMENTA_DETECTOR = {
  name: "detectar_objecao",
  description: "Registra se a última mensagem do lead expressa uma das objeções cadastradas.",
  input_schema: {
    type: "object" as const,
    properties: {
      objecao_detectada: {
        type: "boolean",
        description:
          "true só se a mensagem do lead expressar claramente resistência/hesitação à contratação que corresponda a uma das objeções listadas. false para perguntas factuais neutras (isso é FAQ, não objeção), respostas normais de andamento do fluxo, ou qualquer mensagem sem sinal de resistência.",
      },
      indice: {
        type: "number",
        description: "Quando objecao_detectada=true: o número (1-based) da objeção da lista que melhor corresponde. Ignorado quando objecao_detectada=false.",
      },
    },
    required: ["objecao_detectada"],
  },
};

function montarPrompt(mensagemLead: string, objecoes: ObjecaoParaDetector[]): string {
  const lista = objecoes.map((o, i) => `${i + 1}. ${o.objecao}`).join("\n");
  return [
    "Você ajuda a identificar objeções de leads num atendimento de WhatsApp da ArrudaCred (empresa de limpeza de nome/crédito). Objeção é diferente de dúvida factual — é quando o lead demonstra resistência real à contratação (medo, desconfiança, achar caro, querer adiar, etc.), não uma pergunta neutra.",
    "",
    `Mensagem do lead: "${mensagemLead}"`,
    "",
    `Lista de objeções cadastradas:\n${lista}`,
    "",
    "Use a ferramenta pra registrar o resultado. Prefira marcar objecao_detectada=false a forçar uma correspondência fraca — um falso negativo é seguro (o atendente humano vai ler a mensagem de qualquer forma), um falso positivo espalha ruído.",
  ].join("\n");
}

/** Retorna null quando não detecta objeção OU em qualquer falha — é um "nice to have" da UI, nunca deve travar nada. */
export async function detectarObjecao(mensagemLead: string, objecoesAtivas: ObjecaoParaDetector[]): Promise<ObjecaoDetectada | null> {
  if (!mensagemLead.trim() || objecoesAtivas.length === 0) return null;

  try {
    const cliente = obterCliente();
    const resposta = await cliente.messages.create({
      model: MODELO_DETECTOR,
      max_tokens: 100,
      tools: [FERRAMENTA_DETECTOR],
      tool_choice: { type: "tool", name: "detectar_objecao" },
      messages: [{ role: "user", content: montarPrompt(mensagemLead, objecoesAtivas) }],
    });

    const bloco = resposta.content.find((b) => b.type === "tool_use");
    if (!bloco || bloco.type !== "tool_use") return null;

    const bruto = bloco.input as { objecao_detectada: boolean; indice?: number };
    if (!bruto.objecao_detectada || typeof bruto.indice !== "number") return null;

    const objecao = objecoesAtivas[bruto.indice - 1];
    return objecao ?? null;
  } catch (e) {
    console.error("[detector-objecao] erro ao chamar Claude:", e);
    return null;
  }
}
