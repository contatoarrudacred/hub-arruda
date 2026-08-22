/**
 * Envio de comunicação pro cliente DESATIVADO no módulo Vendas — decisão do Luiz, 21/08/2026.
 *
 * Motivo: o Vendas mandava WhatsApp/e-mail direto pro cliente (Zapster/Resend) sem deixar nenhum
 * rastro visível na ficha da Pessoa — quem monta essa timeline é o CRM, via `mensagens`/`conversas`
 * (núcleo do CRM), e o Vendas nunca gravava nada ali. Daqui pra frente, **só o módulo CRM manda
 * comunicação pro cliente** — o Luiz está coordenando com o agente do CRM como isso deve funcionar
 * (ver docs/COORDENACAO_AGENTES_ARRUDACRED.md, seção 3, 21/08/2026) e vai trazer a decisão.
 *
 * NÃO reativar o envio direto por aqui quando essa decisão chegar — plugar na função/mecanismo que
 * o CRM definir (provavelmente uma função exportada por eles, que já grava a mensagem na ficha da
 * Pessoa). A implementação anterior (chamada direta a `enviarSequenciaWhatsapp`/`enviarEmail`) está
 * no histórico do git (commit `06e7a40` e anteriores) se precisar consultar o que existia antes.
 */
const MOTIVO_DESATIVADO =
  "Envio de comunicação pro cliente está desativado no módulo Vendas — aguardando integração com o CRM (docs/COORDENACAO_AGENTES_ARRUDACRED.md, seção 3, 21/08/2026).";

export async function enviarWhatsapp(pessoaId: string, texto: string): Promise<void> {
  void pessoaId;
  void texto;
  throw new Error(MOTIVO_DESATIVADO);
}

export async function enviarPorEmail(pessoaId: string, assunto: string, texto: string): Promise<void> {
  void pessoaId;
  void assunto;
  void texto;
  throw new Error(MOTIVO_DESATIVADO);
}

/**
 * Antes mandava automaticamente o link de pagamento assim que a cobrança era criada na Asaas — com
 * o envio direto desativado (ver acima), só loga que o link ficou disponível. O admin ainda vê o
 * link em Detalhes da Venda (Ver/Copiar) pra mandar manualmente por fora, até o CRM assumir isso.
 */
export async function enviarLinkPagamentoWhatsapp(pessoaId: string, link: string): Promise<void> {
  console.log(`[vendas] Link de pagamento disponível pra pessoa ${pessoaId} (envio automático desativado, ver notificacoes.ts): ${link}`);
}
