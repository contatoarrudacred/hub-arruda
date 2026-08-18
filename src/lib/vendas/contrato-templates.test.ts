import { describe, expect, it } from "vitest";
import { resolverPlaceholders } from "./contrato-templates";

describe("resolverPlaceholders", () => {
  const dadosBase = {
    nomeCliente: "JOÃO DA SILVA",
    documentoCliente: "123.456.789-09",
    valorTotal: 1500,
    formaPagamento: "Parcelado em 3x no boleto",
    tabelaVencimentos: "| Parcela | Valor | Vencimento |",
    listaDocumentos: "",
  };

  it("substitui todos os placeholders conhecidos", () => {
    const template =
      "Contrato de {{nome_cliente}} ({{documento_cliente}}), valor {{valor_total}} ({{valor_total_extenso}}). " +
      "Forma: {{forma_pagamento}}. {{tabela_vencimentos}}";

    const resultado = resolverPlaceholders(template, dadosBase);

    expect(resultado).toContain("Contrato de JOÃO DA SILVA (123.456.789-09)");
    expect(resultado).toContain("mil e quinhentos reais");
    expect(resultado).toContain("Forma: Parcelado em 3x no boleto");
    expect(resultado).toContain("| Parcela | Valor | Vencimento |");
    expect(resultado).not.toContain("{{");
  });

  it("formata valor_total como moeda brasileira", () => {
    const resultado = resolverPlaceholders("{{valor_total}}", dadosBase);
    expect(resultado).toBe("R$ 1.500,00");
  });

  it("substitui lista_documentos vazia quando não é pacote", () => {
    const resultado = resolverPlaceholders("Documentos: {{lista_documentos}}", dadosBase);
    expect(resultado).toBe("Documentos: ");
  });

  it("substitui lista_documentos com conteúdo quando é pacote", () => {
    const resultado = resolverPlaceholders("{{lista_documentos}}", {
      ...dadosBase,
      listaDocumentos: "CPF 111.111.111-11, CPF 222.222.222-22",
    });
    expect(resultado).toBe("CPF 111.111.111-11, CPF 222.222.222-22");
  });

  it("não altera texto sem placeholders", () => {
    expect(resolverPlaceholders("Texto fixo sem nada pra trocar.", dadosBase)).toBe(
      "Texto fixo sem nada pra trocar.",
    );
  });
});
