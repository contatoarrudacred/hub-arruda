// Repositório de oportunidade_documentos (migration 028) — Fase 1 do suporte a "pacote" (Bloco C,
// PLANO_MESTRE seção 11). Só CRUD básico por enquanto; o motor de fluxo ainda não sabe usar isto
// (Fase 2 em diante) — este módulo existe pra já ter a base pronta quando a Fase 2 chegar.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type TipoDocumento = "cpf" | "cnpj";

export type DocumentoOportunidade = {
  id: string;
  oportunidadeId: string;
  tipoDocumento: TipoDocumento;
  documento: string | null;
  faixaValor: string | null;
  faixaValorDetalhe: string | null;
  valorAproximado: number | null;
  valorRestricaoEstimado: number | null;
  altoValor: boolean;
};

function linhaParaDocumento(linha: {
  id: string;
  oportunidade_id: string;
  tipo_documento: string;
  documento: string | null;
  faixa_valor: string | null;
  faixa_valor_detalhe: string | null;
  valor_aproximado: number | null;
  valor_restricao_estimado: number | null;
  alto_valor: boolean;
}): DocumentoOportunidade {
  return {
    id: linha.id,
    oportunidadeId: linha.oportunidade_id,
    tipoDocumento: linha.tipo_documento as TipoDocumento,
    documento: linha.documento,
    faixaValor: linha.faixa_valor,
    faixaValorDetalhe: linha.faixa_valor_detalhe,
    valorAproximado: linha.valor_aproximado,
    valorRestricaoEstimado: linha.valor_restricao_estimado,
    altoValor: linha.alto_valor,
  };
}

export async function listarDocumentosOportunidade(oportunidadeId: string): Promise<DocumentoOportunidade[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("oportunidade_documentos")
    .select(
      "id, oportunidade_id, tipo_documento, documento, faixa_valor, faixa_valor_detalhe, valor_aproximado, valor_restricao_estimado, alto_valor",
    )
    .eq("oportunidade_id", oportunidadeId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Falha ao listar documentos da oportunidade: ${error.message}`);
  return (data ?? []).map(linhaParaDocumento);
}

export async function criarDocumentoOportunidade(
  oportunidadeId: string,
  tipoDocumento: TipoDocumento,
): Promise<DocumentoOportunidade> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("oportunidade_documentos")
    .insert({ oportunidade_id: oportunidadeId, tipo_documento: tipoDocumento })
    .select(
      "id, oportunidade_id, tipo_documento, documento, faixa_valor, faixa_valor_detalhe, valor_aproximado, valor_restricao_estimado, alto_valor",
    )
    .single();
  if (error || !data) throw new Error(`Falha ao criar documento da oportunidade: ${error?.message}`);
  return linhaParaDocumento(data);
}

/** Atualiza a faixa de valor de um item específico — chamado depois que o lead responde a pergunta de faixa (Passo 6) pra aquele documento. */
export async function atualizarFaixaDocumento(
  documentoId: string,
  campos: {
    faixaValor?: string | null;
    faixaValorDetalhe?: string | null;
    valorAproximado?: number | null;
    valorRestricaoEstimado?: number | null;
    altoValor?: boolean;
  },
): Promise<void> {
  const supabase = createAdminClient();
  const atualizacao: Record<string, unknown> = {};
  if ("faixaValor" in campos) atualizacao.faixa_valor = campos.faixaValor;
  if ("faixaValorDetalhe" in campos) atualizacao.faixa_valor_detalhe = campos.faixaValorDetalhe;
  if ("valorAproximado" in campos) atualizacao.valor_aproximado = campos.valorAproximado;
  if ("valorRestricaoEstimado" in campos) atualizacao.valor_restricao_estimado = campos.valorRestricaoEstimado;
  if ("altoValor" in campos) atualizacao.alto_valor = campos.altoValor;

  const { error } = await supabase.from("oportunidade_documentos").update(atualizacao).eq("id", documentoId);
  if (error) throw new Error(`Falha ao atualizar faixa do documento: ${error.message}`);
}

export async function excluirDocumentoOportunidade(documentoId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("oportunidade_documentos").delete().eq("id", documentoId);
  if (error) throw new Error(`Falha ao excluir documento da oportunidade: ${error.message}`);
}

/** Soma valor_restricao_estimado de todos os itens e grava em oportunidades.valor_estimado — chamado depois que a faixa de cada documento do pacote for capturada (decisão de Luiz, 17/08/2026: preço do pacote é a soma das faixas individuais, nunca uma tabela de desconto combinada). */
export async function recalcularValorEstimadoOportunidade(oportunidadeId: string): Promise<number> {
  const documentos = await listarDocumentosOportunidade(oportunidadeId);
  const total = documentos.reduce((soma, doc) => soma + (doc.valorRestricaoEstimado ?? 0), 0);

  const supabase = createAdminClient();
  const { error } = await supabase.from("oportunidades").update({ valor_estimado: total }).eq("id", oportunidadeId);
  if (error) throw new Error(`Falha ao atualizar valor estimado da oportunidade: ${error.message}`);

  return total;
}
