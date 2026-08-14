// Vocabulário fixo das subetapas do Kanban (KANBAN_COMERCIAL_LIMPANOME.md) — mesmos slugs usados
// em `oportunidades.etapa_kanban` e em `etapas_fluxo.conteudo.kanban_subetapa`. Centralizado aqui
// porque tanto o editor visual (dropdown) quanto qualquer tela futura do Kanban em si vão precisar
// da mesma lista rótulo/cor.

export const KANBAN_SUBETAPAS = [
  { slug: "novo_lead_triagem", label: "1.1 · Triagem", cor: "#94a3b8" },
  { slug: "qualificacao", label: "1.2 · Qualificação", cor: "#60a5fa" },
  { slug: "faixa_divida", label: "2.1 · Faixa de Dívida", cor: "#818cf8" },
  { slug: "envio_proposta", label: "2.2 · Envio Proposta", cor: "#c084fc" },
  { slug: "negociacao_duvidas", label: "2.3 · Negociação/Dúvidas", cor: "#f472b6" },
  { slug: "dados_contrato", label: "3.1 · Dados para Contrato", cor: "#fb923c" },
  { slug: "assinatura_digital", label: "3.2 · Assinatura Digital", cor: "#fbbf24" },
  { slug: "pagamento", label: "3.3 · Pagamento", cor: "#facc15" },
  { slug: "ganha", label: "4.1 · Ganha", cor: "#4ade80" },
  { slug: "perdida", label: "4.2 · Perdida", cor: "#f87171" },
] as const;

export type KanbanSubetapaSlug = (typeof KANBAN_SUBETAPAS)[number]["slug"];

export function corDaSubetapa(slug: string | undefined): string {
  return KANBAN_SUBETAPAS.find((s) => s.slug === slug)?.cor ?? "#cbd5e1";
}

export function rotuloDaSubetapa(slug: string | undefined): string {
  return KANBAN_SUBETAPAS.find((s) => s.slug === slug)?.label ?? "(sem subetapa)";
}
