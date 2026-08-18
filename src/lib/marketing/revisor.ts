// src/lib/marketing/revisor.ts
// Estágio 2 do pipeline — valida o rascunho contra o checklist da propriedade + checagem de
// alucinação factual, score mínimo 80/100 (mesmo padrão do plano original da QMARKA).

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ConteudoGerado, ItemChecklistCarregado, ResultadoRevisao, UsageTokens } from "./tipos";

const MODELO_REVISOR = "claude-sonnet-5";
const SCORE_MINIMO_APROVACAO = 80;

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

const FERRAMENTA_REVISOR = {
  name: "registrar_revisao",
  description: "Registra o resultado da revisão de qualidade do rascunho.",
  input_schema: {
    type: "object" as const,
    properties: {
      score: { type: "number", description: "Score de 0 a 100, ponderado pelo peso de cada item do checklist." },
      motivo: {
        type: "string",
        description: "Obrigatório quando score < 80: explica especificamente o que falhou, para o Escritor corrigir na próxima tentativa. Null quando score >= 80.",
      },
    },
    required: ["score"],
  },
};

function montarPrompt(conteudo: ConteudoGerado, checklist: ItemChecklistCarregado[]): string {
  const linhasChecklist = checklist.map((c) => `- (peso ${c.peso}) ${c.item}`).join("\n");
  return [
    "Você é o Agente QA/Revisor de um pipeline de geração de conteúdo. Avalie o rascunho abaixo contra o checklist, incluindo checagem de alucinação factual (dados numéricos citados precisam ser plausíveis, não inventados). Score mínimo para aprovação: 80/100.",
    "",
    "Checklist:",
    linhasChecklist,
    "",
    `Título: ${conteudo.titulo}`,
    `Meta title: ${conteudo.metaTitle}`,
    `Meta description: ${conteudo.metaDescription}`,
    `Conteúdo HTML:\n"""\n${conteudo.conteudoHtml}\n"""`,
    "",
    "Use a ferramenta para registrar o resultado. Se o score for menor que 80, o campo motivo é obrigatório e precisa ser específico o suficiente para o Escritor corrigir.",
  ].join("\n");
}

export async function revisarConteudo(
  conteudo: ConteudoGerado,
  checklist: ItemChecklistCarregado[],
): Promise<{ resultado: ResultadoRevisao; usage: UsageTokens }> {
  const cliente = obterCliente();
  const prompt = montarPrompt(conteudo, checklist);

  const resposta = await cliente.messages.create({
    model: MODELO_REVISOR,
    max_tokens: 1000,
    tools: [FERRAMENTA_REVISOR],
    tool_choice: { type: "tool", name: "registrar_revisao" },
    messages: [{ role: "user", content: prompt }],
  });

  const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
  if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") {
    throw new Error("Revisor não retornou resultado estruturado.");
  }

  const bruta = blocoFerramenta.input as { score: number; motivo?: string | null };
  const aprovado = bruta.score >= SCORE_MINIMO_APROVACAO;

  return {
    resultado: { aprovado, score: bruta.score, motivo: aprovado ? null : (bruta.motivo ?? "Score abaixo do mínimo, sem motivo detalhado.") },
    usage: {
      inputTokens: resposta.usage?.input_tokens ?? 0,
      outputTokens: resposta.usage?.output_tokens ?? 0,
    },
  };
}
