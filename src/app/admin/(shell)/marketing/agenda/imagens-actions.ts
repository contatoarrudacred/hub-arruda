"use server";

// Agenda de Posts — "Trocar Foto" (20/08/2026, pedido do Luiz): troca a capa ou uma imagem
// secundária de qualquer post, inclusive já publicado ao vivo no WordPress. Três modos (upload de
// arquivo próprio / prompt digitado / gerar de novo com o prompt automático) convergem no mesmo
// fluxo final: produz uma data URL nova → Storage + WordPress media → reconstrói o <figure> no
// HTML (por `data-imagem`, com fallback por `src` antigo em posts sem o marcador) → empurra pro
// WordPress se o post já existir lá → persiste no banco.

import { revalidatePath } from "next/cache";
import { criarAdaptadorWordPress } from "@/lib/marketing/canais/wordpress";
import { enviarImagemStorage } from "@/lib/marketing/imagens/armazenamento";
import { gerarCapa, gerarImagemComPrompt } from "@/lib/marketing/imagens/capa";
import { credenciaisWordPressDaPropriedade } from "@/lib/marketing/processar-pauta";
import { atualizarStatusPost, carregarPauta, carregarPersona, carregarPostDetalhado, carregarPropriedade } from "@/lib/marketing/repositorio";

const ROTA = "/admin/marketing/agenda";

// Regra dura de UI (22/08/2026, docs/COORDENACAO_AGENTES_ARRUDACRED.md seção 4.1 item 8, achado
// real: "não foi possível gerar a imagem" reprovava 3x seguidas sem NENHUM detalhe pra investigar
// — o catch original engolia o erro de verdade). `erro` continua sendo a mensagem amigável (única
// coisa que o usuário leigo precisa ver); `detalhesErro` é a mensagem técnica real, só existe numa
// falha de verdade (não numa reprovação normal do Revisor após esgotar tentativas — ver
// gerarCapa/gerarImagemComPrompt, capa.ts); `log` é o rastro passo-a-passo de tudo que a action fez
// nesta tentativa (inclusive o log interno de gerarCapa, quando esse caminho for usado) — modo de
// depuração específico desta modal, pedido do Luiz pra rastrear um erro que se repetia sem pista
// nenhuma. Sempre presente (sucesso ou falha), nunca vazio.
export type ResultadoTrocaImagem =
  | { sucesso: true; url: string; log: string[] }
  | { sucesso: false; erro: string; detalhesErro?: string; log: string[] };

export type ImagensPost = {
  titulo: string;
  imagemDestaqueUrl: string | null;
  imagensSecundarias: { slug: string; url: string; alt: string; legenda: string }[];
};

/** Leitura sob demanda pro modal "Trocar Foto" da Agenda de Posts — mesmo padrão lazy-fetch-on-open
 * já usado por `carregarDetalhesPostVisualizacaoAction` no Monitor. */
export async function carregarImagensPostAction(postId: string): Promise<ImagensPost | null> {
  const post = await carregarPostDetalhado(postId);
  if (!post) return null;
  return {
    titulo: post.titulo,
    imagemDestaqueUrl: post.imagemDestaqueUrl,
    imagensSecundarias: post.imagensSecundarias.map((i) => ({ slug: i.slug, url: i.url, alt: i.alt, legenda: i.legenda })),
  };
}

type ModoTroca = "upload" | "prompt" | "regenerar";

// Mesmo princípio de escaparAtributoHtml em processar-pauta.ts (repetido aqui, não extraído —
// mesmo padrão já seguido no resto do módulo pra util de 1 linha usado em módulo diferente).
function escaparAtributoHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Substitui a tag <img> de UMA imagem específica dentro do HTML salvo — primeiro tenta casar pelo
 * marcador `data-imagem="<marcador>"` (posts gerados a partir desta mudança), com fallback por
 * `src="<urlAntiga>"` pra posts publicados antes do marcador existir. Se nenhum dos dois casar
 * (HTML editado manualmente fora do padrão, por exemplo), devolve o HTML sem alteração — degradação
 * silenciosa: os campos do banco (imagemDestaqueUrl/imagensSecundarias) já foram atualizados de
 * qualquer forma, só o HTML embutido é que fica desatualizado nesse caso raro.
 */
function substituirImagemNoHtml(html: string, marcador: string, urlAntiga: string | null, novaTagImg: string): string {
  const regexMarcador = new RegExp(`<img[^>]*data-imagem="${escaparRegex(marcador)}"[^>]*>`);
  if (regexMarcador.test(html)) return html.replace(regexMarcador, novaTagImg);

  if (urlAntiga) {
    const regexSrc = new RegExp(`<img[^>]*src="${escaparRegex(urlAntiga)}"[^>]*>`);
    if (regexSrc.test(html)) return html.replace(regexSrc, novaTagImg);
  }

  return html;
}

async function arquivoParaDataUrl(arquivo: File): Promise<string> {
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  return `data:${arquivo.type || "image/png"};base64,${buffer.toString("base64")}`;
}

function lerModo(formData: FormData): ModoTroca | null {
  const modo = formData.get("modo");
  return modo === "upload" || modo === "prompt" || modo === "regenerar" ? modo : null;
}

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro);
}

export async function trocarCapaAction(formData: FormData): Promise<ResultadoTrocaImagem> {
  const log: string[] = [];
  const registrar = (mensagem: string) => log.push(`[${new Date().toISOString()}] ${mensagem}`);

  try {
    const postId = formData.get("postId") as string;
    const modo = lerModo(formData);
    if (!modo) return { sucesso: false, erro: "Modo de troca de imagem inválido.", log };

    registrar(`Carregando post ${postId}...`);
    const post = await carregarPostDetalhado(postId);
    if (!post) return { sucesso: false, erro: "Post não encontrado.", log };
    registrar("Post carregado.");

    let novaDataUrl: string;
    let novoAlt = post.titulo;

    if (modo === "upload") {
      registrar("Modo: upload de arquivo próprio.");
      const arquivo = formData.get("arquivo") as File | null;
      if (!arquivo || arquivo.size === 0) return { sucesso: false, erro: "Selecione uma imagem.", log };
      novaDataUrl = await arquivoParaDataUrl(arquivo);
      registrar("Arquivo convertido pra data URL.");
    } else if (modo === "prompt") {
      registrar("Modo: prompt digitado pelo usuário.");
      const prompt = (formData.get("prompt") as string | null)?.trim();
      if (!prompt) return { sucesso: false, erro: "Digite um prompt.", log };
      registrar("Chamando gerarImagemComPrompt...");
      const { resultado, log: logGeracao, erroDetalhado } = await gerarImagemComPrompt(prompt, post.conteudoHtml);
      log.push(...logGeracao);
      if (!resultado) {
        return { sucesso: false, erro: "Não foi possível gerar a imagem. Tente de novo.", detalhesErro: erroDetalhado, log };
      }
      novaDataUrl = resultado.url;
    } else {
      registrar("Modo: gerar de novo (automático, sem instrução) — chamando gerarCapa (5 etapas).");
      const pauta = await carregarPauta(post.pautaId);
      if (!pauta) return { sucesso: false, erro: "Pauta do post não encontrada.", log };
      const persona = pauta.personaId ? await carregarPersona(pauta.personaId) : null;
      const conteudo = { titulo: post.titulo, conteudoHtml: post.conteudoHtml, metaTitle: post.metaTitle, metaDescription: post.metaDescription, slug: post.slug };
      const { resultado, log: logGeracao, erroDetalhado } = await gerarCapa(pauta, conteudo, persona);
      log.push(...logGeracao);
      if (!resultado) {
        return { sucesso: false, erro: "Não foi possível gerar a imagem. Tente de novo.", detalhesErro: erroDetalhado, log };
      }
      novaDataUrl = resultado.url;
      novoAlt = resultado.alt;
    }

    registrar("Imagem obtida. Carregando propriedade...");
    const propriedade = await carregarPropriedade(post.propriedadeId);
    const novoSlug = `${post.slug}-capa-${Date.now()}`;
    registrar("Enviando a imagem pro Supabase Storage...");
    const { url: storageUrl } = await enviarImagemStorage(novaDataUrl, `${post.propriedadeId}/${post.pautaId}/capa-${novoSlug}.png`);
    registrar("Enviada ao Storage. Enviando mídia pro WordPress...");
    const adaptador = criarAdaptadorWordPress(propriedade.urlBase, credenciaisWordPressDaPropriedade(propriedade));
    const midia = await adaptador.enviarMidia(novaDataUrl, `capa-${novoSlug}.png`, novoAlt);
    registrar("Mídia enviada ao WordPress.");

    const novaTagImg = `<img src="${midia.url}" alt="${escaparAtributoHtml(novoAlt)}" data-imagem="capa">`;
    let novoHtml = substituirImagemNoHtml(post.conteudoHtml, "capa", post.imagemDestaqueUrl, novaTagImg);

    // Achado real de produção (21/08/2026): quando o post nunca teve capa embutida no HTML (ex.:
    // gerar_imagens foi pulada por orçamento de tempo curto, ver processar-pauta.ts), não existe
    // <img> nenhum pra substituir — substituirImagemNoHtml devolve o HTML sem alteração nesse caso.
    // Resultado sem este fallback: imagem_destaque_url fica salva no banco, mas a foto nunca aparece
    // no conteúdo (nem no preview local, nem no WordPress). Insere a figura no INÍCIO do HTML —
    // mesmo formato de construirFiguraCapa (processar-pauta.ts) — quando não havia nada pra trocar.
    if (novoHtml === post.conteudoHtml) {
      registrar("Post não tinha <img> de capa pra substituir — inserindo nova figura no início do HTML.");
      novoHtml = `<figure><img src="${midia.url}" alt="${escaparAtributoHtml(novoAlt)}" data-imagem="capa"></figure>\n${post.conteudoHtml}`;
    }

    if (post.rascunhoIdWordpress) {
      registrar(`Atualizando post existente no WordPress (rascunho ${post.rascunhoIdWordpress})...`);
      await adaptador.atualizarPost(post.rascunhoIdWordpress, { content: novoHtml, featuredMedia: midia.idRemoto });
    }

    registrar("Persistindo no banco...");
    await atualizarStatusPost(postId, post.status, {
      conteudoHtml: novoHtml,
      imagemDestaqueUrl: midia.url,
      imagemDestaqueAlt: novoAlt,
      imagemDestaqueSlug: novoSlug,
      imagemDestaqueStorageUrl: storageUrl,
      imagemDestaqueMediaId: midia.idRemoto,
    });
    registrar("Concluído com sucesso.");

    revalidatePath(ROTA);
    return { sucesso: true, url: midia.url, log };
  } catch (erro) {
    const detalhes = mensagemErro(erro);
    registrar(`FALHA INESPERADA: ${detalhes}`);
    console.error("trocarCapaAction: falha inesperada —", erro);
    return { sucesso: false, erro: "Não foi possível trocar a imagem. Tente de novo.", detalhesErro: detalhes, log };
  }
}

export async function trocarImagemSecundariaAction(formData: FormData): Promise<ResultadoTrocaImagem> {
  const log: string[] = [];
  const registrar = (mensagem: string) => log.push(`[${new Date().toISOString()}] ${mensagem}`);

  try {
    const postId = formData.get("postId") as string;
    const slugImagem = formData.get("slugImagem") as string;
    const modo = lerModo(formData);
    if (!modo) return { sucesso: false, erro: "Modo de troca de imagem inválido.", log };

    registrar(`Carregando post ${postId}...`);
    const post = await carregarPostDetalhado(postId);
    if (!post) return { sucesso: false, erro: "Post não encontrado.", log };
    const imagemAtual = post.imagensSecundarias.find((i) => i.slug === slugImagem);
    if (!imagemAtual) return { sucesso: false, erro: "Imagem secundária não encontrada.", log };
    registrar("Post e imagem secundária carregados.");

    let novaDataUrl: string;

    if (modo === "upload") {
      registrar("Modo: upload de arquivo próprio.");
      const arquivo = formData.get("arquivo") as File | null;
      if (!arquivo || arquivo.size === 0) return { sucesso: false, erro: "Selecione uma imagem.", log };
      novaDataUrl = await arquivoParaDataUrl(arquivo);
      registrar("Arquivo convertido pra data URL.");
    } else {
      // "gerar de novo" (sem prompt digitado) não tem o prompt original — nunca é persistido pelo
      // gerador de imagens secundárias (ver ImagemSecundaria, imagens/secundarias.ts) — aproximação
      // razoável: monta um prompt a partir do título/legenda já salvos desta imagem.
      const prompt = modo === "prompt" ? (formData.get("prompt") as string | null)?.trim() : `${imagemAtual.titulo}: ${imagemAtual.legenda}`;
      if (!prompt) return { sucesso: false, erro: "Digite um prompt.", log };
      registrar(modo === "prompt" ? "Modo: prompt digitado pelo usuário." : "Modo: gerar de novo (prompt aproximado a partir de título/legenda salvos).");
      const { resultado, log: logGeracao, erroDetalhado } = await gerarImagemComPrompt(prompt, post.conteudoHtml);
      log.push(...logGeracao);
      if (!resultado) {
        return { sucesso: false, erro: "Não foi possível gerar a imagem. Tente de novo.", detalhesErro: erroDetalhado, log };
      }
      novaDataUrl = resultado.url;
    }

    registrar("Imagem obtida. Carregando propriedade...");
    const propriedade = await carregarPropriedade(post.propriedadeId);
    registrar("Enviando a imagem pro Supabase Storage...");
    const { url: storageUrl } = await enviarImagemStorage(novaDataUrl, `${post.propriedadeId}/${post.pautaId}/secundaria-${slugImagem}-${Date.now()}.png`);
    registrar("Enviada ao Storage. Enviando mídia pro WordPress...");
    const adaptador = criarAdaptadorWordPress(propriedade.urlBase, credenciaisWordPressDaPropriedade(propriedade));
    const midia = await adaptador.enviarMidia(novaDataUrl, `secundaria-${slugImagem}.png`, imagemAtual.alt);
    registrar("Mídia enviada ao WordPress.");

    const novaTagImg = `<img src="${midia.url}" alt="${escaparAtributoHtml(imagemAtual.alt)}" data-imagem="${escaparAtributoHtml(slugImagem)}">`;
    const novoHtml = substituirImagemNoHtml(post.conteudoHtml, slugImagem, imagemAtual.url, novaTagImg);

    if (post.rascunhoIdWordpress) {
      registrar(`Atualizando post existente no WordPress (rascunho ${post.rascunhoIdWordpress})...`);
      await adaptador.atualizarPost(post.rascunhoIdWordpress, { content: novoHtml });
    }

    registrar("Persistindo no banco...");
    const novasImagensSecundarias = post.imagensSecundarias.map((i) => (i.slug === slugImagem ? { ...i, url: midia.url, storageUrl } : i));
    await atualizarStatusPost(postId, post.status, { conteudoHtml: novoHtml, imagensSecundarias: novasImagensSecundarias });
    registrar("Concluído com sucesso.");

    revalidatePath(ROTA);
    return { sucesso: true, url: midia.url, log };
  } catch (erro) {
    const detalhes = mensagemErro(erro);
    registrar(`FALHA INESPERADA: ${detalhes}`);
    console.error("trocarImagemSecundariaAction: falha inesperada —", erro);
    return { sucesso: false, erro: "Não foi possível trocar a imagem. Tente de novo.", detalhesErro: detalhes, log };
  }
}
