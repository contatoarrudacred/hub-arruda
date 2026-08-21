// src/lib/marketing/sanitizar-html.ts
// conteudo.conteudoHtml é gerado por IA e vai direto pro WordPress — sem sanitização, uma fonte de
// dados da pauta manipulada (ex.: pesquisa automatizada de palavra-chave, no futuro) poderia
// injetar HTML/JS malicioso. Allowlist pensada pra preservar o HTML de um artigo de blog normal
// (headings, parágrafos, listas, links, imagens, tabelas) e, especificamente, o
// <script type="application/ld+json"> onde o Schema FAQPage fica embutido (checklist da
// propriedade exige, ver MODULO_MARKETING_CONTEUDO_ARRUDACRED.md seção 5.2 item 4) — qualquer
// outra tag <script> é removida.
//
// Duplicação de título no post publicado (achado real de teste em produção, 19/08/2026): o
// WordPress renderiza o campo `titulo` do post automaticamente como o H1 da página (confirmado no
// HTML real de um post publicado — o tema, via Elementor, embute exatamente um <h1> a partir do
// widget "Título do post") — então o <h1>título</h1> que o Escritor escreve como primeira linha de
// conteudo_html (pra satisfazer o item de checklist "H1 com a palavra-chave principal") duplicava o
// título visualmente. Decisão do Luiz: manter essa duplicação NO TEXTO GERADO (é o jeito mais
// confiável do Revisor confirmar de verdade que existe um H1 com a palavra-chave — checar uma tag
// literal é mais robusto que confiar no modelo "lembrar" de nunca escrever algo) e garantir que ela
// nunca chega ao WordPress AQUI, mecanicamente: `exclusiveFilter` abaixo descarta qualquer <h1> por
// completo — tag E texto, não só a tag — antes de "sanitizar" (a etapa que roda logo antes de
// "gerar_imagens"/"publicar"). "h1" continua na allowlist (é um heading legítimo de artigo em
// qualquer outro contexto) — o que garante a remoção é o exclusiveFilter, não a ausência da tag na
// lista.

import sanitizeHtml from "sanitize-html";

export function sanitizarConteudoHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "h1", "h2", "img", "script"],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      // "data-imagem" (Agenda de Posts, Trocar Foto, 20/08/2026): marcador estável que liga uma
      // entrada de imagem (capa/slug da secundária) ao seu <figure> no HTML salvo — ver
      // construirFiguraCapa/inserirImagensSecundariasNoHtml em processar-pauta.ts. Precisa
      // sobreviver a re-sanitização (ex.: botão "Sanitizar" do editor manual, Editar Post Completo).
      img: ["src", "alt", "width", "height", "data-imagem"],
      script: ["type"],
    },
    // "mailto"/"tel" incluídos porque o checklist item 5 exige CTA pro canal de contato — sem
    // isso, hrefs mailto:/tel: seriam silenciosamente removidos.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    exclusiveFilter: (frame) =>
      // .trim().toLowerCase() pra não deixar o Schema FAQPage cair fora por variação boba do LLM
      // (ex.: "application/LD+JSON" ou espaço em branco sobrando no atributo).
      (frame.tag === "script" && (frame.attribs.type ?? "").trim().toLowerCase() !== "application/ld+json") ||
      // Remove o <h1> inteiro (tag + texto) — ver comentário de cabeçalho.
      frame.tag === "h1",
  });
}
