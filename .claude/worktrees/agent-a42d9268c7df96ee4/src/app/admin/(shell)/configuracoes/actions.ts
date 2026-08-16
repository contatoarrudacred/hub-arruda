"use server";

import { revalidatePath } from "next/cache";
import {
  excluirConfiguracao as excluirConfiguracaoRepo,
  salvarConfiguracao as salvarConfiguracaoRepo,
} from "@/lib/motor-fluxo/repositorio-admin";

export type EntradaSalvarConfiguracaoForm = {
  id: string | null;
  chave: string;
  valorTexto: string;
  descricao: string;
  produtoId: string | null;
};

export type ResultadoSalvarConfiguracao = { sucesso: true; id: string } | { sucesso: false; erro: string };

export async function salvarConfiguracaoAction(
  entrada: EntradaSalvarConfiguracaoForm,
): Promise<ResultadoSalvarConfiguracao> {
  if (!entrada.chave.trim()) {
    return { sucesso: false, erro: "A chave é obrigatória." };
  }
  if (!entrada.descricao.trim()) {
    return { sucesso: false, erro: "A descrição é obrigatória — explica para que serve este valor." };
  }

  let valor: unknown;
  try {
    valor = JSON.parse(entrada.valorTexto);
  } catch {
    return {
      sucesso: false,
      erro: 'Valor precisa ser um JSON válido — números e texto entre aspas (ex.: 899 ou "texto" ou {"qtd": 6, "valor": 299}).',
    };
  }

  const resultado = await salvarConfiguracaoRepo({
    id: entrada.id,
    chave: entrada.chave.trim(),
    valor,
    descricao: entrada.descricao.trim(),
    produtoId: entrada.produtoId,
  });
  revalidatePath("/admin/configuracoes");
  return { sucesso: true, id: resultado.id };
}

export type ResultadoExcluirConfiguracao = { sucesso: true } | { sucesso: false; erro: string };

export async function excluirConfiguracaoAction(id: string): Promise<ResultadoExcluirConfiguracao> {
  await excluirConfiguracaoRepo(id);
  revalidatePath("/admin/configuracoes");
  return { sucesso: true };
}
