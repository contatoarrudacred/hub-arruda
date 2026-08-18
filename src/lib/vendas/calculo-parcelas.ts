export type Parcela = {
  numero: number;
  valor: number;
  vencimento: Date;
};

/**
 * Distribui um valor total em N parcelas (usado tanto pela tela de Fechamento de Venda pra
 * montar a tabela de vencimentos do contrato, quanto por comissoes.ts pra distribuir comissão de
 * fornecedor). Trabalha em centavos pra evitar erro de ponto flutuante — a última parcela absorve
 * o resto da divisão, garantindo que a soma bate exatamente com valorTotal.
 */
export function calcularParcelas(
  valorTotal: number,
  qtd: number,
  primeiroVencimento: Date,
  intervaloDias: number,
): Parcela[] {
  if (valorTotal < 0) throw new Error("Valor total não pode ser negativo.");
  if (!Number.isInteger(qtd) || qtd < 1) {
    throw new Error("Quantidade de parcelas deve ser um número inteiro maior ou igual a 1.");
  }

  const valorTotalCentavos = Math.round(valorTotal * 100);
  const valorParcelaCentavos = Math.floor(valorTotalCentavos / qtd);
  const restoCentavos = valorTotalCentavos - valorParcelaCentavos * qtd;

  const parcelas: Parcela[] = [];
  for (let i = 0; i < qtd; i++) {
    const centavosDaParcela = valorParcelaCentavos + (i === qtd - 1 ? restoCentavos : 0);
    const vencimento = new Date(primeiroVencimento);
    vencimento.setDate(vencimento.getDate() + intervaloDias * i);
    parcelas.push({ numero: i + 1, valor: centavosDaParcela / 100, vencimento });
  }

  return parcelas;
}
