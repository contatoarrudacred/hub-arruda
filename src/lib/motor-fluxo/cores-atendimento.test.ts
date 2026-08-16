import { describe, expect, it } from "vitest";
import {
  CORES_BADGE,
  CORES_BADGE_LISTA,
  COR_MALALA,
  COR_NAO_ATRIBUIDA,
  corControlador,
  ehCorBadgeValida,
} from "./cores-atendimento";

describe("ehCorBadgeValida", () => {
  it("aceita as 7 cores da paleta", () => {
    for (const cor of CORES_BADGE_LISTA) {
      expect(ehCorBadgeValida(cor)).toBe(true);
    }
  });

  it("rejeita verde/roxo (reservados) e qualquer valor fora da paleta", () => {
    expect(ehCorBadgeValida("verde")).toBe(false);
    expect(ehCorBadgeValida("roxo")).toBe(false);
    expect(ehCorBadgeValida("dourado")).toBe(false);
    expect(ehCorBadgeValida("")).toBe(false);
  });
});

describe("corControlador", () => {
  it("Malala no controle sempre usa a cor reservada de Malala, mesmo com atendenteCor preenchido por engano", () => {
    expect(corControlador({ sobSupervisor: false, atendenteCor: "azul" })).toBe(COR_MALALA);
  });

  it("humano sem atendente específico usa a cor de 'não atribuída'", () => {
    expect(corControlador({ sobSupervisor: true, atendenteCor: null })).toBe(COR_NAO_ATRIBUIDA);
  });

  it("humano com atendente específico usa a cor daquele atendente", () => {
    expect(corControlador({ sobSupervisor: true, atendenteCor: "rosa" })).toBe(CORES_BADGE.rosa);
  });
});
