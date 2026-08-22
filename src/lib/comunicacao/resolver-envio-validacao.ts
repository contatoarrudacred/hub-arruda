// Parte pura do módulo de comunicação centralizada — sem I/O (nenhuma chamada a Supabase, Zapster
// ou Resend), testável direto. A resolução de QUAL conversa buscar/criar (I/O de verdade) fica em
// repositorio.ts; aqui só a DECISÃO, dado o que já foi buscado.

/**
 * Nunca inicia conversa pelo WhatsApp oficial (spec: docs/superpowers/specs/2026-08-22-comunicacao-centralizada-crm-design.md
 * — risco de banimento em modo não-oficial). "Já existe conversa oficial" = QUALQUER conversa que
 * já existiu com a pessoa no oficial, não importa há quanto tempo (decisão de Luiz).
 */
export function resolverInstanciaWhatsapp(existeConversaOficial: boolean): "oficial" | "secundaria" {
  return existeConversaOficial ? "oficial" : "secundaria";
}

export type ResultadoIdempotencia = { repetir: true; mensagemId: string } | { repetir: false };

/** Se já existe uma mensagem gravada com a mesma chave de idempotência, não manda de novo — devolve o resultado anterior. */
export function avaliarIdempotencia(mensagemExistente: { id: string } | null): ResultadoIdempotencia {
  if (mensagemExistente) return { repetir: true, mensagemId: mensagemExistente.id };
  return { repetir: false };
}
