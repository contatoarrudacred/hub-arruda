import { describe, expect, it } from "vitest";
import { corEstagio, ehEstagioTerminal, ESTAGIOS_VENDA, rotuloEstagio } from "./estagio-venda";

describe("ESTAGIOS_VENDA", () => {
  it("tem os 7 estágios na ordem de progressão da venda", () => {
    expect(ESTAGIOS_VENDA.map((e) => e.valor)).toEqual([
      "contrato_gerado",
      "aguardando_assinatura",
      "assinado",
      "parcelas_emitidas",
      "aguardando_pagamento",
      "concluida",
      "cancelada",
    ]);
  });
});

describe("rotuloEstagio", () => {
  it("devolve o rótulo amigável de cada estágio", () => {
    expect(rotuloEstagio("contrato_gerado")).toBe("Emissão Contrato");
    expect(rotuloEstagio("aguardando_pagamento")).toBe("Aguardando Pagamento");
    expect(rotuloEstagio("cancelada")).toBe("Cancelada");
  });
});

describe("corEstagio", () => {
  it("devolve uma cor por estágio", () => {
    expect(corEstagio("concluida")).toBe("#4ade80");
    expect(corEstagio("cancelada")).toBe("#f87171");
  });
});

describe("ehEstagioTerminal", () => {
  it("concluida e cancelada são terminais", () => {
    expect(ehEstagioTerminal("concluida")).toBe(true);
    expect(ehEstagioTerminal("cancelada")).toBe(true);
  });

  it("os demais não são terminais", () => {
    expect(ehEstagioTerminal("contrato_gerado")).toBe(false);
    expect(ehEstagioTerminal("aguardando_assinatura")).toBe(false);
    expect(ehEstagioTerminal("assinado")).toBe(false);
    expect(ehEstagioTerminal("parcelas_emitidas")).toBe(false);
    expect(ehEstagioTerminal("aguardando_pagamento")).toBe(false);
  });
});
