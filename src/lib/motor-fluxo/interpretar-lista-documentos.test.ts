import { describe, expect, it } from "vitest";
import { validarRespostaListaDocumentos } from "./interpretar-lista-documentos-validacao";

describe("validarRespostaListaDocumentos", () => {
  it("completo: converte contagem em lista de itens", () => {
    const r = validarRespostaListaDocumentos({
      status: "completo",
      quantidade_cpf: 2,
      quantidade_cnpj: 1,
      pergunta_esclarecimento: "",
    });
    expect(r).toEqual({
      status: "completo",
      itens: [{ tipo: "cpf" }, { tipo: "cpf" }, { tipo: "cnpj" }],
    });
  });

  it("completo com só 1 documento (caso mais comum)", () => {
    const r = validarRespostaListaDocumentos({
      status: "completo",
      quantidade_cpf: 1,
      quantidade_cnpj: 0,
      pergunta_esclarecimento: "",
    });
    expect(r).toEqual({ status: "completo", itens: [{ tipo: "cpf" }] });
  });

  it("incompleto: repassa a pergunta de esclarecimento gerada pela IA", () => {
    const r = validarRespostaListaDocumentos({
      status: "incompleto",
      quantidade_cpf: 0,
      quantidade_cnpj: 0,
      pergunta_esclarecimento: "Você quer limpar quantos CPFs ou CNPJs, exatamente?",
    });
    expect(r).toEqual({
      status: "incompleto",
      perguntaEsclarecimento: "Você quer limpar quantos CPFs ou CNPJs, exatamente?",
    });
  });

  it("incompleto sem pergunta de esclarecimento vira não entendi (defesa contra resposta vazia)", () => {
    const r = validarRespostaListaDocumentos({
      status: "incompleto",
      quantidade_cpf: 0,
      quantidade_cnpj: 0,
      pergunta_esclarecimento: "",
    });
    expect(r).toEqual({ status: "nao_entendi" });
  });

  it("completo com total zero (alucinação) vira não entendi", () => {
    const r = validarRespostaListaDocumentos({
      status: "completo",
      quantidade_cpf: 0,
      quantidade_cnpj: 0,
      pergunta_esclarecimento: "",
    });
    expect(r).toEqual({ status: "nao_entendi" });
  });

  it("completo com número absurdo (alucinação) vira não entendi", () => {
    const r = validarRespostaListaDocumentos({
      status: "completo",
      quantidade_cpf: 999,
      quantidade_cnpj: 0,
      pergunta_esclarecimento: "",
    });
    expect(r).toEqual({ status: "nao_entendi" });
  });

  it("nao_entendi passa direto", () => {
    const r = validarRespostaListaDocumentos({
      status: "nao_entendi",
      quantidade_cpf: 0,
      quantidade_cnpj: 0,
      pergunta_esclarecimento: "",
    });
    expect(r).toEqual({ status: "nao_entendi" });
  });
});
