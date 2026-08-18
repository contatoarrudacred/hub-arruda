// src/lib/marketing/processar-pauta.ts
// Processa uma tentativa completa (gerar → revisar → publicar) de uma pauta por matriz — ver
// docs/superpowers/specs/2026-08-17-pipeline-conteudo-marketing-design.md seção 3.1. Chamado uma
// vez por tick do cron (Task 9). Nada fica público até a publicação de verdade; reprovação em
// qualquer etapa volta a pauta pro status "pendente" (registrarReprovacaoPauta) — o próximo tick
// do cron re-seleciona a mesma pauta e tenta de novo, sem precisar de máquina de estados própria
// além do que já está no banco (status + tentativas).

import { selecionarPauta } from "./estrategista";
import { gerarConteudo } from "./escritor";
import { revisarConteudo } from "./revisor";
import { criarAdaptadorWordPress, type CredenciaisWordPress } from "./canais/wordpress";
import { sanitizarConteudoHtml } from "./sanitizar-html";
import {
  atualizarStatusPost,
  carregarChecklistAtivo,
  carregarPropriedade,
  criarPost,
  marcarPautaBloqueada,
  marcarPautaPublicada,
  registrarReprovacaoPauta,
} from "./repositorio";

// Nome de variável de ambiente não aceita hífen, daí a troca por underscore. Cai pro par
// genérico WORDPRESS_USUARIO/WORDPRESS_SENHA_APP quando a propriedade ainda não tem credencial
// própria configurada (hoje só existe uma propriedade; o roadmap prevê um segundo site,
// vozdocredito.com.br, cuja senha não pode vazar pro host desta propriedade).
function credenciaisWordPressDaPropriedade(propriedadeId: string): CredenciaisWordPress {
  const sufixo = propriedadeId.replace(/-/g, "_");
  const usuario = process.env[`WORDPRESS_USUARIO_${sufixo}`];
  const senhaApp = process.env[`WORDPRESS_SENHA_APP_${sufixo}`];
  if (usuario && senhaApp) return { usuario, senhaApp };

  console.warn(
    `Propriedade ${propriedadeId} sem credencial WordPress própria (WORDPRESS_USUARIO_${sufixo}/WORDPRESS_SENHA_APP_${sufixo}); usando fallback genérico WORDPRESS_USUARIO/WORDPRESS_SENHA_APP.`,
  );
  return {
    usuario: process.env.WORDPRESS_USUARIO ?? "",
    senhaApp: process.env.WORDPRESS_SENHA_APP ?? "",
  };
}

export async function processarProximaPauta(matrizConteudoId: string, propriedadeId: string) {
  const propriedade = await carregarPropriedade(propriedadeId);
  const pauta = await selecionarPauta(matrizConteudoId);
  if (!pauta) return { status: "sem_pauta" as const };

  if (pauta.tentativas >= propriedade.maxTentativas) {
    await marcarPautaBloqueada(pauta.id, pauta.motivoUltimaReprovacao ?? "Limite de tentativas esgotado.");
    return { status: "bloqueada" as const, pautaId: pauta.id };
  }

  try {
    const checklist = await carregarChecklistAtivo(propriedadeId);
    const conteudo = await gerarConteudo(pauta, checklist);
    const revisao = await revisarConteudo(conteudo, checklist);

    if (!revisao.aprovado) {
      await registrarReprovacaoPauta(pauta.id, revisao.motivo ?? "Reprovado sem motivo detalhado.");
      return { status: "reprovado" as const, pautaId: pauta.id };
    }

    const post = await criarPost({ pautaId: pauta.id, propriedadeId, conteudo, scoreQa: revisao.score });
    const corpoHtmlSanitizado = sanitizarConteudoHtml(conteudo.conteudoHtml);
    const adaptador = criarAdaptadorWordPress(propriedade.urlBase, credenciaisWordPressDaPropriedade(propriedadeId));
    const rascunho = await adaptador.criarRascunho({
      titulo: conteudo.titulo,
      corpoHtml: corpoHtmlSanitizado,
      slug: conteudo.slug,
      metaTitle: conteudo.metaTitle,
      metaDescription: conteudo.metaDescription,
    });

    const verificacao = await adaptador.verificarRascunho(rascunho.idRemoto);
    if (!verificacao.ok) {
      await atualizarStatusPost(post.id, "falhou");
      await registrarReprovacaoPauta(pauta.id, verificacao.detalhes ?? "Rascunho não conforme no WordPress.");
      return { status: "reprovado" as const, pautaId: pauta.id };
    }

    const publicado = await adaptador.aprovarPublicar(rascunho.idRemoto);

    // A partir daqui o post JÁ ESTÁ no ar no WordPress — se o registro local (atualizarStatusPost/
    // marcarPautaPublicada) falhar, NÃO podemos cair no catch/registrarReprovacaoPauta: isso
    // devolveria a pauta pra fila e geraria um segundo artigo publicado no próximo ciclo
    // (duplicidade real, ruim pra SEO). Um registro local desatualizado é um problema bem menor
    // do que conteúdo duplicado — por isso só logamos, sem reprovar.
    try {
      await atualizarStatusPost(post.id, "publicado", {
        canais: { wordpress: { rascunho_id: rascunho.idRemoto, status: "publicado", url: publicado.urlPublicada } },
        publicadoEm: new Date().toISOString(),
      });
      await marcarPautaPublicada(pauta.id);
    } catch (erroPosPublicacao) {
      console.error(
        `Pauta ${pauta.id} publicada em ${publicado.urlPublicada}, mas falhou ao registrar localmente:`,
        erroPosPublicacao,
      );
    }

    return { status: "publicado" as const, url: publicado.urlPublicada };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "Erro inesperado ao processar a pauta.";
    await registrarReprovacaoPauta(pauta.id, motivo);
    return { status: "reprovado" as const, pautaId: pauta.id };
  }
}
