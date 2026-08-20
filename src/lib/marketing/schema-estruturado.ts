// src/lib/marketing/schema-estruturado.ts
// Dados estruturados Article/Organization (Fase 4a, spec seção 3.4, 19/08/2026) — mesmo mecanismo
// que o Escritor já usa pra embutir o Schema FAQPage no corpo do post (script
// `application/ld+json` puro instrução de prompt, sem função dedicada — ver escritor.ts), mas
// montado aqui pelo controller do pipeline (processar-pauta.ts, Task 10 do plano, "Sequenciamento
// final"), não pelo Escritor: author (propriedade.autoria) e as datas de publicação/atualização só
// existem neste ponto do fluxo, não no momento em que o Escritor gera o rascunho.
//
// Esta task (Task 5) só constrói as duas funções — a injeção real no HTML acontece depois da
// sanitização e antes do envio ao WordPress, mecanismo que ainda não existe (Task 10). Por isso o
// formato do <script> abaixo casa exatamente com o que sanitizar-html.ts preserva
// (exclusiveFilter: `frame.tag === "script"` e `type` trimado+lowercased ===
// "application/ld+json", ver esse arquivo) só defensivamente, pro caso de um refactor futuro fazer
// este schema passar pelo sanitizador — hoje ele nunca passa por ali.

import type { AutoriaPropriedade } from "./tipos";

type PostParaSchema = {
  titulo: string;
  slug: string;
  urlBase: string;
  imagemDestaqueUrl: string | null;
};

type PropriedadeParaSchema = {
  autoria: AutoriaPropriedade | null;
  nome: string;
  urlBase: string;
};

type DatasParaSchema = {
  publicadoEm: Date;
  atualizadoEm: Date;
};

/** Envolve um objeto JSON-LD no mesmo formato de <script> que sanitizar-html.ts preserva. */
function envolverLdJson(objeto: Record<string, unknown>): string {
  return `<script type="application/ld+json">${JSON.stringify(objeto)}</script>`;
}

/**
 * Objeto Organization puro (sem wrapper <script>) — reaproveitado tanto por
 * `montarSchemaOrganization` (bloco fixo por propriedade) quanto como valor de `publisher` dentro
 * do Article, pra não aninhar uma segunda tag <script> completa dentro do JSON do Article.
 */
function construirObjetoOrganization(propriedade: { nome: string; urlBase: string }): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: propriedade.nome,
    url: propriedade.urlBase,
  };
}

/**
 * Objeto Person a partir da autoria E-E-A-T cadastrada na propriedade (tipos.ts,
 * AutoriaPropriedade). `credenciais`/`perfisProfissionais` só entram no objeto quando o array vem
 * não-vazio — evita emitir `hasCredential: []`/`sameAs: []` quando a propriedade cadastrou autoria
 * mas deixou esses campos em branco.
 */
function construirObjetoAuthor(autoria: AutoriaPropriedade): Record<string, unknown> {
  return {
    "@type": "Person",
    name: autoria.nome,
    image: autoria.fotoUrl,
    description: autoria.bio,
    jobTitle: autoria.especialidade,
    worksFor: {
      "@type": "Organization",
      name: autoria.empresa,
    },
    ...(autoria.credenciais.length > 0 ? { hasCredential: autoria.credenciais } : {}),
    ...(autoria.perfisProfissionais.length > 0 ? { sameAs: autoria.perfisProfissionais } : {}),
  };
}

/**
 * Monta o JSON-LD `Article` (schema.org) de um post e retorna já envolvido em
 * `<script type="application/ld+json">`, pronto pra injetar no HTML sanitizado (Task 10).
 *
 * `image`/`author` são condicionalmente omitidos (chave ausente, nunca `null`) quando
 * `post.imagemDestaqueUrl`/`propriedade.autoria` são `null` — propriedade sem autoria cadastrada ou
 * post sem imagem de capa ainda publicam normalmente, só sem esses campos no schema (ver spec
 * seção 3.3 e tipos.ts, PropriedadeCarregada.autoria).
 */
export function montarSchemaArticle(post: PostParaSchema, propriedade: PropriedadeParaSchema, datas: DatasParaSchema): string {
  const objeto: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.titulo,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${post.urlBase.replace(/\/$/, "")}/${post.slug}`,
    },
    datePublished: datas.publicadoEm.toISOString(),
    dateModified: datas.atualizadoEm.toISOString(),
    publisher: construirObjetoOrganization({ nome: propriedade.nome, urlBase: propriedade.urlBase }),
  };

  if (post.imagemDestaqueUrl !== null) {
    objeto.image = post.imagemDestaqueUrl;
  }

  if (propriedade.autoria !== null) {
    objeto.author = construirObjetoAuthor(propriedade.autoria);
  }

  return envolverLdJson(objeto);
}

/** Bloco `Organization` fixo por propriedade — montado uma vez, reaproveitado em todo post dela. */
export function montarSchemaOrganization(propriedade: { nome: string; urlBase: string }): string {
  return envolverLdJson(construirObjetoOrganization(propriedade));
}
