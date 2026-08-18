// Interpretador especializado de `tipo_resposta: "lista_documentos"` (suporte a "pacote" de N
// CPF/CNPJ — Bloco C, PLANO_MESTRE seção 11). Diferente de interpretacao-ia.ts (2 saídas), este
// tem 3: completo / incompleto (pede esclarecimento específico) / não entendi — decisão de Luiz
// (17/08/2026): "a IA só pode dar checkpoint depois de ter entendido exatamente o que o lead
// precisa e ter informações suficientes pra gerar proposta".

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { textoDeMensagem } from "./engine";
import {
  validarRespostaListaDocumentos,
  type RespostaBrutaListaDocumentos,
} from "./interpretar-lista-documentos-validacao";
import type { EtapaCarregada, InterpretadorListaDocumentos } from "./tipos";

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

const FERRAMENTA = {
  name: "interpretar_lista_documentos",
  description:
    "Registra quantos documentos (CPF/CNPJ) o lead quer limpar, ou pede esclarecimento quando a resposta não deixa isso claro.",
  input_schema: {
    type: "object" as const,
    properties: {
      status: {
        type: "string",
        enum: ["completo", "incompleto", "nao_entendi"],
        description:
          "'completo' só quando der pra saber com certeza quantos CPFs e quantos CNPJs o lead quer limpar. 'incompleto' quando entendeu que o lead quer limpar mais de um documento (ou não deixou claro) mas falta saber quantos/quais tipos — gere uma pergunta de esclarecimento específica. 'nao_entendi' quando a resposta não tem nada a ver com quantidade/tipo de documento.",
      },
      quantidade_cpf: {
        type: "integer",
        description: "Quantos CPFs o lead quer limpar. 0 se nenhum. Só preencher com certeza quando status=completo.",
      },
      quantidade_cnpj: {
        type: "integer",
        description: "Quantos CNPJs o lead quer limpar. 0 se nenhum. Só preencher com certeza quando status=completo.",
      },
      pergunta_esclarecimento: {
        type: "string",
        description:
          "Só quando status=incompleto: uma pergunta curta e específica em português, no tom da Malala (consultora ArrudaCred), perguntando exatamente o que falta saber — nunca repita a pergunta original genérica.",
      },
    },
    required: ["status", "quantidade_cpf", "quantidade_cnpj", "pergunta_esclarecimento"],
  },
};

function montarPrompt(params: { etapaAtual: EtapaCarregada; respostaLead: string }): string {
  const { etapaAtual, respostaLead } = params;
  const pergunta = etapaAtual.conteudo.mensagens.map(textoDeMensagem).join("\n");

  return [
    "Você ajuda a entender quantos documentos (CPF e/ou CNPJ) um lead quer limpar num atendimento automatizado de WhatsApp (ArrudaCred, empresa de limpeza de nome/crédito). O lead pode pedir só 1 documento, ou um 'pacote' com vários (ex.: '2 CPF e 1 CNPJ da minha empresa').",
    "",
    `Pergunta feita ao lead:\n"""\n${pergunta}\n"""`,
    "",
    `Resposta do lead: "${respostaLead}"`,
    "",
    "Use a ferramenta pra registrar o resultado. Só marque 'completo' quando tiver certeza real da quantidade de cada tipo — é melhor pedir esclarecimento (status=incompleto, com uma pergunta específica) do que adivinhar errado e gerar uma proposta pro número errado de documentos.",
  ].join("\n");
}

export const interpretarListaDocumentos: InterpretadorListaDocumentos = async ({ etapaAtual, respostaLead }) => {
  const cliente = obterCliente();
  const prompt = montarPrompt({ etapaAtual, respostaLead });

  try {
    const resposta = await cliente.messages.create({
      model: MODELO_INTERPRETACAO,
      max_tokens: 400,
      tools: [FERRAMENTA],
      tool_choice: { type: "tool", name: "interpretar_lista_documentos" },
      messages: [{ role: "user", content: prompt }],
    });

    const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
    if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") return { status: "nao_entendi" };

    const bruta = blocoFerramenta.input as RespostaBrutaListaDocumentos;
    return validarRespostaListaDocumentos(bruta);
  } catch (e) {
    console.error("[interpretar-lista-documentos] erro ao chamar Claude:", e);
    return { status: "nao_entendi" };
  }
};
