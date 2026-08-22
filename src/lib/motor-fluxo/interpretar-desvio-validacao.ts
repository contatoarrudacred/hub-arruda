// Parte pura de interpretar-desvio.ts, separada sem `server-only` de propósito — mesmo motivo de
// interpretacao-ia-validacao.ts / interpretar-faixas-documentos-validacao.ts (o SDK da Anthropic
// quebra o Vitest se importado direto).

import type { FaqParaDesvio, ResultadoDesvio } from "./tipos";

export type RespostaBrutaDesvio = {
  status: "faq" | "escalar";
  indice_faq: number;
};

/**
 * Valida a resposta bruta da IA contra a lista de FAQs de verdade — nunca confia cegamente no índice
 * que o modelo devolveu (mesmo padrão de `validarEscolhaFaixaMenu`): fora do range, ou índice ausente
 * quando status=faq, vira `escalar` (mais seguro escalar de mais do que citar uma FAQ errada).
 */
export function validarResultadoDesvio(bruta: RespostaBrutaDesvio, faqsAtivas: FaqParaDesvio[]): ResultadoDesvio {
  if (bruta.status !== "faq") return { status: "escalar" };

  const indice = bruta.indice_faq - 1; // IA responde 1-based, array é 0-based
  const faq = faqsAtivas[indice];
  if (!faq) return { status: "escalar" };

  return { status: "faq", faq };
}

/**
 * Monta a mensagem de desvio (regra de desvio, seção 5 do PERSONA_MALALA_PROMPT_SISTEMA.md): responde
 * a pergunta lateral com o texto oficial da FAQ e, na MESMA mensagem, retoma a pergunta pendente do
 * checkpoint — nunca gerado por IA (zero risco de alucinação, a resposta já foi aprovada por Luiz).
 */
export function montarMensagemDesvio(faq: FaqParaDesvio, perguntaPendente: string): string {
  return `${faq.resposta}\n\n${perguntaPendente}`;
}
