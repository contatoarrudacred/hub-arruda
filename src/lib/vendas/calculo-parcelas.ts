export type Parcela = {
  numero: number;
  valor: number;
  vencimento: Date;
};

export type DiaAncora = 1 | 10 | 20;

/**
 * Divide um valor total em N partes, trabalhando em centavos pra evitar erro de ponto flutuante —
 * a última parte absorve o resto da divisão, garantindo que a soma bate exatamente com o total.
 */
export function dividirValorEmParcelas(valorTotal: number, qtd: number): number[] {
  if (valorTotal < 0) throw new Error("Valor total não pode ser negativo.");
  if (!Number.isInteger(qtd) || qtd < 1) {
    throw new Error("Quantidade de parcelas deve ser um número inteiro maior ou igual a 1.");
  }

  const valorTotalCentavos = Math.round(valorTotal * 100);
  const valorParcelaCentavos = Math.floor(valorTotalCentavos / qtd);
  const restoCentavos = valorTotalCentavos - valorParcelaCentavos * qtd;

  return Array.from({ length: qtd }, (_, i) => {
    const centavosDaParcela = valorParcelaCentavos + (i === qtd - 1 ? restoCentavos : 0);
    return centavosDaParcela / 100;
  });
}

/**
 * Distribui um valor total em N parcelas com vencimento em intervalo fixo de dias — regra usada
 * por comissoes.ts pra parcelas de comissão de fornecedor (fornecedor_produtos.comissao_intervalo_dias_parcelas).
 * Não é a regra de vencimento do contrato com o cliente — ver calcularParcelasContrato pra isso.
 */
export function calcularParcelas(
  valorTotal: number,
  qtd: number,
  primeiroVencimento: Date,
  intervaloDias: number,
): Parcela[] {
  const valores = dividirValorEmParcelas(valorTotal, qtd);

  return valores.map((valor, i) => {
    const vencimento = new Date(primeiroVencimento);
    vencimento.setDate(vencimento.getDate() + intervaloDias * i);
    return { numero: i + 1, valor, vencimento };
  });
}

/**
 * Vencimentos das parcelas de um contrato com o cliente, seguindo a regra de negócio validada com
 * o Luiz em 18/08/2026 (docs/superpowers/specs/2026-08-18-captura-detalhe-pagamento-fechamento-design.md,
 * seção 1) — mesma regra usada pelo CRM na captura via bot, pra manter as duas origens (funil e
 * venda sem funil prévio) consistentes:
 * - 1ª parcela: na data informada (a validação de até +15 dias da venda é responsabilidade de quem
 *   chama, não desta função — a Fechamento de Venda valida, o CRM valida no interpretador dele).
 * - 2ª parcela em diante: dia-âncora fixo (01, 10 ou 20) do mês seguinte ao mês em que caiu a 1ª
 *   parcela, avançando um mês por parcela e rolando o ano quando necessário.
 */
export function calcularVencimentosPorAncora(
  primeiraParcela: Date,
  diaAncora: DiaAncora,
  qtdParcelas: number,
): Date[] {
  if (!Number.isInteger(qtdParcelas) || qtdParcelas < 1) {
    throw new Error("Quantidade de parcelas deve ser um número inteiro maior ou igual a 1.");
  }

  const vencimentos: Date[] = [primeiraParcela];

  let mes = primeiraParcela.getUTCMonth();
  let ano = primeiraParcela.getUTCFullYear();

  for (let i = 1; i < qtdParcelas; i++) {
    mes += 1;
    if (mes > 11) {
      mes = 0;
      ano += 1;
    }
    vencimentos.push(new Date(Date.UTC(ano, mes, diaAncora)));
  }

  return vencimentos;
}

/**
 * Combina dividirValorEmParcelas + calcularVencimentosPorAncora — é o que a tela de Fechamento de
 * Venda e a leitura de conversas.dados.detalhe_pagamento usam pra montar contrato_parcelas.
 */
export function calcularParcelasContrato(
  valorTotal: number,
  qtdParcelas: number,
  primeiraParcela: Date,
  diaAncora: DiaAncora,
): Parcela[] {
  const valores = dividirValorEmParcelas(valorTotal, qtdParcelas);
  const vencimentos = calcularVencimentosPorAncora(primeiraParcela, diaAncora, qtdParcelas);

  return valores.map((valor, i) => ({ numero: i + 1, valor, vencimento: vencimentos[i] }));
}
