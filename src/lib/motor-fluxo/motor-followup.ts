import type { ItemAgendaFollowupCarregado } from "./repositorio";

// Motor de decisão do disparo de follow-up (Fase 6) — puro/testável, sem Supabase, igual ao
// motor de fluxo principal (engine.ts). Quem lê o banco e efetivamente grava é o cron
// (src/app/api/cron/followups/route.ts) e persistencia.ts; aqui só mora "dado o estado atual,
// o que (se algo) deveria disparar agora?".
//
// Os intervalos de cada item (10min, 45min, 4h, 24h...) são sempre contados a partir do MESMO
// ponto de origem — o instante em que a Malala mandou a última mensagem que aguardava resposta
// (conversas.aguardando_resposta_desde) — não a partir do item anterior disparado. Confirmado
// por Luiz: os rótulos da agenda Padrão ("10 dias" pro item de encerramento logo depois de "7
// dias") só fazem sentido como offsets absolutos, não cumulativos.

const FUSO_ARRUDACRED = "America/Sao_Paulo";
const JANELA_COMERCIAL_INICIO_HORA = 9;
const JANELA_COMERCIAL_FIM_HORA = 21;

const MS_POR_UNIDADE: Record<ItemAgendaFollowupCarregado["intervaloUnidade"], number> = {
  minutos: 60_000,
  horas: 3_600_000,
  dias: 86_400_000,
};

export function offsetEmMs(
  intervaloValor: number,
  intervaloUnidade: ItemAgendaFollowupCarregado["intervaloUnidade"],
): number {
  return intervaloValor * MS_POR_UNIDADE[intervaloUnidade];
}

/**
 * Janela comercial confirmada por Luiz: 09h-21h, todo dia menos domingo (SCRIPT_LIMPANOME_SERASA_SPC.md).
 * Gap conhecido, documentado — sem calendário de feriados ainda (precisaria de uma fonte de datas,
 * possivelmente variando por município; fica pra quando isso incomodar de verdade).
 */
export function dentroJanelaComercial(agora: Date): boolean {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO_ARRUDACRED,
    hour: "numeric",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(agora);

  const hora = Number(partes.find((p) => p.type === "hour")?.value);
  const diaSemana = partes.find((p) => p.type === "weekday")?.value;

  if (diaSemana === "Sun") return false;
  return hora >= JANELA_COMERCIAL_INICIO_HORA && hora < JANELA_COMERCIAL_FIM_HORA;
}

export function podeDispararAgora(item: ItemAgendaFollowupCarregado, agora: Date): boolean {
  if (!item.respeitaJanelaComercial) return true;
  return dentroJanelaComercial(agora);
}

/**
 * Decide qual item da agenda (se algum) deveria disparar agora, dado o que já foi disparado
 * neste ciclo de espera. Considera a régua inteira, WhatsApp e e-mail — Luiz confirmou
 * (15/08/2026) que o rastreio continua até o fim de verdade, mesmo depois da oportunidade virar
 * Perdida (item de encerramento): a agenda Padrão segue com 3 tentativas de nutrição por e-mail
 * (30/60/90 dias) depois disso. Quem manda cada tipo (grava em `mensagens` vs. `followup_emails`)
 * é responsabilidade de quem chama (persistencia.ts), não desta função.
 *
 * Retorna null quando não há nada pendente, ou quando o próximo item pendente ainda não venceu.
 * Não verifica janela comercial — isso é responsabilidade de quem chama (podeDispararAgora),
 * separado de propósito pra manter esta função simples de testar.
 */
export function calcularProximoDisparo(
  itens: ItemAgendaFollowupCarregado[],
  proximoItemAgenda: number,
  aguardandoDesde: Date,
  agora: Date,
): ItemAgendaFollowupCarregado | null {
  const proximoPendente = itens
    .filter((item) => item.ordem > proximoItemAgenda)
    .sort((a, b) => a.ordem - b.ordem)[0];

  if (!proximoPendente) return null;

  const disparoPrevistoEm =
    aguardandoDesde.getTime() + offsetEmMs(proximoPendente.intervaloValor, proximoPendente.intervaloUnidade);

  return agora.getTime() >= disparoPrevistoEm ? proximoPendente : null;
}

/**
 * Data prevista do próximo item pendente da agenda, mesmo que ainda não tenha vencido — só pra
 * exibição (chip "follow-up ativo" na Tela de Atendimento, Fase 8 do Bloco B). Não decide se
 * dispara agora (isso é `calcularProximoDisparo`) nem checa janela comercial.
 */
export function proximoDisparoPrevisto(
  itens: ItemAgendaFollowupCarregado[],
  proximoItemAgenda: number,
  aguardandoDesde: Date,
): Date | null {
  const proximoPendente = itens
    .filter((item) => item.ordem > proximoItemAgenda)
    .sort((a, b) => a.ordem - b.ordem)[0];

  if (!proximoPendente) return null;

  return new Date(
    aguardandoDesde.getTime() + offsetEmMs(proximoPendente.intervaloValor, proximoPendente.intervaloUnidade),
  );
}

/** Último item da agenda (maior ordem) — quando ele dispara, a cadência de follow-up termina de vez (relógio para, conversa fecha). Diferente de `encerraAtendimento`, que é sobre marcar a oportunidade como Perdida (acontece antes, no meio da régua). */
export function ehUltimoItemDaAgenda(itens: ItemAgendaFollowupCarregado[], item: ItemAgendaFollowupCarregado): boolean {
  const maiorOrdem = Math.max(...itens.map((i) => i.ordem));
  return item.ordem === maiorOrdem;
}

export const MOTIVO_PERDA_SEM_RESPOSTA = "LEAD PAROU DE RESPONDER";
