"use server";

import { revalidatePath } from "next/cache";
import {
  excluirFaq as excluirFaqRepo,
  salvarFaq as salvarFaqRepo,
  type EntradaSalvarFaq,
} from "@/lib/motor-fluxo/repositorio-admin";

export type ResultadoSalvarFaq = { sucesso: true; id: string } | { sucesso: false; erro: string };

export async function salvarFaqAction(entrada: EntradaSalvarFaq): Promise<ResultadoSalvarFaq> {
  if (!entrada.pergunta.trim() || !entrada.resposta.trim()) {
    return { sucesso: false, erro: "Pergunta e resposta são obrigatórias." };
  }

  const resultado = await salvarFaqRepo(entrada);
  revalidatePath("/admin/faqs");
  return { sucesso: true, id: resultado.id };
}

export type ResultadoExcluirFaq = { sucesso: true } | { sucesso: false; erro: string };

export async function excluirFaqAction(id: string): Promise<ResultadoExcluirFaq> {
  await excluirFaqRepo(id);
  revalidatePath("/admin/faqs");
  return { sucesso: true };
}
