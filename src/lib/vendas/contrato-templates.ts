import { createClient } from "@/lib/supabase/server";
import { valorPorExtenso } from "./valor-por-extenso";

export type ContratoTemplate = {
  id: string;
  produtoId: string;
  conteudoMarkdown: string;
  versao: number;
};

export async function buscarTemplateAtivoPorProduto(produtoId: string): Promise<ContratoTemplate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contrato_templates")
    .select("id, produto_id, conteudo_markdown, versao")
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
    conteudoMarkdown: data.conteudo_markdown,
    versao: data.versao,
  };
}

export type DadosResolucaoContrato = {
  nomeCliente: string;
  documentoCliente: string;
  valorTotal: number;
  formaPagamento: string;
  tabelaVencimentos: string;
  listaDocumentos: string;
};

const PLACEHOLDERS = [
  "nome_cliente",
  "documento_cliente",
  "valor_total",
  "valor_total_extenso",
  "tabela_vencimentos",
  "forma_pagamento",
  "lista_documentos",
] as const;

/**
 * Resolve os placeholders {{...}} do template contra os dados já coletados na tela de
 * Fechamento de Venda. valor_total_extenso e valor_total são calculados aqui (não vêm prontos
 * de fora) para não duplicar a formatação em cada chamador.
 */
export function resolverPlaceholders(conteudoMarkdown: string, dados: DadosResolucaoContrato): string {
  const valorFormatado = dados.valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const substituicoes: Record<(typeof PLACEHOLDERS)[number], string> = {
    nome_cliente: dados.nomeCliente,
    documento_cliente: dados.documentoCliente,
    valor_total: valorFormatado,
    valor_total_extenso: valorPorExtenso(dados.valorTotal),
    tabela_vencimentos: dados.tabelaVencimentos,
    forma_pagamento: dados.formaPagamento,
    lista_documentos: dados.listaDocumentos,
  };

  return PLACEHOLDERS.reduce(
    (texto, chave) => texto.split(`{{${chave}}}`).join(substituicoes[chave]),
    conteudoMarkdown,
  );
}
