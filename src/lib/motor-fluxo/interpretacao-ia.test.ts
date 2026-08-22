import { describe, expect, it } from "vitest";
import { validarRespostaIA } from "./interpretacao-ia-validacao";
import type { FaqParaDesvio, ObjecaoParaDesvio, Opcao } from "./tipos";

const OPCOES: Opcao[] = [
  { valor: "limpeza_nome", rotulos: ["1"], proximo_codigo: "ln_passo2" },
  { valor: "score", rotulos: ["2"], proximo_codigo: "handoff_humano" },
];

const FAQS: FaqParaDesvio[] = [{ pergunta: "Vocês trabalham com CNPJ?", resposta: "Sim, atendemos CPF e CNPJ." }];
const OBJECOES: ObjecaoParaDesvio[] = [{ objecao: "Acha caro", comoLidar: "Comparar valor vs. risco." }];

describe("validarRespostaIA", () => {
  it("retorna null quando a IA marca conseguiu_interpretar=false", () => {
    expect(validarRespostaIA({ conseguiu_interpretar: false, valor: "" }, OPCOES)).toBeNull();
  });

  it("retorna null quando o valor vem vazio mesmo com conseguiu_interpretar=true", () => {
    expect(validarRespostaIA({ conseguiu_interpretar: true, valor: "   " }, OPCOES)).toBeNull();
  });

  it("checkpoint com opções: aceita valor que bate exatamente com uma opção válida", () => {
    const r = validarRespostaIA({ conseguiu_interpretar: true, valor: "limpeza_nome" }, OPCOES);
    expect(r).toEqual({ valor: "limpeza_nome", opcaoEscolhida: OPCOES[0] });
  });

  it("checkpoint com opções: rejeita valor 'alucinado' fora da lista, mesmo com conseguiu_interpretar=true", () => {
    const r = validarRespostaIA({ conseguiu_interpretar: true, valor: "consorcio" }, OPCOES);
    expect(r).toBeNull();
  });

  it("checkpoint de texto livre (sem opções): aceita o valor extraído sem validar contra lista nenhuma", () => {
    const r = validarRespostaIA({ conseguiu_interpretar: true, valor: "uns 250 mil" }, undefined);
    expect(r).toEqual({ valor: "uns 250 mil" });
  });

  // Conteúdo extra embutido (achado 22/08/2026) — sem faqsAtivas/objecoesAtivas, comportamento idêntico ao de antes.
  it("sem faqsAtivas/objecoesAtivas: nunca anexa conteudoExtra, mesmo com índice preenchido", () => {
    const r = validarRespostaIA({ conseguiu_interpretar: true, valor: "uns 250 mil", indice_faq_extra: 1 }, undefined);
    expect(r).toEqual({ valor: "uns 250 mil" });
  });

  it("com faqsAtivas: anexa conteudoExtra quando o índice extra bate", () => {
    const r = validarRespostaIA(
      { conseguiu_interpretar: true, valor: "limpeza_nome", indice_faq_extra: 1 },
      OPCOES,
      FAQS,
      OBJECOES,
    );
    expect(r).toEqual({ valor: "limpeza_nome", opcaoEscolhida: OPCOES[0], conteudoExtra: { tipo: "faq", faq: FAQS[0] } });
  });

  it("com objecoesAtivas: anexa conteudoExtra de objeção quando o índice extra bate", () => {
    const r = validarRespostaIA(
      { conseguiu_interpretar: true, valor: "uns 250 mil", indice_objecao_extra: 1 },
      undefined,
      FAQS,
      OBJECOES,
    );
    expect(r).toEqual({ valor: "uns 250 mil", conteudoExtra: { tipo: "objecao", objecao: OBJECOES[0] } });
  });

  it("índice extra fora do range: não anexa conteudoExtra (defensivo, mesma filosofia de resolverConteudoExtra)", () => {
    const r = validarRespostaIA(
      { conseguiu_interpretar: true, valor: "uns 250 mil", indice_faq_extra: 99 },
      undefined,
      FAQS,
      OBJECOES,
    );
    expect(r).toEqual({ valor: "uns 250 mil" });
  });
});
