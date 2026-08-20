"use server";

import type { StatusContrato } from "@/lib/vendas/contratos";
import { cancelarVenda, excluirVenda, listarVendas, type VendaResumo } from "@/lib/vendas/painel-vendas";

export async function listarVendasAction(): Promise<VendaResumo[]> {
  return listarVendas();
}

export type ResultadoAcaoVenda = { sucesso: true } | { sucesso: false; erro: string };

export async function cancelarVendaAction(contratoId: string, motivo: string): Promise<ResultadoAcaoVenda> {
  try {
    await cancelarVenda(contratoId, motivo);
    return { sucesso: true };
  } catch {
    return { sucesso: false, erro: "Falha ao cancelar a venda. Tente novamente." };
  }
}

export async function excluirVendaAction(contratoId: string): Promise<ResultadoAcaoVenda> {
  try {
    await excluirVenda(contratoId);
    return { sucesso: true };
  } catch {
    return { sucesso: false, erro: "Falha ao excluir a venda. Tente novamente." };
  }
}

export async function tentarNovamenteEmLoteAction(status: StatusContrato): Promise<{ total: number }> {
  const { createClient } = await import("@/lib/supabase/server");
  const { tentarNovamente } = await import("@/lib/vendas/progressao");
  const supabase = await createClient();

  // Não existe retentativa automática de verdade hoje (só uma tentativa por etapa, ver
  // progressao.ts) — então qualquer contrato com erro pendente é candidato a retentativa, não só
  // depois de 3 falhas acumuladas (achado real da revisão final da branch).
  const { data, error } = await supabase.from("contratos").select("id").eq("status", status).not("ultimo_erro", "is", null);
  if (error) throw new Error(`Falha ao buscar cards travados: ${error.message}`);

  for (const linha of data ?? []) {
    try {
      await tentarNovamente(linha.id);
    } catch (erro) {
      // Uma falha inesperada (ex.: banco fora do ar no meio do lote) não pode abortar os demais
      // cards silenciosamente — tentarNovamente já isola falha de Assinafy/Asaas por dentro
      // (progressao.ts), então chegar aqui é o caso raro de algo quebrar fora desse isolamento.
      console.error(`Falha ao tentar novamente o contrato ${linha.id} (retentativa em lote):`, erro);
    }
  }
  return { total: data?.length ?? 0 };
}
