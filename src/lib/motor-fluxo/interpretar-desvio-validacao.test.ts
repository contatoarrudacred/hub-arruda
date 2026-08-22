import { describe, expect, it } from "vitest";
import { resolverRespostaDesvio } from "./interpretar-desvio-validacao";
import type { FaqParaDesvio, ObjecaoParaDesvio } from "./tipos";

const FAQS: FaqParaDesvio[] = [
  { pergunta: "Vocês trabalham com CNPJ?", resposta: "Sim, atendemos CPF e CNPJ." },
  { pergunta: "Quanto tempo demora?", resposta: "Entre 7 e 45 dias úteis." },
];

const OBJECOES: ObjecaoParaDesvio[] = [
  { objecao: "Acha caro", comoLidar: "Comparar valor vs. risco de continuar com o nome sujo." },
  { objecao: "Quer pensar / adiar", comoLidar: "Diagnosticar o motivo real antes de aceitar o adiamento." },
];

describe("resolverRespostaDesvio", () => {
  it("faq com índice válido: resolve pro objeto FAQ certo", () => {
    expect(resolverRespostaDesvio({ status: "faq", indice_faq: 2, indice_objecao: 0 }, FAQS, OBJECOES)).toEqual({
      status: "faq",
      faq: FAQS[1],
    });
  });

  it("objecao com índice válido: resolve pro objeto de objeção certo", () => {
    expect(resolverRespostaDesvio({ status: "objecao", indice_faq: 0, indice_objecao: 1 }, FAQS, OBJECOES)).toEqual({
      status: "objecao",
      objecao: OBJECOES[0],
    });
  });

  it("status escalar: sempre escala, independente dos índices", () => {
    expect(resolverRespostaDesvio({ status: "escalar", indice_faq: 1, indice_objecao: 1 }, FAQS, OBJECOES)).toEqual({ status: "escalar" });
  });

  it("status ambiguo: cai em ambiguo, não escala", () => {
    expect(resolverRespostaDesvio({ status: "ambiguo", indice_faq: 0, indice_objecao: 0 }, FAQS, OBJECOES)).toEqual({ status: "ambiguo" });
  });

  it("índice de faq fora do range (alucinação) vira ambiguo, não escala nem cita FAQ errada — achado da bateria completa de 21/08/2026: escalar demais corta o lead do automatizado sem necessidade", () => {
    expect(resolverRespostaDesvio({ status: "faq", indice_faq: 99, indice_objecao: 0 }, FAQS, OBJECOES)).toEqual({ status: "ambiguo" });
  });

  it("índice de objeção fora do range vira ambiguo", () => {
    expect(resolverRespostaDesvio({ status: "objecao", indice_faq: 0, indice_objecao: 99 }, FAQS, OBJECOES)).toEqual({ status: "ambiguo" });
  });

  it("índice zero ou negativo vira ambiguo", () => {
    expect(resolverRespostaDesvio({ status: "faq", indice_faq: 0, indice_objecao: 0 }, FAQS, OBJECOES)).toEqual({ status: "ambiguo" });
  });

  it("listas vazias: qualquer índice vira ambiguo", () => {
    expect(resolverRespostaDesvio({ status: "faq", indice_faq: 1, indice_objecao: 0 }, [], [])).toEqual({ status: "ambiguo" });
    expect(resolverRespostaDesvio({ status: "objecao", indice_faq: 0, indice_objecao: 1 }, [], [])).toEqual({ status: "ambiguo" });
  });

  it("status desconhecido/inesperado vira ambiguo, defensivo", () => {
    expect(resolverRespostaDesvio({ status: "outra_coisa" as never, indice_faq: 1, indice_objecao: 1 }, FAQS, OBJECOES)).toEqual({ status: "ambiguo" });
  });
});
