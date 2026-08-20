"use server";

import { configurarWebhook } from "@/lib/assinafy/cliente";

export type ResultadoConfigurarWebhook = { sucesso: true; url: string } | { sucesso: false; erro: string };

/** Setup de uma vez só — registra na Assinafy a URL do nosso webhook (document_ready,
 * signer_rejected_document). Sem isso a Assinafy nunca avisa o sistema que alguém assinou. */
export async function configurarWebhookAssinafyAction(email: string): Promise<ResultadoConfigurarWebhook> {
  if (!email.trim()) return { sucesso: false, erro: "Informe um e-mail." };

  const segredo = process.env.ASSINAFY_WEBHOOK_SECRET;
  if (!segredo) {
    return { sucesso: false, erro: "ASSINAFY_WEBHOOK_SECRET não está configurada no Vercel — adicione antes de continuar." };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = `${baseUrl}/api/webhooks/assinafy?secret=${encodeURIComponent(segredo)}`;

  try {
    await configurarWebhook(url, email.trim());
    return { sucesso: true, url };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha ao configurar o webhook. Tente novamente.";
    return { sucesso: false, erro: mensagem };
  }
}
