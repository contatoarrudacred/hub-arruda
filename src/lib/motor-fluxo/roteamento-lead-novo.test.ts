import { describe, expect, it } from "vitest";
import { resolverEtapaInicialLeadNovo, type RegraRoteamento } from "./roteamento-lead-novo";

describe("resolverEtapaInicialLeadNovo", () => {
  it("modo manual nunca responde sozinho", () => {
    expect(resolverEtapaInicialLeadNovo("oi, tudo bem?", "manual", "saudacao_inicial", [])).toBeNull();
  });

  it("modo fluxo_fixo sempre retorna a etapa configurada, ignorando o texto", () => {
    expect(resolverEtapaInicialLeadNovo("qualquer coisa", "fluxo_fixo", "saudacao_inicial", [])).toBe(
      "saudacao_inicial",
    );
  });

  it("modo palavra_chave aciona a primeira regra cujo termo aparece na mensagem", () => {
    const regras: RegraRoteamento[] = [
      { termos: ["score", "protesto"], etapaCodigo: "handoff_score" },
      { termos: ["nome sujo", "serasa", "spc"], etapaCodigo: "saudacao_inicial" },
    ];
    expect(resolverEtapaInicialLeadNovo("meu nome tá no SPC", "palavra_chave", "saudacao_inicial", regras)).toBe(
      "saudacao_inicial",
    );
    expect(resolverEtapaInicialLeadNovo("quero saber do meu score", "palavra_chave", "saudacao_inicial", regras)).toBe(
      "handoff_score",
    );
  });

  it("modo palavra_chave sem nenhuma regra batendo não responde sozinho", () => {
    const regras: RegraRoteamento[] = [{ termos: ["score"], etapaCodigo: "handoff_score" }];
    expect(resolverEtapaInicialLeadNovo("bom dia", "palavra_chave", "saudacao_inicial", regras)).toBeNull();
  });

  it("modo palavra_chave é case-insensitive", () => {
    const regras: RegraRoteamento[] = [{ termos: ["SERASA"], etapaCodigo: "saudacao_inicial" }];
    expect(resolverEtapaInicialLeadNovo("vi meu nome no serasa", "palavra_chave", "x", regras)).toBe(
      "saudacao_inicial",
    );
  });

  it("modo palavra_chave respeita a ordem — primeira regra que bate vence", () => {
    const regras: RegraRoteamento[] = [
      { termos: ["nome"], etapaCodigo: "etapa_a" },
      { termos: ["nome sujo"], etapaCodigo: "etapa_b" },
    ];
    expect(resolverEtapaInicialLeadNovo("meu nome está sujo", "palavra_chave", "x", regras)).toBe("etapa_a");
  });
});
