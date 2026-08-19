import { buscarClientePorCpfCnpj, criarCliente, criarCobranca } from "./cliente";
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
 * Cria as cobranças na Asaas a partir das parcelas já calculadas em `contrato_parcelas` — uma
 * chamada por parcela, com o valor/vencimento exatos que já temos (não usa o parcelamento nativo
 * da Asaas, ver comentário em cliente.ts). Dispara depois que a Assinafy confirma que o contrato
 * foi assinado (webhook, Task 11).
 */
export async function criarCobrancasDoContrato(contratoId: string): Promise<void> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato) throw new Error("Contrato não encontrado.");

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

  await atualizarStatusContrato(contratoId, "parcelas_emitidas");
  await atualizarStatusContrato(contratoId, "aguardando_pagamento");

  if (linkPrimeiraParcela) {
    await enviarLinkPagamentoWhatsapp(contrato.pessoaSignatarioId, linkPrimeiraParcela);
  }
}
