import { atualizarStatusContrato, type MetodoPagamento } from "./contratos";
import { buscarUnidadeNegocioDaPessoa, promoverPessoaACliente } from "./clientes";
import { sincronizarEtapaKanban } from "./oportunidades";

/**
 * Decide se a venda deve ser concluída neste exato momento, ao confirmar uma parcela paga.
 * Boleto/pix: só a 1ª parcela conclui (regra de negócio já existente, preservada). Cartão: nunca
 * aqui — fica de fora até a reconciliação do Checkout existir (ver
 * docs/superpowers/specs/2026-08-21-vendas-checkout-cartao-recebiveis-design.md), que vai concluir
 * a venda direto no pagamento do Checkout, sem depender de parcela. `null` (venda comissionada) também
 * nunca — esse tipo de venda não passa por `contrato_parcelas`/webhook Asaas nenhum, tem seu próprio
 * caminho de conclusão (`confirmarVendaComissionada`, `src/lib/vendas/comissoes.ts`). Comparação
 * explícita com `"boleto_pix"` em vez de `!== "cartao"` — a primeira versão excluía só cartão e
 * deixava `null` passar por engano (achado pelo próprio teste, 21/08/2026). Pura, sem I/O.
 */
export function deveConcluirAoConfirmarParcela(metodoPagamento: MetodoPagamento | null, numeroParcela: number): boolean {
  return metodoPagamento === "boleto_pix" && numeroParcela === 1;
}

/**
 * Efeitos de "a venda foi paga/concluída" — extraída de dentro do webhook `/api/webhooks/asaas`
 * (`processarPagamentoConfirmado`) pra ser compartilhada também com a baixa manual de "recebido em
 * dinheiro" (`src/lib/asaas/adapter.ts`, `marcarParcelaRecebidaEmDinheiroDoContrato`), que não passa
 * pelo webhook (a Asaas usa um status diferente, `RECEIVED_IN_CASH`, pra esse caminho).
 */
export async function concluirVenda(contrato: { id: string; oportunidadeId: string; pessoaSignatarioId: string }): Promise<void> {
  await atualizarStatusContrato(contrato.id, "concluida");
  await sincronizarEtapaKanban(contrato.oportunidadeId, "ganha");

  const unidadeNegocioId = await buscarUnidadeNegocioDaPessoa(contrato.pessoaSignatarioId);
  if (unidadeNegocioId) {
    await promoverPessoaACliente(contrato.pessoaSignatarioId, unidadeNegocioId);
  } else {
    console.error(`[concluirVenda] pessoa ${contrato.pessoaSignatarioId} sem unidade de negócio — não promovida a cliente`);
  }
}
