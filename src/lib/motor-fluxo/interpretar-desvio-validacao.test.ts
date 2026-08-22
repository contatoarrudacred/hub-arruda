import { describe, expect, it } from "vitest";
import { montarMensagemDesvio, validarResultadoDesvio } from "./interpretar-desvio-validacao";
import type { FaqParaDesvio } from "./tipos";

const FAQS: FaqParaDesvio[] = [
  { pergunta: "Vocês trabalham com CNPJ?", resposta: "Sim, atendemos CPF e CNPJ." },
  { pergunta: "Quanto tempo demora?", resposta: "Entre 7 e 45 dias úteis." },
];

describe("validarResultadoDesvio", () => {
  it("faq com índice válido: resolve pro objeto FAQ certo", () => {
    expect(validarResultadoDesvio({ status: "faq", indice_faq: 2 }, FAQS)).toEqual({
      status: "faq",
      faq: FAQS[1],
    });
  });

  it("status escalar: sempre escala, independente do índice", () => {
    expect(validarResultadoDesvio({ status: "escalar", indice_faq: 1 }, FAQS)).toEqual({ status: "escalar" });
  });

  it("índice fora do range (alucinação) vira escalar, não quebra nem cita FAQ errada", () => {
    expect(validarResultadoDesvio({ status: "faq", indice_faq: 99 }, FAQS)).toEqual({ status: "escalar" });
  });

  it("índice zero ou negativo vira escalar", () => {
    expect(validarResultadoDesvio({ status: "faq", indice_faq: 0 }, FAQS)).toEqual({ status: "escalar" });
  });

  it("lista de FAQs vazia: qualquer índice vira escalar", () => {
    expect(validarResultadoDesvio({ status: "faq", indice_faq: 1 }, [])).toEqual({ status: "escalar" });
  });
});

describe("montarMensagemDesvio", () => {
  it("responde a FAQ e retoma a pergunta pendente na mesma mensagem (regra de desvio)", () => {
    const mensagem = montarMensagemDesvio(FAQS[0], "Com quem eu falo?");
    expect(mensagem).toBe("Sim, atendemos CPF e CNPJ.\n\nCom quem eu falo?");
  });
});
