import { describe, expect, it } from "vitest";
import {
  validarRespostaNegociacaoPagamento,
  type RespostaBrutaNegociacaoPagamento,
} from "./interpretar-negociacao-pagamento-validacao";

const HOJE = "2026-08-18";
const ESTADO_PADRAO = {
  formaPagamento: "boleto_pix" as const,
  dataPrimeiraParcela: HOJE,
  diaAncora: 10 as const,
  parcelado: true,
};

describe("validarRespostaNegociacaoPagamento", () => {
  it("confirmado passa direto", () => {
    const bruta: RespostaBrutaNegociacaoPagamento = {
      status: "confirmado",
      forma_pagamento: "boleto_pix",
      data_primeira_parcela: HOJE,
      dia_ancora: 10,
      mensagem: "",
    };
    expect(validarRespostaNegociacaoPagamento(bruta, ESTADO_PADRAO, HOJE)).toEqual({ status: "confirmado" });
  });

  it("ajuste_valido de forma de pagamento pra cartao", () => {
    const bruta: RespostaBrutaNegociacaoPagamento = {
      status: "ajuste_valido",
      forma_pagamento: "cartao",
      data_primeira_parcela: HOJE,
      dia_ancora: 10,
      mensagem: "Combinado, ajustei pra cartão!",
    };
    expect(validarRespostaNegociacaoPagamento(bruta, ESTADO_PADRAO, HOJE)).toEqual({
      status: "ajuste_valido",
      formaPagamento: "cartao",
      dataPrimeiraParcela: HOJE,
      diaAncora: 10,
      mensagemConfirmando: "Combinado, ajustei pra cartão!",
    });
  });

  it("ajuste_valido de data dentro do limite de 15 dias", () => {
    const bruta: RespostaBrutaNegociacaoPagamento = {
      status: "ajuste_valido",
      forma_pagamento: "boleto_pix",
      data_primeira_parcela: "2026-08-28",
      dia_ancora: 10,
      mensagem: "Fechado, dia 28!",
    };
    expect(validarRespostaNegociacaoPagamento(bruta, ESTADO_PADRAO, HOJE)).toEqual({
      status: "ajuste_valido",
      formaPagamento: "boleto_pix",
      dataPrimeiraParcela: "2026-08-28",
      diaAncora: 10,
      mensagemConfirmando: "Fechado, dia 28!",
    });
  });

  it("data pedida além de 15 dias vira negociando (nao aceita cegamente o que a IA mandou)", () => {
    const bruta: RespostaBrutaNegociacaoPagamento = {
      status: "ajuste_valido",
      forma_pagamento: "boleto_pix",
      data_primeira_parcela: "2026-09-10",
      dia_ancora: 10,
      mensagem: "",
    };
    const resultado = validarRespostaNegociacaoPagamento(bruta, ESTADO_PADRAO, HOJE);
    expect(resultado.status).toBe("negociando");
  });

  it("dia-ancora fora de 01/10/20 vira negociando mesmo se a IA mandou ajuste_valido", () => {
    const bruta: RespostaBrutaNegociacaoPagamento = {
      status: "ajuste_valido",
      forma_pagamento: "boleto_pix",
      data_primeira_parcela: HOJE,
      dia_ancora: 15,
      mensagem: "",
    };
    const resultado = validarRespostaNegociacaoPagamento(bruta, ESTADO_PADRAO, HOJE);
    expect(resultado.status).toBe("negociando");
  });

  it("dia-ancora em pedido a vista fica null mesmo se a IA mandou um numero", () => {
    const estadoAvista = { ...ESTADO_PADRAO, parcelado: false };
    const bruta: RespostaBrutaNegociacaoPagamento = {
      status: "ajuste_valido",
      forma_pagamento: "cartao",
      data_primeira_parcela: HOJE,
      dia_ancora: 10,
      mensagem: "Combinado!",
    };
    expect(validarRespostaNegociacaoPagamento(bruta, estadoAvista, HOJE)).toEqual({
      status: "ajuste_valido",
      formaPagamento: "cartao",
      dataPrimeiraParcela: HOJE,
      diaAncora: null,
      mensagemConfirmando: "Combinado!",
    });
  });

  it("negociando repassa a mensagem da IA", () => {
    const bruta: RespostaBrutaNegociacaoPagamento = {
      status: "negociando",
      forma_pagamento: "boleto_pix",
      data_primeira_parcela: HOJE,
      dia_ancora: 10,
      mensagem: "Consigo adiar até 15 dias — quer que eu deixe pro dia 28?",
    };
    expect(validarRespostaNegociacaoPagamento(bruta, ESTADO_PADRAO, HOJE)).toEqual({
      status: "negociando",
      mensagemNegociacao: "Consigo adiar até 15 dias — quer que eu deixe pro dia 28?",
    });
  });

  it("status desconhecido vira negociando com mensagem generica (nunca quebra o motor)", () => {
    const bruta = {
      status: "algo_invalido",
      forma_pagamento: "boleto_pix",
      data_primeira_parcela: HOJE,
      dia_ancora: 10,
      mensagem: "",
    } as unknown as RespostaBrutaNegociacaoPagamento;
    const resultado = validarRespostaNegociacaoPagamento(bruta, ESTADO_PADRAO, HOJE);
    expect(resultado.status).toBe("negociando");
  });
});
