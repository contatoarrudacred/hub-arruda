import { describe, expect, it } from "vitest";
import {
  validarConfirmacaoFaixa,
  validarEscolhaFaixaMenu,
  validarRespostaFaixasDocumentos,
} from "./interpretar-faixas-documentos-validacao";

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

describe("validarEscolhaFaixaMenu (rodada 1 do menu fechado, ln_passo6)", () => {
  it("faixa escolhida: converte índice 1-based (IA) pra 0-based (array ordenado)", () => {
    expect(validarEscolhaFaixaMenu({ status: "faixa_escolhida", indice_faixa: 2 }, 5)).toEqual({
      tipo: "faixa_escolhida",
      indice: 1,
    });
  });

  it("quer consulta paga", () => {
    expect(validarEscolhaFaixaMenu({ status: "quer_consulta_paga", indice_faixa: 0 }, 5)).toEqual({
      tipo: "quer_consulta_paga",
    });
  });

  it("índice fora do range do menu vira nao_entendi (alucinação)", () => {
    expect(validarEscolhaFaixaMenu({ status: "faixa_escolhida", indice_faixa: 9 }, 5)).toEqual({ tipo: "nao_entendi" });
  });

  it("índice zero ou negativo vira nao_entendi", () => {
    expect(validarEscolhaFaixaMenu({ status: "faixa_escolhida", indice_faixa: 0 }, 5)).toEqual({ tipo: "nao_entendi" });
  });

  it("status desconhecido vira nao_entendi", () => {
    expect(validarEscolhaFaixaMenu({ status: "nao_entendi", indice_faixa: 1 }, 5)).toEqual({ tipo: "nao_entendi" });
  });
});

describe("validarConfirmacaoFaixa (rodada 2 do menu fechado, ln_passo6)", () => {
  it("confirmado", () => {
    expect(validarConfirmacaoFaixa({ status: "confirmado" })).toBe("confirmado");
  });

  it("quer consulta paga", () => {
    expect(validarConfirmacaoFaixa({ status: "quer_consulta_paga" })).toBe("quer_consulta_paga");
  });

  it("não confirmado", () => {
    expect(validarConfirmacaoFaixa({ status: "nao_confirmado" })).toBe("nao_confirmado");
  });

  it("qualquer status inesperado vira nao_confirmado (defensivo — cai pra extração livre, sem risco)", () => {
    expect(validarConfirmacaoFaixa({ status: "algo_estranho" } as never)).toBe("nao_confirmado");
  });
});
