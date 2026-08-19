import type { StatusContrato } from "./contratos";

/**
 * Colunas do Painel de Vendas (Kanban/lista) — SEM relação com src/lib/motor-fluxo/kanban.ts
 * (Kanban do CRM, quadro diferente, dados diferentes). Ordem = ordem de progressão da venda.
 */
export const ESTAGIOS_VENDA: { valor: StatusContrato; rotulo: string; cor: string }[] = [
  { valor: "contrato_gerado", rotulo: "Emissão Contrato", cor: "#fb923c" },
  { valor: "aguardando_assinatura", rotulo: "Assinatura", cor: "#fbbf24" },
  { valor: "assinado", rotulo: "Assinado", cor: "#a3e635" },
  { valor: "parcelas_emitidas", rotulo: "Emissão Parcelas", cor: "#38bdf8" },
  { valor: "aguardando_pagamento", rotulo: "Aguardando Pagamento", cor: "#818cf8" },
  { valor: "concluida", rotulo: "Concluída", cor: "#4ade80" },
  { valor: "cancelada", rotulo: "Cancelada", cor: "#f87171" },
];

const POR_VALOR = new Map(ESTAGIOS_VENDA.map((e) => [e.valor, e]));

export function rotuloEstagio(status: StatusContrato): string {
  return POR_VALOR.get(status)?.rotulo ?? status;
}

export function corEstagio(status: StatusContrato): string {
  return POR_VALOR.get(status)?.cor ?? "#a1a1aa";
}

/** Estágios terminais — a venda não sai deles sozinha. */
export function ehEstagioTerminal(status: StatusContrato): boolean {
  return status === "concluida" || status === "cancelada";
}
