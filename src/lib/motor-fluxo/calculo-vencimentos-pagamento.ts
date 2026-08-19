// Cálculo de vencimentos do detalhe de pagamento no fechamento — spec:
// docs/superpowers/specs/2026-08-18-captura-detalhe-pagamento-fechamento-design.md
//
// Puro e testável: "agora"/"hoje" é sempre parâmetro injetável com default `new Date()`, nunca lido
// de Date.now() direto dentro da função — mesmo padrão de saudacaoPorHorario (engine.ts) e
// selo-risco.ts.

import type { ParcelaTier } from "./regras-limpeza-nome";

export const LIMITE_DIAS_ADIAR_PRIMEIRA_PARCELA = 15;
export const DIAS_ANCORA_VALIDOS = [1, 10, 20] as const;
export type DiaAncora = (typeof DIAS_ANCORA_VALIDOS)[number];

function paraISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** Data de hoje em ISO (YYYY-MM-DD), sem hora — base pra "1ª parcela vence hoje" por padrão. */
export function dataDeHojeISO(agora: Date = new Date()): string {
  return paraISO(agora);
}

/**
 * Valida se a data de 1ª parcela pedida pelo lead está dentro da regra (hoje até +15 dias, nunca
 * antes de hoje). `dataPedidaISO`/`hojeISO` em ISO (YYYY-MM-DD). `null` = fora da regra ou inválida.
 */
export function validarDataPrimeiraParcela(dataPedidaISO: string, hojeISO: string): string | null {
  const pedida = new Date(`${dataPedidaISO}T00:00:00Z`);
  const hoje = new Date(`${hojeISO}T00:00:00Z`);
  if (Number.isNaN(pedida.getTime())) return null;
  const diffDias = Math.round((pedida.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDias < 0 || diffDias > LIMITE_DIAS_ADIAR_PRIMEIRA_PARCELA) return null;
  return dataPedidaISO;
}

export type ParcelaCalculada = { numero: number; valor: number; vencimento: string };

/**
 * Vencimento de UMA parcela: a 1ª cai exatamente na data confirmada; da 2ª em diante, no dia-âncora
 * do mês seguinte ao mês em que caiu a 1ª parcela, avançando um mês por parcela — nunca do mês da
 * venda (regra confirmada com o Luiz, 18/08/2026: se a 1ª parcela foi adiada pra outro mês, a
 * contagem parte do mês em que ela caiu). `Date.UTC` com mês > 11 rola o ano sozinho.
 */
function vencimentoParcela(dataPrimeiraParcelaISO: string, diaAncora: DiaAncora, numeroParcela: number): string {
  if (numeroParcela === 1) return dataPrimeiraParcelaISO;
  const primeira = new Date(`${dataPrimeiraParcelaISO}T00:00:00Z`);
  const data = new Date(
    Date.UTC(primeira.getUTCFullYear(), primeira.getUTCMonth() + (numeroParcela - 1), diaAncora),
  );
  return paraISO(data);
}

/**
 * Expande os tiers já combinados pela precificação (`combinarParcelas`/`combinarFaixasPacote`, em
 * regras-limpeza-nome.ts — cada tier é "N meses seguidos neste valor mensal") numa lista de parcelas
 * individuais com número/valor/vencimento, uma por mês, na ordem dos tiers.
 */
export function expandirParcelas(
  tiers: ParcelaTier[],
  dataPrimeiraParcelaISO: string,
  diaAncora: DiaAncora,
): ParcelaCalculada[] {
  const parcelas: ParcelaCalculada[] = [];
  let numero = 1;
  for (const tier of tiers) {
    for (let i = 0; i < tier.quantidade; i++) {
      parcelas.push({
        numero,
        valor: tier.valor,
        vencimento: vencimentoParcela(dataPrimeiraParcelaISO, diaAncora, numero),
      });
      numero++;
    }
  }
  return parcelas;
}
