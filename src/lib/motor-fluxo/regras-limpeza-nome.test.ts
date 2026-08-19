import { describe, expect, it } from "vitest";
import { FAIXAS_PRECOS_LIMPEZA_NOME as FAIXAS_PRECOS } from "./dados-referencia-limpeza-nome";
import {
  buscarFaixaPreco,
  combinarFaixasPacote,
  combinarParcelas,
  formatarFaixaConfirmacao,
  formatarLabelFaixa,
  formatarMenuFaixas,
  formatarParcelas,
  montarMensagemConfirmacaoFaixa,
  valorRepresentativoFaixa,
  type FaixaPreco,
} from "./regras-limpeza-nome";

describe("combinarParcelas (pacote Fase 4, régua mês a mês)", () => {
  it("um documento só degenera num tier único", () => {
    expect(combinarParcelas([{ quantidade: 6, valor: 430 }])).toEqual([{ quantidade: 6, valor: 430 }]);
  });

  it("exemplo de Luiz: CPF 6x R$100 + CNPJ 3x R$200 vira 3x R$300 + 3x R$100 (6 no total)", () => {
    const tiers = combinarParcelas([
      { quantidade: 6, valor: 100 },
      { quantidade: 3, valor: 200 },
    ]);
    expect(tiers).toEqual([
      { quantidade: 3, valor: 300 },
      { quantidade: 3, valor: 100 },
    ]);
    expect(tiers.reduce((soma, t) => soma + t.quantidade, 0)).toBe(6);
  });

  it("3 documentos com prazos diferentes encadeiam em 3 tiers", () => {
    const tiers = combinarParcelas([
      { quantidade: 12, valor: 50 },
      { quantidade: 6, valor: 100 },
      { quantidade: 3, valor: 200 },
    ]);
    expect(tiers).toEqual([
      { quantidade: 3, valor: 350 }, // meses 1-3: os 3 documentos
      { quantidade: 3, valor: 150 }, // meses 4-6: só os 2 de prazo mais longo
      { quantidade: 6, valor: 50 }, // meses 7-12: só o de 12x
    ]);
  });

  it("mesmo número de parcelas em todos os documentos vira um tier só (caso comum)", () => {
    const tiers = combinarParcelas([
      { quantidade: 6, valor: 430 },
      { quantidade: 6, valor: 600 },
    ]);
    expect(tiers).toEqual([{ quantidade: 6, valor: 1030 }]);
  });
});

describe("formatarParcelas", () => {
  it("um tier: mesmo formato de antes", () => {
    expect(formatarParcelas([{ quantidade: 6, valor: 430 }])).toBe("6x R$ 430,00");
  });

  it("múltiplos tiers: encadeados com '+'", () => {
    expect(
      formatarParcelas([
        { quantidade: 3, valor: 300 },
        { quantidade: 3, valor: 100 },
      ]),
    ).toBe("3x R$ 300,00 + 3x R$ 100,00");
  });
});

describe("combinarFaixasPacote (pacote Fase 4 — preço por documento, somado)", () => {
  it("um documento só é idêntico à faixa única de sempre (sem mudança de comportamento)", () => {
    const combinada = combinarFaixasPacote([5_000], FAIXAS_PRECOS);
    const faixaDireta = buscarFaixaPreco(5_000, FAIXAS_PRECOS);
    expect(combinada?.precoCheio).toBe(faixaDireta?.precoCheio);
    expect(combinada?.precoAvista).toBe(faixaDireta?.precoAvista);
    expect(combinada?.parcelasBoleto).toEqual([
      { quantidade: faixaDireta?.parcelasBoletoQtd, valor: faixaDireta?.parcelasBoletoValor },
    ]);
    expect(combinada?.parcelasCartaoMax).toBe(faixaDireta?.parcelasCartaoMax);
    expect(combinada?.voucherAvista).toBe(faixaDireta?.voucherAvista);
  });

  it("dois documentos em faixas diferentes: preço cheio/à vista somam, cartão pega o maior", () => {
    const faixaBaixa: FaixaPreco = {
      faixaMin: 0,
      faixaMax: 10_000,
      precoCheio: 2000,
      precoAvista: 1000,
      parcelasBoletoQtd: 6,
      parcelasBoletoValor: 100,
      parcelasCartaoMax: 10,
      voucherAvista: 500,
      voucherParcelasQtd: 6,
      voucherParcelasValor: 50,
    };
    const faixaAlta: FaixaPreco = {
      faixaMin: 10_000,
      faixaMax: 200_000,
      precoCheio: 6000,
      precoAvista: 3000,
      parcelasBoletoQtd: 3,
      parcelasBoletoValor: 200,
      parcelasCartaoMax: 12,
      voucherAvista: 1500,
      voucherParcelasQtd: 3,
      voucherParcelasValor: 100,
    };
    const faixas = [faixaBaixa, faixaAlta];

    const combinada = combinarFaixasPacote([5_000, 80_000], faixas);

    expect(combinada?.precoCheio).toBe(2000 + 6000);
    expect(combinada?.precoAvista).toBe(1000 + 3000);
    expect(combinada?.parcelasCartaoMax).toBe(12); // maior entre 10 e 12
    expect(combinada?.voucherAvista).toBe(500 + 1500);
    // mesma régua mês a mês testada em combinarParcelas: 6x100 + 3x200 -> 3x300 + 3x100
    expect(combinada?.parcelasBoleto).toEqual([
      { quantidade: 3, valor: 300 },
      { quantidade: 3, valor: 100 },
    ]);
    expect(combinada?.voucherParcelas).toEqual([
      { quantidade: 3, valor: 150 },
      { quantidade: 3, valor: 50 },
    ]);
  });

  it("sem nenhum documento com faixa encontrada, retorna null", () => {
    expect(combinarFaixasPacote([], FAIXAS_PRECOS)).toBeNull();
  });
});

describe("formatarLabelFaixa (menu do ln_passo6, correção 18/08/2026)", () => {
  it("primeira faixa da lista vira 'Menos de X mil' (só o teto)", () => {
    const faixa: FaixaPreco = { faixaMin: 3000, faixaMax: 10000, precoCheio: null, precoAvista: null, parcelasBoletoQtd: null, parcelasBoletoValor: null, parcelasCartaoMax: null, voucherAvista: null, voucherParcelasQtd: null, voucherParcelasValor: null };
    expect(formatarLabelFaixa(faixa, true)).toBe("Menos de 10 mil");
  });

  it("faixa do meio vira 'Entre X e Y mil'", () => {
    const faixa: FaixaPreco = { faixaMin: 10000, faixaMax: 30000, precoCheio: null, precoAvista: null, parcelasBoletoQtd: null, parcelasBoletoValor: null, parcelasCartaoMax: null, voucherAvista: null, voucherParcelasQtd: null, voucherParcelasValor: null };
    expect(formatarLabelFaixa(faixa, false)).toBe("Entre 10 mil e 30 mil");
  });

  it("faixa sem teto (faixaMax null) vira 'Acima de X mil'", () => {
    const faixa: FaixaPreco = { faixaMin: 500000, faixaMax: null, precoCheio: null, precoAvista: null, parcelasBoletoQtd: null, parcelasBoletoValor: null, parcelasCartaoMax: null, voucherAvista: null, voucherParcelasQtd: null, voucherParcelasValor: null };
    expect(formatarLabelFaixa(faixa, false)).toBe("Acima de 500 mil");
  });
});

describe("formatarMenuFaixas", () => {
  it("gera lista numerada com emoji, ordenada por faixaMin, com as 5 faixas reais do produto", () => {
    const menu = formatarMenuFaixas(FAIXAS_PRECOS);
    expect(menu).toBe(
      [
        "1️⃣ Menos de 10 mil",
        "2️⃣ Entre 10 mil e 30 mil",
        "3️⃣ Entre 30 mil e 50 mil",
        "4️⃣ Entre 50 mil e 100 mil",
        "5️⃣ Entre 100 mil e 500 mil",
      ].join("\n"),
    );
  });

  it("ordena mesmo se a lista de entrada vier fora de ordem", () => {
    const [a, b, c, d, e] = FAIXAS_PRECOS;
    const foraDeOrdem = [c, a, e, b, d];
    expect(formatarMenuFaixas(foraDeOrdem)).toBe(formatarMenuFaixas(FAIXAS_PRECOS));
  });
});

describe("formatarFaixaConfirmacao (frase de confirmação do ln_passo6, 18/08/2026)", () => {
  it("primeira faixa: 'menos de X mil', minúsculo e sem espaço antes do mil", () => {
    const faixa: FaixaPreco = { faixaMin: 3000, faixaMax: 10000, precoCheio: null, precoAvista: null, parcelasBoletoQtd: null, parcelasBoletoValor: null, parcelasCartaoMax: null, voucherAvista: null, voucherParcelasQtd: null, voucherParcelasValor: null };
    expect(formatarFaixaConfirmacao(faixa, true)).toBe("menos de 10mil");
  });

  it("faixa do meio: 'entre X e Ymil' — só o segundo número leva 'mil' colado", () => {
    const faixa: FaixaPreco = { faixaMin: 10000, faixaMax: 30000, precoCheio: null, precoAvista: null, parcelasBoletoQtd: null, parcelasBoletoValor: null, parcelasCartaoMax: null, voucherAvista: null, voucherParcelasQtd: null, voucherParcelasValor: null };
    expect(formatarFaixaConfirmacao(faixa, false)).toBe("entre 10 e 30mil");
  });

  it("faixa sem teto: 'acima de Xmil'", () => {
    const faixa: FaixaPreco = { faixaMin: 500000, faixaMax: null, precoCheio: null, precoAvista: null, parcelasBoletoQtd: null, parcelasBoletoValor: null, parcelasCartaoMax: null, voucherAvista: null, voucherParcelasQtd: null, voucherParcelasValor: null };
    expect(formatarFaixaConfirmacao(faixa, false)).toBe("acima de 500mil");
  });
});

describe("valorRepresentativoFaixa", () => {
  it("faixa com teto: ponto médio", () => {
    const faixa: FaixaPreco = { faixaMin: 10000, faixaMax: 30000, precoCheio: null, precoAvista: null, parcelasBoletoQtd: null, parcelasBoletoValor: null, parcelasCartaoMax: null, voucherAvista: null, voucherParcelasQtd: null, voucherParcelasValor: null };
    expect(valorRepresentativoFaixa(faixa)).toBe(20000);
  });

  it("faixa sem teto: usa o piso", () => {
    const faixa: FaixaPreco = { faixaMin: 500000, faixaMax: null, precoCheio: null, precoAvista: null, parcelasBoletoQtd: null, parcelasBoletoValor: null, parcelasCartaoMax: null, voucherAvista: null, voucherParcelasQtd: null, voucherParcelasValor: null };
    expect(valorRepresentativoFaixa(faixa)).toBe(500000);
  });
});

describe("montarMensagemConfirmacaoFaixa (formato exato pedido por Luiz, 18/08/2026)", () => {
  const faixa: FaixaPreco = { faixaMin: 10000, faixaMax: 30000, precoCheio: null, precoAvista: null, parcelasBoletoQtd: null, parcelasBoletoValor: null, parcelasCartaoMax: null, voucherAvista: null, voucherParcelasQtd: null, voucherParcelasValor: null };

  it("1 CPF só — sem 'cada um deles'", () => {
    expect(montarMensagemConfirmacaoFaixa(faixa, false, ["cpf"])).toBe(
      "Só confirmando: Limpeza de nome para *01 CPF* com restrições entre 10 e 30mil.\n👉 *Está correto?*",
    );
  });

  it("1 CPF e 1 CNPJ — com 'em cada um deles'", () => {
    expect(montarMensagemConfirmacaoFaixa(faixa, false, ["cpf", "cnpj"])).toBe(
      "Só confirmando: Limpeza de nome para *01 CPF e 01 CNPJ* com restrições entre 10 e 30mil em *cada um deles*.\n👉 *Está correto?*",
    );
  });

  it("3 CPF e 55 CNPJ — conta agrupada por tipo, zero-padded", () => {
    const tipos: ("cpf" | "cnpj")[] = [...Array(3).fill("cpf"), ...Array(55).fill("cnpj")];
    expect(montarMensagemConfirmacaoFaixa(faixa, false, tipos)).toBe(
      "Só confirmando: Limpeza de nome para *03 CPF e 55 CNPJ* com restrições entre 10 e 30mil em *cada um deles*.\n👉 *Está correto?*",
    );
  });
});
