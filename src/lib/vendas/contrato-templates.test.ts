import { describe, expect, it } from "vitest";
import {
  montarDadosClienteHtml,
  montarListaDocumentosHtml,
  montarTabelaVencimentosHtml,
  resolverPlaceholders,
  type PessoaContrato,
} from "./contrato-templates";

const pessoaPfBase: PessoaContrato = {
  tipoPessoa: "pf",
  nomeRazaoSocial: "JOÃO DA SILVA",
  documento: "123.456.789-09",
  email: "joao@example.com",
  whatsapp: "(48) 99999-0000",
  endereco: "Rua das Flores, 123 — Florianópolis/SC",
  rg: "1.234.567",
  estadoCivil: "Casado",
  profissao: "Engenheiro",
};

const pessoaPjBase: PessoaContrato = {
  tipoPessoa: "pj",
  nomeRazaoSocial: "EMPRESA LTDA",
  documento: "12.345.678/0001-90",
  email: null,
  whatsapp: null,
  endereco: null,
  rg: null,
  estadoCivil: null,
  profissao: null,
};

describe("resolverPlaceholders", () => {
  const dadosBase = {
    dadosCliente: "<p>Nome: JOÃO DA SILVA</p>",
    valorTotal: 1500,
    formaPagamento: "Parcelado em 3x no boleto",
    tabelaVencimentos: "<table><tr><td>1</td></tr></table>",
    listaDocumentos: "",
  };

  it("substitui todos os placeholders conhecidos", () => {
    const template =
      "<div>{{dados_cliente}}<p>Valor: {{valor_total}} ({{valor_total_extenso}})</p>" +
      "<p>Forma: {{forma_pagamento}}</p>{{tabela_vencimentos}}</div>";

    const resultado = resolverPlaceholders(template, dadosBase);

    expect(resultado).toContain("<p>Nome: JOÃO DA SILVA</p>");
    expect(resultado).toContain("mil e quinhentos reais");
    expect(resultado).toContain("Forma: Parcelado em 3x no boleto");
    expect(resultado).toContain("<table><tr><td>1</td></tr></table>");
    expect(resultado).not.toContain("{{");
  });

  it("formata valor_total como moeda brasileira", () => {
    const resultado = resolverPlaceholders("{{valor_total}}", dadosBase);
    expect(resultado).toBe((1500).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  });

  it("substitui lista_documentos vazia quando não é pacote", () => {
    const resultado = resolverPlaceholders("Documentos: {{lista_documentos}}", dadosBase);
    expect(resultado).toBe("Documentos: ");
  });

  it("não altera texto sem placeholders", () => {
    expect(resolverPlaceholders("Texto fixo sem nada pra trocar.", dadosBase)).toBe(
      "Texto fixo sem nada pra trocar.",
    );
  });
});

describe("montarDadosClienteHtml", () => {
  it("monta os 8 campos de uma Pessoa Física", () => {
    const html = montarDadosClienteHtml(pessoaPfBase);

    expect(html).toContain("JOÃO DA SILVA");
    expect(html).toContain("123.456.789-09");
    expect(html).toContain("1.234.567");
    expect(html).toContain("Casado");
    expect(html).toContain("Engenheiro");
    expect(html).toContain("joao@example.com");
  });

  it("usa travessão quando um campo opcional está vazio", () => {
    const html = montarDadosClienteHtml({ ...pessoaPfBase, profissao: null });
    expect(html).toContain("<strong>Profissão:</strong> —");
  });

  it("monta razão social + CNPJ + dados do representante pra Pessoa Jurídica", () => {
    const html = montarDadosClienteHtml(pessoaPjBase, pessoaPfBase);

    expect(html).toContain("EMPRESA LTDA");
    expect(html).toContain("12.345.678/0001-90");
    expect(html).toContain("Representada por");
    expect(html).toContain("JOÃO DA SILVA");
    expect(html).toContain("1.234.567");
  });

  it("lança erro se Pessoa Jurídica não tiver representante", () => {
    expect(() => montarDadosClienteHtml(pessoaPjBase)).toThrow();
  });
});

describe("montarListaDocumentosHtml", () => {
  it("devolve vazio quando não é pacote (0 ou 1 documento)", () => {
    expect(montarListaDocumentosHtml([])).toBe("");
    expect(montarListaDocumentosHtml([{ documento: "123.456.789-09", nomeRazaoSocial: "JOÃO DA SILVA" }])).toBe("");
  });

  it("lista documento + nome de cada item do pacote (sem RG/estado civil/profissão — não existe pra esses)", () => {
    const html = montarListaDocumentosHtml([
      { documento: "123.456.789-09", nomeRazaoSocial: "JOÃO DA SILVA" },
      { documento: "987.654.321-00", nomeRazaoSocial: "MARIA SOUZA" },
    ]);

    expect(html).toContain("<table>");
    expect(html).toContain("123.456.789-09");
    expect(html).toContain("987.654.321-00");
    expect(html).toContain("JOÃO DA SILVA");
    expect(html).toContain("MARIA SOUZA");
  });
});

describe("montarTabelaVencimentosHtml", () => {
  it("monta uma linha por parcela com número, vencimento, valor e forma de pagamento", () => {
    const html = montarTabelaVencimentosHtml(
      [
        { numero: 1, valor: 750, vencimento: new Date("2026-09-01T00:00:00Z") },
        { numero: 2, valor: 750, vencimento: new Date("2026-10-10T00:00:00Z") },
      ],
      "Boleto/Pix",
    );

    expect(html).toContain("<table>");
    expect(html).toContain("01/09/2026");
    expect(html).toContain("10/10/2026");
    expect(html).toContain((750).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
    expect((html.match(/Boleto\/Pix/g) ?? []).length).toBe(2);
  });
});
