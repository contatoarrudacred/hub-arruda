"use server";

// Agenda de Posts — Editar Post Completo (21/08/2026, pedido do Luiz): salva título/slug/
// metadados/conteúdo editados à mão, empurrando pro WordPress quando o post já existe lá (mesmo
// método único `atualizarPost` já usado por Trocar Foto/Agendamento manual — funciona em post
// `future` ou já `publish`).

import { revalidatePath } from "next/cache";
import { criarAdaptadorWordPress } from "@/lib/marketing/canais/wordpress";
import { enviarImagemStorage } from "@/lib/marketing/imagens/armazenamento";
import { credenciaisWordPressDaPropriedade } from "@/lib/marketing/processar-pauta";
import { atualizarConteudoPost, carregarPostDetalhado, carregarPropriedade } from "@/lib/marketing/repositorio";

const ROTA_AGENDA = "/admin/marketing/agenda";

export type ResultadoSalvarPost = { sucesso: true } | { sucesso: false; erro: string };

export async function salvarPostCompletoAction(
  postId: string,
  dados: { titulo: string; slug: string; metaTitle: string; metaDescription: string; conteudoHtml: string },
): Promise<ResultadoSalvarPost> {
  if (!dados.titulo.trim()) return { sucesso: false, erro: "Título é obrigatório." };
  if (!dados.slug.trim()) return { sucesso: false, erro: "Slug é obrigatório." };
  if (!dados.metaTitle.trim()) return { sucesso: false, erro: "Meta title é obrigatório." };
  if (!dados.metaDescription.trim()) return { sucesso: false, erro: "Meta description é obrigatória." };
  if (!dados.conteudoHtml.trim()) return { sucesso: false, erro: "Conteúdo não pode ficar vazio." };

  try {
    const post = await carregarPostDetalhado(postId);
    if (!post) return { sucesso: false, erro: "Post não encontrado." };

    await atualizarConteudoPost(postId, dados);

    if (post.rascunhoIdWordpress) {
      const propriedade = await carregarPropriedade(post.propriedadeId);
      const adaptador = criarAdaptadorWordPress(propriedade.urlBase, credenciaisWordPressDaPropriedade(propriedade));
      await adaptador.atualizarPost(post.rascunhoIdWordpress, {
        title: dados.titulo,
        content: dados.conteudoHtml,
        slug: dados.slug,
        meta: { _yoast_wpseo_title: dados.metaTitle, _yoast_wpseo_metadesc: dados.metaDescription },
      });
    }

    revalidatePath(ROTA_AGENDA);
    return { sucesso: true };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha ao salvar o post.";
    return { sucesso: false, erro: mensagem };
  }
}

export type ResultadoEnviarImagem = { sucesso: true; url: string } | { sucesso: false; erro: string };

/** Upload ad-hoc de imagem inserida no meio do texto pelo editor — vai pro Storage e pro WordPress
 * (mesmo host das demais imagens do post), sem vínculo com capa/secundárias rastreadas. */
export async function enviarImagemEditorAction(postId: string, formData: FormData): Promise<ResultadoEnviarImagem> {
  const arquivo = formData.get("arquivo") as File | null;
  if (!arquivo || arquivo.size === 0) return { sucesso: false, erro: "Selecione uma imagem." };

  try {
    const post = await carregarPostDetalhado(postId);
    if (!post) return { sucesso: false, erro: "Post não encontrado." };

    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const dataUrl = `data:${arquivo.type || "image/png"};base64,${buffer.toString("base64")}`;

    const propriedade = await carregarPropriedade(post.propriedadeId);
    await enviarImagemStorage(dataUrl, `${post.propriedadeId}/${post.pautaId}/editor-${Date.now()}.png`);
    const adaptador = criarAdaptadorWordPress(propriedade.urlBase, credenciaisWordPressDaPropriedade(propriedade));
    const midia = await adaptador.enviarMidia(dataUrl, `editor-${Date.now()}.png`, arquivo.name);

    return { sucesso: true, url: midia.url };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha ao enviar a imagem.";
    return { sucesso: false, erro: mensagem };
  }
}
