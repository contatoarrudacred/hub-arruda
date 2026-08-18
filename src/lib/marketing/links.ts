// src/lib/marketing/links.ts
// Agente de Links — v1 simplificada (decisão de Luiz, 17/08/2026): o checklist padrão pede "3 a 6
// links internos contextuais" (MODULO_MARKETING_CONTEUDO_ARRUDACRED.md seção 5.2 item 7), mas
// nenhum agente fazia isso. Em vez de inserção contextual no meio do texto (exigiria NLP mais
// sofisticado, fica pra uma versão futura), esta v1 acrescenta uma lista de posts relacionados da
// mesma propriedade ao final do artigo.

import "server-only";
import { carregarPostsPublicadosDaPropriedade } from "./repositorio";

const MINIMO_POSTS_RELACIONADOS = 3;

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function inserirLinksInternos(conteudoHtml: string, propriedadeId: string, excluirPostId?: string): Promise<string> {
  const relacionados = await carregarPostsPublicadosDaPropriedade(propriedadeId, excluirPostId);

  // Menos de 3 posts publicados ainda é o caso comum no começo de uma propriedade nova — não faz
  // sentido forçar uma seção de "relacionados" vazia ou com só 1-2 links.
  if (relacionados.length < MINIMO_POSTS_RELACIONADOS) {
    return conteudoHtml;
  }

  const itens = relacionados.map((post) => `  <li><a href="${escaparHtml(post.url)}">${escaparHtml(post.titulo)}</a></li>`).join("\n");
  const secao = `<h2>Posts relacionados</h2>\n<ul>\n${itens}\n</ul>`;

  return `${conteudoHtml}\n${secao}`;
}
