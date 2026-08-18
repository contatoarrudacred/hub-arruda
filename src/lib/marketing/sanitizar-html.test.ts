// src/lib/marketing/sanitizar-html.test.ts
import { describe, expect, it } from "vitest";
import { sanitizarConteudoHtml } from "./sanitizar-html";

describe("sanitizarConteudoHtml", () => {
  it("remove <script> comuns (risco de injeção)", () => {
    const resultado = sanitizarConteudoHtml("<p>Texto</p><script>alert(1)</script>");
    expect(resultado).not.toContain("<script>");
    expect(resultado).not.toContain("alert(1)");
    expect(resultado).toContain("<p>Texto</p>");
  });

  it("preserva <script type=\"application/ld+json\"> intacto (Schema FAQPage)", () => {
    const html = '<p>Texto</p><script type="application/ld+json">{"a":1}</script>';
    const resultado = sanitizarConteudoHtml(html);
    expect(resultado).toContain('<script type="application/ld+json">{"a":1}</script>');
  });

  it("preserva HTML normal de artigo de blog (headings, listas, links, imagens, tabelas)", () => {
    const html =
      '<h1>Título</h1><h2>Subtítulo</h2><p>Parágrafo com <a href="https://exemplo.com">link</a>.</p>' +
      '<ul><li>Item 1</li><li>Item 2</li></ul><img src="https://exemplo.com/img.jpg" alt="Descrição" width="1200" height="628">' +
      "<table><tr><td>Célula</td></tr></table>";
    const resultado = sanitizarConteudoHtml(html);

    expect(resultado).toContain("<h1>Título</h1>");
    expect(resultado).toContain("<h2>Subtítulo</h2>");
    expect(resultado).toContain('href="https://exemplo.com"');
    expect(resultado).toContain("<li>Item 1</li>");
    expect(resultado).toContain('src="https://exemplo.com/img.jpg"');
    expect(resultado).toContain('alt="Descrição"');
    expect(resultado).toContain("<td>Célula</td>");
  });
});
