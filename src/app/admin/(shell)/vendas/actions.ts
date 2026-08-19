"use server";

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
