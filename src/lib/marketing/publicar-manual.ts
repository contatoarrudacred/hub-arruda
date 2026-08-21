// src/lib/marketing/publicar-manual.ts
// Agenda de Posts — Agendamento manual (20/08/2026, pedido do Luiz): agenda (ou reagenda) UM post
// específico sob demanda, escolhido por drag-and-drop ou pelo menu de ações da Agenda — não espera
// o cron pegar a pauta de novo. Espelha de propósito as etapas "publicar"/"registrar_resultado" de
// processar-pauta.ts (não reaproveita o corpo delas — estão inline numa função grande, extrair um
// helper compartilhado seria um refactor maior e mais arriscado que duplicar estas ~15 linhas).

import "server-only";
import { criarAdaptadorWordPress } from "./canais/wordpress";
import { credenciaisWordPressDaPropriedade } from "./processar-pauta";
import { atualizarStatusPost, carregarPostDetalhado, carregarPropriedade, marcarPautaPublicada } from "./repositorio";

/**
 * Agenda (primeira vez) ou reagenda (já existia no WordPress) o post pra `agendadoPara`. Lança em
 * qualquer falha — quem chama (agendamento-actions.ts) converte pra `{sucesso:false, erro}`.
 */
export async function agendarPostManualmente(postId: string, agendadoPara: Date): Promise<{ url: string }> {
  const post = await carregarPostDetalhado(postId);
  if (!post) throw new Error(`Post ${postId} não encontrado.`);

  const propriedade = await carregarPropriedade(post.propriedadeId);
  const adaptador = criarAdaptadorWordPress(propriedade.urlBase, credenciaisWordPressDaPropriedade(propriedade));

  if (!post.rascunhoIdWordpress) {
    // Primeira vez — post ainda não existe no WordPress (status "rascunho", pronto_para_publicar).
    const rascunho = await adaptador.criarRascunho(
      {
        titulo: post.titulo,
        corpoHtml: post.conteudoHtml,
        slug: post.slug,
        metaTitle: post.metaTitle,
        metaDescription: post.metaDescription,
      },
      post.imagemDestaqueMediaId ?? undefined,
      agendadoPara,
    );

    await atualizarStatusPost(postId, "publicado", {
      canais: { wordpress: { rascunho_id: rascunho.idRemoto, status: "agendado", url: rascunho.link } },
      publicadoEm: new Date().toISOString(),
      conteudoHtml: post.conteudoHtml,
      agendadoPara: agendadoPara.toISOString(),
    });

    // Essencial — sem isso a pauta continua elegível pra reclaim/reprocessamento automático do
    // cron, o que duplicaria o post (mesmo raciocínio do bloco "registrar_resultado" em
    // processar-pauta.ts).
    await marcarPautaPublicada(post.pautaId);

    return { url: rascunho.link };
  }

  // Já existia no WordPress (reagendamento) — só atualiza a data, sem tocar na pauta (já estava
  // "publicado").
  const atualizado = await adaptador.atualizarPost(post.rascunhoIdWordpress, {
    status: "future",
    dateGmt: agendadoPara.toISOString(),
  });
  await atualizarStatusPost(postId, "publicado", { agendadoPara: agendadoPara.toISOString() });

  return { url: atualizado.link };
}
