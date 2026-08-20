import { describe, expect, it } from "vitest";
import {
  codificarParcialFaixas,
  decodificarParcialFaixas,
  mesclarAtualizacoesParciais,
  validarConfirmacaoFaixa,
  validarEscolhaFaixaMenu,
} from "./interpretar-faixas-documentos-validacao";

describe("codificarParcialFaixas / decodificarParcialFaixas (modo livre, 19/08/2026)", () => {
  it("ida e volta preserva os 3 estados: ainda não sabido, não sei, valor conhecido", () => {
    const itens = [null, { tipo: "cpf" as const, valorAproximado: null }, { tipo: "cnpj" as const, valorAproximado: 20000 }];
    const csv = codificarParcialFaixas(itens);
    expect(csv).toBe(",nao_sei,20000");
    expect(decodificarParcialFaixas(csv, ["cpf", "cpf", "cnpj"])).toEqual(itens);
  });

  it("string vazia decodifica como 'tudo ainda não sabido' (estado inicial)", () => {
    expect(decodificarParcialFaixas("", ["cpf", "cnpj"])).toEqual([null, null]);
  });

  it("token malformado (não numérico, não 'nao_sei') decodifica como não sabido, defensivo", () => {
    expect(decodificarParcialFaixas("abc,10000", ["cpf", "cnpj"])).toEqual([null, { tipo: "cnpj", valorAproximado: 10000 }]);
  });
});

describe("mesclarAtualizacoesParciais (modo livre, 19/08/2026 — corrige o loop infinito do log real)", () => {
  it("aplica atualização num índice sem mexer nos outros já sabidos", () => {
    const anterior = [{ tipo: "cpf" as const, valorAproximado: 20000 }, null];
    const r = mesclarAtualizacoesParciais(anterior, [{ indice: 2, tipo: "cpf", sabe_valor: true, valor_aproximado: 8000 }], ["cpf", "cpf"]);
    expect(r).toEqual([
      { tipo: "cpf", valorAproximado: 20000 },
      { tipo: "cpf", valorAproximado: 8000 },
    ]);
  });

  it("caso do log real: resposta 'menos de 10' pro segundo CPF fecha o checkpoint (não fica em loop)", () => {
    const anterior = [{ tipo: "cpf" as const, valorAproximado: 20000 }, null];
    const r = mesclarAtualizacoesParciais(anterior, [{ indice: 2, tipo: "cpf", sabe_valor: true, valor_aproximado: 9000 }], ["cpf", "cpf"]);
    expect(r.every((item) => item !== null)).toBe(true);
  });

  it("'não sei' é uma atualização válida (fecha o item, não bloqueia)", () => {
    const r = mesclarAtualizacoesParciais([null], [{ indice: 1, tipo: "cpf", sabe_valor: false, valor_aproximado: 0 }], ["cpf"]);
    expect(r).toEqual([{ tipo: "cpf", valorAproximado: null }]);
  });

  it("ignora índice fora do range (defensivo contra alucinação)", () => {
    const anterior = [null];
    const r = mesclarAtualizacoesParciais(anterior, [{ indice: 5, tipo: "cpf", sabe_valor: true, valor_aproximado: 1000 }], ["cpf"]);
    expect(r).toEqual([null]);
  });

  it("ignora quando o tipo da atualização não bate com o esperado naquele índice", () => {
    const anterior = [null];
    const r = mesclarAtualizacoesParciais(anterior, [{ indice: 1, tipo: "cnpj", sabe_valor: true, valor_aproximado: 1000 }], ["cpf"]);
    expect(r).toEqual([null]);
  });

  it("ignora valor absurdo (alucinação), mantém o item como ainda não sabido", () => {
    const anterior = [null];
    const r = mesclarAtualizacoesParciais(anterior, [{ indice: 1, tipo: "cpf", sabe_valor: true, valor_aproximado: 999_999_999 }], ["cpf"]);
    expect(r).toEqual([null]);
  });

  it("sem atualizações, devolve o estado anterior intacto", () => {
    const anterior = [{ tipo: "cpf" as const, valorAproximado: 5000 }, null];
    expect(mesclarAtualizacoesParciais(anterior, [], ["cpf", "cpf"])).toEqual(anterior);
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

  it("acima do corte (opção virtual, spec 2026-08-20-agendamento-consultor-alto-valor.md) — não precisa de índice", () => {
    expect(validarEscolhaFaixaMenu({ status: "acima_do_corte", indice_faixa: 0 }, 5)).toEqual({
      tipo: "acima_do_corte",
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
