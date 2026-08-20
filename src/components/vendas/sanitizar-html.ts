"use client";

const TAGS_PERMITIDAS = new Set([
  "P", "BR", "STRONG", "B", "EM", "I", "U", "H1", "H2", "H3", "UL", "OL", "LI",
  "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "IMG", "A", "BLOCKQUOTE",
]);

const ATRIBUTOS_PERMITIDOS: Record<string, string[]> = {
  IMG: ["src", "alt"],
  A: ["href"],
};

/**
 * Remove toda formatação/estilo de um HTML colado (Word, site, planilha) — mantém só a estrutura
 * semântica que o editor entende (parágrafo, negrito, lista, tabela...), sem `style=`, `class=`
 * nem tags de apresentação (span, font, div genérico, atributos mso-* do Word). Roda só no
 * navegador (usa DOMParser) — chamado a partir do botão "Sanitizar" no editor rico.
 */
export function sanitizarHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  limparNo(doc.body);
  return doc.body.innerHTML;
}

function limparNo(no: Node): void {
  for (const filho of Array.from(no.childNodes)) {
    if (filho.nodeType === Node.TEXT_NODE) continue;
    if (filho.nodeType !== Node.ELEMENT_NODE) {
      no.removeChild(filho);
      continue;
    }

    const elemento = filho as HTMLElement;
    limparNo(elemento);

    if (!TAGS_PERMITIDAS.has(elemento.tagName)) {
      while (elemento.firstChild) no.insertBefore(elemento.firstChild, elemento);
      no.removeChild(elemento);
      continue;
    }

    const permitidos = ATRIBUTOS_PERMITIDOS[elemento.tagName] ?? [];
    for (const atributo of Array.from(elemento.attributes)) {
      if (!permitidos.includes(atributo.name)) elemento.removeAttribute(atributo.name);
    }
  }
}
