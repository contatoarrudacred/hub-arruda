import "server-only";
import { render } from "react-email";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEmail } from "./resend";
import { EmailBoasVindas } from "./templates/boas-vindas";

// Disparo do e-mail de boas-vindas — assim que a Malala captura o e-mail do lead no fluxo
// (checkpoint `abertura_email`, ver fluxo-limpeza-nome.ts), quem chama registrarTurnoMalala
// (persistencia.ts) aciona isto. Primeiro e-mail de uma base de mail marketing que só cresce
// (Luiz, 15/08/2026) — por isso os dois controles: nunca duas vezes pro mesmo lead, e respeita
// descadastro desde o primeiro envio.

const NUMERO_WHATSAPP_ARRUDACRED = "5513974024339"; // (13) 97402-4339 — confirmado direto no site oficial, 15/08/2026. Outros números antigos não são mais válidos.
const LINK_BLOG_REPUTACAO = "https://arrudacred.com.br/empresa-confiavel-limpar-nome-arrudacred-reclame-aqui/";

function montarLinkWhatsapp(): string {
  const texto = "Olá! Vim do e-mail e quero continuar minha conversa sobre limpar meu nome 😊";
  return `https://wa.me/${NUMERO_WHATSAPP_ARRUDACRED}?text=${encodeURIComponent(texto)}`;
}

function montarLinkDescadastro(pessoaId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/descadastro?p=${pessoaId}`;
}

/** Envia o e-mail de boas-vindas se ainda não foi enviado pra essa pessoa e ela não pediu descadastro. Silencioso (não lança) — um e-mail de boas-vindas falho não pode travar o fluxo de atendimento no WhatsApp. */
export async function enviarEmailBoasVindasSeNecessario(
  pessoaId: string,
  nomeCompleto: string,
  email: string,
): Promise<void> {
  const supabase = createAdminClient();

  const { data: pessoa } = await supabase
    .from("pessoas")
    .select("email_boas_vindas_enviado, email_marketing_opt_out")
    .eq("id", pessoaId)
    .single();

  if (!pessoa || pessoa.email_boas_vindas_enviado || pessoa.email_marketing_opt_out) return;

  const primeiroNome = nomeCompleto.trim().split(/\s+/)[0] || "";

  try {
    const html = await render(
      EmailBoasVindas({
        nome: primeiroNome,
        linkWhatsapp: montarLinkWhatsapp(),
        linkBlog: LINK_BLOG_REPUTACAO,
        linkDescadastro: montarLinkDescadastro(pessoaId),
      }),
    );

    await enviarEmail({
      destinatario: email,
      assunto: `As informações que te prometi, ${primeiroNome} 💛`,
      html,
    });

    await supabase.from("pessoas").update({ email_boas_vindas_enviado: true }).eq("id", pessoaId);
  } catch (e) {
    console.error("Falha ao enviar e-mail de boas-vindas:", e);
  }
}
