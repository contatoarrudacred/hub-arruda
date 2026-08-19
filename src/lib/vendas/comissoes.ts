import { createClient } from "@/lib/supabase/server";
import { buscarUnidadeNegocioDaPessoa, promoverPessoaACliente } from "./clientes";
import { calcularParcelas } from "./calculo-parcelas";
import { sincronizarEtapaKanban } from "./oportunidades";
import { atualizarStatusContrato, buscarContratoPorOportunidade, criarContratoComissionado } from "./contratos";

type FornecedorProdutoRegra = {
  fornecedor_id: string;
  percentual_comissao: number;
  forma_comissao: "parcela_unica" | "parcelado";
  comissao_parcelas_qtd: number | null;
  comissao_dias_primeira_parcela: number;
  comissao_intervalo_dias_parcelas: number | null;
};

/**
 * Ação "Confirmar venda" pra produtos comissionados (spec seção 3.4) — sem contrato/Assinafy, o
 * "Ganha" da Oportunidade é a confirmação do fornecedor, não o recebimento da comissão em si.
 * `dataAssinaturaCliente` é a data real em que o cliente assinou com o FORNECEDOR (informada
 * manualmente pelo admin — hoje não existe integração automatizada com cada administradora que
 * avise isso sozinha), não a data em que o admin está confirmando aqui no sistema.
 */
export async function confirmarVendaComissionada(oportunidadeId: string, dataAssinaturaCliente: Date): Promise<void> {
  const supabase = await createClient();

  const { data: oportunidade, error: erroOportunidade } = await supabase
    .from("oportunidades")
    .select("id, pessoa_id, produto_id, valor_estimado, produtos(fornecedor_id)")
    .eq("id", oportunidadeId)
    .single();
  if (erroOportunidade) throw new Error(`Falha ao buscar oportunidade: ${erroOportunidade.message}`);

  const produto = oportunidade.produtos as unknown as { fornecedor_id: string | null } | { fornecedor_id: string | null }[] | null;
  const fornecedorId = (Array.isArray(produto) ? produto[0]?.fornecedor_id : produto?.fornecedor_id) ?? null;
  if (!fornecedorId) throw new Error("Produto comissionado sem fornecedor definido.");

  const { data: regra, error: erroRegra } = await supabase
    .from("fornecedor_produtos")
    .select("fornecedor_id, percentual_comissao, forma_comissao, comissao_parcelas_qtd, comissao_dias_primeira_parcela, comissao_intervalo_dias_parcelas")
    .eq("fornecedor_id", fornecedorId)
    .eq("produto_id", oportunidade.produto_id)
    .eq("ativo", true)
    .single();
  if (erroRegra) throw new Error(`Falha ao buscar regra de comissão: ${erroRegra.message}`);

  const regraTipada = regra as FornecedorProdutoRegra;
  const valorEstimado = oportunidade.valor_estimado ?? 0;
  const valorComissaoTotal = (valorEstimado * regraTipada.percentual_comissao) / 100;
  const qtdParcelas = regraTipada.forma_comissao === "parcelado" ? (regraTipada.comissao_parcelas_qtd ?? 1) : 1;

  const primeiraParcela = new Date(dataAssinaturaCliente);
  primeiraParcela.setDate(primeiraParcela.getDate() + regraTipada.comissao_dias_primeira_parcela);

  const parcelas = calcularParcelas(valorComissaoTotal, qtdParcelas, primeiraParcela, regraTipada.comissao_intervalo_dias_parcelas ?? 30);

  const { error: erroInsert } = await supabase.from("comissoes_fornecedor_receber").insert(
    parcelas.map((parcela) => ({
      oportunidade_id: oportunidadeId,
      fornecedor_id: fornecedorId,
      produto_id: oportunidade.produto_id,
      numero: parcela.numero,
      valor: parcela.valor,
      data_prevista: parcela.vencimento.toISOString().slice(0, 10),
    })),
  );
  if (erroInsert) throw new Error(`Falha ao gerar comissões: ${erroInsert.message}`);

  // Registra a venda no Painel de Vendas — direto em aguardando_pagamento (pula os estágios de
  // contrato/assinatura, que não existem pra comissionado): a venda só chega aqui depois de já
  // aprovada pelo fornecedor, não tem fase de espera a modelar.
  await criarContratoComissionado({
    oportunidadeId,
    pessoaSignatarioId: oportunidade.pessoa_id,
    fornecedorId,
    valorTotal: valorComissaoTotal,
  });

  await sincronizarEtapaKanban(oportunidadeId, "ganha");

  const unidadeNegocioId = await buscarUnidadeNegocioDaPessoa(oportunidade.pessoa_id);
  if (unidadeNegocioId) {
    await promoverPessoaACliente(oportunidade.pessoa_id, unidadeNegocioId);
  }
}

/**
 * Marca uma parcela de comissão como recebida do fornecedor — ação manual do admin (não existe
 * webhook de fornecedor pra isso). Quando é a 1ª parcela, a venda avança pra `concluida` no Painel
 * de Vendas (mesmo critério usado pro contrato normal: 1ª parcela paga = venda concluída, o resto é
 * cobrança contínua do financeiro).
 */
export async function marcarComissaoParcelaRecebida(comissaoParcelaId: string, recebidoEm: Date): Promise<void> {
  const supabase = await createClient();

  const { data: parcela, error: erroUpdate } = await supabase
    .from("comissoes_fornecedor_receber")
    .update({ status: "recebido", recebido_em: recebidoEm.toISOString() })
    .eq("id", comissaoParcelaId)
    .select("oportunidade_id, numero")
    .single();
  if (erroUpdate) throw new Error(`Falha ao marcar comissão como recebida: ${erroUpdate.message}`);

  if (parcela.numero !== 1) return;

  const contrato = await buscarContratoPorOportunidade(parcela.oportunidade_id);
  if (contrato) await atualizarStatusContrato(contrato.id, "concluida");
}
