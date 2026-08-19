// Interpretador especializado de `tipo_resposta: "negociacao_pagamento"` — negocia naturalmente o
// detalhe de pagamento do fechamento (forma, data da 1ª parcela, dia-âncora das seguintes) em vez de
// um menu fechado. Spec: docs/superpowers/specs/2026-08-18-captura-detalhe-pagamento-fechamento-design.md.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { dataDeHojeISO } from "./calculo-vencimentos-pagamento";
import { textoDeMensagem } from "./engine";
import {
  validarRespostaNegociacaoPagamento,
  type EstadoNegociacaoPagamento,
  type RespostaBrutaNegociacaoPagamento,
} from "./interpretar-negociacao-pagamento-validacao";
import type { EtapaCarregada, InterpretadorNegociacaoPagamento } from "./tipos";

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

function ferramenta() {
  return {
    name: "interpretar_negociacao_pagamento",
    description:
      "Registra se o lead confirmou a mensagem de pagamento como está, pediu um ajuste válido, ou precisa de mais negociação/explicação.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["confirmado", "ajuste_valido", "negociando"],
          description:
            "'confirmado' quando o lead aceitou a proposta como está (ex.: 'confirmo', 'pode ser', 'tá bom'). 'ajuste_valido' quando pediu uma mudança que está dentro do que é permitido (forma boleto_pix/cartão, data até 15 dias a partir de hoje, dia-âncora 01/10/20). 'negociando' quando pediu algo fora do permitido, foi ambíguo, ou fez uma pergunta — gere uma resposta natural explicando o que é possível.",
        },
        forma_pagamento: {
          type: "string",
          enum: ["boleto_pix", "cartao"],
          description: "Forma de pagamento final (mesmo quando não mudou, repita o valor atual).",
        },
        data_primeira_parcela: {
          type: "string",
          description: "Data da 1ª parcela em ISO (YYYY-MM-DD) — mesmo quando não mudou, repita a data atual.",
        },
        dia_ancora: {
          type: "number",
          description:
            "Dia-âncora das parcelas seguintes (1, 10 ou 20) — mesmo quando não mudou, repita o valor atual. Ignorado se a venda é à vista.",
        },
        mensagem: {
          type: "string",
          description:
            "Se status=ajuste_valido: frase curta e natural confirmando a mudança (ex.: 'Combinado, ajustei pra cartão!'). Se status=negociando: mensagem explicando o que é possível dentro do que o lead pediu, no tom da Malala — natural, não robótica, pode fazer pergunta de volta. Vazio se status=confirmado.",
        },
      },
      required: ["status", "forma_pagamento", "data_primeira_parcela", "dia_ancora", "mensagem"],
    },
  };
}

function montarPrompt(params: {
  etapaAtual: EtapaCarregada;
  respostaLead: string;
  estadoAtual: EstadoNegociacaoPagamento;
  hojeISO: string;
}): string {
  const { etapaAtual, respostaLead, estadoAtual, hojeISO } = params;
  const mensagemAtual = etapaAtual.conteudo.mensagens.map(textoDeMensagem).join("\n");

  return [
    "Você é a Malala, atendente automatizada de WhatsApp da ArrudaCred (limpeza de nome/crédito). Você acabou de mandar uma mensagem de confirmação de pagamento pro lead e ele respondeu.",
    "",
    `Mensagem de confirmação que o lead recebeu:\n"""\n${mensagemAtual}\n"""`,
    "",
    `Estado atual (o que está na mensagem acima): forma de pagamento ${estadoAtual.formaPagamento}, 1ª parcela em ${estadoAtual.dataPrimeiraParcela}${
      estadoAtual.parcelado ? `, parcelas seguintes sempre no dia ${estadoAtual.diaAncora}` : " (pagamento único, à vista)"
    }.`,
    `Hoje é ${hojeISO}.`,
    "",
    `Resposta do lead: "${respostaLead}"`,
    "",
    "Regras de negócio pra validar qualquer pedido de mudança:",
    "- Forma de pagamento: só Boleto/Pix ou Cartão.",
    `- Data da 1ª parcela: pode ser adiada a partir de hoje (${hojeISO}), no máximo até 15 dias depois — nunca antes de hoje, nunca mais que 15 dias.`,
    estadoAtual.parcelado
      ? "- Dia-âncora das parcelas seguintes: só 01, 10 ou 20 do mês."
      : "- Esta venda é à vista — não existe dia-âncora, só a data da 1ª (e única) parcela.",
    "",
    "Se o lead confirmou (mesmo implicitamente, tipo 'combinado' ou 'pode fechar assim'), marque confirmado. Se pediu algo dentro do permitido, marque ajuste_valido com os valores finais. Se pediu algo fora do permitido, foi vago, ou fez uma pergunta, marque negociando e escreva uma resposta natural (não robótica) explicando o que é possível — pode negociar em várias mensagens, não precisa fechar nesta.",
  ].join("\n");
}

export const interpretarNegociacaoPagamento: InterpretadorNegociacaoPagamento = async ({
  etapaAtual,
  respostaLead,
  dados,
}) => {
  const hojeISO = dataDeHojeISO();
  const estadoAtual: EstadoNegociacaoPagamento = {
    formaPagamento: dados.forma_pagamento_detalhe === "cartao" ? "cartao" : "boleto_pix",
    dataPrimeiraParcela: dados.data_primeira_parcela || hojeISO,
    diaAncora:
      dados.dia_ancora_parcelas === "1" || dados.dia_ancora_parcelas === "20"
        ? (Number(dados.dia_ancora_parcelas) as 1 | 20)
        : 10,
    parcelado: dados.forma_pagamento === "parcelado",
  };

  const prompt = montarPrompt({ etapaAtual, respostaLead, estadoAtual, hojeISO });

  try {
    // obterCliente() dentro do try de propósito (achado real, 18/08/2026, ver interpretacao-ia.ts).
    const cliente = obterCliente();
    const resposta = await cliente.messages.create({
      model: MODELO_INTERPRETACAO,
      max_tokens: 800,
      tools: [ferramenta()],
      tool_choice: { type: "tool", name: "interpretar_negociacao_pagamento" },
      messages: [{ role: "user", content: prompt }],
    });

    const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
    if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") {
      return { status: "negociando", mensagemNegociacao: "Deixa eu confirmar isso direitinho com você antes de seguir." };
    }

    const bruta = blocoFerramenta.input as RespostaBrutaNegociacaoPagamento;
    return validarRespostaNegociacaoPagamento(bruta, estadoAtual, hojeISO);
  } catch (e) {
    console.error("[interpretar-negociacao-pagamento] erro ao chamar Claude:", e);
    return { status: "negociando", mensagemNegociacao: "Deixa eu confirmar isso direitinho com você antes de seguir." };
  }
};
