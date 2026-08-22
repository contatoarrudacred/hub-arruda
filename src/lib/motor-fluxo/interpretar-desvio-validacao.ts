// Parte pura de interpretar-desvio.ts, separada sem `server-only` de propósito — mesmo motivo de
// interpretacao-ia-validacao.ts / interpretar-faixas-documentos-validacao.ts (o SDK da Anthropic
// quebra o Vitest se importado direto).

import type { FaqParaDesvio, ObjecaoParaDesvio } from "./tipos";

export type RespostaBrutaDesvio = {
  status: "faq" | "objecao" | "escalar" | "ambiguo";
  indice_faq: number;
  indice_objecao: number;
};

/**
 * Resolução intermediária (antes da geração de texto, que precisa de IA — fica em interpretar-
 * desvio.ts) — resolve o índice bruto que a IA devolveu pro objeto de verdade (FAQ ou objeção).
 */
export type ResolucaoDesvio =
  | { status: "faq"; faq: FaqParaDesvio }
  | { status: "objecao"; objecao: ObjecaoParaDesvio }
  | { status: "escalar" }
  | { status: "ambiguo" };

/**
 * Valida a resposta bruta da IA contra as listas de verdade — nunca confia cegamente no índice que o
 * modelo devolveu (mesmo padrão de `validarEscolhaFaixaMenu`). `ambiguo` é o fallback seguro: qualquer
 * inconsistência (índice fora do range, status desconhecido) cai em `ambiguo`, nunca em `escalar` —
 * depois da bateria completa de 21/08/2026 (achado: `escalar` sendo usado demais), `escalar` só deve
 * acontecer quando a IA teve certeza suficiente pra pedir isso explicitamente.
 */
export function resolverRespostaDesvio(bruta: RespostaBrutaDesvio, faqsAtivas: FaqParaDesvio[], objecoesAtivas: ObjecaoParaDesvio[]): ResolucaoDesvio {
  if (bruta.status === "faq") {
    const faq = faqsAtivas[bruta.indice_faq - 1]; // IA responde 1-based, array é 0-based
    return faq ? { status: "faq", faq } : { status: "ambiguo" };
  }

  if (bruta.status === "objecao") {
    const objecao = objecoesAtivas[bruta.indice_objecao - 1];
    return objecao ? { status: "objecao", objecao } : { status: "ambiguo" };
  }

  if (bruta.status === "escalar") return { status: "escalar" };

  return { status: "ambiguo" };
}
