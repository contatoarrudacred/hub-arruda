import { describe, expect, it } from "vitest";
import { validarRespostaFaixasDocumentos } from "./interpretar-faixas-documentos-validacao";

describe("validarRespostaFaixasDocumentos", () => {
  it("completo: 1 documento com valor conhecido", () => {
    const r = validarRespostaFaixasDocumentos(
      {
        status: "completo",
        itens: [{ tipo: "cpf", sabe_valor: true, valor_aproximado: 15000 }],
        pergunta_esclarecimento: "",
      },
      ["cpf"],
    );
    expect(r).toEqual({ status: "completo", itens: [{ tipo: "cpf", valorAproximado: 15000 }] });
  });

  it("completo: pacote com 2 documentos, um deles 'não sei'", () => {
    const r = validarRespostaFaixasDocumentos(
      {
        status: "completo",
        itens: [
          { tipo: "cpf", sabe_valor: true, valor_aproximado: 15000 },
          { tipo: "cnpj", sabe_valor: false, valor_aproximado: 0 },
        ],
        pergunta_esclarecimento: "",
      },
      ["cpf", "cnpj"],
    );
    expect(r).toEqual({
      status: "completo",
      itens: [
        { tipo: "cpf", valorAproximado: 15000 },
        { tipo: "cnpj", valorAproximado: null },
      ],
    });
  });

  it("incompleto: repassa a pergunta de esclarecimento", () => {
    const r = validarRespostaFaixasDocumentos(
      {
        status: "incompleto",
        itens: [],
        pergunta_esclarecimento: "Você mencionou o CPF, mas qual a faixa do CNPJ?",
      },
      ["cpf", "cnpj"],
    );
    expect(r).toEqual({ status: "incompleto", perguntaEsclarecimento: "Você mencionou o CPF, mas qual a faixa do CNPJ?" });
  });

  it("rejeita quando a quantidade de itens não bate com os documentos esperados", () => {
    const r = validarRespostaFaixasDocumentos(
      {
        status: "completo",
        itens: [{ tipo: "cpf", sabe_valor: true, valor_aproximado: 15000 }],
        pergunta_esclarecimento: "",
      },
      ["cpf", "cnpj"],
    );
    expect(r).toEqual({ status: "nao_entendi" });
  });

  it("rejeita quando a ordem/tipo dos itens não bate com o esperado", () => {
    const r = validarRespostaFaixasDocumentos(
      {
        status: "completo",
        itens: [{ tipo: "cnpj", sabe_valor: true, valor_aproximado: 15000 }],
        pergunta_esclarecimento: "",
      },
      ["cpf"],
    );
    expect(r).toEqual({ status: "nao_entendi" });
  });

  it("rejeita valor absurdo (alucinação)", () => {
    const r = validarRespostaFaixasDocumentos(
      {
        status: "completo",
        itens: [{ tipo: "cpf", sabe_valor: true, valor_aproximado: 999_999_999 }],
        pergunta_esclarecimento: "",
      },
      ["cpf"],
    );
    expect(r).toEqual({ status: "nao_entendi" });
  });
});
