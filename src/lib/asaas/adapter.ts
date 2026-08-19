import { buscarClientePorCpfCnpj, criarCheckout, criarCliente, criarCobranca } from "./cliente";
import { atualizarParcelaAsaas, atualizarStatusContrato, buscarContratoPorId, type MetodoPagamento } from "@/lib/vendas/contratos";
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
    const pessoa = await buscarPessoaCompleta(contrato.pessoaSignatarioId);
    if (!pessoa) throw new Error(`Pessoa ${contrato.pessoaSignatarioId} não encontrada.`);

    const checkout = await criarCheckout({
      descricao: `Contrato ${contratoId}`,
      valorTotal: contrato.valorTotal,
      maxParcelas: contrato.parcelasQtd,
      externalReference: contratoId,
      cliente: { nome: pessoa.nomeRazaoSocial, documento: pessoa.documento, email: pessoa.email, telefone: pessoa.whatsapp },
    });
    await atualizarStatusContrato(contratoId, "aguardando_pagamento");
    await enviarLinkPagamentoWhatsapp(contrato.pessoaSignatarioId, checkout.link);
    return;
  }

  const customerId = await resolverClienteAsaas(contrato.pessoaSignatarioId);
  const billingType = BILLING_TYPE[contrato.metodoPagamento];
  let linkPrimeiraParcela: string | null = null;

  for (const parcela of contrato.parcelas) {
    const cobranca = await criarCobranca({
      customerId,
      billingType,
      value: parcela.valor,
      dueDate: parcela.vencimentoPrevisto,
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
