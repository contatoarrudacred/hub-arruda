"use server";

import { revalidatePath } from "next/cache";
import {
  excluirFaixaPreco as excluirFaixaPrecoRepo,
  salvarFaixaPreco as salvarFaixaPrecoRepo,
  type EntradaSalvarFaixaPreco,
} from "@/lib/motor-fluxo/repositorio-admin";

export type ResultadoSalvarFaixa = { sucesso: true; id: string } | { sucesso: false; erro: string };

export async function salvarFaixaPrecoAction(
  entrada: EntradaSalvarFaixaPreco,
): Promise<ResultadoSalvarFaixa> {
  if (entrada.faixaMax !== null && entrada.faixaMax < entrada.faixaMin) {
    return { sucesso: false, erro: "O valor máximo da faixa não pode ser menor que o mínimo." };
  }

  const resultado = await salvarFaixaPrecoRepo(entrada);
  revalidatePath("/admin/precos");
  return { sucesso: true, id: resultado.id };
}

export type ResultadoExcluirFaixa = { sucesso: true } | { sucesso: false; erro: string };

export async function excluirFaixaPrecoAction(id: string): Promise<ResultadoExcluirFaixa> {
  await excluirFaixaPrecoRepo(id);
  revalidatePath("/admin/precos");
  return { sucesso: true };
}
