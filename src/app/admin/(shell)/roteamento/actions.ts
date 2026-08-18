"use server";

import { revalidatePath } from "next/cache";
import {
  excluirRegraRoteamento as excluirRegraRoteamentoRepo,
  salvarRegraRoteamento as salvarRegraRoteamentoRepo,
  type EntradaSalvarRegraRoteamento,
} from "@/lib/motor-fluxo/repositorio-admin";

export type ResultadoSalvarRegraRoteamento = { sucesso: true; id: string } | { sucesso: false; erro: string };

export async function salvarRegraRoteamentoAction(
  entrada: EntradaSalvarRegraRoteamento,
): Promise<ResultadoSalvarRegraRoteamento> {
  if (!entrada.nome.trim()) return { sucesso: false, erro: "Nome é obrigatório." };
  if (entrada.termos.length === 0) return { sucesso: false, erro: "Pelo menos um termo é obrigatório." };
  if (!entrada.etapaCodigo.trim()) return { sucesso: false, erro: "Etapa de destino é obrigatória." };

  try {
    const resultado = await salvarRegraRoteamentoRepo(entrada);
    revalidatePath("/admin/roteamento");
    return { sucesso: true, id: resultado.id };
  } catch (e) {
    return { sucesso: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

export async function excluirRegraRoteamentoAction(id: string): Promise<void> {
  await excluirRegraRoteamentoRepo(id);
  revalidatePath("/admin/roteamento");
}
