import { describe, expect, it } from "vitest";
import { deveConcluirAoConfirmarParcela } from "./conclusao-venda";

describe("deveConcluirAoConfirmarParcela", () => {
  it("conclui no boleto/pix quando é a 1ª parcela", () => {
    expect(deveConcluirAoConfirmarParcela("boleto_pix", 1)).toBe(true);
  });

  it("não conclui no boleto/pix quando não é a 1ª parcela", () => {
    expect(deveConcluirAoConfirmarParcela("boleto_pix", 2)).toBe(false);
  });

  it("nunca conclui no cartão, mesmo quando seria a 1ª parcela", () => {
    expect(deveConcluirAoConfirmarParcela("cartao", 1)).toBe(false);
  });

  it("não conclui quando o método de pagamento é nulo (venda comissionada não usa este caminho)", () => {
    expect(deveConcluirAoConfirmarParcela(null, 1)).toBe(false);
  });
});
