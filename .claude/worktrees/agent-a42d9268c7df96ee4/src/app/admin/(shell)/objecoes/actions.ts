"use server";

import { revalidatePath } from "next/cache";
import {
  excluirObjecao as excluirObjecaoRepo,
  salvarObjecao as salvarObjecaoRepo,
  type EntradaSalvarObjecao,
} from "@/lib/motor-fluxo/repositorio-admin";

export type ResultadoSalvarObjecao = { sucesso: true; id: string } | { sucesso: false; erro: string };

export async function salvarObjecaoAction(entrada: EntradaSalvarObjecao): Promise<ResultadoSalvarObjecao> {
  if (!entrada.objecao.trim() || !entrada.comoLidar.trim()) {
    return { sucesso: false, erro: "Objeção e orientação de como lidar são obrigatórias." };
  }

  const resultado = await salvarObjecaoRepo(entrada);
  revalidatePath("/admin/objecoes");
  return { sucesso: true, id: resultado.id };
}

export type ResultadoExcluirObjecao = { sucesso: true } | { sucesso: false; erro: string };

export async function excluirObjecaoAction(id: string): Promise<ResultadoExcluirObjecao> {
  await excluirObjecaoRepo(id);
  revalidatePath("/admin/objecoes");
  return { sucesso: true };
}
