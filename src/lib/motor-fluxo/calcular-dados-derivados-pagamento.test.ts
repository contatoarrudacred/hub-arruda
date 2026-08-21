import { describe, expect, it } from "vitest";
import { criarCalculadoraDadosDerivados } from "./fluxo-limpeza-nome";
import type { FaixaPreco } from "./regras-limpeza-nome";

const FAIXA_TESTE: FaixaPreco = {
  faixaMin: 0,
  faixaMax: null,
  precoCheio: 3840,
  precoAvista: 3840,
  parcelasBoletoQtd: 6,
  parcelasBoletoValor: 640,
  parcelasCartaoMax: 12,
  voucherAvista: null,
  voucherParcelasQtd: null,
  voucherParcelasValor: null,
};

const CONFIG_TESTE = { altoValorFixo: 0, altoValorPercentual: 0, corteAltoValor: 500_000 };

describe("criarCalculadoraDadosDerivados — detalhe de pagamento", () => {
  const calcular = criarCalculadoraDadosDerivados(CONFIG_TESTE, [FAIXA_TESTE]);

  it("parcelado: calcula defaults (boleto_pix, hoje, ancora 10) e expande parcelas", () => {
    const derivados = calcular({
      forma_pagamento: "parcelado",
      documentos_valores: "2000",
    });
    expect(derivados.forma_pagamento_detalhe).toBe("boleto_pix");
    expect(derivados.dia_ancora_parcelas).toBe("10");
    expect(derivados.data_primeira_parcela).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(derivados.parcelas_valores).toBe("640.00,640.00,640.00,640.00,640.00,640.00");
    expect(derivados.parcelas_vencimentos?.split(",")).toHaveLength(6);
  });

  it("a vista: sem dia-ancora, uma parcela so", () => {
    const derivados = calcular({ forma_pagamento: "avista", documentos_valores: "2000" });
    expect(derivados.dia_ancora_parcelas).toBeUndefined();
    expect(derivados.parcelas_valores?.split(",")).toHaveLength(1);
  });

  it("nao recalcula (nem sobrescreve ajuste ja negociado) quando parcelas_valores ja existe", () => {
    const derivados = calcular({
      forma_pagamento: "parcelado",
      documentos_valores: "2000",
      parcelas_valores: "999",
      forma_pagamento_detalhe: "cartao",
    });
    expect(derivados.forma_pagamento_detalhe).toBeUndefined();
    expect(derivados.parcelas_valores).toBeUndefined();
  });
});

// Achado real (21/08/2026, bateria de testes da Malala): a parcela cobrada não batia com a
// "Condição Especial" (voucher) que a Malala tinha acabado de oferecer — o cálculo de defaults
// sempre usava o preço normal, nunca o preço com desconto do voucher, mesmo quando o lead topou
// a condição especial (prioridade_fechar_hoje=sim).
describe("criarCalculadoraDadosDerivados — Condição Especial (voucher)", () => {
  const FAIXA_COM_VOUCHER: FaixaPreco = {
    ...FAIXA_TESTE,
    voucherAvista: 1290,
    voucherParcelasQtd: 6,
    voucherParcelasValor: 399,
  };
  const calcular = criarCalculadoraDadosDerivados(CONFIG_TESTE, [FAIXA_COM_VOUCHER]);

  it("prioridade_fechar_hoje=sim + parcelado: usa o valor da parcela do voucher, não o normal", () => {
    const derivados = calcular({
      forma_pagamento: "parcelado",
      documentos_valores: "2000",
      prioridade_fechar_hoje: "sim",
    });
    expect(derivados.parcelas_valores).toBe("399.00,399.00,399.00,399.00,399.00,399.00");
  });

  it("prioridade_fechar_hoje=sim + à vista: usa o valor à vista do voucher, não o normal", () => {
    const derivados = calcular({
      forma_pagamento: "avista",
      documentos_valores: "2000",
      prioridade_fechar_hoje: "sim",
    });
    expect(derivados.parcelas_valores).toBe("1290.00");
  });

  it("sem prioridade_fechar_hoje: continua usando o preço normal (não aplica o voucher à toa)", () => {
    const derivados = calcular({
      forma_pagamento: "parcelado",
      documentos_valores: "2000",
      prioridade_fechar_hoje: "nao",
    });
    expect(derivados.parcelas_valores).toBe("640.00,640.00,640.00,640.00,640.00,640.00");
  });

  it("prioridade_fechar_hoje=sim mas faixa sem voucher parcelado (só à vista): cai pro parcelamento normal", () => {
    const faixaSoVoucherAvista: FaixaPreco = { ...FAIXA_TESTE, voucherAvista: 1290 };
    const calcularSoAvista = criarCalculadoraDadosDerivados(CONFIG_TESTE, [faixaSoVoucherAvista]);
    const derivados = calcularSoAvista({
      forma_pagamento: "parcelado",
      documentos_valores: "2000",
      prioridade_fechar_hoje: "sim",
    });
    expect(derivados.parcelas_valores).toBe("640.00,640.00,640.00,640.00,640.00,640.00");
  });
});
