import { describe, expect, it } from "vitest";
import { calcularParcelas } from "./calculo-parcelas";

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
