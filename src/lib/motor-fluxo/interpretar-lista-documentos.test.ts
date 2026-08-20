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

  it("incompleto sem proposta de contagem: repassa a pergunta, dadosParciais só com a pergunta pendente", () => {
    const r = validarRespostaListaDocumentos({
      status: "incompleto",
      quantidade_cpf: 0,
      quantidade_cnpj: 0,
      pergunta_esclarecimento: "Você quer limpar quantos CPFs ou CNPJs, exatamente?",
    });
    expect(r).toEqual({
      status: "incompleto",
      perguntaEsclarecimento: "Você quer limpar quantos CPFs ou CNPJs, exatamente?",
      dadosParciais: { _doc_pergunta_pendente: "Você quer limpar quantos CPFs ou CNPJs, exatamente?" },
    });
  });

  it("incompleto propondo contagem específica (caso do log real, 19/08/2026): dadosParciais carrega a proposta pro próximo turno confirmar", () => {
    const r = validarRespostaListaDocumentos({
      status: "incompleto",
      quantidade_cpf: 1,
      quantidade_cnpj: 1,
      pergunta_esclarecimento: "Perfeito! Você quer limpar 1 CPF e 1 CNPJ, é isso?",
    });
    expect(r).toEqual({
      status: "incompleto",
      perguntaEsclarecimento: "Perfeito! Você quer limpar 1 CPF e 1 CNPJ, é isso?",
      dadosParciais: {
        _doc_pergunta_pendente: "Perfeito! Você quer limpar 1 CPF e 1 CNPJ, é isso?",
        _doc_cpf_proposto: "1",
        _doc_cnpj_proposto: "1",
      },
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
