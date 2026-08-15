import "server-only";
import { Resend } from "resend";

// Envio real de e-mail (Resend, decidido por Luiz em 15/08/2026 — domínio arrudacred.com.br já
// verificado). Único lugar do projeto que fala com a API da Resend — tanto a régua de follow-up
// (nutrição pós-perda) quanto o futuro e-mail de boas-vindas passam por aqui.

const REMETENTE_PADRAO = "ArrudaCred <contato@arrudacred.com.br>";

function obterClienteResend(): Resend {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) {
    throw new Error("RESEND_API_KEY não configurada — falta no .env.local (dev) ou nas variáveis de ambiente da Vercel (produção).");
  }
  return new Resend(chave);
}

export type EnvioEmail = {
  destinatario: string;
  assunto: string;
  html: string;
  texto?: string;
  remetente?: string;
};

/** Envia um e-mail de verdade via Resend. Lança erro em caso de falha — quem chama decide como registrar (ex.: status "falhou" em followup_emails). */
export async function enviarEmail(envio: EnvioEmail): Promise<{ id: string }> {
  const resend = obterClienteResend();
  const { data, error } = await resend.emails.send({
    from: envio.remetente ?? REMETENTE_PADRAO,
    to: envio.destinatario,
    subject: envio.assunto,
    html: envio.html,
    text: envio.texto,
  });

  if (error || !data) {
    throw new Error(`Falha ao enviar e-mail via Resend: ${error?.message ?? "resposta vazia"}`);
  }
  return { id: data.id };
}
