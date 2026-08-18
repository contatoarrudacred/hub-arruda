import { describe, expect, it } from "vitest";
import { calcularParcelas, calcularParcelasContrato, calcularVencimentosPorAncora } from "./calculo-parcelas";

describe("calcularParcelas", () => {
  it("gera uma única parcela à vista, com o valor total, na data informada", () => {
    const vencimento = new Date("2026-09-01T00:00:00Z");
    const parcelas = calcularParcelas(1500, 1, vencimento, 30);

    expect(parcelas).toEqual([{ numero: 1, valor: 1500, vencimento }]);
  });

  it("divide igualmente quando o valor total é múltiplo da quantidade", () => {
    const parcelas = calcularParcelas(1500, 2, new Date("2026-09-01T00:00:00Z"), 30);

    expect(parcelas.map((p) => p.valor)).toEqual([750, 750]);
  });

  it("a última parcela absorve o resto de arredondamento, e a soma bate exatamente com o total", () => {
    const parcelas = calcularParcelas(100, 3, new Date("2026-09-01T00:00:00Z"), 30);

    expect(parcelas.map((p) => p.valor)).toEqual([33.33, 33.33, 33.34]);
    const soma = parcelas.reduce((acc, p) => acc + p.valor, 0);
    expect(Math.round(soma * 100) / 100).toBe(100);
  });

  it("numera as parcelas sequencialmente a partir de 1", () => {
    const parcelas = calcularParcelas(300, 3, new Date("2026-09-01T00:00:00Z"), 30);
    expect(parcelas.map((p) => p.numero)).toEqual([1, 2, 3]);
  });

  it("incrementa o vencimento pelo intervalo de dias a cada parcela", () => {
    const parcelas = calcularParcelas(300, 3, new Date("2026-09-01T00:00:00Z"), 30);

    expect(parcelas[0].vencimento.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(parcelas[1].vencimento.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(parcelas[2].vencimento.toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });

  it("lança erro para valor total negativo", () => {
    expect(() => calcularParcelas(-1, 1, new Date(), 30)).toThrow();
  });

  it("lança erro para quantidade de parcelas menor que 1", () => {
    expect(() => calcularParcelas(100, 0, new Date(), 30)).toThrow();
  });

  it("lança erro para quantidade de parcelas não inteira", () => {
    expect(() => calcularParcelas(100, 2.5, new Date(), 30)).toThrow();
  });
});

describe("calcularVencimentosPorAncora", () => {
  it("reproduz o exemplo da spec: venda em 18/08/2026, 6x, âncora dia 10, rolando o ano", () => {
    const vencimentos = calcularVencimentosPorAncora(new Date("2026-08-18T00:00:00Z"), 10, 6);

    expect(vencimentos.map((v) => v.toISOString().slice(0, 10))).toEqual([
      "2026-08-18",
      "2026-09-10",
      "2026-10-10",
      "2026-11-10",
      "2026-12-10",
      "2027-01-10",
    ]);
  });

  it("parcela única (à vista) devolve só a 1ª parcela, na data informada", () => {
    const primeira = new Date("2026-08-18T00:00:00Z");
    const vencimentos = calcularVencimentosPorAncora(primeira, 10, 1);
    expect(vencimentos).toEqual([primeira]);
  });

  it("aceita âncora no dia 01", () => {
    const vencimentos = calcularVencimentosPorAncora(new Date("2026-08-18T00:00:00Z"), 1, 2);
    expect(vencimentos[1].toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("aceita âncora no dia 20", () => {
    const vencimentos = calcularVencimentosPorAncora(new Date("2026-08-18T00:00:00Z"), 20, 2);
    expect(vencimentos[1].toISOString().slice(0, 10)).toBe("2026-09-20");
  });

  it("conta o mês seguinte a partir do mês da 1ª parcela, não do mês da venda, quando a 1ª parcela foi adiada pra outro mês", () => {
    // 1ª parcela adiada de 18/08 pra 05/09 (dentro do limite de +15 dias) -- a 2ª deve cair em
    // outubro (mês seguinte ao de setembro), não em setembro (mês seguinte ao de agosto).
    const vencimentos = calcularVencimentosPorAncora(new Date("2026-09-05T00:00:00Z"), 10, 2);
    expect(vencimentos[1].toISOString().slice(0, 10)).toBe("2026-10-10");
  });

  it("lança erro para quantidade de parcelas menor que 1", () => {
    expect(() => calcularVencimentosPorAncora(new Date(), 10, 0)).toThrow();
  });
});

describe("calcularParcelasContrato", () => {
  it("combina valor dividido e vencimento por âncora", () => {
    const parcelas = calcularParcelasContrato(100, 3, new Date("2026-08-18T00:00:00Z"), 10);

    expect(parcelas.map((p) => p.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(parcelas.map((p) => p.vencimento.toISOString().slice(0, 10))).toEqual([
      "2026-08-18",
      "2026-09-10",
      "2026-10-10",
    ]);
    expect(parcelas.map((p) => p.numero)).toEqual([1, 2, 3]);
  });
});
