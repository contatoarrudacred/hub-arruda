"use server";

import { buscarStatusWebhook, configurarWebhook, type StatusWebhookAssinafy } from "@/lib/assinafy/cliente";

export type ResultadoConfigurarWebhook = { sucesso: true; url: string } | { sucesso: false; erro: string };

export type ResultadoStatusWebhook =
  | { sucesso: true; status: StatusWebhookAssinafy | null; segredoBate: boolean | null }
  | { sucesso: false; erro: string };

/**
 * Achado real, Luiz 21/08/2026 (2ª vez que um contrato assinado fica preso sem avançar sozinho): a
 * checagem de status desta tela sempre comparou só o COMEÇO da URL registrada na Assinafy — nunca o
 * `?secret=` no final dela. Isso significa que a tela podia mostrar "✅ tudo certo" mesmo com o
 * segredo desatualizado (ex.: `ASSINAFY_WEBHOOK_SECRET` trocada no Vercel depois do último
 * `configurarWebhook`, ou vice-versa) — exatamente o cenário silencioso que já intrigou pelo menos
 * uma vez nesta sessão. Nunca retorna o valor do segredo pro client (só o booleano da comparação) —
 * a comparação roda aqui, no server.
 */
function segredoDaUrlBateComOAtual(status: StatusWebhookAssinafy | null): boolean | null {
  const segredoLocal = process.env.ASSINAFY_WEBHOOK_SECRET;
  if (!status || !segredoLocal) return null;
  try {
    const secretDaUrl = new URL(status.url).searchParams.get("secret") ?? "";
    return secretDaUrl === segredoLocal;
  } catch {
    return null;
  }
}

/** Consulta o estado atual direto na Assinafy — prova concreta de que o setup deu certo (ou não),
 * em vez de confiar só na mensagem do momento em que o botão foi clicado. */
export async function buscarStatusWebhookAssinafyAction(): Promise<ResultadoStatusWebhook> {
  try {
    const status = await buscarStatusWebhook();
    return { sucesso: true, status, segredoBate: segredoDaUrlBateComOAtual(status) };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha ao consultar o status. Tente novamente.";
    return { sucesso: false, erro: mensagem };
  }
}

/** Setup de uma vez só — registra na Assinafy a URL do nosso webhook (document_ready,
 * signer_rejected_document). Sem isso a Assinafy nunca avisa o sistema que alguém assinou. */
export async function configurarWebhookAssinafyAction(email: string): Promise<ResultadoConfigurarWebhook> {
  if (!email.trim()) return { sucesso: false, erro: "Informe um e-mail." };

  const segredo = process.env.ASSINAFY_WEBHOOK_SECRET;
  if (!segredo) {
    return { sucesso: false, erro: "ASSINAFY_WEBHOOK_SECRET não está configurada no Vercel — adicione antes de continuar." };
  }

  // "?? fallback" só cobre undefined/null — se a env var estiver setada como string vazia
  // (achado real: foi exatamente isso que causou "não é uma URL válida" na Assinafy), o "??"
  // não pega, então checa vazio explicitamente também.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  const url = `${baseUrl}/api/webhooks/assinafy?secret=${encodeURIComponent(segredo)}`;

  try {
    new URL(url);
  } catch {
    return {
      sucesso: false,
      erro: `URL montada não é válida: "${url}" — confira o valor de NEXT_PUBLIC_APP_URL no Vercel (precisa começar com https:// e não pode ter espaço).`,
    };
  }

  try {
    await configurarWebhook(url, email.trim());
    return { sucesso: true, url };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha ao configurar o webhook. Tente novamente.";
    return { sucesso: false, erro: mensagem };
  }
}
