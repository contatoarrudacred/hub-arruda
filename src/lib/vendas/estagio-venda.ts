import type { StatusContrato } from "./contratos";

/**
 * Colunas do Kanban de Vendas — SEM relação com src/lib/motor-fluxo/kanban.ts (Kanban do CRM,
 * quadro diferente, dados diferentes). Ordem = ordem de progressão da venda. Etapas 2/4 são
 * automáticas (o sistema avança sozinho); 3/5 esperam ação humana confirmada por webhook.
 *
 * "Emitindo Contrato" cobre PDF + envio pra Assinafy num só card/coluna (decisão do Luiz,
 * 20/08/2026) — antes existia uma coluna própria "Envelopando Assinaturas" entre as duas, mas as
 * duas etapas já rodavam automaticamente uma atrás da outra sem nenhuma pausa humana no meio
 * (ver tentarEmitirContrato em progressao.ts, que já encadeia direto pra tentarEnvelopar), então a
 * coluna extra não representava nenhum estado real intermediário — só ficava sempre vazia.
 */
export const ESTAGIOS_VENDA: { valor: StatusContrato; rotulo: string; cor: string }[] = [
  { valor: "nova_oportunidade", rotulo: "Nova Oportunidade", cor: "#a78bfa" },
  { valor: "emitindo_contrato", rotulo: "Emitindo Contrato", cor: "#fb923c" },
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
