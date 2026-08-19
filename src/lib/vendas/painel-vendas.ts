import { createClient } from "@/lib/supabase/server";
import type { StatusContrato } from "./contratos";

export type VendaResumo = {
  contratoId: string;
  oportunidadeId: string;
  status: StatusContrato;
  motivoCancelamento: string | null;
  valorTotal: number;
  pessoaNome: string;
  pessoaDocumento: string;
  produtoNome: string;
  criadoEm: string;
};

type LinhaVendaBruta = {
  id: string;
  oportunidade_id: string;
  status: StatusContrato;
  motivo_cancelamento: string | null;
  valor_total: number;
  created_at: string;
  oportunidades:
    | { pessoas: { nome_razao_social: string; documento: string } | null; produtos: { nome: string } | null }
    | { pessoas: { nome_razao_social: string; documento: string } | null; produtos: { nome: string } | null }[]
    | null;
};

function extrairOportunidade(bruta: LinhaVendaBruta["oportunidades"]) {
  return Array.isArray(bruta) ? bruta[0] : bruta;
}

/** Lista todas as vendas (uma linha por `contratos`) pro Painel de Vendas — lista ou Kanban, quem
 * decide a apresentação é a tela, aqui só vem o dado bruto ordenado por mais recente. */
export async function listarVendas(): Promise<VendaResumo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contratos")
    .select(
      "id, oportunidade_id, status, motivo_cancelamento, valor_total, created_at, oportunidades(pessoas(nome_razao_social, documento), produtos(nome))",
    )
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[DEBUG listarVendas] erro do Supabase:", JSON.stringify(error));
    throw new Error(`Falha ao listar vendas: ${error.message}`);
  }
  console.log("[DEBUG listarVendas] linhas encontradas em contratos:", data?.length ?? 0);

  return ((data ?? []) as unknown as LinhaVendaBruta[]).map((linha) => {
    const oportunidade = extrairOportunidade(linha.oportunidades);
    return {
      contratoId: linha.id,
      oportunidadeId: linha.oportunidade_id,
      status: linha.status,
      motivoCancelamento: linha.motivo_cancelamento,
      valorTotal: linha.valor_total,
      pessoaNome: oportunidade?.pessoas?.nome_razao_social ?? "",
      pessoaDocumento: oportunidade?.pessoas?.documento ?? "",
      produtoNome: oportunidade?.produtos?.nome ?? "",
      criadoEm: linha.created_at,
    };
  });
}

export async function cancelarVenda(contratoId: string, motivo: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contratos")
    .update({ status: "cancelada", motivo_cancelamento: motivo })
    .eq("id", contratoId);
  if (error) throw new Error(`Falha ao cancelar venda: ${error.message}`);
}

/** Exclusão definitiva — uso restrito ao admin (confirmação na UI, não aqui). Remove só os
 * registros do Vendas (contrato + parcelas, via ON DELETE CASCADE); a Oportunidade do CRM nunca é
 * tocada por esta função. */
export async function excluirVenda(contratoId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("contratos").delete().eq("id", contratoId);
  if (error) throw new Error(`Falha ao excluir venda: ${error.message}`);
}
