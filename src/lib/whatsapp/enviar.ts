import "server-only";
import type { MensagemEtapa } from "../motor-fluxo/tipos";
import { enviarMensagemMidia, enviarMensagemTexto } from "./zapster";

// Camada de adaptador de canal pro WhatsApp real (Fase 7) — traduz o formato canal-agnóstico do
// motor (MensagemEtapa, ver tipos.ts) pro que a API do Zapster entende. Único lugar que decide
// "que chamada da API usar pra cada tipo de mensagem".

/** Envia uma MensagemEtapa de verdade via WhatsApp. Localização, contato e Pix ainda não têm tradução — nenhuma etapa do script usa esses tipos hoje; lança erro em vez de falhar silenciosamente se algum dia usarem. */
export async function enviarMensagemWhatsapp(telefone: string, mensagem: MensagemEtapa): Promise<void> {
  switch (mensagem.tipo) {
    case "texto":
      await enviarMensagemTexto(telefone, mensagem.texto);
      return;
    case "imagem":
    case "audio":
    case "video":
    case "documento":
      await enviarMensagemMidia(telefone, mensagem.midia_url, mensagem.legenda);
      return;
    case "localizacao":
    case "contato":
    case "pix":
      throw new Error(
        `Envio real de mensagem tipo "${mensagem.tipo}" ainda não implementado no adaptador do WhatsApp (Zapster).`,
      );
  }
}
