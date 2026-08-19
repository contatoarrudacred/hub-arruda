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
