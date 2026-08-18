import { describe, expect, it, beforeAll } from "vitest";
import { cifrar, decifrar } from "./criptografia";

describe("criptografia", () => {
  beforeAll(() => {
    process.env.MARKETING_CREDENCIAIS_CHAVE = "chave-de-teste-nao-usar-em-producao";
  });

  it("cifra e decifra de volta pro texto original", () => {
    const original = "senha-de-aplicativo-do-wordpress-123";
    const cifrado = cifrar(original);
    expect(cifrado).not.toBe(original);
    expect(decifrar(cifrado)).toBe(original);
  });

  it("gera cifrados diferentes pro mesmo texto (IV aleatório)", () => {
    expect(cifrar("mesma-senha")).not.toBe(cifrar("mesma-senha"));
  });

  it("lança erro se MARKETING_CREDENCIAIS_CHAVE não estiver configurada", () => {
    const original = process.env.MARKETING_CREDENCIAIS_CHAVE;
    delete process.env.MARKETING_CREDENCIAIS_CHAVE;
    expect(() => cifrar("x")).toThrow();
    process.env.MARKETING_CREDENCIAIS_CHAVE = original;
  });

  it("decifrar com valor corrompido lança erro (authTag do GCM detecta adulteração)", () => {
    const cifrado = cifrar("senha-original");
    const corrompido = cifrado.slice(0, -4) + "abcd";
    expect(() => decifrar(corrompido)).toThrow();
  });
});
