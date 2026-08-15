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
 * neste ciclo de espera. Só considera itens de WhatsApp — itens de e-mail (nutrição pós-perda,
 * ordem 8-10 na agenda Padrão) ficam fora do escopo deste motor por ora: não existe canal de
 * e-mail conectado, e a "fase de nutrição pós-perda" ainda precisa de desenho próprio
 * (SCRIPT_LIMPANOME_SERASA_SPC.md: "'Perdida' não é 100% terminal... precisa de suporte no
 * sistema" — suporte esse que ainda não existe).
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
    .filter((item) => item.canal === "whatsapp" && item.ordem > proximoItemAgenda)
    .sort((a, b) => a.ordem - b.ordem)[0];

  if (!proximoPendente) return null;

  const disparoPrevistoEm =
    aguardandoDesde.getTime() + offsetEmMs(proximoPendente.intervaloValor, proximoPendente.intervaloUnidade);

  return agora.getTime() >= disparoPrevistoEm ? proximoPendente : null;
}

export const MOTIVO_PERDA_SEM_RESPOSTA = "LEAD PAROU DE RESPONDER";
