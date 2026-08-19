import { enviarSequenciaWhatsapp } from "@/lib/whatsapp/enviar";
import { buscarPessoaCompleta } from "./pessoas";

/**
 * Reenvia o link de pagamento por WhatsApp — passa pela mesma Camada de Adaptadores de Canal já
 * usada pelo motor de fluxo (nunca chama a Zapster direto). Se a Pessoa não tiver WhatsApp
 * cadastrado, só loga — não trava o fluxo de criação da cobrança por causa disso (o admin ainda
 * pode copiar o link manualmente na tela).
 */
export async function enviarLinkPagamentoWhatsapp(pessoaId: string, link: string): Promise<void> {
  const pessoa = await buscarPessoaCompleta(pessoaId);
  if (!pessoa?.whatsapp) {
    console.error(`[vendas] Pessoa ${pessoaId} sem WhatsApp cadastrado — link de pagamento não enviado automaticamente.`);
    return;
  }

  await enviarSequenciaWhatsapp(pessoa.whatsapp, [
    {
      mensagem: { tipo: "texto", texto: `Seu contrato foi assinado! Aqui está o link para pagamento: ${link}` },
      digitando: true,
      delay: { tipo: "automatico" },
    },
  ]);
}
