import { createClient } from "@/lib/supabase/server";
import { buscarContratoPorId, type StatusContrato } from "./contratos";
import { apagarPdfContrato } from "./geracao-pdf";
import { sincronizarEtapaKanban } from "./oportunidades";

export type VendaResumo = {
  contratoId: string;
  oportunidadeId: string;
  status: StatusContrato;
  motivoCancelamento: string | null;
  ultimoErro: string | null;
  tentativasErro: number;
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
  ultimo_erro: string | null;
  tentativas_erro: number;
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
      "id, oportunidade_id, status, motivo_cancelamento, valor_total, created_at, ultimo_erro, tentativas_erro, oportunidades(pessoas(nome_razao_social, documento), produtos(nome))",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao listar vendas: ${error.message}`);

  return ((data ?? []) as unknown as LinhaVendaBruta[]).map((linha) => {
    const oportunidade = extrairOportunidade(linha.oportunidades);
    return {
      contratoId: linha.id,
      oportunidadeId: linha.oportunidade_id,
      status: linha.status,
      motivoCancelamento: linha.motivo_cancelamento,
      ultimoErro: linha.ultimo_erro,
      tentativasErro: linha.tentativas_erro,
      valorTotal: linha.valor_total,
      pessoaNome: oportunidade?.pessoas?.nome_razao_social ?? "",
      pessoaDocumento: oportunidade?.pessoas?.documento ?? "",
      produtoNome: oportunidade?.produtos?.nome ?? "",
      criadoEm: linha.created_at,
    };
  });
}

/**
 * Achado real da auditoria de 21/08/2026: esta função nunca sincronizava `oportunidades.etapa_kanban`
 * — diferente do caminho automático (`processarDocumentoRecusado`, webhook da Assinafy, que já
 * chama `sincronizarEtapaKanban(..., "perdida")` quando um signatário recusa), uma venda cancelada
 * manualmente aqui ficava "viva" em alguma etapa do Kanban do CRM. Corrigido pra chamar a mesma
 * sincronização — não é território novo, é a mesma função que o Vendas já usa em vários outros
 * pontos-chave (assinatura recusada, venda concluída, venda comissionada confirmada).
 */
export async function cancelarVenda(contratoId: string, motivo: string): Promise<void> {
  const supabase = await createClient();
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato) throw new Error("Contrato não encontrado.");

  // Limpa ultimo_erro/tentativas_erro junto — sem isso, uma venda cancelada por causa de um erro
  // pendente continuava aparecendo vermelha na coluna "Cancelada", com o botão "Tentar novamente
  // todos" da coluna ativo pra ela (clicar nele só apaga o erro sem retentar nada, já que
  // tentarNovamente não tem branch pra status "cancelada").
  const { error } = await supabase
    .from("contratos")
    .update({ status: "cancelada", motivo_cancelamento: motivo, ultimo_erro: null, tentativas_erro: 0 })
    .eq("id", contratoId);
  if (error) throw new Error(`Falha ao cancelar venda: ${error.message}`);

  await sincronizarEtapaKanban(contrato.oportunidadeId, "perdida");
}

/**
 * Exclusão definitiva — uso restrito ao admin (confirmação na UI, não aqui). Remove os registros do
 * Vendas (contrato + parcelas, via ON DELETE CASCADE) e o PDF do contrato no Storage, quando existir
 * — achado real da auditoria de 21/08/2026: antes desta correção, o arquivo ficava órfão no bucket
 * pra sempre (a linha que apontava pra ele já não existe mais em lugar nenhum). Falha ao apagar o
 * PDF não impede a exclusão do registro (o Storage pode já não ter o arquivo por algum motivo — não
 * é motivo pra travar a ação principal). A Oportunidade do CRM nunca é tocada por esta função.
 */
export async function excluirVenda(contratoId: string): Promise<void> {
  const contrato = await buscarContratoPorId(contratoId);
  if (contrato?.pdfUrl) {
    try {
      await apagarPdfContrato(contrato.pdfUrl);
    } catch (erro) {
      console.error(`[excluirVenda] falha ao apagar o PDF do contrato ${contratoId} no Storage:`, erro);
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("contratos").delete().eq("id", contratoId);
  if (error) throw new Error(`Falha ao excluir venda: ${error.message}`);
}
