import { describe, expect, it } from "vitest";
import { normalizarDocumento, tipoPessoaPorDocumento, validarDocumento } from "./documento";

describe("normalizarDocumento", () => {
  it("remove pontuação e espaços, mantendo só dígitos", () => {
    expect(normalizarDocumento("123.456.789-09")).toBe("12345678909");
    expect(normalizarDocumento("12.345.678/0001-95")).toBe("12345678000195");
    expect(normalizarDocumento("  111 222 333-44 ")).toBe("11122233344");
  });
});

describe("validarDocumento", () => {
  it("aceita CPF com dígito verificador correto", () => {
    expect(validarDocumento("11144477735")).toBe(true);
  });

  it("rejeita CPF com dígito verificador incorreto", () => {
    expect(validarDocumento("11144477736")).toBe(false);
  });

  it("rejeita CPF com todos os dígitos iguais", () => {
    expect(validarDocumento("11111111111")).toBe(false);
  });

  it("aceita CNPJ com dígito verificador correto", () => {
    expect(validarDocumento("11222333000181")).toBe(true);
  });

  it("rejeita CNPJ com dígito verificador incorreto", () => {
    expect(validarDocumento("11222333000182")).toBe(false);
  });

  it("rejeita valor com tamanho diferente de 11 ou 14 dígitos", () => {
    expect(validarDocumento("123")).toBe(false);
    expect(validarDocumento("")).toBe(false);
  });

  it("aceita documento já formatado, normalizando antes de validar", () => {
    expect(validarDocumento("111.444.777-35")).toBe(true);
  });
});

describe("tipoPessoaPorDocumento", () => {
  it("retorna pf para documento de 11 dígitos válido", () => {
    expect(tipoPessoaPorDocumento("11144477735")).toBe("pf");
  });

  it("retorna pj para documento de 14 dígitos válido", () => {
    expect(tipoPessoaPorDocumento("11222333000181")).toBe("pj");
  });

  it("retorna null para documento inválido", () => {
    expect(tipoPessoaPorDocumento("123")).toBeNull();
  });
});
