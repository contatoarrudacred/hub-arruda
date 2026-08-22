// Interpretador de desvio — spec docs/superpowers/plans/2026-08-21-desvio-escalar-quando-nao-sabe.md.
// Só roda quando o InterpretadorIA genérico (interpretacao-ia.ts) não reconheceu a resposta do lead
// como sendo sobre o checkpoint atual: decide se é uma pergunta lateral que já tem resposta oficial
// (FAQ) ou se a Malala genuinamente não sabe responder (escalar pra humano em vez de repetir a
// pergunta ignorando o lead — regra de Luiz, 21/08/2026: nunca adivinhar nem protelar).

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { textoDeMensagem } from "./engine";
import { validarResultadoDesvio, type RespostaBrutaDesvio } from "./interpretar-desvio-validacao";
import type { EtapaCarregada, FaqParaDesvio, InterpretadorDesvio, ResultadoDesvio } from "./tipos";

const MODELO_INTERPRETACAO = "claude-haiku-4-5-20251001";

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

function ferramenta(qtdFaqs: number) {
  return {
    name: "interpretar_desvio",
    description: "Registra se a pergunta do lead já tem resposta numa FAQ cadastrada, ou se precisa escalar pra um atendente humano.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["faq", "escalar"],
          description:
            "'faq' só quando a pergunta do lead bate claramente com uma das FAQs listadas — pergunta factual sobre a empresa/processo/serviço. 'escalar' pra qualquer outra coisa: fora do escopo comercial (ex.: outro produto que a empresa não vende), pergunta que nenhuma FAQ cobre, objeção/resistência, ou qualquer ambiguidade — prefira escalar a forçar uma correspondência fraca.",
        },
        indice_faq: {
          type: "number",
          description: `Número da FAQ que responde a pergunta, de 1 a ${qtdFaqs} — só preencher com certeza quando status=faq.`,
        },
      },
      required: ["status", "indice_faq"],
    },
  };
}

function montarPrompt(params: { etapaAtual: EtapaCarregada; respostaLead: string; faqsAtivas: FaqParaDesvio[] }): string {
  const { etapaAtual, respostaLead, faqsAtivas } = params;
  const perguntaPendente = etapaAtual.conteudo.mensagens.map(textoDeMensagem).join("\n");
  const listaFaqs = faqsAtivas.map((f, i) => `${i + 1}. P: ${f.pergunta}\n   R: ${f.resposta}`).join("\n");

  return [
    "Você ajuda a atender leads num script automatizado de WhatsApp (ArrudaCred, empresa de limpeza de nome/crédito). O lead respondeu algo que não tem nada a ver com a pergunta que a Malala fez — pode ser uma pergunta lateral genuína, ou pode ser algo totalmente fora do assunto.",
    "",
    `Pergunta que a Malala tinha feito (ainda pendente):\n"""\n${perguntaPendente}\n"""`,
    "",
    `Resposta do lead: "${respostaLead}"`,
    "",
    `FAQs cadastradas (perguntas factuais já respondidas oficialmente):\n${listaFaqs || "(nenhuma FAQ cadastrada)"}`,
    "",
    "Use a ferramenta pra registrar o resultado. REGRA DE CERTEZA: nunca marque 'faq' só porque parece relacionado — só quando a pergunta do lead bate de verdade com uma das FAQs listadas. Qualquer coisa fora disso (inclusive um produto/serviço que a empresa não vende, ou uma pergunta sem FAQ correspondente) é 'escalar' — é sempre mais seguro escalar pra um humano do que a Malala inventar ou adivinhar uma resposta.",
  ].join("\n");
}

/** FAQs ativas capturadas por closure (mesmo padrão de `criarInterpretadorFaixasDocumentos`) — carregadas uma vez por dependências do motor, não a cada turno. */
export function criarInterpretadorDesvio(faqsAtivas: FaqParaDesvio[]): InterpretadorDesvio {
  return async ({ etapaAtual, respostaLead }) => {
    if (faqsAtivas.length === 0) return { status: "escalar" };

    const prompt = montarPrompt({ etapaAtual, respostaLead, faqsAtivas });

    try {
      const cliente = obterCliente();
      const resposta = await cliente.messages.create({
        model: MODELO_INTERPRETACAO,
        max_tokens: 300,
        tools: [ferramenta(faqsAtivas.length)],
        tool_choice: { type: "tool", name: "interpretar_desvio" },
        messages: [{ role: "user", content: prompt }],
      });

      const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
      if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") return { status: "escalar" } satisfies ResultadoDesvio;

      const bruta = blocoFerramenta.input as RespostaBrutaDesvio;
      return validarResultadoDesvio(bruta, faqsAtivas);
    } catch (e) {
      console.error("[interpretar-desvio] erro ao chamar Claude:", e);
      return { status: "escalar" };
    }
  };
}
