"use server";

import { revalidatePath } from "next/cache";
import { reabrirPauta } from "@/lib/marketing/repositorio";

const ROTA = "/admin/marketing/pautas";

export type ResultadoReabrirPauta = { sucesso: true } | { sucesso: false; erro: string };

/**
 * Reabre uma pauta "bloqueada" de volta pra "pendente" (repositório, Task 3). É uma ação com custo
 * real — Escritor e Revisor rodam de novo pra essa pauta no próximo ciclo do cron — por isso captura
 * a exceção do repositório e devolve um resultado tipado, em vez de deixá-la propagar sem tratamento
 * (como fazem as ações de exclusão simples de outras telas de configuração): o admin precisa ver um
 * erro claro em vez do overlay genérico do Next.js antes de decidir se tenta de novo.
 */
export async function reabrirPautaAction(pautaId: string): Promise<ResultadoReabrirPauta> {
  try {
    await reabrirPauta(pautaId);
  } catch (erro) {
    return { sucesso: false, erro: erro instanceof Error ? erro.message : "Erro desconhecido ao reabrir a pauta." };
  }

  revalidatePath(ROTA);
  return { sucesso: true };
}
