import { describe, expect, it } from "vitest";
import {
  dataDeHojeISO,
  DIAS_ANCORA_VALIDOS,
  expandirParcelas,
  LIMITE_DIAS_ADIAR_PRIMEIRA_PARCELA,
  validarDataPrimeiraParcela,
} from "./calculo-vencimentos-pagamento";
import type { ParcelaTier } from "./regras-limpeza-nome";

describe("dataDeHojeISO", () => {
  it("formata a data injetada em ISO sem hora", () => {
    expect(dataDeHojeISO(new Date("2026-08-18T14:32:00-03:00"))).toBe("2026-08-18");
  });
});

describe("validarDataPrimeiraParcela", () => {
  it("aceita a própria data de hoje", () => {
    expect(validarDataPrimeiraParcela("2026-08-18", "2026-08-18")).toBe("2026-08-18");
  });

  it("aceita adiamento dentro do limite de 15 dias", () => {
    expect(validarDataPrimeiraParcela("2026-08-28", "2026-08-18")).toBe("2026-08-28");
  });

  it("aceita exatamente o limite de 15 dias", () => {
    expect(validarDataPrimeiraParcela("2026-09-02", "2026-08-18")).toBe("2026-09-02");
  });

  it("rejeita adiamento além de 15 dias", () => {
    expect(validarDataPrimeiraParcela("2026-09-03", "2026-08-18")).toBeNull();
  });

  it("rejeita data anterior a hoje", () => {
    expect(validarDataPrimeiraParcela("2026-08-17", "2026-08-18")).toBeNull();
  });

  it("rejeita data inválida", () => {
    expect(validarDataPrimeiraParcela("não é data", "2026-08-18")).toBeNull();
  });

  it("expõe o limite como constante (não valor mágico espalhado)", () => {
    expect(LIMITE_DIAS_ADIAR_PRIMEIRA_PARCELA).toBe(15);
  });
});

describe("expandirParcelas", () => {
  it("à vista (tier único de 1 parcela) — vencimento é a própria data da 1ª parcela", () => {
    const tiers: ParcelaTier[] = [{ quantidade: 1, valor: 3840 }];
    const parcelas = expandirParcelas(tiers, "2026-08-18", 10);
    expect(parcelas).toEqual([{ numero: 1, valor: 3840, vencimento: "2026-08-18" }]);
  });

  it("exemplo da spec: 18/08/2026, âncora 10, 6 parcelas tier único — mês seguinte ao da 1ª, rolando o ano", () => {
    const tiers: ParcelaTier[] = [{ quantidade: 6, valor: 1280 }];
    const parcelas = expandirParcelas(tiers, "2026-08-18", 10);
    expect(parcelas.map((p) => p.vencimento)).toEqual([
      "2026-08-18",
      "2026-09-10",
      "2026-10-10",
      "2026-11-10",
      "2026-12-10",
      "2027-01-10",
    ]);
    expect(parcelas.map((p) => p.valor)).toEqual([1280, 1280, 1280, 1280, 1280, 1280]);
    expect(parcelas.map((p) => p.numero)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("dois tiers (pacote CPF+CNPJ, ver regras-limpeza-nome.ts combinarParcelas) — valor muda de tier sem quebrar a sequência de vencimento", () => {
    const tiers: ParcelaTier[] = [
      { quantidade: 3, valor: 300 },
      { quantidade: 3, valor: 100 },
    ];
    const parcelas = expandirParcelas(tiers, "2026-08-18", 10);
    expect(parcelas.map((p) => p.valor)).toEqual([300, 300, 300, 100, 100, 100]);
    expect(parcelas.map((p) => p.vencimento)).toEqual([
      "2026-08-18",
      "2026-09-10",
      "2026-10-10",
      "2026-11-10",
      "2026-12-10",
      "2027-01-10",
    ]);
  });

  it("troca de âncora — dia 01 e dia 20 calculam corretamente", () => {
    const tiers: ParcelaTier[] = [{ quantidade: 2, valor: 500 }];
    expect(expandirParcelas(tiers, "2026-08-18", 1).map((p) => p.vencimento)).toEqual([
      "2026-08-18",
      "2026-09-01",
    ]);
    expect(expandirParcelas(tiers, "2026-08-18", 20).map((p) => p.vencimento)).toEqual([
      "2026-08-18",
      "2026-09-20",
    ]);
  });

  it("1ª parcela adiada muda o mês-base das seguintes (parte do mês em que ela caiu, não do mês da venda)", () => {
    const tiers: ParcelaTier[] = [{ quantidade: 2, valor: 500 }];
    // venda em 28/08, lead adia a 1ª pra 02/09 (dentro do limite de 15 dias) — mês da 1ª parcela
    // passa a ser setembro, então a 2ª parcela cai no mês seguinte (outubro), não em setembro.
    expect(expandirParcelas(tiers, "2026-09-02", 10).map((p) => p.vencimento)).toEqual([
      "2026-09-02",
      "2026-10-10",
    ]);
  });

  it("lista de tiers vazia devolve lista vazia", () => {
    expect(expandirParcelas([], "2026-08-18", 10)).toEqual([]);
  });

  it("expõe os dias-âncora válidos como constante", () => {
    expect(DIAS_ANCORA_VALIDOS).toEqual([1, 10, 20]);
  });
});
