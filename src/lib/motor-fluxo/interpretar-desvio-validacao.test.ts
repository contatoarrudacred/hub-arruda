import { describe, expect, it } from "vitest";
import { resolverConteudoExtra, resolverRespostaDesvio, type RespostaBrutaConteudoExtra } from "./interpretar-desvio-validacao";
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

// resolverConteudoExtra — achado 22/08/2026 (docs/superpowers/plans/2026-08-21-desvio-escalar-quando-nao-sabe.md,
// seção "Atualização"): quando um dos 4 interpretadores (interpretacao-ia.ts, faixas_documentos,
// negociacao_pagamento, lista_documentos) já RECONHECE a resposta do lead como válida pro checkpoint
// atual, o desvio (interpretar-desvio.ts) nunca chega a rodar (só dispara quando não reconhece) — uma
// objeção/pergunta embutida na MESMA mensagem que a resposta válida se perdia silenciosamente. Em vez
// de rodar uma 2ª chamada de IA à parte, os próprios 4 interpretadores passam a detectar isso na MESMA
// chamada que já reconhece a resposta — esta função resolve o índice bruto (igual resolverRespostaDesvio),
// só que sem "escalar": uma resposta já reconhecida nunca deve ser escalada por causa de algo extra.
describe("resolverConteudoExtra", () => {
  it("sem conteúdo extra (bruto undefined): null", () => {
    expect(resolverConteudoExtra(undefined, FAQS, OBJECOES)).toBeNull();
  });

  it("índices zerados (nada detectado, caso mais comum): null", () => {
    expect(resolverConteudoExtra({ indice_faq_extra: 0, indice_objecao_extra: 0 }, FAQS, OBJECOES)).toBeNull();
  });

  it("faq extra com índice válido: resolve pro objeto FAQ certo", () => {
    const bruto: RespostaBrutaConteudoExtra = { indice_faq_extra: 2, indice_objecao_extra: 0 };
    expect(resolverConteudoExtra(bruto, FAQS, OBJECOES)).toEqual({ tipo: "faq", faq: FAQS[1] });
  });

  it("objeção extra com índice válido: resolve pro objeto de objeção certo", () => {
    const bruto: RespostaBrutaConteudoExtra = { indice_faq_extra: 0, indice_objecao_extra: 1 };
    expect(resolverConteudoExtra(bruto, FAQS, OBJECOES)).toEqual({ tipo: "objecao", objecao: OBJECOES[0] });
  });

  it("faq tem prioridade quando os 2 índices vêm preenchidos (não deveria acontecer, mas defensivo)", () => {
    const bruto: RespostaBrutaConteudoExtra = { indice_faq_extra: 1, indice_objecao_extra: 1 };
    expect(resolverConteudoExtra(bruto, FAQS, OBJECOES)).toEqual({ tipo: "faq", faq: FAQS[0] });
  });

  it("índice fora do range (alucinação) vira null, nunca escala nem cita FAQ/objeção errada — mesma filosofia de resolverRespostaDesvio", () => {
    expect(resolverConteudoExtra({ indice_faq_extra: 99, indice_objecao_extra: 0 }, FAQS, OBJECOES)).toBeNull();
    expect(resolverConteudoExtra({ indice_faq_extra: 0, indice_objecao_extra: 99 }, FAQS, OBJECOES)).toBeNull();
  });

  it("índice negativo vira null", () => {
    expect(resolverConteudoExtra({ indice_faq_extra: -1, indice_objecao_extra: 0 }, FAQS, OBJECOES)).toBeNull();
  });

  it("listas vazias: qualquer índice vira null", () => {
    expect(resolverConteudoExtra({ indice_faq_extra: 1, indice_objecao_extra: 0 }, [], [])).toBeNull();
  });
});
