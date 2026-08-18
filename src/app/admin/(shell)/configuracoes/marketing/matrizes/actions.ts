"use server";

import { revalidatePath } from "next/cache";
import { salvarMatriz } from "@/lib/marketing/repositorio";
import type { MatrizAdmin } from "@/lib/marketing/tipos";

const ROTA = "/admin/configuracoes/marketing/matrizes";

export type EntradaSalvarMatriz = {
  id: string | null;
  propriedadeId: string;
  nome: string;
  ativo: boolean;
};

export type ResultadoSalvarMatriz = { sucesso: true; matriz: MatrizAdmin } | { sucesso: false; erro: string };

export async function salvarMatrizAction(entrada: EntradaSalvarMatriz): Promise<ResultadoSalvarMatriz> {
  const nome = entrada.nome.trim();

  if (!nome) return { sucesso: false, erro: "Nome é obrigatório." };
  if (!entrada.propriedadeId) return { sucesso: false, erro: "Propriedade é obrigatória." };

  const matriz = await salvarMatriz({
    ...(entrada.id ? { id: entrada.id } : {}),
    propriedadeId: entrada.propriedadeId,
    nome,
    ativo: entrada.ativo,
  });

  revalidatePath(ROTA);
  return { sucesso: true, matriz };
}
