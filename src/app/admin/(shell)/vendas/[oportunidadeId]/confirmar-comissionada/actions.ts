"use server";

import { confirmarVendaComissionada } from "@/lib/vendas/comissoes";

export type ResultadoConfirmarComissionada = { sucesso: true } | { sucesso: false; erro: string };

export async function confirmarVendaComissionadaAction(
  oportunidadeId: string,
  dataAssinaturaCliente: string,
): Promise<ResultadoConfirmarComissionada> {
  try {
    await confirmarVendaComissionada(oportunidadeId, new Date(dataAssinaturaCliente));
    return { sucesso: true };
  } catch (erro) {
    console.error("Falha ao confirmar venda comissionada:", erro);
    const mensagem = erro instanceof Error ? erro.message : "Falha ao confirmar a venda. Tente novamente.";
    return { sucesso: false, erro: mensagem };
  }
}
