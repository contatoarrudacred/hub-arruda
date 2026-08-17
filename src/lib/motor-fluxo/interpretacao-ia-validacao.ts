// Parte pura de interpretacao-ia.ts, separada num módulo sem `server-only` de propósito — só pra
// dar pra testar sem puxar o SDK da Anthropic nem o resto do módulo servidor (server-only quebra o
// Vitest se importado direto). Ver interpretacao-ia.ts pra o encaixe real (chamada à API).

import type { Opcao } from "./tipos";

/**
 * Valida a resposta bruta da IA contra as opções válidas do checkpoint (quando existirem) — nunca
 * confia cegamente no que o modelo devolveu, defende contra o modelo "alucinar" um valor fora da
 * lista permitida.
 */
export function validarRespostaIA(
  bruta: { conseguiu_interpretar: boolean; valor: string },
  opcoes: Opcao[] | undefined,
): { valor: string; opcaoEscolhida?: Opcao } | null {
  if (!bruta.conseguiu_interpretar) return null;
  const valor = bruta.valor?.trim();
  if (!valor) return null;

  if (!opcoes?.length) return { valor };

  const opcaoEscolhida = opcoes.find((o) => o.valor === valor);
  if (!opcaoEscolhida) return null;

  return { valor: opcaoEscolhida.valor, opcaoEscolhida };
}
