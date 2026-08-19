import { describe, expect, it } from "vitest";
import { corEstagio, ehEstagioTerminal, ESTAGIOS_VENDA, rotuloEstagio } from "./estagio-venda";

describe("estagio-venda", () => {
  it("tem os 7 estágios na ordem certa, mais cancelada", () => {
    expect(ESTAGIOS_VENDA.map((e) => e.valor)).toEqual([
      "nova_oportunidade",
      "emitindo_contrato",
      "envelopando_assinaturas",
      "aguardando_assinaturas",
      "gerando_financeiro",
      "aguardando_pagamento",
      "concluida",
      "cancelada",
    ]);
  });

  it("rotuloEstagio devolve o texto certo pra cada valor novo", () => {
    expect(rotuloEstagio("nova_oportunidade")).toBe("Nova Oportunidade");
    expect(rotuloEstagio("emitindo_contrato")).toBe("Emitindo Contrato");
    expect(rotuloEstagio("envelopando_assinaturas")).toBe("Envelopando Assinaturas");
    expect(rotuloEstagio("aguardando_assinaturas")).toBe("Aguardando Assinaturas");
    expect(rotuloEstagio("gerando_financeiro")).toBe("Gerando Financeiro");
  });

  it("corEstagio devolve uma cor pra todo estágio (não cai no fallback cinza)", () => {
    for (const estagio of ESTAGIOS_VENDA) {
      expect(corEstagio(estagio.valor)).not.toBe("#a1a1aa");
    }
  });

  it("ehEstagioTerminal só é true pra concluida e cancelada", () => {
    expect(ehEstagioTerminal("concluida")).toBe(true);
    expect(ehEstagioTerminal("cancelada")).toBe(true);
    expect(ehEstagioTerminal("nova_oportunidade")).toBe(false);
    expect(ehEstagioTerminal("aguardando_pagamento")).toBe(false);
  });
});
