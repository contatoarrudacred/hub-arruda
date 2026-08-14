// Regras de negócio específicas do produto Limpeza de Nome Serasa/SPC — corte de alto valor,
// cálculo de proposta por faixa e fórmula de alto valor (PLANO_MESTRE seções 8.6-8.9,
// KANBAN_COMERCIAL_LIMPANOME.md, SCRIPT_LIMPANOME_SERASA_SPC.md Passos 6-7 e 15).
//
// Deliberadamente fora do motor de fluxo genérico (engine.ts): isto é lógica do produto, não do
// motor — outros produtos (Fase futura) terão suas próprias regras de qualificação/preço.

import type { DadosConversa } from "./tipos";

export type FaixaPreco = {
  faixaMin: number;
  faixaMax: number | null;
  precoCheio: number | null;
  precoAvista: number | null;
  parcelasBoletoQtd: number | null;
  parcelasBoletoValor: number | null;
  parcelasCartaoMax: number | null;
  voucherAvista: number | null;
  voucherParcelasQtd: number | null;
  voucherParcelasValor: number | null;
};

export type ConfigPrecificacaoLimpaNome = {
  investimentoMinimoAvista: number;
  investimentoMinimoParcelasQtd: number;
  investimentoMinimoParcelasValor: number;
  altoValorFixo: number;
  altoValorPercentual: number;
  corteAltoValor: number;
};

/** Converte as respostas já capturadas (faixa_valor / faixa_valor_detalhe / valor_aproximado) num valor representativo em reais. */
export function resolverValorRestricao(dados: DadosConversa): number | null {
  const faixa = dados.faixa_valor;

  if (faixa === "menos_10mil") {
    if (dados.faixa_valor_detalhe === "menos_3mil") return 2000;
    if (dados.faixa_valor_detalhe === "3_10mil") return 6000;
    return null;
  }
  if (faixa === "10_30mil") return 20000;
  if (faixa === "30_50mil") return 40000;
  if (faixa === "50_100mil") return 75000;
  if (faixa === "mais_100mil") {
    const bruto = dados.valor_aproximado;
    if (!bruto || bruto === "nao_sei") {
      // Sem valor informado — trata como alto valor por segurança (aciona qualificação para
      // call com Luiz em vez de arriscar subprecificar uma restrição potencialmente grande).
      return 600_000;
    }
    const numero = Number(bruto);
    return Number.isNaN(numero) ? 600_000 : numero;
  }
  return null;
}

export function classificarAltoValor(
  valorRestricao: number | null,
  corteAltoValor: number,
): boolean {
  if (valorRestricao === null) return false;
  return valorRestricao > corteAltoValor;
}

export function calcularFormulaAltoValor(
  valorRestricao: number,
  fixo: number,
  percentual: number,
): number {
  return fixo + percentual * valorRestricao;
}

export function buscarFaixaPreco(
  valorRestricao: number,
  faixas: FaixaPreco[],
): FaixaPreco | null {
  return (
    faixas.find(
      (f) => valorRestricao >= f.faixaMin && (f.faixaMax === null || valorRestricao <= f.faixaMax),
    ) ?? null
  );
}

export function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Bloco de proposta (Passo 15) para restrição abaixo de R$3 mil — usa o valor mínimo fixo, não a tabela por faixa. */
export function montarPropostaBaixoValor(config: ConfigPrecificacaoLimpaNome): string[] {
  return [
    `📎 PROPOSTA LIMPA NOME - SPC/SERASA\nComo o valor das restrições é menor, aplicamos nosso investimento mínimo:\n\n📌 *Á vista*: ${formatarReais(config.investimentoMinimoAvista)}\nou\n📌 *Parcelado*: ${config.investimentoMinimoParcelasQtd}x de ${formatarReais(config.investimentoMinimoParcelasValor)}`,
    `🙋‍♂️Como fica melhor para você fechar HOJE?\n\n👉 *À vista ou parcelado?*`,
  ];
}

/** Bloco de proposta (Passo 15) padrão — restrição dentro da tabela por faixa (até R$500 mil). */
export function montarPropostaPorFaixa(
  faixaPreco: FaixaPreco,
  quisPrioridadeHoje: boolean,
): string[] {
  const mensagens: string[] = [
    `A proposta é elaborada de acordo com as suas restrições e as condições de pagamento variam ao longo do mês. Se você já decidiu limpar seu nome, aproveite a condição especial que conseguimos liberar hoje utilizando por conta do fechamento da nossa meta`,
    `📎 PROPOSTA LIMPA NOME - SPC/SERASA\nPacote fechado para limpar seu nome nos 4 maiores órgãos de proteção de crédito: SERASA, SPC BOA VISTA, SPC BRASIL e CENPROT. Todos os tipos de restrições inclusos: boletos, duplicadas, ações judicias, protestos, cartões de crédito e restrições bancárias. Preço já engloba custas processuais, honorários, despesas gerais e blindagem:\n\n👉 Prazo: De 7 até 45 dias úteis\n👉 Seguro-Garantia: 1 ano\n👉 Bacen: não incluso.`,
  ];

  if (faixaPreco.precoCheio && faixaPreco.precoAvista) {
    mensagens.push(
      `👉 *PREÇO JÁ COM DESCONTO para pagamento Boleto/Pix sendo primeira parcela imediata junto com a assinatura do contrato*:\n\n📌 *Especial à vista*:\n~De: ${formatarReais(faixaPreco.precoCheio)}~\nPor: ${formatarReais(faixaPreco.precoAvista)} parcela única\n\nou\n\n📌 *Parcelado Boleto/Pix*:\n${faixaPreco.parcelasBoletoQtd}x ${formatarReais(faixaPreco.parcelasBoletoValor ?? 0)} ou ainda em até ${faixaPreco.parcelasCartaoMax}x no cartão.`,
    );
  }

  if (quisPrioridadeHoje && faixaPreco.voucherAvista) {
    mensagens.push(
      `💥💥 *Condição Especial*\n_Fechando agora com voucher especial (válido por 24h):_\n\n👉 *${formatarReais(faixaPreco.voucherAvista)}* à vista ou ${faixaPreco.voucherParcelasQtd} vezes de ${formatarReais(faixaPreco.voucherParcelasValor ?? 0)} 🤩`,
    );
  }

  mensagens.push(`🙋‍♂️Como fica melhor para você fechar HOJE?\n\n👉 *À vista ou parcelado?*`);

  return mensagens;
}

/** Bloco de qualificação para alto valor (>R$500 mil) — PLANO_MESTRE seção 8.6: qualifica e tenta agendar call com Luiz antes de propor. */
export function montarQualificacaoAltoValor(): string[] {
  return [
    `Pelo que você me contou, esse é um caso que merece atenção especial — vale a pena conversarmos por ligação para eu te apresentar a proposta com todo o cuidado que ela precisa.`,
    `👉 *Podemos agendar uma ligação com nosso especialista, ou prefere já receber a proposta por aqui mesmo?*\n\n1️⃣ Quero agendar a ligação\n2️⃣ Prefiro receber por WhatsApp`,
  ];
}

/** Bloco de proposta self-service para quem recusou a call de alto valor — usa a mesma fórmula de previsibilidade do Kanban. */
export function montarPropostaAltoValorSelfService(
  valorEstimado: number,
): string[] {
  return [
    `Sem problema! Com base no que você me passou, o investimento estimado para o seu caso é de ${formatarReais(valorEstimado)}.`,
    `🙋‍♂️Como fica melhor para você fechar HOJE?\n\n👉 *À vista ou parcelado?*`,
  ];
}
