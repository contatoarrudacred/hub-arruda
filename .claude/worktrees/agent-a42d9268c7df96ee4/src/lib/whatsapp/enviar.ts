import "server-only";
import type { ConfigDelay, MensagemEnviada, MensagemEtapa } from "../motor-fluxo/tipos";
import { definirDigitando, enviarMensagemMidia, enviarMensagemTexto } from "./zapster";

// Camada de adaptador de canal pro WhatsApp real (Fase 7) — traduz o formato canal-agnóstico do
// motor (MensagemEtapa, ver tipos.ts) pro que a API do Zapster entende. Único lugar que decide
// "que chamada da API usar pra cada tipo de mensagem".

function delayEmMs(delay: ConfigDelay): number {
  switch (delay.tipo) {
    case "nenhum":
      return 0;
    case "fixo":
      return delay.segundos * 1000;
    case "aleatorio":
      return (delay.min_segundos + Math.random() * (delay.max_segundos - delay.min_segundos)) * 1000;
    case "automatico":
      // Não deveria chegar aqui — engine.ts já resolve "automatico" num valor concreto antes de
      // devolver MensagemEnviada. Fallback conservador só por segurança de tipo.
      return 1500;
  }
}

async function enviar(telefone: string, mensagem: MensagemEtapa): Promise<void> {
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

/**
 * Envia uma sequência de mensagens de verdade via WhatsApp, respeitando "digitando..." e o delay
 * de cada uma (mesma pausa que o simulador já mostra) — sem isso, mensagens de texto (rápidas)
 * podem chegar ANTES de uma mídia anterior (mais lenta, a Zapster precisa baixar/processar a URL),
 * entregando fora de ordem — foi o que aconteceu no primeiro teste real (16/08/2026, Luiz).
 */
export async function enviarSequenciaWhatsapp(telefone: string, mensagens: MensagemEnviada[]): Promise<void> {
  for (const item of mensagens) {
    if (item.digitando) {
      await definirDigitando(telefone);
    }
    const espera = delayEmMs(item.delay);
    if (espera > 0) {
      await new Promise((resolve) => setTimeout(resolve, espera));
    }
    await enviar(telefone, item.mensagem);
  }
}
