import { timingSafeEqual } from "node:crypto";

// Extraído de src/app/api/webhooks/zapster/route.ts em 22/08/2026 — a rota do número secundário
// (ver src/app/api/webhooks/zapster-secundario/route.ts) precisa da MESMA checagem
// (segredo na query string, comparação em tempo constante, fail-closed em produção), só que com
// uma env var diferente. Único lugar com essa lógica agora.

/** Comparação em tempo constante — evita vazar, por timing, quantos caracteres do segredo já acertaram. */
function segredosBatem(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * `true` = requisição autorizada, pode processar. `false` = quem chamou deve responder 401
 * imediatamente. Fail-closed em produção (Vercel): sem a env var configurada, rejeita — um erro de
 * configuração não pode virar um endpoint aberto aceitando payload de qualquer um (achado real,
 * 16/08/2026, ver histórico do zapster/route.ts). Em dev local (sem `process.env.VERCEL`), pula a
 * checagem se a env var não estiver setada.
 */
export function verificarSegredoWebhook(request: Request, nomeEnvVar: string): boolean {
  const segredo = process.env[nomeEnvVar];

  if (!segredo) {
    if (process.env.VERCEL) {
      console.error(`[webhook] ${nomeEnvVar} não configurada em produção — rejeitando.`);
      return false;
    }
    return true;
  }

  const secretDaUrl = new URL(request.url).searchParams.get("secret") ?? "";
  return segredosBatem(secretDaUrl, segredo);
}
