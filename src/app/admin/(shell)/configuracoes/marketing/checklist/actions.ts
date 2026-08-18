"use server";

import { revalidatePath } from "next/cache";
import { excluirItemChecklist, salvarItemChecklist } from "@/lib/marketing/repositorio";
import type { ItemChecklistAdmin } from "@/lib/marketing/tipos";

const ROTA = "/admin/configuracoes/marketing/checklist";

export type EntradaSalvarItemChecklist = {
  id: string | null;
  propriedadeId: string;
  item: string;
  peso: number;
  ativo: boolean;
};

export type ResultadoSalvarItemChecklist =
  | { sucesso: true; item: ItemChecklistAdmin }
  | { sucesso: false; erro: string };

export async function salvarItemChecklistAction(
  entrada: EntradaSalvarItemChecklist,
): Promise<ResultadoSalvarItemChecklist> {
  const item = entrada.item.trim();

  if (!item) return { sucesso: false, erro: "O texto do item é obrigatório." };
  if (!entrada.propriedadeId) return { sucesso: false, erro: "Propriedade é obrigatória." };
  if (!Number.isInteger(entrada.peso) || entrada.peso <= 0) {
    return { sucesso: false, erro: "Peso deve ser um número inteiro positivo." };
  }

  const salvo = await salvarItemChecklist({
    ...(entrada.id ? { id: entrada.id } : {}),
    propriedadeId: entrada.propriedadeId,
    item,
    peso: entrada.peso,
    ativo: entrada.ativo,
  });

  revalidatePath(ROTA);
  return { sucesso: true, item: salvo };
}

export type ResultadoExcluirItemChecklist = { sucesso: true } | { sucesso: false; erro: string };

export async function excluirItemChecklistAction(id: string): Promise<ResultadoExcluirItemChecklist> {
  await excluirItemChecklist(id);
  revalidatePath(ROTA);
  return { sucesso: true };
}
