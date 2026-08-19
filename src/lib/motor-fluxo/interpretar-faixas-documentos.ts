// Interpretador especializado de `tipo_resposta: "faixas_documentos"` (suporte a "pacote" — Bloco
// C, PLANO_MESTRE seção 11). Extrai a faixa de valor de TODOS os documentos de uma resposta livre
// só (decisão de Luiz, 17/08/2026: uma pergunta só, não um checkpoint por documento). Mesma
// filosofia de 3 saídas de interpretar-lista-documentos.ts — só dá "completo" quando tiver um
// valor (ou "não sei" explícito) pra cada documento já sabido em `dados.documentos_tipos`.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { textoDeMensagem } from "./engine";
import {
  validarRespostaFaixasDocumentos,
  type RespostaBrutaFaixasDocumentos,
} from "./interpretar-faixas-documentos-validacao";
import type { EtapaCarregada, InterpretadorFaixasDocumentos } from "./tipos";

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

function ferramenta(tiposEsperados: ("cpf" | "cnpj")[]) {
  return {
    name: "interpretar_faixas_documentos",
    description:
      "Registra a faixa de valor aproximada de cada documento que o lead quer limpar, ou pede esclarecimento quando falta informação de algum.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["completo", "incompleto", "nao_entendi"],
          description:
            "'completo' só quando tiver um valor aproximado (ou 'não sei' explícito) pra CADA UM dos documentos. 'incompleto' quando faltar informação de pelo menos um documento — gere uma pergunta de esclarecimento específica pedindo só o que falta. 'nao_entendi' quando a resposta não tem nada a ver com valores de restrição.",
        },
        itens: {
          type: "array",
          description: `Exatamente ${tiposEsperados.length} item(ns), nesta ordem exata de tipo: ${tiposEsperados.join(", ")}. Só preencher com certeza quando status=completo.`,
          items: {
            type: "object",
            properties: {
              tipo: { type: "string", enum: ["cpf", "cnpj"] },
              sabe_valor: {
                type: "boolean",
                description: "false quando o lead respondeu 'não sei' (ou equivalente) pra este documento específico.",
              },
              valor_aproximado: {
                type: "number",
                description: "Valor aproximado em reais pra este documento. 0 quando sabe_valor=false.",
              },
            },
            required: ["tipo", "sabe_valor", "valor_aproximado"],
          },
        },
        pergunta_esclarecimento: {
          type: "string",
          description:
            "Só quando status=incompleto: pergunta curta e específica em português, no tom da Malala, pedindo só a informação que falta (não repita a pergunta original inteira).",
        },
      },
      required: ["status", "itens", "pergunta_esclarecimento"],
    },
  };
}

function montarPrompt(params: { etapaAtual: EtapaCarregada; respostaLead: string; tiposEsperados: ("cpf" | "cnpj")[] }): string {
  const { etapaAtual, respostaLead, tiposEsperados } = params;
  const pergunta = etapaAtual.conteudo.mensagens.map(textoDeMensagem).join("\n");
  const listaDocumentos = tiposEsperados.map((tipo, i) => `${i + 1}. ${tipo.toUpperCase()}`).join("\n");

  return [
    "Você ajuda a entender a faixa de valor de restrição de cada documento que um lead quer limpar, num atendimento automatizado de WhatsApp (ArrudaCred, empresa de limpeza de nome/crédito).",
    "",
    `Documentos já confirmados nesta conversa, nesta ordem:\n${listaDocumentos}`,
    "",
    `Pergunta feita ao lead:\n"""\n${pergunta}\n"""`,
    "",
    `Resposta do lead: "${respostaLead}"`,
    "",
    "O lead pode responder com valores aproximados por extenso, com gírias, ou dizer 'não sei' pra qualquer documento (isso é uma resposta válida, não bloqueia o status completo). Use a ferramenta pra registrar o resultado, na mesma ordem dos documentos listados acima. Só marque 'completo' quando tiver informação (valor OU 'não sei' explícito) de TODOS os documentos — é melhor pedir esclarecimento do que assumir errado.",
  ].join("\n");
}

export const interpretarFaixasDocumentos: InterpretadorFaixasDocumentos = async ({ etapaAtual, respostaLead, dados }) => {
  const tiposEsperados = (dados.documentos_tipos ?? "")
    .split(",")
    .filter((t): t is "cpf" | "cnpj" => t === "cpf" || t === "cnpj");
  if (tiposEsperados.length === 0) return { status: "nao_entendi" };

  const prompt = montarPrompt({ etapaAtual, respostaLead, tiposEsperados });

  try {
    // obterCliente() dentro do try de propósito (achado real, 18/08/2026, ver interpretacao-ia.ts).
    const cliente = obterCliente();
    const resposta = await cliente.messages.create({
      model: MODELO_INTERPRETACAO,
      max_tokens: 800,
      tools: [ferramenta(tiposEsperados)],
      tool_choice: { type: "tool", name: "interpretar_faixas_documentos" },
      messages: [{ role: "user", content: prompt }],
    });

    const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
    if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") return { status: "nao_entendi" };

    const bruta = blocoFerramenta.input as RespostaBrutaFaixasDocumentos;
    return validarRespostaFaixasDocumentos(bruta, tiposEsperados);
  } catch (e) {
    console.error("[interpretar-faixas-documentos] erro ao chamar Claude:", e);
    return { status: "nao_entendi" };
  }
};
