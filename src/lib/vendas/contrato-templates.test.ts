import { describe, expect, it } from "vitest";
import {
  montarCamposClienteResolucao,
  montarDadosClienteHtml,
  montarTabelaContratanteHtml,
  montarTabelaDocumentosHtml,
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
    tabelaDocumentos: "",
    tabelaContratante: "<table><tr><td><strong>Nome Completo</strong></td><td>JOÃO DA SILVA</td></tr></table>",
    clienteNome: "JOÃO DA SILVA",
    clienteDocumento: "123.456.789-09",
    clienteRg: "1.234.567",
    clienteEstadoCivil: "Casado",
    clienteProfissao: "Engenheiro",
    clienteEmail: "joao@example.com",
    clienteWhatsapp: "(48) 99999-0000",
    clienteEndereco: "Rua das Flores, 123 — Florianópolis/SC",
    empresaRazaoSocial: "",
    empresaCnpj: "",
  };

  it("substitui os placeholders granulares de cliente ({{cliente_nome}}, etc.)", () => {
    const template = "Eu, {{cliente_nome}}, CPF {{cliente_documento}}, RG {{cliente_rg}}, {{cliente_estado_civil}}, {{cliente_profissao}}.";
    const resultado = resolverPlaceholders(template, dadosBase);
    expect(resultado).toBe("Eu, JOÃO DA SILVA, CPF 123.456.789-09, RG 1.234.567, Casado, Engenheiro.");
  });

  it("substitui empresa_razao_social/empresa_cnpj vazios quando é PF", () => {
    const resultado = resolverPlaceholders("{{empresa_razao_social}} {{empresa_cnpj}}", dadosBase);
    expect(resultado).toBe(" ");
  });

  it("usa travessão quando um campo opcional granular está vazio", () => {
    const resultado = resolverPlaceholders("Profissão: {{cliente_profissao}}", { ...dadosBase, clienteProfissao: "" });
    expect(resultado).toBe("Profissão: —");
  });

  it("substitui {{tabela_contratante}}", () => {
    const resultado = resolverPlaceholders("{{tabela_contratante}}", dadosBase);
    expect(resultado).toBe(dadosBase.tabelaContratante);
  });

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

  it("substitui tabela_documentos vazia quando não é pacote", () => {
    const resultado = resolverPlaceholders("Documentos: {{tabela_documentos}}", dadosBase);
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

describe("montarCamposClienteResolucao", () => {
  it("PF: campos do próprio cliente, empresa_* vazio", () => {
    const campos = montarCamposClienteResolucao(pessoaPfBase);
    expect(campos.clienteNome).toBe("JOÃO DA SILVA");
    expect(campos.clienteDocumento).toBe("123.456.789-09");
    expect(campos.clienteRg).toBe("1.234.567");
    expect(campos.empresaRazaoSocial).toBe("");
    expect(campos.empresaCnpj).toBe("");
  });

  it("PF: campo opcional ausente vira string vazia (não trava)", () => {
    const campos = montarCamposClienteResolucao({ ...pessoaPfBase, profissao: null });
    expect(campos.clienteProfissao).toBe("");
  });

  it("PJ: cliente_* são do representante, empresa_* é a razão social/CNPJ", () => {
    const campos = montarCamposClienteResolucao(pessoaPjBase, pessoaPfBase);
    expect(campos.clienteNome).toBe("JOÃO DA SILVA");
    expect(campos.clienteDocumento).toBe("123.456.789-09");
    expect(campos.empresaRazaoSocial).toBe("EMPRESA LTDA");
    expect(campos.empresaCnpj).toBe("12.345.678/0001-90");
  });

  it("PJ sem representante lança erro", () => {
    expect(() => montarCamposClienteResolucao(pessoaPjBase)).toThrow();
  });
});

describe("montarTabelaContratanteHtml", () => {
  it("PF: uma tabela com rótulo em negrito + valor, na ordem certa", () => {
    const html = montarTabelaContratanteHtml(pessoaPfBase);

    expect(html).toContain("<table>");
    expect(html).toContain("<tr><td><strong>Nome Completo</strong></td><td>JOÃO DA SILVA</td></tr>");
    expect(html).toContain("<tr><td><strong>CPF</strong></td><td>123.456.789-09</td></tr>");
    expect(html).toContain("<tr><td><strong>RG</strong></td><td>1.234.567</td></tr>");
    expect(html).toContain("<tr><td><strong>Estado Civil</strong></td><td>Casado</td></tr>");
    expect(html).toContain("<tr><td><strong>Profissão</strong></td><td>Engenheiro</td></tr>");
    expect(html).toContain("<tr><td><strong>E-mail</strong></td><td>joao@example.com</td></tr>");
    expect(html).toContain("<tr><td><strong>Fone/WhatsApp</strong></td><td>(48) 99999-0000</td></tr>");
    expect(html).toContain("<tr><td><strong>Endereço</strong></td><td>Rua das Flores, 123 — Florianópolis/SC</td></tr>");
  });

  it("PF: usa travessão quando um campo opcional está vazio", () => {
    const html = montarTabelaContratanteHtml({ ...pessoaPfBase, profissao: null });
    expect(html).toContain("<tr><td><strong>Profissão</strong></td><td>—</td></tr>");
  });

  it("PJ: tabela 2x2 de razão social/CNPJ, texto 'representada por:', depois a tabela do representante", () => {
    const html = montarTabelaContratanteHtml(pessoaPjBase, pessoaPfBase);

    expect(html).toContain("<tr><td><strong>Razão Social</strong></td><td>EMPRESA LTDA</td></tr>");
    expect(html).toContain("<tr><td><strong>CNPJ</strong></td><td>12.345.678/0001-90</td></tr>");
    expect(html).toContain("representada por:");
    expect(html).toContain("<tr><td><strong>Nome Completo</strong></td><td>JOÃO DA SILVA</td></tr>");

    const posRazaoSocial = html.indexOf("Razão Social");
    const posRepresentadaPor = html.indexOf("representada por:");
    const posNomeCompleto = html.indexOf("Nome Completo");
    expect(posRazaoSocial).toBeLessThan(posRepresentadaPor);
    expect(posRepresentadaPor).toBeLessThan(posNomeCompleto);
  });

  it("PJ sem representante lança erro", () => {
    expect(() => montarTabelaContratanteHtml(pessoaPjBase)).toThrow();
  });
});

describe("montarTabelaDocumentosHtml", () => {
  it("devolve vazio quando não é pacote (0 ou 1 documento)", () => {
    expect(montarTabelaDocumentosHtml([])).toBe("");
    expect(montarTabelaDocumentosHtml([{ documento: "123.456.789-09", nomeRazaoSocial: "JOÃO DA SILVA" }])).toBe("");
  });

  it("monta tabela com cabeçalho CPF / CNPJ e NOME / RAZÃO SOCIAL", () => {
    const html = montarTabelaDocumentosHtml([
      { documento: "123.456.789-09", nomeRazaoSocial: "JOÃO DA SILVA" },
      { documento: "987.654.321-00", nomeRazaoSocial: "MARIA SOUZA" },
    ]);

    expect(html).toContain("<table>");
    expect(html).toContain("<th>CPF / CNPJ</th>");
    expect(html).toContain("<th>NOME / RAZÃO SOCIAL</th>");
    expect(html).toContain("<tr><td>123.456.789-09</td><td>JOÃO DA SILVA</td></tr>");
    expect(html).toContain("<tr><td>987.654.321-00</td><td>MARIA SOUZA</td></tr>");
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
