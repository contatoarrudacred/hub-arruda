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
      '<h2>Subtítulo</h2><p>Parágrafo com <a href="https://exemplo.com">link</a>.</p>' +
      '<ul><li>Item 1</li><li>Item 2</li></ul><img src="https://exemplo.com/img.jpg" alt="Descrição" width="1200" height="628">' +
      "<table><tr><td>Célula</td></tr></table>";
    const resultado = sanitizarConteudoHtml(html);

    expect(resultado).toContain("<h2>Subtítulo</h2>");
    expect(resultado).toContain('href="https://exemplo.com"');
    expect(resultado).toContain("<li>Item 1</li>");
    expect(resultado).toContain('src="https://exemplo.com/img.jpg"');
    expect(resultado).toContain('alt="Descrição"');
    expect(resultado).toContain("<td>Célula</td>");
  });

  // Agenda de Posts (Trocar Foto, 20/08/2026): data-imagem precisa sobreviver à re-sanitização
  // (ex.: botão "Sanitizar" do editor manual, Editar Post Completo) — sem isso, o marcador que liga
  // uma entrada de imagem (capa/slug da secundária) ao seu <figure> se perderia silenciosamente.
  it("preserva o atributo data-imagem em <img> (marcador de troca de foto)", () => {
    const html = '<img src="https://exemplo.com/capa.png" alt="Capa" data-imagem="capa">';
    const resultado = sanitizarConteudoHtml(html);
    expect(resultado).toContain('data-imagem="capa"');
  });

  // Achado real de teste em produção (19/08/2026) + decisão do Luiz: o Escritor CONTINUA
  // escrevendo <h1>título</h1> no corpo (é como o Revisor confirma de verdade que existe um H1 com
  // a palavra-chave, ver escritor.ts) — o WordPress renderiza o campo `titulo` do post como o H1
  // real da página (confirmado no HTML de um post publicado), então esse <h1> do corpo duplicaria
  // o título visualmente se chegasse ao ar. sanitizarConteudoHtml é quem garante que isso nunca
  // acontece: remove o <h1> por COMPLETO — tag e texto, não só a tag — antes de qualquer coisa
  // seguir pro WordPress.
  it("remove o <h1> por completo do corpo — tag e texto — pra nunca duplicar o H1 real da página no WordPress", () => {
    const resultado = sanitizarConteudoHtml("<h1>Como Limpar o Nome no Serasa</h1><h2>Subtítulo</h2><p>Texto</p>");

    expect(resultado).not.toContain("<h1>");
    expect(resultado).not.toContain("</h1>");
    expect(resultado).not.toContain("Como Limpar o Nome no Serasa");
    expect(resultado).toContain("<h2>Subtítulo</h2>");
    expect(resultado).toContain("<p>Texto</p>");
  });

  it("preserva links mailto: e tel: (CTA pro canal de contato exigido pelo checklist)", () => {
    const html = '<p><a href="mailto:contato@exemplo.com">e-mail</a> ou <a href="tel:+5511999999999">telefone</a></p>';
    const resultado = sanitizarConteudoHtml(html);

    expect(resultado).toContain('href="mailto:contato@exemplo.com"');
    expect(resultado).toContain('href="tel:+5511999999999"');
  });

  it("preserva o Schema FAQPage mesmo com variação de caixa/espaço no atributo type", () => {
    const html = '<script type=" application/LD+JSON ">{"a":1}</script>';
    const resultado = sanitizarConteudoHtml(html);

    expect(resultado).toContain("<script");
    expect(resultado).toContain('{"a":1}');
    expect(resultado).not.toBe("");
  });
});
