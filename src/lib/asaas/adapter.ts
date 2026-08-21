import { buscarClientePorCpfCnpj, criarCheckout, criarCliente, criarCobranca } from "./cliente";
import {
  atualizarCheckoutContrato,
  atualizarParcelaAsaas,
  atualizarStatusContrato,
  atualizarVencimentoParcela,
  buscarContratoPorId,
  type Contrato,
  type MetodoPagamento,
} from "@/lib/vendas/contratos";
import { enviarLinkPagamentoWhatsapp } from "@/lib/vendas/notificacoes";
import { buscarPessoaCompleta } from "@/lib/vendas/pessoas";

const BILLING_TYPE: Record<MetodoPagamento, "BOLETO" | "CREDIT_CARD"> = {
  boleto_pix: "BOLETO",
  cartao: "CREDIT_CARD",
};

async function resolverClienteAsaas(pessoaId: string): Promise<string> {
  const pessoa = await buscarPessoaCompleta(pessoaId);
  if (!pessoa) throw new Error(`Pessoa ${pessoaId} não encontrada.`);

  const existente = await buscarClientePorCpfCnpj(pessoa.documento);
  if (existente) return existente.id;

  const novo = await criarCliente(pessoa.nomeRazaoSocial, pessoa.documento, pessoa.id);
  return novo.id;
}

/** Monta e persiste um novo Checkout de cartão pro contrato — usado tanto na criação automática
 * (dentro de criarCobrancasDoContrato) quanto na geração manual sob demanda (criarCheckoutManual,
 * quando o link salvo já passou das 24h de validade). Grava o link em `contratos` via
 * atualizarCheckoutContrato (migration 20260821100000) — antes dessa mudança o link gerado
 * automaticamente nunca era salvo em lugar nenhum, só mandado por WhatsApp na hora. */
async function gerarEPersistirCheckout(contrato: Pick<Contrato, "id" | "valorTotal" | "maxParcelasCartao" | "pessoaSignatarioId">): Promise<string> {
  const pessoa = await buscarPessoaCompleta(contrato.pessoaSignatarioId);
  if (!pessoa) throw new Error(`Pessoa ${contrato.pessoaSignatarioId} não encontrada.`);

  const checkout = await criarCheckout({
    descricao: `Contrato ${contrato.id}`,
    valorTotal: contrato.valorTotal,
    // NÃO usar contrato.parcelasQtd aqui — o significado dela pra cartão varia por tela de
    // origem (Nova Oportunidade: sempre 1, um placeholder; Fechamento de Venda: reflete parcelas
    // reais calculadas). O parcelamento que vale pro Checkout é sempre maxParcelasCartao,
    // independente de quem criou o contrato; achado real na revisão final da branch (o valor
    // escolhido nunca chegava na Asaas antes desta correção).
    maxParcelas: contrato.maxParcelasCartao ?? 1,
    externalReference: contrato.id,
    cliente: { nome: pessoa.nomeRazaoSocial, documento: pessoa.documento, email: pessoa.email, telefone: pessoa.whatsapp },
  });
  await atualizarCheckoutContrato(contrato.id, checkout.id, checkout.link);
  return checkout.link;
}

/** Gera um novo Checkout sob demanda — chamado pelo botão "Gerar novo link de pagamento" em
 * Detalhes da Venda quando o link salvo já expirou (24h, minutesToExpire: 1440). */
export async function criarCheckoutManual(contratoId: string): Promise<string> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato) throw new Error("Contrato não encontrado.");
  if (contrato.metodoPagamento !== "cartao") throw new Error("Esta venda não é por cartão — não tem Checkout pra gerar de novo.");
  return gerarEPersistirCheckout(contrato);
}

/**
 * Cria as cobranças na Asaas — ramifica por método de pagamento. Boleto/Pix: uma chamada por
 * parcela, com o valor/vencimento exatos que já temos (não usa o parcelamento nativo da Asaas, ver
 * comentário em cliente.ts). Cartão: um único Checkout hospedado, com parcelamento nativo do cartão
 * (a Asaas divide, ver criarCheckout) — o cliente nunca digita o cartão no nosso sistema. Dispara
 * depois que a Assinafy confirma que o contrato foi assinado (webhook, Task 11).
 */
export async function criarCobrancasDoContrato(contratoId: string): Promise<void> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato) throw new Error("Contrato não encontrado.");
  if (!contrato.metodoPagamento) throw new Error("Venda comissionada não gera cobrança na Asaas — não deveria chegar aqui.");

  if (contrato.metodoPagamento === "cartao") {
    const link = await gerarEPersistirCheckout(contrato);
    await atualizarStatusContrato(contratoId, "aguardando_pagamento");
    await enviarLinkPagamentoWhatsapp(contrato.pessoaSignatarioId, link);
    return;
  }

  const customerId = await resolverClienteAsaas(contrato.pessoaSignatarioId);
  const billingType = BILLING_TYPE[contrato.metodoPagamento];
  let linkPrimeiraParcela: string | null = null;

  for (const parcela of contrato.parcelas) {
    // Idempotência: uma retentativa manual (Task 14) pode chamar isto de novo depois de já ter
    // criado algumas cobranças com sucesso na rodada anterior — pular as que já têm
    // asaas_payment_id evita duplicar boleto/cobrança na Asaas pro cliente. Achado real da revisão
    // final da branch: sem isso, o botão "Tentar novamente" (que agora aparece já no 1º erro,
    // ver Critical 2) recriaria as parcelas que já tinham dado certo antes de uma falha no meio.
    if (parcela.asaasPaymentId) continue;

    // Achado real (Luiz, 21/08/2026): a Asaas rejeita (400 invalid_dueDate) qualquer vencimento
    // anterior a hoje — acontece numa venda que demorou a ser assinada/destravada bem depois do
    // previsto (ex.: webhook document_ready perdido, corrigido só depois via
    // confirmarAssinaturaManualAction). Empurra pra hoje nesse caso e grava a correção de volta em
    // contrato_parcelas, pra não ficar um dado divergente do que a Asaas realmente cobra.
    const hoje = new Date().toISOString().slice(0, 10);
    const dueDate = parcela.vencimentoPrevisto < hoje ? hoje : parcela.vencimentoPrevisto;
    if (dueDate !== parcela.vencimentoPrevisto) {
      await atualizarVencimentoParcela(parcela.id, dueDate);
    }

    const cobranca = await criarCobranca({
      customerId,
      billingType,
      value: parcela.valor,
      dueDate,
      externalReference: parcela.id,
      description: `Parcela ${parcela.numero}/${contrato.parcelasQtd} — contrato ${contratoId}`,
    });
    await atualizarParcelaAsaas(parcela.id, cobranca.id);
    if (parcela.numero === 1) linkPrimeiraParcela = cobranca.invoiceUrl;
  }

  await atualizarStatusContrato(contratoId, "aguardando_pagamento");

  if (linkPrimeiraParcela) {
    await enviarLinkPagamentoWhatsapp(contrato.pessoaSignatarioId, linkPrimeiraParcela);
  }
}
