// src/lib/marketing/agendador.ts
// Agente Agendador (Fase 4e, 20/08/2026) — decide o próximo horário livre da agenda de publicação
// de uma propriedade, pra processar-pauta.ts criar o post no WordPress já com `status: "future"`
// pra esse horário em vez de publicar na hora (ver docs/MODULO_MARKETING_CONTEUDO_ARRUDACRED.md,
// Fase 4e). Diferente dos outros agentes (estrategista/escritor/revisor), este é puro/sem I/O —
// quem carrega os agendamentos já existentes é repositorio.ts (carregarProximosAgendamentos);
// processar-pauta.ts só chama esta função com os dados já em mão.

// Mesma decisão de processar-pauta.ts (obterMomentoSaoPaulo): Brasília não observa horário de
// verão desde 2019, então o offset -03:00 é fixo e seguro de embutir sem lib de fuso horário nova.
const OFFSET_SAO_PAULO = "-03:00";

// Guarda-corpo — nunca deveria chegar perto disso na prática (propriedade com horários
// configurados publica bem mais que 1x/mês).
const LIMITE_DIAS_BUSCA = 30;

function diaISOEmSaoPaulo(data: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(data);
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

function somarDiasISO(diaISO: string, dias: number): string {
  const [ano, mes, dia] = diaISO.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

/**
 * Primeiro slot, varrendo dia a dia a partir de hoje (fuso de Brasília) e horário a horário na
 * ordem em que aparecem em `horariosPublicacao`, que esteja depois de `agora` e não coincida
 * (mesmo instante) com nenhum item de `jaAgendados` — outro post desta propriedade já ocupando
 * aquele horário. `horariosPublicacao` é recebido já validado/ordenado (validação fica na tela de
 * Propriedades Digitais, ver propriedades-client.tsx).
 */
export function decidirProximoHorario(horariosPublicacao: string[], jaAgendados: Date[], agora: Date): Date {
  if (horariosPublicacao.length === 0) {
    throw new Error("decidirProximoHorario chamado sem horários de publicação configurados.");
  }

  const ocupados = new Set(jaAgendados.map((data) => data.toISOString()));
  let diaISO = diaISOEmSaoPaulo(agora);

  for (let i = 0; i <= LIMITE_DIAS_BUSCA; i++) {
    for (const horario of horariosPublicacao) {
      const candidato = new Date(`${diaISO}T${horario}:00${OFFSET_SAO_PAULO}`);
      if (candidato > agora && !ocupados.has(candidato.toISOString())) {
        return candidato;
      }
    }
    diaISO = somarDiasISO(diaISO, 1);
  }

  throw new Error(`Nenhum horário de publicação livre encontrado nos próximos ${LIMITE_DIAS_BUSCA} dias.`);
}
