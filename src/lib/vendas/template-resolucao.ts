import { valorPorExtenso } from "./valor-por-extenso";

/**
 * Lógica pura de resolução de template (sem I/O) — separada de contrato-templates.ts de propósito:
 * aquele arquivo importa @/lib/supabase/server (server-only, usa next/headers), então nenhum
 * Client Component pode importar nada de lá sem quebrar o build ("You're importing a component
 * that needs next/headers"). O preview do editor (src/components/vendas/editor-html-contrato.tsx,
 * "use client") precisa de resolverPlaceholders/gerarDadosMockPreview — daqui, direto, sem passar
 * por contrato-templates.ts. Mesmo padrão já usado em src/lib/vendas/tipos-documento.ts.
 */

export type DadosResolucaoContrato = {
  dadosCliente: string;
  valorTotal: number;
  formaPagamento: string;
  tabelaVencimentos: string;
  quantidadeParcelas: string;
  tabelaDocumentos: string;
  tabelaContratante: string;
  // Campos granulares — complementam {{dados_cliente}} (bloco pronto) pra quem quer montar o
  // layout do contrato campo a campo (pedido do Luiz, 19/08/2026: "precisaremos deles separados
  // e não uma variável única que traz tudo junto"). Vazio ("") quando não se aplica — ver
  // montarCamposClienteResolucao.
  clienteNome: string;
  clienteDocumento: string;
  clienteRg: string;
  clienteEstadoCivil: string;
  clienteProfissao: string;
  clienteEmail: string;
  clienteWhatsapp: string;
  clienteEndereco: string;
  empresaRazaoSocial: string;
  empresaCnpj: string;
};

const PLACEHOLDERS = [
  "dados_cliente",
  "valor_total",
  "valor_total_extenso",
  "tabela_vencimentos",
  "quantidade_parcelas",
  "forma_pagamento",
  "tabela_documentos",
  "tabela_contratante",
  "cliente_nome",
  "cliente_documento",
  "cliente_rg",
  "cliente_estado_civil",
  "cliente_profissao",
  "cliente_email",
  "cliente_whatsapp",
  "cliente_endereco",
  "empresa_razao_social",
  "empresa_cnpj",
] as const;

/** Mesmo critério de "—" já usado nos blocos prontos (campo(), abaixo) — aplicado só aos campos
 * opcionais (rg/estado civil/profissão/e-mail/whatsapp/endereço). Nome/documento nunca ficam
 * vazios (campo obrigatório), e razão social/CNPJ vazios (PF) ficam "" mesmo — não é dado
 * "faltando", é "não se aplica", então não faz sentido mostrar travessão. */
function valorOuTraco(valor: string): string {
  return valor.trim() ? valor : "—";
}

/**
 * Resolve os placeholders {{...}} do HTML do template contra os dados já coletados na tela de
 * Fechamento de Venda. Os blocos HTML de dados_cliente/tabela_documentos/tabela_vencimentos já
 * chegam prontos (montados por montarDadosClienteHtml/montarTabelaDocumentosHtml/
 * montarTabelaVencimentosHtml) — esta função só faz a substituição final, continua pura.
 */
export function resolverPlaceholders(conteudoHtml: string, dados: DadosResolucaoContrato): string {
  const valorFormatado = dados.valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const substituicoes: Record<(typeof PLACEHOLDERS)[number], string> = {
    dados_cliente: dados.dadosCliente,
    valor_total: valorFormatado,
    valor_total_extenso: valorPorExtenso(dados.valorTotal),
    tabela_vencimentos: dados.tabelaVencimentos,
    quantidade_parcelas: dados.quantidadeParcelas,
    forma_pagamento: dados.formaPagamento,
    tabela_documentos: dados.tabelaDocumentos,
    tabela_contratante: dados.tabelaContratante,
    cliente_nome: dados.clienteNome,
    cliente_documento: dados.clienteDocumento,
    cliente_rg: valorOuTraco(dados.clienteRg),
    cliente_estado_civil: valorOuTraco(dados.clienteEstadoCivil),
    cliente_profissao: valorOuTraco(dados.clienteProfissao),
    cliente_email: valorOuTraco(dados.clienteEmail),
    cliente_whatsapp: valorOuTraco(dados.clienteWhatsapp),
    cliente_endereco: valorOuTraco(dados.clienteEndereco),
    empresa_razao_social: dados.empresaRazaoSocial,
    empresa_cnpj: dados.empresaCnpj,
  };

  return PLACEHOLDERS.reduce(
    (texto, chave) => texto.split(`{{${chave}}}`).join(substituicoes[chave]),
    conteudoHtml,
  );
}

export type PessoaContrato = {
  tipoPessoa: "pf" | "pj";
  nomeRazaoSocial: string;
  documento: string;
  email: string | null;
  whatsapp: string | null;
  endereco: string | null;
  rg: string | null;
  estadoCivil: string | null;
  profissao: string | null;
};

function campo(rotulo: string, valor: string | null): string {
  return `<p><strong>${rotulo}:</strong> ${valor && valor.trim() ? valor : "—"}</p>`;
}

function montarBlocoPessoaFisica(pessoa: PessoaContrato): string {
  return [
    campo("Nome completo", pessoa.nomeRazaoSocial),
    campo("CPF", pessoa.documento),
    campo("RG", pessoa.rg),
    campo("Estado civil", pessoa.estadoCivil),
    campo("Profissão", pessoa.profissao),
    campo("E-mail", pessoa.email),
    campo("Telefone/WhatsApp", pessoa.whatsapp),
    campo("Endereço", pessoa.endereco),
  ].join("\n");
}

/**
 * Monta o bloco {{dados_cliente}} — PF: os 8 campos do próprio cliente. PJ: razão social/CNPJ +
 * os mesmos 8 campos do representante legal (obrigatório passar `representante` quando `pessoa`
 * é PJ — lança erro se faltar, contrato de PJ sem representante não tem quem assine).
 */
export function montarDadosClienteHtml(pessoa: PessoaContrato, representante?: PessoaContrato | null): string {
  if (pessoa.tipoPessoa === "pf") {
    return montarBlocoPessoaFisica(pessoa);
  }

  if (!representante) {
    throw new Error("Pessoa jurídica precisa de um representante legal pra montar os dados do contrato.");
  }

  return [
    campo("Razão social", pessoa.nomeRazaoSocial),
    campo("CNPJ", pessoa.documento),
    "<p><strong>Representada por:</strong></p>",
    montarBlocoPessoaFisica(representante),
  ].join("\n");
}

function linhaTabela(rotulo: string, valor: string | null): string {
  return `<tr><td><strong>${rotulo}</strong></td><td>${valor && valor.trim() ? valor : "—"}</td></tr>`;
}

function montarTabelaPessoaFisica(pessoa: PessoaContrato): string {
  return [
    linhaTabela("Nome Completo", pessoa.nomeRazaoSocial),
    linhaTabela("CPF", pessoa.documento),
    linhaTabela("RG", pessoa.rg),
    linhaTabela("Estado Civil", pessoa.estadoCivil),
    linhaTabela("Profissão", pessoa.profissao),
    linhaTabela("E-mail", pessoa.email),
    linhaTabela("Fone/WhatsApp", pessoa.whatsapp),
    linhaTabela("Endereço", pessoa.endereco),
  ].join("\n");
}

/**
 * Monta {{tabela_contratante}} — mesma informação de {{dados_cliente}}, mas como tabela de duas
 * colunas (rótulo em negrito | valor) em vez de parágrafos soltos. PF: uma tabela só, com os 8
 * campos do cliente. PJ: uma tabela 2x2 com Razão Social/CNPJ, o texto "representada por:", e
 * embaixo uma segunda tabela com os 8 campos do representante legal — mesma regra de
 * obrigatoriedade de representante que montarDadosClienteHtml.
 */
export function montarTabelaContratanteHtml(pessoa: PessoaContrato, representante?: PessoaContrato | null): string {
  if (pessoa.tipoPessoa === "pf") {
    return `<table>\n${montarTabelaPessoaFisica(pessoa)}\n</table>`;
  }

  if (!representante) {
    throw new Error("Pessoa jurídica precisa de um representante legal pra montar os dados do contrato.");
  }

  return [
    "<table>",
    linhaTabela("Razão Social", pessoa.nomeRazaoSocial),
    linhaTabela("CNPJ", pessoa.documento),
    "</table>",
    "<p>representada por:</p>",
    "<table>",
    montarTabelaPessoaFisica(representante),
    "</table>",
  ].join("\n");
}

export type CamposClienteResolucao = {
  clienteNome: string;
  clienteDocumento: string;
  clienteRg: string;
  clienteEstadoCivil: string;
  clienteProfissao: string;
  clienteEmail: string;
  clienteWhatsapp: string;
  clienteEndereco: string;
  empresaRazaoSocial: string;
  empresaCnpj: string;
};

/**
 * Monta os placeholders granulares de cliente ({{cliente_nome}}, {{cliente_documento}}, etc.) —
 * complementa {{dados_cliente}} (bloco pronto) pra quem quer montar o layout do contrato campo a
 * campo, em vez do bloco fixo. PF: cliente_* são os dados da própria pessoa, empresa_* fica vazio
 * (não se aplica). PJ: cliente_* são do representante legal (quem assina de fato), empresa_* é a
 * razão social/CNPJ da pessoa jurídica — mesma regra de obrigatoriedade de representante que
 * montarDadosClienteHtml.
 */
export function montarCamposClienteResolucao(pessoa: PessoaContrato, representante?: PessoaContrato | null): CamposClienteResolucao {
  const pessoaFisica = pessoa.tipoPessoa === "pf" ? pessoa : representante;
  if (pessoa.tipoPessoa === "pj" && !representante) {
    throw new Error("Pessoa jurídica precisa de um representante legal pra montar os dados do contrato.");
  }
  // pessoaFisica nunca é null aqui: pf usa a própria pessoa, pj já teria lançado acima sem representante.
  const p = pessoaFisica as PessoaContrato;

  return {
    clienteNome: p.nomeRazaoSocial,
    clienteDocumento: p.documento,
    clienteRg: p.rg ?? "",
    clienteEstadoCivil: p.estadoCivil ?? "",
    clienteProfissao: p.profissao ?? "",
    clienteEmail: p.email ?? "",
    clienteWhatsapp: p.whatsapp ?? "",
    clienteEndereco: p.endereco ?? "",
    empresaRazaoSocial: pessoa.tipoPessoa === "pj" ? pessoa.nomeRazaoSocial : "",
    empresaCnpj: pessoa.tipoPessoa === "pj" ? pessoa.documento : "",
  };
}

export type DocumentoPacote = { documento: string; nomeRazaoSocial: string };

/**
 * Monta {{tabela_documentos}} — tabela de duas colunas (CPF/CNPJ, nome/razão social) de cada
 * documento coberto pelo contrato. **Decisão de escopo (Luiz, 18/08/2026): só temos dado completo
 * (RG/estado civil/profissão/endereço) de quem assina o contrato — os demais documentos do pacote
 * só têm documento + nome, e é só isso que existe pra mostrar aqui.** Devolve string vazia só
 * quando não há nenhum documento cadastrado no pacote (produto sem `exige_lista_documentos`, ou
 * pacote ainda vazio).
 *
 * Achado do Luiz (21/08/2026, mesmo padrão do bug já corrigido em {{tabela_vencimentos}}): antes só
 * gerava a tabela com MAIS de 1 documento — um pacote com 1 documento só (ex.: produto exige a
 * lista, mas só um nome foi informado) ficava sem tabela nenhuma no contrato real, mesmo o preview
 * do editor (sempre com 2 documentos fictícios) mostrando a tabela funcionando normalmente. Gera
 * sempre que houver pelo menos 1 documento agora.
 */
export function montarTabelaDocumentosHtml(documentos: DocumentoPacote[]): string {
  if (documentos.length === 0) return "";

  const linhas = documentos
    .map((doc) => `<tr><td>${doc.documento}</td><td>${doc.nomeRazaoSocial}</td></tr>`)
    .join("\n");

  return `<table><thead><tr><th>CPF / CNPJ</th><th>NOME / RAZÃO SOCIAL</th></tr></thead><tbody>\n${linhas}\n</tbody></table>`;
}

export type ParcelaTabela = { numero: number; valor: number; vencimento: Date };

/**
 * Monta {{tabela_vencimentos}} — tabela HTML (nº / vencimento / valor / forma de pagamento).
 * `formaPagamentoLabel` repete na coluna de cada linha (contratos.metodo_pagamento é por
 * contrato, não por parcela).
 */
export function montarTabelaVencimentosHtml(parcelas: ParcelaTabela[], formaPagamentoLabel: string): string {
  const linhas = parcelas
    .map((parcela) => {
      const valorFormatado = parcela.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const vencimentoFormatado = parcela.vencimento.toLocaleDateString("pt-BR", { timeZone: "UTC" });
      return `<tr><td>${parcela.numero}</td><td>${vencimentoFormatado}</td><td>${valorFormatado}</td><td>${formaPagamentoLabel}</td></tr>`;
    })
    .join("\n");

  return `<table><thead><tr><th>Nº</th><th>Vencimento</th><th>Valor</th><th>Forma de pagamento</th></tr></thead><tbody>\n${linhas}\n</tbody></table>`;
}

/**
 * Dados fictícios (nome/CPF/parcelas de exemplo) pra resolver os placeholders no preview do editor
 * ("Ver como vai ficar") — sem isso o preview mostrava {{cliente_nome}}, {{tabela_contratante}}
 * etc. literalmente, sem nunca substituir nada (pedido do Luiz, 20/08/2026). Pessoa fixa (não
 * gerada por Math.random()) — o objetivo é parecer um documento real preenchido, não testar
 * aleatoriedade; dado fixo também é mais fácil de revisar visualmente toda vez.
 */
export function gerarDadosMockPreview(): DadosResolucaoContrato {
  const pessoaMock: PessoaContrato = {
    tipoPessoa: "pf",
    nomeRazaoSocial: "MARIA APARECIDA SOUZA",
    documento: "123.456.789-00",
    email: "maria.souza@example.com",
    whatsapp: "(48) 99123-4567",
    endereco: "Rua das Palmeiras, 456 — Florianópolis/SC",
    rg: "1.234.567-8",
    estadoCivil: "Casada",
    profissao: "Professora",
  };

  const documentosPacoteMock: DocumentoPacote[] = [
    { documento: "123.456.789-00", nomeRazaoSocial: "MARIA APARECIDA SOUZA" },
    { documento: "987.654.321-00", nomeRazaoSocial: "JOSÉ CARLOS SOUZA" },
  ];

  const parcelasMock: ParcelaTabela[] = [
    { numero: 1, valor: 500, vencimento: new Date("2026-09-10T00:00:00Z") },
    { numero: 2, valor: 500, vencimento: new Date("2026-10-10T00:00:00Z") },
    { numero: 3, valor: 500, vencimento: new Date("2026-11-10T00:00:00Z") },
  ];

  return {
    dadosCliente: montarDadosClienteHtml(pessoaMock),
    valorTotal: 1500,
    formaPagamento: "Parcelado em 3x no boleto/PIX",
    tabelaVencimentos: montarTabelaVencimentosHtml(parcelasMock, "Boleto/Pix"),
    quantidadeParcelas: String(parcelasMock.length),
    tabelaDocumentos: montarTabelaDocumentosHtml(documentosPacoteMock),
    tabelaContratante: montarTabelaContratanteHtml(pessoaMock),
    ...montarCamposClienteResolucao(pessoaMock),
  };
}
