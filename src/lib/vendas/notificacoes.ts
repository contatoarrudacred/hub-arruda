import { enviarSequenciaWhatsapp } from "@/lib/whatsapp/enviar";
import { enviarEmail } from "@/lib/email/resend";
import { buscarPessoaCompleta } from "./pessoas";

/** Manda uma mensagem de texto simples por WhatsApp — passa pela mesma Camada de Adaptadores de
 * Canal já usada pelo motor de fluxo (nunca chama a Zapster direto). Lança erro se a Pessoa não
 * tiver WhatsApp cadastrado — quem chama decide como reportar isso na UI (o admin sempre pode usar
 * "copiar link" como alternativa). */
export async function enviarWhatsapp(pessoaId: string, texto: string): Promise<void> {
  const pessoa = await buscarPessoaCompleta(pessoaId);
  if (!pessoa?.whatsapp) throw new Error(`Pessoa "${pessoa?.nomeRazaoSocial ?? pessoaId}" não tem WhatsApp cadastrado.`);

  await enviarSequenciaWhatsapp(pessoa.whatsapp, [
    { mensagem: { tipo: "texto", texto }, digitando: true, delay: { tipo: "automatico" } },
  ]);
}

/** Manda um e-mail simples via Resend (src/lib/email/resend.ts) — mesmo remetente/infra já usada
 * pelo módulo Marketing, sem integração nova. Lança erro se a Pessoa não tiver e-mail cadastrado. */
export async function enviarPorEmail(pessoaId: string, assunto: string, texto: string): Promise<void> {
  const pessoa = await buscarPessoaCompleta(pessoaId);
  if (!pessoa?.email) throw new Error(`Pessoa "${pessoa?.nomeRazaoSocial ?? pessoaId}" não tem e-mail cadastrado.`);

  await enviarEmail({ destinatario: pessoa.email, assunto, html: `<p>${texto}</p>`, texto });
}

/**
 * Reenvia o link de pagamento por WhatsApp — chamado automaticamente quando a cobrança é criada na
 * Asaas (src/lib/asaas/adapter.ts). Se a Pessoa não tiver WhatsApp cadastrado, só loga — não trava
 * o fluxo de criação da cobrança por causa disso (o admin ainda pode reenviar manualmente depois,
 * pela tela de Detalhes da Venda, escolhendo outro canal).
 */
export async function enviarLinkPagamentoWhatsapp(pessoaId: string, link: string): Promise<void> {
  try {
    await enviarWhatsapp(pessoaId, `Seu contrato foi assinado! Aqui está o link para pagamento: ${link}`);
  } catch (erro) {
    console.error(`[vendas] Falha ao enviar link de pagamento automaticamente:`, erro);
  }
}
