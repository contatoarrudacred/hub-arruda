"use server";

import { criarProduto, atualizarProduto, type EntradaSalvarProduto } from "@/lib/vendas/produtos";

export type ResultadoSalvarProduto = { sucesso: true; id: string } | { sucesso: false; erro: string };

export async function salvarProdutoAction(
  produtoId: string | null,
  entrada: EntradaSalvarProduto,
): Promise<ResultadoSalvarProduto> {
  if (!entrada.nome.trim()) {
    return { sucesso: false, erro: "Informe o nome do produto/serviço." };
  }
  if (entrada.tipo === "comissionado" && !entrada.fornecedorId) {
    return { sucesso: false, erro: "Produto comissionado precisa de um fornecedor vinculado." };
  }
  if (entrada.tipo === "subcontratado" && !entrada.fornecedorDefinidoEm) {
    return { sucesso: false, erro: "Produto subcontratado precisa definir onde o fornecedor é escolhido (venda ou ordem de serviço)." };
  }

  try {
    if (produtoId) {
      await atualizarProduto(produtoId, entrada);
      return { sucesso: true, id: produtoId };
    }
    const { id } = await criarProduto(entrada);
    return { sucesso: true, id };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha ao salvar o produto. Tente novamente.";
    return { sucesso: false, erro: mensagem };
  }
}
