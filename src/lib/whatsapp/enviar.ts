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

// Buffer extra depois de despachar uma mídia, antes de despachar a PRÓXIMA mensagem — achado real
// (19/08/2026, Luiz): mesmo com o loop abaixo estritamente sequencial (cada `await enviar()` só
// libera a próxima iteração depois que a Zapster CONFIRMA o recebimento do pedido de envio), a
// Zapster ainda entregou uma foto DEPOIS de 2 textos despachados na sequência certa logo em
// seguida — a confirmação HTTP do POST só significa "aceito pra processar", não "já saiu pro
// WhatsApp do lead". Mídia (upload + processamento) é mais lenta que texto do lado deles, e nosso
// delay padrão (calcularDelayAutomatico, engine.ts) não sabe disso — ele é dimensionado pelo
// TAMANHO da mensagem, não pelo TIPO da anterior. Este buffer é cego (não temos como saber quando
// a mídia realmente chegou — a Zapster não documenta isso, ver `docs/COORDENACAO_AGENTES_ARRUDACRED.md`
// aviso 19/08), é mitigação, não garantia.
const BUFFER_POS_MIDIA_MS = 2500;

/**
 * Envia uma sequência de mensagens de verdade via WhatsApp, respeitando "digitando..." e o delay
 * de cada uma (mesma pausa que o simulador já mostra) — sem isso, mensagens de texto (rápidas)
 * podem chegar ANTES de uma mídia anterior (mais lenta, a Zapster precisa baixar/processar a URL),
 * entregando fora de ordem — foi o que aconteceu no primeiro teste real (16/08/2026, Luiz) e de
 * novo em produção (19/08/2026, Luiz) mesmo com o envio sequencial abaixo.
 */
export async function enviarSequenciaWhatsapp(telefone: string, mensagens: MensagemEnviada[]): Promise<void> {
  let ultimaFoiMidia = false;
  for (const item of mensagens) {
    if (item.digitando) {
      await definirDigitando(telefone);
    }
    const espera = delayEmMs(item.delay);
    const bufferExtra = ultimaFoiMidia ? BUFFER_POS_MIDIA_MS : 0;
    if (espera + bufferExtra > 0) {
      await new Promise((resolve) => setTimeout(resolve, espera + bufferExtra));
    }
    await enviar(telefone, item.mensagem);
    ultimaFoiMidia = item.mensagem.tipo === "imagem" || item.mensagem.tipo === "video" || item.mensagem.tipo === "audio" || item.mensagem.tipo === "documento";
  }
}
