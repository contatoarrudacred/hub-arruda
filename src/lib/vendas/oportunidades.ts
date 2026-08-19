import { createClient } from "@/lib/supabase/server";

/**
 * Push pontual pro etapa_kanban da Oportunidade (Kanban do CRM) nos marcos-chave da venda —
 * "pagamento" quando o contrato é assinado, "ganha" quando a 1ª parcela é paga, "perdida" quando a
 * venda é cancelada. Vendas SÓ ESCREVE aqui, nunca lê etapa_kanban de volta pra decidir nada — o
 * Painel de Vendas usa contratos.status, um campo totalmente seu (ver spec seção 3.6). Mesma
 * coluna que o próprio CRM já escreve (persistencia.ts) — não é arquivo/lógica deles, é só a
 * tabela núcleo compartilhada, uso já previsto desde o desenho original da spec.
 */
export async function sincronizarEtapaKanban(oportunidadeId: string, etapaKanban: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("oportunidades").update({ etapa_kanban: etapaKanban }).eq("id", oportunidadeId);
  if (error) throw new Error(`Falha ao sincronizar etapa_kanban: ${error.message}`);
}

export type OportunidadeFechamento = {
  id: string;
  pessoaId: string;
  produtoId: string;
  produtoNome: string;
  valorEstimado: number;
};

export async function buscarOportunidadeParaFechamento(oportunidadeId: string): Promise<OportunidadeFechamento | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("oportunidades")
    .select("id, pessoa_id, produto_id, valor_estimado, produtos(nome)")
    .eq("id", oportunidadeId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar oportunidade: ${error.message}`);
  if (!data) return null;

  const produto = data.produtos as unknown as { nome: string } | { nome: string }[] | null;
  const produtoNome = Array.isArray(produto) ? produto[0]?.nome : produto?.nome;

  return {
    id: data.id,
    pessoaId: data.pessoa_id,
    produtoId: data.produto_id,
    produtoNome: produtoNome ?? "",
    valorEstimado: data.valor_estimado ?? 0,
  };
}

export type DocumentoPacoteLinha = { id: string; documento: string; nomeRazaoSocial: string };

export async function listarDocumentosPacote(oportunidadeId: string): Promise<DocumentoPacoteLinha[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("oportunidade_documentos")
    .select("id, documento, nome_razao_social")
    .eq("oportunidade_id", oportunidadeId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Falha ao listar documentos do pacote: ${error.message}`);

  return (data ?? [])
    .filter((linha) => linha.documento)
    .map((linha) => ({
      id: linha.id,
      documento: linha.documento as string,
      nomeRazaoSocial: linha.nome_razao_social ?? "",
    }));
}

export type EntradaDocumentoPacote = { documento: string; nomeRazaoSocial: string; tipoDocumento: "cpf" | "cnpj" };

/** Substitui a lista de documentos do pacote — apaga o que existia e insere de novo. Mais simples
 * que reconciliar diffs, e essa tela não permite editar o pacote concorrentemente com mais de um
 * admin ao mesmo tempo (não vale a pena a complexidade de upsert parcial). */
export async function salvarDocumentosPacote(oportunidadeId: string, documentos: EntradaDocumentoPacote[]): Promise<void> {
  const supabase = await createClient();

  const { error: erroDelete } = await supabase
    .from("oportunidade_documentos")
    .delete()
    .eq("oportunidade_id", oportunidadeId);
  if (erroDelete) throw new Error(`Falha ao limpar documentos do pacote: ${erroDelete.message}`);

  if (documentos.length === 0) return;

  const { error: erroInsert } = await supabase.from("oportunidade_documentos").insert(
    documentos.map((doc) => ({
      oportunidade_id: oportunidadeId,
      tipo_documento: doc.tipoDocumento,
      documento: doc.documento,
      nome_razao_social: doc.nomeRazaoSocial,
    })),
  );
  if (erroInsert) throw new Error(`Falha ao salvar documentos do pacote: ${erroInsert.message}`);
}

export type DetalhePagamentoCrm = {
  forma: "boleto_pix" | "cartao";
  tipo: "avista" | "parcelado";
  parcelas: { numero: number; valor: number; vencimento: string }[];
};

function ehDetalhePagamentoValido(valor: unknown): valor is DetalhePagamentoCrm {
  if (!valor || typeof valor !== "object") return false;
  const v = valor as Record<string, unknown>;
  return (
    (v.forma === "boleto_pix" || v.forma === "cartao") &&
    (v.tipo === "avista" || v.tipo === "parcelado") &&
    Array.isArray(v.parcelas)
  );
}

/** Lê conversas.dados.detalhe_pagamento pra essa Oportunidade, quando existir — formato definido
 * em docs/superpowers/specs/2026-08-18-captura-detalhe-pagamento-fechamento-design.md (ainda não
 * implementado do lado do CRM; lido aqui de forma defensiva, sem assumir que o campo existe). */
export async function buscarDetalhePagamentoCrm(oportunidadeId: string): Promise<DetalhePagamentoCrm | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversas")
    .select("dados")
    .eq("oportunidade_id", oportunidadeId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar dados da conversa: ${error.message}`);
  if (!data) return null;

  const dados = data.dados as Record<string, unknown> | null;
  const detalhe = dados?.detalhe_pagamento;
  return ehDetalhePagamentoValido(detalhe) ? detalhe : null;
}
