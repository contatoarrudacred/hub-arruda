import { describe, expect, it } from "vitest";
import { avaliarIdempotencia, resolverInstanciaWhatsapp } from "./resolver-envio-validacao";

describe("resolverInstanciaWhatsapp", () => {
  it("já existe conversa oficial: usa oficial", () => {
    expect(resolverInstanciaWhatsapp(true)).toBe("oficial");
  });

  it("não existe conversa oficial: usa secundaria (nunca inicia contato pelo oficial)", () => {
    expect(resolverInstanciaWhatsapp(false)).toBe("secundaria");
  });
});

describe("avaliarIdempotencia", () => {
  it("sem mensagem existente: não repete, segue com o envio normal", () => {
    expect(avaliarIdempotencia(null)).toEqual({ repetir: false });
  });

  it("já existe mensagem com essa chave: repete o resultado anterior, não manda de novo", () => {
    expect(avaliarIdempotencia({ id: "msg-123" })).toEqual({ repetir: true, mensagemId: "msg-123" });
  });
});
