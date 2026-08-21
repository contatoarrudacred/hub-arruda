import type { StatusContrato } from "./contratos";

/**
 * Colunas do Kanban de Vendas — SEM relação com src/lib/motor-fluxo/kanban.ts (Kanban do CRM,
 * quadro diferente, dados diferentes). Ordem = ordem de progressão da venda. Etapa 2 é automática
 * (o sistema avança sozinho); 3 espera ação humana confirmada por webhook.
 *
 * "Emitindo Contrato" cobre PDF + envio pra Assinafy num só card/coluna (decisão do Luiz,
 * 20/08/2026) — antes existia uma coluna própria "Envelopando Assinaturas" entre as duas, mas as
 * duas etapas já rodavam automaticamente uma atrás da outra sem nenhuma pausa humana no meio
 * (ver tentarEmitirContrato em progressao.ts, que já encadeia direto pra tentarEnvelopar), então a
 * coluna extra não representava nenhum estado real intermediário — só ficava sempre vazia.
 *
 * "Gerando Financeiro" removida pelo mesmo motivo (decisão do Luiz, 20/08/2026): assim que o
 * webhook document_ready da Assinafy confirma a assinatura, o sistema já tenta criar a cobrança na
 * Asaas na hora — se der certo, pula direto pra "Aguardando Pagamento"; se falhar, o erro fica
 * visível em "Aguardando Assinaturas" mesmo (ver tentarGerarFinanceiro em progressao.ts). Nenhum
 * contrato jamais teve `status = 'gerando_financeiro'` de verdade — coluna sempre vazia.
 */
export const ESTAGIOS_VENDA: { valor: StatusContrato; rotulo: string; cor: string }[] = [
  { valor: "nova_oportunidade", rotulo: "Nova Oportunidade", cor: "#a78bfa" },
  { valor: "emitindo_contrato", rotulo: "Emitindo Contrato", cor: "#fb923c" },
  { valor: "aguardando_assinaturas", rotulo: "Aguardando Assinaturas", cor: "#facc15" },
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
