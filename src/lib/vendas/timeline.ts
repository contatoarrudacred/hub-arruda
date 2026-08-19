import { createClient } from "@/lib/supabase/server";
import { rotuloEstagio } from "./estagio-venda";
import type { Contrato, StatusContrato } from "./contratos";

export type LinhaAuditoriaBruta = {
  tabela: string;
  operacao: "INSERT" | "UPDATE" | "DELETE";
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  criado_em: string;
};

export type EventoTimeline = { data: string; texto: string };

/**
 * Traduz uma linha crua de `auditoria_log` (trigger genérico, ver migration 006) num evento de
 * timeline legível — ou `null` quando a linha é ruído pra esse propósito (ex.: UPDATE que não mudou
 * o status, ou tabela fora do escopo da venda). Lógica pura, sem I/O — testada em timeline.test.ts.
 */
export function formatarEventoAuditoria(linha: LinhaAuditoriaBruta): EventoTimeline | null {
  if (linha.tabela === "contratos") {
    if (linha.operacao === "INSERT") {
      const status = linha.dados_depois?.status as StatusContrato | undefined;
      if (!status) return null;
      return { data: linha.criado_em, texto: `Venda registrada — ${rotuloEstagio(status)}` };
    }
    if (linha.operacao === "UPDATE") {
      const antes = linha.dados_antes?.status as StatusContrato | undefined;
      const depois = linha.dados_depois?.status as StatusContrato | undefined;
      if (!depois || antes === depois) return null;
      const motivo = depois === "cancelada" ? (linha.dados_depois?.motivo_cancelamento as string | null) : null;
      return { data: linha.criado_em, texto: `Avançou para "${rotuloEstagio(depois)}"${motivo ? ` — ${motivo}` : ""}` };
    }
    return null;
  }

  if (linha.tabela === "contrato_parcelas") {
    if (linha.operacao !== "UPDATE") return null;
    const antes = linha.dados_antes?.status as string | undefined;
    const depois = linha.dados_depois?.status as string | undefined;
    if (depois !== "pago" || antes === depois) return null;
    return { data: linha.criado_em, texto: `Parcela ${linha.dados_depois?.numero} paga` };
  }

  if (linha.tabela === "comissoes_fornecedor_receber") {
    if (linha.operacao !== "UPDATE") return null;
    const antes = linha.dados_antes?.status as string | undefined;
    const depois = linha.dados_depois?.status as string | undefined;
    if (depois !== "recebido" || antes === depois) return null;
    return { data: linha.criado_em, texto: `Comissão do fornecedor — parcela ${linha.dados_depois?.numero} recebida` };
  }

  return null;
}

/**
 * Monta a timeline de uma venda a partir do `auditoria_log` que já existe (migration 006) — sem
 * tabela nova. Cobre os 3 registros que compõem a venda: o contrato em si, suas parcelas
 * (contrato_parcelas) e, no caminho comissionado, as parcelas de comissão do fornecedor.
 */
export async function listarTimelineVenda(contrato: Contrato, oportunidadeId: string): Promise<EventoTimeline[]> {
  const supabase = await createClient();

  const { data: comissoes, error: erroComissoes } = await supabase
    .from("comissoes_fornecedor_receber")
    .select("id")
    .eq("oportunidade_id", oportunidadeId);
  if (erroComissoes) throw new Error(`Falha ao buscar comissões da venda: ${erroComissoes.message}`);

  const registroIds = [contrato.id, ...contrato.parcelas.map((p) => p.id), ...(comissoes ?? []).map((c) => c.id)];

  const { data, error } = await supabase
    .from("auditoria_log")
    .select("tabela, operacao, dados_antes, dados_depois, criado_em")
    .in("registro_id", registroIds)
    .order("criado_em", { ascending: true });
  if (error) throw new Error(`Falha ao buscar timeline da venda: ${error.message}`);

  return (data ?? [])
    .map((linha) => formatarEventoAuditoria(linha as LinhaAuditoriaBruta))
    .filter((evento): evento is EventoTimeline => evento !== null);
}
