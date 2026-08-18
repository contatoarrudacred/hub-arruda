"use server";

import { buscarEnderecoPorCep } from "@/lib/vendas/endereco";

export async function buscarEnderecoPorCepAction(cep: string) {
  return buscarEnderecoPorCep(cep);
}
