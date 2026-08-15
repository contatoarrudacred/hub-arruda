import "server-only";
import { render } from "react-email";
import { createAdminClient } from "@/lib/supabase/admin";
import { carregarContatoInstitucional } from "./contato-institucional";
import { enviarEmail } from "./resend";
import { EmailBoasVindas } from "./templates/boas-vindas";

// Disparo do e-mail de boas-vindas — assim que a Malala captura o e-mail do lead no fluxo
// (checkpoint `abertura_email`, ver fluxo-limpeza-nome.ts), quem chama registrarTurnoMalala
// (persistencia.ts) aciona isto. Primeiro e-mail de uma base de mail marketing que só cresce
// (Luiz, 15/08/2026) — por isso os dois controles: nunca duas vezes pro mesmo lead, e respeita
// descadastro desde o primeiro envio.

const LINK_BLOG_REPUTACAO = "https://arrudacred.com.br/empresa-confiavel-limpar-nome-arrudacred-reclame-aqui/";
const TITULO_BLOG_REPUTACAO = "ArrudaCred é indicada ao Prêmio Reclame Aqui 2026";
const CAPA_BLOG_REPUTACAO = "https://arrudacred.com.br/wp-content/uploads/2026/08/capa-arrudacred-premioRA-2026.png";

// Vídeo de apresentação institucional passado por Luiz (15/08/2026). A miniatura vem direto do
// YouTube (URL previsível a partir do id do vídeo, sem precisar de API/chave).
const ID_VIDEO_APRESENTACAO = "RZVQQIBHr0Y";
const LINK_VIDEO_APRESENTACAO = `https://youtu.be/${ID_VIDEO_APRESENTACAO}`;
const CAPA_VIDEO_APRESENTACAO = `https://img.youtube.com/vi/${ID_VIDEO_APRESENTACAO}/hqdefault.jpg`;

function montarLinkWhatsapp(numero: string): string {
  const texto = "Olá! Vim do e-mail e quero continuar minha conversa sobre limpar meu nome 😊";
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
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
    const contato = await carregarContatoInstitucional();

    const html = await render(
      EmailBoasVindas({
        nome: primeiroNome,
        linkWhatsapp: montarLinkWhatsapp(contato.whatsappNumero),
        linkBlog: LINK_BLOG_REPUTACAO,
        tituloBlog: TITULO_BLOG_REPUTACAO,
        capaBlog: CAPA_BLOG_REPUTACAO,
        linkVideo: LINK_VIDEO_APRESENTACAO,
        capaVideo: CAPA_VIDEO_APRESENTACAO,
        linkDescadastro: montarLinkDescadastro(pessoaId),
        redesSociais: contato.redesSociais,
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
