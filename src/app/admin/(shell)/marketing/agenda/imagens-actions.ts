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

export type ResultadoTrocaImagem = { sucesso: true; url: string } | { sucesso: false; erro: string };

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

export async function trocarCapaAction(formData: FormData): Promise<ResultadoTrocaImagem> {
  const postId = formData.get("postId") as string;
  const modo = lerModo(formData);
  if (!modo) return { sucesso: false, erro: "Modo de troca de imagem inválido." };

  const post = await carregarPostDetalhado(postId);
  if (!post) return { sucesso: false, erro: "Post não encontrado." };

  let novaDataUrl: string;
  let novoAlt = post.titulo;

  if (modo === "upload") {
    const arquivo = formData.get("arquivo") as File | null;
    if (!arquivo || arquivo.size === 0) return { sucesso: false, erro: "Selecione uma imagem." };
    novaDataUrl = await arquivoParaDataUrl(arquivo);
  } else if (modo === "prompt") {
    const prompt = (formData.get("prompt") as string | null)?.trim();
    if (!prompt) return { sucesso: false, erro: "Digite um prompt." };
    const { resultado } = await gerarImagemComPrompt(prompt, post.conteudoHtml);
    if (!resultado) return { sucesso: false, erro: "Não foi possível gerar a imagem. Tente de novo." };
    novaDataUrl = resultado.url;
  } else {
    const pauta = await carregarPauta(post.pautaId);
    if (!pauta) return { sucesso: false, erro: "Pauta do post não encontrada." };
    const persona = pauta.personaId ? await carregarPersona(pauta.personaId) : null;
    const conteudo = { titulo: post.titulo, conteudoHtml: post.conteudoHtml, metaTitle: post.metaTitle, metaDescription: post.metaDescription, slug: post.slug };
    const { resultado } = await gerarCapa(pauta, conteudo, persona);
    if (!resultado) return { sucesso: false, erro: "Não foi possível gerar a imagem. Tente de novo." };
    novaDataUrl = resultado.url;
    novoAlt = resultado.alt;
  }

  const propriedade = await carregarPropriedade(post.propriedadeId);
  const novoSlug = `${post.slug}-capa-${Date.now()}`;
  const { url: storageUrl } = await enviarImagemStorage(novaDataUrl, `${post.propriedadeId}/${post.pautaId}/capa-${novoSlug}.png`);
  const adaptador = criarAdaptadorWordPress(propriedade.urlBase, credenciaisWordPressDaPropriedade(propriedade));
  const midia = await adaptador.enviarMidia(novaDataUrl, `capa-${novoSlug}.png`, novoAlt);

  const novaTagImg = `<img src="${midia.url}" alt="${escaparAtributoHtml(novoAlt)}" data-imagem="capa">`;
  const novoHtml = substituirImagemNoHtml(post.conteudoHtml, "capa", post.imagemDestaqueUrl, novaTagImg);

  if (post.rascunhoIdWordpress) {
    await adaptador.atualizarPost(post.rascunhoIdWordpress, { content: novoHtml, featuredMedia: midia.idRemoto });
  }

  await atualizarStatusPost(postId, post.status, {
    conteudoHtml: novoHtml,
    imagemDestaqueUrl: midia.url,
    imagemDestaqueAlt: novoAlt,
    imagemDestaqueSlug: novoSlug,
    imagemDestaqueStorageUrl: storageUrl,
    imagemDestaqueMediaId: midia.idRemoto,
  });

  revalidatePath(ROTA);
  return { sucesso: true, url: midia.url };
}

export async function trocarImagemSecundariaAction(formData: FormData): Promise<ResultadoTrocaImagem> {
  const postId = formData.get("postId") as string;
  const slugImagem = formData.get("slugImagem") as string;
  const modo = lerModo(formData);
  if (!modo) return { sucesso: false, erro: "Modo de troca de imagem inválido." };

  const post = await carregarPostDetalhado(postId);
  if (!post) return { sucesso: false, erro: "Post não encontrado." };
  const imagemAtual = post.imagensSecundarias.find((i) => i.slug === slugImagem);
  if (!imagemAtual) return { sucesso: false, erro: "Imagem secundária não encontrada." };

  let novaDataUrl: string;

  if (modo === "upload") {
    const arquivo = formData.get("arquivo") as File | null;
    if (!arquivo || arquivo.size === 0) return { sucesso: false, erro: "Selecione uma imagem." };
    novaDataUrl = await arquivoParaDataUrl(arquivo);
  } else {
    // "gerar de novo" (sem prompt digitado) não tem o prompt original — nunca é persistido pelo
    // gerador de imagens secundárias (ver ImagemSecundaria, imagens/secundarias.ts) — aproximação
    // razoável: monta um prompt a partir do título/legenda já salvos desta imagem.
    const prompt = modo === "prompt" ? (formData.get("prompt") as string | null)?.trim() : `${imagemAtual.titulo}: ${imagemAtual.legenda}`;
    if (!prompt) return { sucesso: false, erro: "Digite um prompt." };
    const { resultado } = await gerarImagemComPrompt(prompt, post.conteudoHtml);
    if (!resultado) return { sucesso: false, erro: "Não foi possível gerar a imagem. Tente de novo." };
    novaDataUrl = resultado.url;
  }

  const propriedade = await carregarPropriedade(post.propriedadeId);
  const { url: storageUrl } = await enviarImagemStorage(novaDataUrl, `${post.propriedadeId}/${post.pautaId}/secundaria-${slugImagem}-${Date.now()}.png`);
  const adaptador = criarAdaptadorWordPress(propriedade.urlBase, credenciaisWordPressDaPropriedade(propriedade));
  const midia = await adaptador.enviarMidia(novaDataUrl, `secundaria-${slugImagem}.png`, imagemAtual.alt);

  const novaTagImg = `<img src="${midia.url}" alt="${escaparAtributoHtml(imagemAtual.alt)}" data-imagem="${escaparAtributoHtml(slugImagem)}">`;
  const novoHtml = substituirImagemNoHtml(post.conteudoHtml, slugImagem, imagemAtual.url, novaTagImg);

  if (post.rascunhoIdWordpress) {
    await adaptador.atualizarPost(post.rascunhoIdWordpress, { content: novoHtml });
  }

  const novasImagensSecundarias = post.imagensSecundarias.map((i) => (i.slug === slugImagem ? { ...i, url: midia.url, storageUrl } : i));
  await atualizarStatusPost(postId, post.status, { conteudoHtml: novoHtml, imagensSecundarias: novasImagensSecundarias });

  revalidatePath(ROTA);
  return { sucesso: true, url: midia.url };
}
