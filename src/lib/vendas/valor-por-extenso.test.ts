import { describe, expect, it } from "vitest";
import { valorPorExtenso } from "./valor-por-extenso";

describe("valorPorExtenso", () => {
  it("converte zero", () => {
    expect(valorPorExtenso(0)).toBe("zero reais");
  });

  it("converte um real (singular)", () => {
    expect(valorPorExtenso(1)).toBe("um real");
  });

  it("converte valores de um dígito", () => {
    expect(valorPorExtenso(7)).toBe("sete reais");
  });

  it("converte dezenas de dez a dezenove", () => {
    expect(valorPorExtenso(15)).toBe("quinze reais");
  });

  it("converte dezenas com unidade", () => {
    expect(valorPorExtenso(23)).toBe("vinte e três reais");
  });

  it("converte cem exato (não 'cento')", () => {
    expect(valorPorExtenso(100)).toBe("cem reais");
  });

  it("converte centena com resto (usa 'cento')", () => {
    expect(valorPorExtenso(101)).toBe("cento e um reais");
  });

  it("converte centena redonda com dezena/unidade", () => {
    expect(valorPorExtenso(223)).toBe("duzentos e vinte e três reais");
  });

  it("converte mil exato (não 'um mil')", () => {
    expect(valorPorExtenso(1000)).toBe("mil reais");
  });

  it("converte mil e quinhentos (exemplo do plano)", () => {
    expect(valorPorExtenso(1500)).toBe("mil e quinhentos reais");
  });

  it("converte milhares com centena não redonda", () => {
    expect(valorPorExtenso(15234)).toBe("quinze mil, duzentos e trinta e quatro reais");
  });

  it("converte um milhão exato, com 'de reais'", () => {
    expect(valorPorExtenso(1_000_000)).toBe("um milhão de reais");
  });

  it("converte milhões no plural, com 'de reais'", () => {
    expect(valorPorExtenso(2_000_000)).toBe("dois milhões de reais");
  });

  it("converte milhão com resto (sem 'de reais')", () => {
    expect(valorPorExtenso(1_000_050)).toBe("um milhão e cinquenta reais");
  });

  it("converte milhão com centena e milhar", () => {
    expect(valorPorExtenso(1_234_567)).toBe(
      "um milhão, duzentos e trinta e quatro mil, quinhentos e sessenta e sete reais",
    );
  });

  it("converte só centavos quando reais é zero", () => {
    expect(valorPorExtenso(0.01)).toBe("um centavo");
  });

  it("converte centavos no plural", () => {
    expect(valorPorExtenso(0.5)).toBe("cinquenta centavos");
  });

  it("converte reais e centavos combinados", () => {
    expect(valorPorExtenso(1234.56)).toBe("mil, duzentos e trinta e quatro reais e cinquenta e seis centavos");
  });

  it("arredonda ponto flutuante de centavos corretamente", () => {
    expect(valorPorExtenso(10.1)).toBe("dez reais e dez centavos");
  });

  it("lança erro para valor negativo", () => {
    expect(() => valorPorExtenso(-1)).toThrow();
  });
});
