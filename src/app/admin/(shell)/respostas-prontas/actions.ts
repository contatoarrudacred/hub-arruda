"use server";

import { revalidatePath } from "next/cache";
import {
  excluirRespostaPronta as excluirRespostaProntaRepo,
  salvarRespostaPronta as salvarRespostaProntaRepo,
  type EntradaSalvarRespostaPronta,
} from "@/lib/motor-fluxo/repositorio-admin";

export type ResultadoSalvarRespostaPronta = { sucesso: true; id: string } | { sucesso: false; erro: string };

export async function salvarRespostaProntaAction(
  entrada: EntradaSalvarRespostaPronta,
): Promise<ResultadoSalvarRespostaPronta> {
  if (!entrada.atalho.trim() || !entrada.texto.trim()) {
    return { sucesso: false, erro: "Atalho e texto são obrigatórios." };
  }

  try {
    const resultado = await salvarRespostaProntaRepo(entrada);
    revalidatePath("/admin/respostas-prontas");
    return { sucesso: true, id: resultado.id };
  } catch (e) {
    return { sucesso: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

export type ResultadoExcluirRespostaPronta = { sucesso: true } | { sucesso: false; erro: string };

export async function excluirRespostaProntaAction(id: string): Promise<ResultadoExcluirRespostaPronta> {
  await excluirRespostaProntaRepo(id);
  revalidatePath("/admin/respostas-prontas");
  return { sucesso: true };
}
