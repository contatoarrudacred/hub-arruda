import { describe, expect, it } from "vitest";
import {
  formatarCep,
  formatarCpfCnpj,
  formatarTelefone,
  normalizarCep,
  paraCaixaAlta,
  validarCep,
} from "./mascaras";

describe("paraCaixaAlta", () => {
  it("converte texto para caixa alta", () => {
    expect(paraCaixaAlta("joão da silva")).toBe("JOÃO DA SILVA");
  });
});

describe("normalizarCep", () => {
  it("remove tudo que não é dígito", () => {
    expect(normalizarCep("01310-100")).toBe("01310100");
    expect(normalizarCep("01310100")).toBe("01310100");
  });
});

describe("validarCep", () => {
  it("aceita CEP com 8 dígitos", () => {
    expect(validarCep("01310-100")).toBe(true);
  });

  it("rejeita CEP com menos de 8 dígitos", () => {
    expect(validarCep("0131")).toBe(false);
  });
});

describe("formatarCep", () => {
  it("formata como 00000-000 quando completo", () => {
    expect(formatarCep("01310100")).toBe("01310-100");
  });

  it("não quebra com menos de 6 dígitos (sem hífen ainda)", () => {
    expect(formatarCep("0131")).toBe("0131");
  });
});

describe("formatarCpfCnpj", () => {
  it("formata 11 dígitos como CPF (000.000.000-00)", () => {
    expect(formatarCpfCnpj("12345678909")).toBe("123.456.789-09");
  });

  it("formata 14 dígitos como CNPJ (00.000.000/0000-00)", () => {
    expect(formatarCpfCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("ignora caracteres não numéricos na entrada", () => {
    expect(formatarCpfCnpj("123.456.789-09")).toBe("123.456.789-09");
  });
});

describe("formatarTelefone", () => {
  it("formata 10 dígitos como telefone fixo ((00) 0000-0000)", () => {
    expect(formatarTelefone("1131001000")).toBe("(11) 3100-1000");
  });

  it("formata 11 dígitos como celular ((00) 00000-0000)", () => {
    expect(formatarTelefone("11987654321")).toBe("(11) 98765-4321");
  });
});
