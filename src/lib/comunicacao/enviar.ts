import "server-only";
import { render } from "react-email";
import { carregarContatoInstitucional } from "@/lib/email/contato-institucional";
import { EmailComunicacaoGenerica } from "@/lib/email/templates/comunicacao-generica";
import { enviarEmail } from "@/lib/email/resend";
import { enviarMensagemTexto } from "@/lib/whatsapp/zapster";
import {
  buscarConversaWhatsappOficial,
  buscarEmailPessoa,
  buscarMensagemPorChaveIdempotencia,
  buscarOuCriarConversaEmail,
  buscarOuCriarConversaSecundaria,
  inserirMensagemSistema,
} from "./repositorio";
import { avaliarIdempotencia, resolverInstanciaWhatsapp } from "./resolver-envio-validacao";
import type { ParametrosComunicacao, ResultadoComunicacao } from "./tipos";

// Núcleo do módulo de comunicação centralizada — ver
// docs/superpowers/specs/2026-08-22-comunicacao-centralizada-crm-design.md. Único ponto de entrada
// que outros módulos (Vendas, Financeiro, Marketing...) chamam pra mandar WhatsApp/e-mail pro
// cliente — nunca falam direto com Zapster/Resend.

function montarLinkWhatsapp(numero: string): string {
  return `https://wa.me/${numero}`;
}

const AVISO_INSTANCIA_SECUNDARIA_PREFIXO =
  "⚠️ Este número é apenas para envio automático e não consegue responder. " +
  "Se precisar de ajuda, fale com a gente pelo nosso WhatsApp oficial: ";

export async function enviarComunicacao(params: ParametrosComunicacao): Promise<ResultadoComunicacao> {
  const { pessoaId, categoriaId, chaveIdempotencia, canal, conteudo } = params;

  if (chaveIdempotencia) {
    const existente = await buscarMensagemPorChaveIdempotencia(chaveIdempotencia);
    const avaliacao = avaliarIdempotencia(existente);
    if (avaliacao.repetir) return { status: "idempotente_repetido", mensagemId: avaliacao.mensagemId };
  }

  if (canal === "whatsapp") {
    const conversaOficial = await buscarConversaWhatsappOficial(pessoaId);
    const instancia = resolverInstanciaWhatsapp(conversaOficial !== null);

    let conversaId: string;
    let telefone: string;
    let textoParaEnviar = conteudo.texto;

    if (instancia === "oficial" && conversaOficial) {
      conversaId = conversaOficial.id;
      telefone = conversaOficial.telefone;
    } else {
      const conversaSecundaria = await buscarOuCriarConversaSecundaria(pessoaId);
      conversaId = conversaSecundaria.id;
      telefone = conversaSecundaria.telefone;
      const contato = await carregarContatoInstitucional();
      const aviso = `${AVISO_INSTANCIA_SECUNDARIA_PREFIXO}${montarLinkWhatsapp(contato.whatsappNumero)}`;
      textoParaEnviar = `${aviso}\n\n${conteudo.texto}`;
    }

    const { messageId } = await enviarMensagemTexto(telefone, textoParaEnviar, instancia);
    const { id: mensagemId } = await inserirMensagemSistema({
      conversaId,
      texto: textoParaEnviar,
      categoriaId,
      chaveIdempotencia,
      provedorMessageId: messageId || null,
    });

    return { status: "enviado", mensagemId, instancia };
  }

  // canal === "email"
  const [conversaEmail, contato] = await Promise.all([buscarOuCriarConversaEmail(pessoaId), carregarContatoInstitucional()]);

  const html = await render(
    EmailComunicacaoGenerica({
      assunto: conteudo.assunto,
      corpo: conteudo.corpo,
      linkWhatsapp: montarLinkWhatsapp(contato.whatsappNumero),
      redesSociais: contato.redesSociais,
      linkDescadastro: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/descadastro?p=${pessoaId}`,
    }),
  );

  const emailPessoa = await buscarEmailPessoa(pessoaId);
  if (!emailPessoa) throw new Error(`Pessoa ${pessoaId} não tem e-mail cadastrado — não é possível enviar.`);

  const { id: emailId } = await enviarEmail({ destinatario: emailPessoa, assunto: conteudo.assunto, html });
  const { id: mensagemId } = await inserirMensagemSistema({
    conversaId: conversaEmail.id,
    texto: `${conteudo.assunto}\n\n${conteudo.corpo}`,
    categoriaId,
    chaveIdempotencia,
    provedorMessageId: emailId || null,
  });

  return { status: "enviado", mensagemId };
}
