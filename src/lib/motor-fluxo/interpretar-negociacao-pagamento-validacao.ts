// Parte pura de interpretar-negociacao-pagamento.ts, separada sem `server-only` de propósito —
// mesmo motivo de interpretacao-ia-validacao.ts / interpretar-faixas-documentos-validacao.ts (o SDK
// da Anthropic quebra o Vitest se importado direto).

import { DIAS_ANCORA_VALIDOS, validarDataPrimeiraParcela, type DiaAncora } from "./calculo-vencimentos-pagamento";
import type { ResultadoNegociacaoPagamento } from "./tipos";

export type RespostaBrutaNegociacaoPagamento = {
  status: "confirmado" | "ajuste_valido" | "negociando";
  forma_pagamento: "boleto_pix" | "cartao";
  data_primeira_parcela: string;
  dia_ancora: number;
  mensagem: string;
};

/** Estado atual da negociação (o que já está em `dados` — defaults ou ajuste de rodada anterior). */
export type EstadoNegociacaoPagamento = {
  formaPagamento: "boleto_pix" | "cartao";
  dataPrimeiraParcela: string;
  diaAncora: DiaAncora;
  /** false = à vista, parcela única — dia-âncora não se aplica */
  parcelado: boolean;
};

const MENSAGEM_NEGOCIANDO_GENERICA = "Deixa eu confirmar isso direitinho com você antes de seguir.";

/**
 * Valida a resposta bruta da IA contra as regras de negócio (spec, seção 1) — nunca confia cegamente
 * que o modelo respeitou o limite de 15 dias ou o dia-âncora 01/10/20 sozinho; rebaixa pra
 * "negociando" com mensagem genérica sempre que o que a IA mandou não bate com a regra.
 */
export function validarRespostaNegociacaoPagamento(
  bruta: RespostaBrutaNegociacaoPagamento,
  estadoAtual: EstadoNegociacaoPagamento,
  hojeISO: string,
): ResultadoNegociacaoPagamento {
  if (bruta.status === "confirmado") return { status: "confirmado" };

  if (bruta.status === "negociando") {
    const mensagem = bruta.mensagem?.trim();
    return { status: "negociando", mensagemNegociacao: mensagem || MENSAGEM_NEGOCIANDO_GENERICA };
  }

  if (bruta.status !== "ajuste_valido") {
    return { status: "negociando", mensagemNegociacao: MENSAGEM_NEGOCIANDO_GENERICA };
  }

  const dataValidada = validarDataPrimeiraParcela(bruta.data_primeira_parcela, hojeISO);
  if (!dataValidada) return { status: "negociando", mensagemNegociacao: MENSAGEM_NEGOCIANDO_GENERICA };

  let diaAncora: DiaAncora | null = null;
  if (estadoAtual.parcelado) {
    if (!DIAS_ANCORA_VALIDOS.includes(bruta.dia_ancora as DiaAncora)) {
      return { status: "negociando", mensagemNegociacao: MENSAGEM_NEGOCIANDO_GENERICA };
    }
    diaAncora = bruta.dia_ancora as DiaAncora;
  }

  if (bruta.forma_pagamento !== "boleto_pix" && bruta.forma_pagamento !== "cartao") {
    return { status: "negociando", mensagemNegociacao: MENSAGEM_NEGOCIANDO_GENERICA };
  }

  const mensagemConfirmando = bruta.mensagem?.trim();
  if (!mensagemConfirmando) return { status: "negociando", mensagemNegociacao: MENSAGEM_NEGOCIANDO_GENERICA };

  return {
    status: "ajuste_valido",
    formaPagamento: bruta.forma_pagamento,
    dataPrimeiraParcela: dataValidada,
    diaAncora,
    mensagemConfirmando,
  };
}
