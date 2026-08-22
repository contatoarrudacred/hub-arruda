// Parte pura de interpretacao-ia.ts, separada num módulo sem `server-only` de propósito — só pra
// dar pra testar sem puxar o SDK da Anthropic nem o resto do módulo servidor (server-only quebra o
// Vitest se importado direto). Ver interpretacao-ia.ts pra o encaixe real (chamada à API).

import { resolverConteudoExtra } from "./interpretar-desvio-validacao";
import type { ConteudoExtraDetectado, FaqParaDesvio, ObjecaoParaDesvio, Opcao } from "./tipos";

/**
 * Valida a resposta bruta da IA contra as opções válidas do checkpoint (quando existirem) — nunca
 * confia cegamente no que o modelo devolveu, defende contra o modelo "alucinar" um valor fora da
 * lista permitida.
 *
 * `indice_faq_extra`/`indice_objecao_extra` (achado 22/08/2026) — detecção de conteúdo embutido na
 * MESMA chamada (ver `resolverConteudoExtra`): `faqsAtivas`/`objecoesAtivas` default pra `[]` pra
 * não quebrar chamadas antigas que não passam esses argumentos.
 */
export function validarRespostaIA(
  bruta: { conseguiu_interpretar: boolean; valor: string; indice_faq_extra?: number; indice_objecao_extra?: number },
  opcoes: Opcao[] | undefined,
  faqsAtivas: FaqParaDesvio[] = [],
  objecoesAtivas: ObjecaoParaDesvio[] = [],
): { valor: string; opcaoEscolhida?: Opcao; conteudoExtra?: ConteudoExtraDetectado } | null {
  if (!bruta.conseguiu_interpretar) return null;
  const valor = bruta.valor?.trim();
  if (!valor) return null;

  const conteudoExtra = resolverConteudoExtra(bruta, faqsAtivas, objecoesAtivas);
  const extra = conteudoExtra ? { conteudoExtra } : {};

  if (!opcoes?.length) return { valor, ...extra };

  const opcaoEscolhida = opcoes.find((o) => o.valor === valor);
  if (!opcaoEscolhida) return null;

  return { valor: opcaoEscolhida.valor, opcaoEscolhida, ...extra };
}
