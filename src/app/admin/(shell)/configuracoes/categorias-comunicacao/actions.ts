"use server";

import { revalidatePath } from "next/cache";
import {
  atualizarCategoriaComunicacao,
  criarCategoriaComunicacao,
  excluirCategoriaComunicacao,
} from "@/lib/comunicacao/categorias-repositorio";

export type ResultadoSalvarCategoria = { sucesso: true; id: string } | { sucesso: false; erro: string };

export async function salvarCategoriaComunicacaoAction(
  categoriaId: string | null,
  entrada: { nome: string; ativo: boolean },
): Promise<ResultadoSalvarCategoria> {
  if (!entrada.nome.trim()) {
    return { sucesso: false, erro: "Informe o nome da categoria." };
  }

  try {
    if (categoriaId) {
      await atualizarCategoriaComunicacao(categoriaId, entrada);
      revalidatePath("/admin/configuracoes/categorias-comunicacao");
      return { sucesso: true, id: categoriaId };
    }
    const { id } = await criarCategoriaComunicacao(entrada.nome);
    revalidatePath("/admin/configuracoes/categorias-comunicacao");
    return { sucesso: true, id };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha ao salvar a categoria. Tente novamente.";
    return { sucesso: false, erro: mensagem };
  }
}

export async function excluirCategoriaComunicacaoAction(categoriaId: string): Promise<void> {
  await excluirCategoriaComunicacao(categoriaId);
  revalidatePath("/admin/configuracoes/categorias-comunicacao");
}
