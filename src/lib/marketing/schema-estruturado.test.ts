// src/lib/marketing/schema-estruturado.test.ts
import { describe, expect, it } from "vitest";
import type { AutoriaPropriedade } from "./tipos";
import { montarSchemaArticle, montarSchemaOrganization } from "./schema-estruturado";

const AUTORIA: AutoriaPropriedade = {
  nome: "Ana Souza",
  fotoUrl: "https://exemplo.com/ana.jpg",
  bio: "Especialista em crédito consignado com 12 anos de experiência.",
  especialidade: "Crédito consignado",
  empresa: "ArrudaCred",
  credenciais: ["CFP", "Pós-graduação em Direito Financeiro"],
  perfisProfissionais: ["https://linkedin.com/in/anasouza"],
};

const POST = {
  titulo: "Como funciona o crédito consignado",
  slug: "como-funciona-credito-consignado",
  urlBase: "https://exemplo.com",
  imagemDestaqueUrl: "https://exemplo.com/imagens/capa.jpg",
};

const PROPRIEDADE_SEM_AUTORIA = {
  autoria: null,
  nome: "ArrudaCred Blog",
  urlBase: "https://exemplo.com",
};

const PROPRIEDADE_COM_AUTORIA = {
  autoria: AUTORIA,
  nome: "ArrudaCred Blog",
  urlBase: "https://exemplo.com",
};

const DATAS = {
  publicadoEm: new Date("2026-08-19T10:00:00.000Z"),
  atualizadoEm: new Date("2026-08-19T12:30:00.000Z"),
};

/** Extrai e faz parse do JSON dentro de um <script type="application/ld+json">...</script>. */
function extrairJsonLd(scriptTag: string): Record<string, unknown> {
  const match = scriptTag.match(/^<script type="application\/ld\+json">([\s\S]*)<\/script>$/);
  expect(match).not.toBeNull();
  return JSON.parse(match![1]);
}

describe("montarSchemaArticle", () => {
  it("propriedade sem autoria produz schema válido sem a chave author (não null, ausente)", () => {
    const resultado = montarSchemaArticle(POST, PROPRIEDADE_SEM_AUTORIA, DATAS);
    const parsed = extrairJsonLd(resultado);

    expect(parsed.author).toBeUndefined();
    expect("author" in parsed).toBe(false);
    expect(parsed["@type"]).toBe("Article");
    expect(parsed.headline).toBe(POST.titulo);
  });

  it("propriedade com autoria preenche author com os dados corretos (Person)", () => {
    const resultado = montarSchemaArticle(POST, PROPRIEDADE_COM_AUTORIA, DATAS);
    const parsed = extrairJsonLd(resultado);

    expect(parsed.author).toEqual({
      "@type": "Person",
      name: AUTORIA.nome,
      image: AUTORIA.fotoUrl,
      description: AUTORIA.bio,
      jobTitle: AUTORIA.especialidade,
      worksFor: {
        "@type": "Organization",
        name: AUTORIA.empresa,
      },
      hasCredential: AUTORIA.credenciais,
      sameAs: AUTORIA.perfisProfissionais,
    });
  });

  it("omite hasCredential/sameAs quando os arrays de autoria vêm vazios (não emite array vazio)", () => {
    const autoriaSemExtras: AutoriaPropriedade = { ...AUTORIA, credenciais: [], perfisProfissionais: [] };
    const resultado = montarSchemaArticle(POST, { ...PROPRIEDADE_COM_AUTORIA, autoria: autoriaSemExtras }, DATAS);
    const parsed = extrairJsonLd(resultado);
    const author = parsed.author as Record<string, unknown>;

    expect("hasCredential" in author).toBe(false);
    expect("sameAs" in author).toBe(false);
  });

  it("datas formatadas em ISO 8601 (datePublished/dateModified)", () => {
    const resultado = montarSchemaArticle(POST, PROPRIEDADE_SEM_AUTORIA, DATAS);
    const parsed = extrairJsonLd(resultado);

    expect(parsed.datePublished).toBe(DATAS.publicadoEm.toISOString());
    expect(parsed.dateModified).toBe(DATAS.atualizadoEm.toISOString());
  });

  it("imagemDestaqueUrl null omite a chave image (não emite null)", () => {
    const resultado = montarSchemaArticle({ ...POST, imagemDestaqueUrl: null }, PROPRIEDADE_SEM_AUTORIA, DATAS);
    const parsed = extrairJsonLd(resultado);

    expect(parsed.image).toBeUndefined();
    expect("image" in parsed).toBe(false);
  });

  it("imagemDestaqueUrl presente preenche a chave image", () => {
    const resultado = montarSchemaArticle(POST, PROPRIEDADE_SEM_AUTORIA, DATAS);
    const parsed = extrairJsonLd(resultado);

    expect(parsed.image).toBe(POST.imagemDestaqueUrl);
  });

  it("publisher é um objeto Organization embutido (não uma string <script> aninhada)", () => {
    const resultado = montarSchemaArticle(POST, PROPRIEDADE_SEM_AUTORIA, DATAS);
    const parsed = extrairJsonLd(resultado);

    expect(parsed.publisher).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: PROPRIEDADE_SEM_AUTORIA.nome,
      url: PROPRIEDADE_SEM_AUTORIA.urlBase,
    });
  });

  it("o resultado tem exatamente uma tag <script type=\"application/ld+json\"> (publisher não duplica a tag)", () => {
    const resultado = montarSchemaArticle(POST, PROPRIEDADE_COM_AUTORIA, DATAS);
    const ocorrencias = resultado.match(/<script/g) ?? [];

    expect(ocorrencias.length).toBe(1);
  });

  it("o script tag casa exatamente com o padrão que sanitizar-html.ts preserva (type trimado e minúsculo)", () => {
    const resultado = montarSchemaArticle(POST, PROPRIEDADE_SEM_AUTORIA, DATAS);

    expect(resultado.startsWith('<script type="application/ld+json">')).toBe(true);
    expect(resultado.endsWith("</script>")).toBe(true);
  });
});

describe("montarSchemaOrganization", () => {
  it("produz um bloco Organization válido com nome e url da propriedade", () => {
    const resultado = montarSchemaOrganization({ nome: "ArrudaCred Blog", urlBase: "https://exemplo.com" });
    const parsed = extrairJsonLd(resultado);

    expect(parsed).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "ArrudaCred Blog",
      url: "https://exemplo.com",
    });
  });

  it("o script tag casa exatamente com o padrão que sanitizar-html.ts preserva", () => {
    const resultado = montarSchemaOrganization({ nome: "ArrudaCred Blog", urlBase: "https://exemplo.com" });

    expect(resultado.startsWith('<script type="application/ld+json">')).toBe(true);
    expect(resultado.endsWith("</script>")).toBe(true);
  });
});
