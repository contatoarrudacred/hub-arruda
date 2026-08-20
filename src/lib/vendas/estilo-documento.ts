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
    line-height: 1.6;
    color: #18181b;
    background: #ffffff;
    margin: 0;
    padding: 0;
  }
  p { text-align: justify; margin: 0 0 12px 0; }
  h1, h2, h3 { font-weight: bold; margin: 20px 0 10px 0; }
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
  }
  th { background: #f4f4f5; font-weight: bold; }
  img { max-width: 100%; }
  ul, ol { margin: 0 0 12px 0; padding-left: 24px; }
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
