/**
 * Estilo visual único aplicado a todo documento gerado em PDF (contrato, e futuramente termo de
 * acordo/ficha associativa) — convenção de documento jurídico impresso: fonte serifada, texto
 * justificado, entrelinha confortável, tabelas que não quebram no meio da página, área de
 * assinatura com linha. Aplicado automaticamente na geração do PDF (src/lib/vendas/geracao-pdf.ts)
 * e sob demanda no preview do editor (src/components/vendas/editor-html-contrato.tsx) — não é
 * gravado dentro do conteúdo de cada documento, pra não desatualizar templates já criados quando
 * o visual mudar aqui no futuro (decisão de escopo, 19/08/2026).
 */
export const ESTILO_DOCUMENTO_CSS = `
  body {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 12pt;
    line-height: 1.3;
    color: #18181b;
    background: #ffffff;
    margin: 0;
    padding: 0;
  }
  p {
    text-align: justify;
    margin: 0 0 8px 0;
    /* Evita "linha órfã" — 1 linha isolada sozinha no topo/rodapé de uma página quando o
       parágrafo é cortado ao meio pela quebra de página do PDF. */
    orphans: 3;
    widows: 3;
  }
  h1, h2, h3 {
    font-weight: bold;
    margin: 20px 0 10px 0;
    /* Mantém o título grudado no parágrafo seguinte — sem isso um título de cláusula podia
       ficar sozinho na última linha de uma página, com o texto começando só na próxima. */
    page-break-after: avoid;
  }
  h1 { font-size: 16pt; text-transform: uppercase; text-align: center; }
  h2 { font-size: 13pt; text-transform: uppercase; }
  h3 { font-size: 12pt; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    page-break-inside: avoid;
  }
  td, th {
    border: 1px solid #71717a;
    padding: 6px 8px;
    text-align: left;
    font-size: 11pt;
    line-height: 1.3;
  }
  th { background: #f4f4f5; font-weight: bold; }
  img { max-width: 100%; page-break-inside: avoid; }
  ul, ol { margin: 0 0 8px 0; padding-left: 24px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

/** Envolve o HTML de um documento (já com placeholders resolvidos) num documento completo com o
 * estilo aplicado — usado tanto pela geração de PDF quanto, futuramente, por qualquer preview
 * fora do editor. */
export function envolverComEstiloDocumento(htmlConteudo: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${ESTILO_DOCUMENTO_CSS}</style></head><body>${htmlConteudo}</body></html>`;
}

/** Mesma margem passada pro Puppeteer em src/lib/vendas/geracao-pdf.ts (page.pdf({ margin })) —
 * extraída aqui pra não duplicar o número em dois lugares. No PDF real, o Puppeteer aplica essa
 * margem por fora do conteúdo (opção da própria lib, não CSS) — por isso ESTILO_DOCUMENTO_CSS
 * não tem padding no body. O preview (abaixo) não passa pelo Puppeteer, então precisa simular
 * essa margem via CSS pra mostrar de verdade como o PDF vai sair. */
export const MARGENS_PDF_MM = { top: 20, bottom: 20, left: 18, right: 18 } as const;

/** Igual a envolverComEstiloDocumento, mas com a margem de página simulada em CSS — usada só no
 * preview do editor (iframe isolado, nunca vira PDF de verdade). Sem isso o preview mostrava o
 * texto colado nas bordas, sem a folga que o PDF real tem (achado do Luiz: preview "pior" que o
 * modo de edição, que tem padding próprio). */
export function envolverComEstiloDocumentoPreview(htmlConteudo: string): string {
  const margemCss = `${MARGENS_PDF_MM.top}mm ${MARGENS_PDF_MM.right}mm ${MARGENS_PDF_MM.bottom}mm ${MARGENS_PDF_MM.left}mm`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${ESTILO_DOCUMENTO_CSS}
    body { padding: ${margemCss}; box-sizing: border-box; min-height: 100vh; }
  </style></head><body>${htmlConteudo}</body></html>`;
}
