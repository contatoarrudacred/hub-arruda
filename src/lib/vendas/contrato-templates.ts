import { createClient } from "@/lib/supabase/server";
import { valorPorExtenso } from "./valor-por-extenso";

export type ContratoTemplate = {
  id: string;
  produtoId: string;
  conteudoHtml: string;
  versao: number;
};

export async function buscarTemplateAtivoPorProduto(produtoId: string): Promise<ContratoTemplate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contrato_templates")
    .select("id, produto_id, conteudo_html, versao")
    .eq("produto_id", produtoId)
    .eq("ativo", true)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar template de contrato: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    produtoId: data.produto_id,
    conteudoHtml: data.conteudo_html,
    versao: data.versao,
  };
}

export async function salvarTemplate(produtoId: string, conteudoHtml: string): Promise<{ id: string }> {
  const supabase = await createClient();
  const existente = await buscarTemplateAtivoPorProduto(produtoId);

  if (existente) {
    const { error } = await supabase
      .from("contrato_templates")
      .update({ conteudo_html: conteudoHtml, versao: existente.versao + 1 })
      .eq("id", existente.id);
    if (error) throw new Error(`Falha ao atualizar template de contrato: ${error.message}`);
    return { id: existente.id };
  }

  const { data, error } = await supabase
    .from("contrato_templates")
    .insert({ produto_id: produtoId, conteudo_html: conteudoHtml })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar template de contrato: ${error.message}`);
  return { id: data.id };
}

export type DadosResolucaoContrato = {
  dadosCliente: string;
  valorTotal: number;
  formaPagamento: string;
  tabelaVencimentos: string;
  listaDocumentos: string;
};

const PLACEHOLDERS = [
  "dados_cliente",
  "valor_total",
  "valor_total_extenso",
  "tabela_vencimentos",
  "forma_pagamento",
  "lista_documentos",
] as const;

/**
 * Resolve os placeholders {{...}} do HTML do template contra os dados já coletados na tela de
 * Fechamento de Venda. Os blocos HTML de dados_cliente/lista_documentos/tabela_vencimentos já
 * chegam prontos (montados por montarDadosClienteHtml/montarListaDocumentosHtml/
 * montarTabelaVencimentosHtml) — esta função só faz a substituição final, continua pura.
 */
export function resolverPlaceholders(conteudoHtml: string, dados: DadosResolucaoContrato): string {
  const valorFormatado = dados.valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const substituicoes: Record<(typeof PLACEHOLDERS)[number], string> = {
    dados_cliente: dados.dadosCliente,
    valor_total: valorFormatado,
    valor_total_extenso: valorPorExtenso(dados.valorTotal),
    tabela_vencimentos: dados.tabelaVencimentos,
    forma_pagamento: dados.formaPagamento,
    lista_documentos: dados.listaDocumentos,
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

export type DocumentoPacote = { pessoa: PessoaContrato; representante?: PessoaContrato | null };

/**
 * Monta {{lista_documentos}} — repete montarDadosClienteHtml pra cada documento do pacote.
 * Devolve string vazia quando não é pacote (0 ou 1 documento — nesse caso os dados já estão em
 * {{dados_cliente}}, não precisa repetir).
 */
export function montarListaDocumentosHtml(documentos: DocumentoPacote[]): string {
  if (documentos.length <= 1) return "";

  return documentos
    .map(
      (doc, indice) =>
        `<h4>Documento ${indice + 1}</h4>\n${montarDadosClienteHtml(doc.pessoa, doc.representante)}`,
    )
    .join("\n");
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
