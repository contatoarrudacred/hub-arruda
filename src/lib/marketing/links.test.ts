// src/lib/marketing/links.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { inserirLinksInternos } from "./links";
import * as repositorio from "./repositorio";

describe("inserirLinksInternos", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("acrescenta a seção 'Posts relacionados' quando há 3 ou mais posts publicados", async () => {
    vi.spyOn(repositorio, "carregarPostsPublicadosDaPropriedade").mockResolvedValue([
      { titulo: "Como Limpar o Nome no Serasa", url: "https://teste.exemplo.com/limpar-nome-serasa/" },
      { titulo: "Score de Crédito: Guia Completo", url: "https://teste.exemplo.com/score-credito/" },
      { titulo: "Como Sair do SPC", url: "https://teste.exemplo.com/sair-do-spc/" },
    ]);

    const resultado = await inserirLinksInternos("<h1>Artigo</h1><p>Conteúdo.</p>", "prop-1");

    expect(resultado).toContain("<h1>Artigo</h1><p>Conteúdo.</p>");
    expect(resultado).toContain("<h2>Posts relacionados</h2>");
    expect(resultado).toContain('<a href="https://teste.exemplo.com/limpar-nome-serasa/">Como Limpar o Nome no Serasa</a>');
    expect(resultado).toContain('<a href="https://teste.exemplo.com/score-credito/">Score de Crédito: Guia Completo</a>');
    expect(resultado).toContain('<a href="https://teste.exemplo.com/sair-do-spc/">Como Sair do SPC</a>');
  });

  it("retorna o HTML inalterado quando há menos de 3 posts publicados", async () => {
    vi.spyOn(repositorio, "carregarPostsPublicadosDaPropriedade").mockResolvedValue([
      { titulo: "Como Limpar o Nome no Serasa", url: "https://teste.exemplo.com/limpar-nome-serasa/" },
      { titulo: "Score de Crédito: Guia Completo", url: "https://teste.exemplo.com/score-credito/" },
    ]);

    const html = "<h1>Artigo</h1><p>Conteúdo.</p>";
    const resultado = await inserirLinksInternos(html, "prop-1");

    expect(resultado).toBe(html);
  });

  it("retorna o HTML inalterado quando não há posts publicados ainda", async () => {
    vi.spyOn(repositorio, "carregarPostsPublicadosDaPropriedade").mockResolvedValue([]);

    const html = "<h1>Artigo</h1><p>Conteúdo.</p>";
    const resultado = await inserirLinksInternos(html, "prop-1");

    expect(resultado).toBe(html);
  });

  it("repassa o id do post atual pra excluir da lista de relacionados", async () => {
    const spy = vi.spyOn(repositorio, "carregarPostsPublicadosDaPropriedade").mockResolvedValue([]);

    await inserirLinksInternos("<p>x</p>", "prop-1", "post-atual");

    expect(spy).toHaveBeenCalledWith("prop-1", "post-atual");
  });
});
