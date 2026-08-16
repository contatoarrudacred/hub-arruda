import { describe, expect, it } from "vitest";
import {
  calcularProximoDisparo,
  dentroJanelaComercial,
  ehUltimoItemDaAgenda,
  offsetEmMs,
  proximoDisparoPrevisto,
} from "./motor-followup";
import type { ItemAgendaFollowupCarregado } from "./repositorio";

function item(parcial: Partial<ItemAgendaFollowupCarregado>): ItemAgendaFollowupCarregado {
  return {
    id: "item",
    ordem: 1,
    intervaloValor: 10,
    intervaloUnidade: "minutos",
    canal: "whatsapp",
    respeitaJanelaComercial: true,
    conteudo: "oi",
    encerraAtendimento: false,
    ...parcial,
  };
}

describe("offsetEmMs", () => {
  it("converte minutos/horas/dias corretamente", () => {
    expect(offsetEmMs(10, "minutos")).toBe(10 * 60_000);
    expect(offsetEmMs(4, "horas")).toBe(4 * 3_600_000);
    expect(offsetEmMs(3, "dias")).toBe(3 * 86_400_000);
  });
});

describe("dentroJanelaComercial (09h-21h, América/São_Paulo, exceto domingo)", () => {
  // Referência: 01/01/2026 é quinta-feira, então 04/01/2026 é domingo, 05/01/2026 é
  // segunda, 03/01/2026 é sábado.
  it("domingo é sempre fora, não importa a hora", () => {
    expect(dentroJanelaComercial(new Date(Date.UTC(2026, 0, 4, 15, 0)))).toBe(false); // 12h em SP
  });

  it("segunda-feira às 12h (SP) está dentro", () => {
    expect(dentroJanelaComercial(new Date(Date.UTC(2026, 0, 5, 15, 0)))).toBe(true);
  });

  it("sábado conta como dia útil pra esta janela (só domingo é excluído)", () => {
    expect(dentroJanelaComercial(new Date(Date.UTC(2026, 0, 3, 15, 0)))).toBe(true); // 12h em SP
  });

  it("antes das 9h (SP) está fora", () => {
    expect(dentroJanelaComercial(new Date(Date.UTC(2026, 0, 5, 10, 0)))).toBe(false); // 07h em SP
  });

  it("às 21h (SP) já está fora — limite exclusivo", () => {
    expect(dentroJanelaComercial(new Date(Date.UTC(2026, 0, 6, 0, 0)))).toBe(false); // 21h de 05/01 em SP
  });

  it("às 9h (SP) já está dentro — limite inclusivo", () => {
    expect(dentroJanelaComercial(new Date(Date.UTC(2026, 0, 5, 12, 0)))).toBe(true); // 09h em SP
  });
});

describe("calcularProximoDisparo", () => {
  const origem = new Date("2026-01-05T12:00:00Z");
  const itens = [
    item({ id: "i1", ordem: 1, intervaloValor: 10, intervaloUnidade: "minutos" }),
    item({ id: "i2", ordem: 2, intervaloValor: 45, intervaloUnidade: "minutos" }),
    item({ id: "i8", ordem: 8, intervaloValor: 30, intervaloUnidade: "dias", canal: "email" }),
  ];

  it("nada disparado ainda e prazo do primeiro item não venceu → null", () => {
    const agora = new Date(origem.getTime() + 5 * 60_000);
    expect(calcularProximoDisparo(itens, 0, origem, agora)).toBeNull();
  });

  it("prazo do primeiro item vencido → retorna o item 1", () => {
    const agora = new Date(origem.getTime() + 11 * 60_000);
    expect(calcularProximoDisparo(itens, 0, origem, agora)?.id).toBe("i1");
  });

  it("item 1 já disparado, prazo do item 2 ainda não venceu (contado da origem, não do item 1) → null", () => {
    const agora = new Date(origem.getTime() + 11 * 60_000);
    expect(calcularProximoDisparo(itens, 1, origem, agora)).toBeNull();
  });

  it("item 1 já disparado, prazo do item 2 vencido (46min desde a origem) → retorna o item 2", () => {
    const agora = new Date(origem.getTime() + 46 * 60_000);
    expect(calcularProximoDisparo(itens, 1, origem, agora)?.id).toBe("i2");
  });

  it("considera itens de e-mail também — retorna o item 8 quando o prazo dele vence (30 dias desde a origem)", () => {
    const agora = new Date(origem.getTime() + 31 * 86_400_000);
    expect(calcularProximoDisparo(itens, 2, origem, agora)?.id).toBe("i8");
  });

  it("nada mais pendente depois do último item disparado → null", () => {
    const agora = new Date(origem.getTime() + 60 * 86_400_000);
    expect(calcularProximoDisparo(itens, 8, origem, agora)).toBeNull();
  });
});

describe("proximoDisparoPrevisto", () => {
  const origem = new Date("2026-01-05T12:00:00Z");
  const itens = [
    item({ id: "i1", ordem: 1, intervaloValor: 10, intervaloUnidade: "minutos" }),
    item({ id: "i2", ordem: 2, intervaloValor: 45, intervaloUnidade: "minutos" }),
  ];

  it("retorna a data prevista do próximo item pendente, mesmo que ainda não tenha vencido", () => {
    const previsto = proximoDisparoPrevisto(itens, 0, origem);
    expect(previsto?.toISOString()).toBe(new Date(origem.getTime() + 10 * 60_000).toISOString());
  });

  it("pula pro item seguinte quando o anterior já disparou", () => {
    const previsto = proximoDisparoPrevisto(itens, 1, origem);
    expect(previsto?.toISOString()).toBe(new Date(origem.getTime() + 45 * 60_000).toISOString());
  });

  it("null quando não há mais item pendente", () => {
    expect(proximoDisparoPrevisto(itens, 2, origem)).toBeNull();
  });
});

describe("ehUltimoItemDaAgenda", () => {
  const itens = [
    item({ id: "i1", ordem: 1 }),
    item({ id: "i2", ordem: 2 }),
    item({ id: "i8", ordem: 8, canal: "email" }),
  ];

  it("identifica o item de maior ordem como o último", () => {
    expect(ehUltimoItemDaAgenda(itens, itens[2])).toBe(true);
  });

  it("itens que não são o de maior ordem não são o último", () => {
    expect(ehUltimoItemDaAgenda(itens, itens[0])).toBe(false);
    expect(ehUltimoItemDaAgenda(itens, itens[1])).toBe(false);
  });
});
