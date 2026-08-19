import type { StatusContrato } from "./contratos";

/**
 * Colunas do Kanban de Vendas — SEM relação com src/lib/motor-fluxo/kanban.ts (Kanban do CRM,
 * quadro diferente, dados diferentes). Ordem = ordem de progressão da venda. Etapas 2/3/5 são
 * automáticas (o sistema avança sozinho); 4/6 esperam ação humana confirmada por webhook.
 */
export const ESTAGIOS_VENDA: { valor: StatusContrato; rotulo: string; cor: string }[] = [
  { valor: "nova_oportunidade", rotulo: "Nova Oportunidade", cor: "#a78bfa" },
  { valor: "emitindo_contrato", rotulo: "Emitindo Contrato", cor: "#fb923c" },
  { valor: "envelopando_assinaturas", rotulo: "Envelopando Assinaturas", cor: "#fbbf24" },
  { valor: "aguardando_assinaturas", rotulo: "Aguardando Assinaturas", cor: "#facc15" },
  { valor: "gerando_financeiro", rotulo: "Gerando Financeiro", cor: "#38bdf8" },
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
