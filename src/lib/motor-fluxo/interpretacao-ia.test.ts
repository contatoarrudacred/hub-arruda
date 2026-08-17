import { describe, expect, it } from "vitest";
import { validarRespostaIA } from "./interpretacao-ia-validacao";
import type { Opcao } from "./tipos";

const OPCOES: Opcao[] = [
  { valor: "limpeza_nome", rotulos: ["1"], proximo_codigo: "ln_passo2" },
  { valor: "score", rotulos: ["2"], proximo_codigo: "handoff_humano" },
];

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
});
