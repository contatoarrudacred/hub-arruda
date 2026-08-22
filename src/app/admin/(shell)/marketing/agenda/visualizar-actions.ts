"use server";

// Agenda de Posts — "Visualizar post (local)" (21/08/2026, pedido do Luiz): preview só-leitura do
// conteúdo salvo no NOSSO banco, distinto de "Visualizar no WordPress" (o post ao vivo lá fora) —
// útil pra conferir o que o pipeline gerou mesmo antes/sem depender do post estar publicado.

import { carregarPostDetalhado } from "@/lib/marketing/repositorio";

export type PostVisualizacao = {
  titulo: string;
  metaTitle: string;
  metaDescription: string;
  conteudoHtml: string;
};

export async function carregarPostVisualizacaoAction(postId: string): Promise<PostVisualizacao | null> {
  const post = await carregarPostDetalhado(postId);
  if (!post) return null;
  return {
    titulo: post.titulo,
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    conteudoHtml: post.conteudoHtml,
  };
}
