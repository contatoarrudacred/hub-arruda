// src/lib/marketing/sanitizar-html.ts
// conteudo.conteudoHtml é gerado por IA e vai direto pro WordPress — sem sanitização, uma fonte de
// dados da pauta manipulada (ex.: pesquisa automatizada de palavra-chave, no futuro) poderia
// injetar HTML/JS malicioso. Allowlist pensada pra preservar o HTML de um artigo de blog normal
// (headings, parágrafos, listas, links, imagens, tabelas) e, especificamente, o
// <script type="application/ld+json"> onde o Schema FAQPage fica embutido (checklist da
// propriedade exige, ver MODULO_MARKETING_CONTEUDO_ARRUDACRED.md seção 5.2 item 4) — qualquer
// outra tag <script> é removida.

import sanitizeHtml from "sanitize-html";

export function sanitizarConteudoHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "h1", "h2", "img", "script"],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "width", "height"],
      script: ["type"],
    },
    // "mailto"/"tel" incluídos porque o checklist item 5 exige CTA pro canal de contato — sem
    // isso, hrefs mailto:/tel: seriam silenciosamente removidos.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    // .trim().toLowerCase() pra não deixar o Schema FAQPage cair fora por variação boba do LLM
    // (ex.: "application/LD+JSON" ou espaço em branco sobrando no atributo).
    exclusiveFilter: (frame) => frame.tag === "script" && (frame.attribs.type ?? "").trim().toLowerCase() !== "application/ld+json",
  });
}
