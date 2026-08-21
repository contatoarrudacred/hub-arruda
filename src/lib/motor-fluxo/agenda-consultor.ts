// Cálculo puro de horários disponíveis pra agendamento com consultor — spec
// docs/superpowers/specs/2026-08-20-agendamento-consultor-alto-valor.md
//
// Puro e testável: "agora" é sempre parâmetro injetável, nunca lido de Date.now() direto — mesmo
// padrão de calculo-vencimentos-pagamento.ts / motor-followup.ts.
//
// Fuso horário: America/Sao_Paulo é UTC-3 fixo desde nov/2019 (Brasil não observa mais horário de
// verão) — por isso um offset fixo é seguro aqui, sem precisar de biblioteca de fuso horário (mesma
// leitura de partes locais via Intl.DateTimeFormat já usada em motor-followup.ts).

const FUSO_OFFSET_HORAS = 3; // America/Sao_Paulo = UTC-3

const DURACAO_PADRAO_MINUTOS = 60;
const LIMITE_DIAS_JANELA = 1; // hoje até hoje+1, nunca além disso
const QUANTIDADE_PADRAO = 2;

/** Dia da semana na mesma convenção de `Date.getUTCDay()`/coluna `dia_semana` — 0 = domingo. */
export type JanelaDisponibilidade = { diaSemana: number; horaInicio: number; horaFim: number };
export type PeriodoOcupado = { inicio: Date; fim: Date };
export type HorarioCandidato = { inicio: Date; fim: Date };

type PartesSaoPaulo = { ano: number; mes: number; dia: number; diaSemana: number; hora: number };

const MAPA_DIA_SEMANA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function partesSaoPaulo(data: Date): PartesSaoPaulo {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(data);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  const diaSemanaTexto = partes.find((p) => p.type === "weekday")?.value ?? "";
  return {
    ano: valor("year"),
    mes: valor("month") - 1,
    dia: valor("day"),
    diaSemana: MAPA_DIA_SEMANA[diaSemanaTexto] ?? 0,
    hora: valor("hour"),
  };
}

/** Constrói o instante UTC correspondente a uma hora cheia local (São Paulo) num dia calendário dado. */
function horarioSaoPaulo(ano: number, mes: number, dia: number, hora: number): Date {
  return new Date(Date.UTC(ano, mes, dia, hora + FUSO_OFFSET_HORAS, 0, 0));
}

function turnoDe(hora: number): "manha" | "tarde" | "noite" {
  if (hora < 12) return "manha";
  if (hora < 18) return "tarde";
  return "noite";
}

function sobrepoe(candidato: HorarioCandidato, ocupado: PeriodoOcupado): boolean {
  return candidato.inicio < ocupado.fim && candidato.fim > ocupado.inicio;
}

/**
 * Até `quantidade` horários (2 por padrão) dentro da janela "hoje até hoje+1" (nunca além, nunca
 * domingo), respeitando a disponibilidade do consultor e sem sobrepor agendamentos já confirmados.
 * Tenta diversificar dia/turno entre as opções escolhidas — se não der (poucos horários livres),
 * completa com o que sobrar em vez de devolver menos que `quantidade`.
 */
export function calcularHorariosDisponiveis(params: {
  disponibilidade: JanelaDisponibilidade[];
  agendamentosExistentes: PeriodoOcupado[];
  agora: Date;
  duracaoMinutos?: number;
  quantidade?: number;
}): HorarioCandidato[] {
  const { disponibilidade, agendamentosExistentes, agora, duracaoMinutos = DURACAO_PADRAO_MINUTOS, quantidade = QUANTIDADE_PADRAO } = params;
  const duracaoMs = duracaoMinutos * 60 * 1000;
  const agoraSp = partesSaoPaulo(agora);

  const candidatos: HorarioCandidato[] = [];
  for (let offsetDia = 0; offsetDia <= LIMITE_DIAS_JANELA; offsetDia++) {
    const diaAlvo = agoraSp.dia + offsetDia;
    const diaSemanaAlvo = (agoraSp.diaSemana + offsetDia) % 7;
    if (diaSemanaAlvo === 0) continue; // sem domingo

    const janelasDoDia = disponibilidade.filter((j) => j.diaSemana === diaSemanaAlvo);
    for (const janela of janelasDoDia) {
      for (let hora = janela.horaInicio; hora <= janela.horaFim; hora++) {
        const inicio = horarioSaoPaulo(agoraSp.ano, agoraSp.mes, diaAlvo, hora);
        if (inicio <= agora) continue; // nunca oferece horário que já passou
        const fim = new Date(inicio.getTime() + duracaoMs);
        candidatos.push({ inicio, fim });
      }
    }
  }
  candidatos.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

  const livres = candidatos.filter((c) => !agendamentosExistentes.some((ocupado) => sobrepoe(c, ocupado)));

  const chaveDiaTurno = (c: HorarioCandidato) => {
    const p = partesSaoPaulo(c.inicio);
    return `${p.dia}-${turnoDe(p.hora)}`;
  };

  const escolhidos: HorarioCandidato[] = [];
  const chavesUsadas = new Set<string>();
  for (const c of livres) {
    if (escolhidos.length >= quantidade) break;
    const chave = chaveDiaTurno(c);
    if (chavesUsadas.has(chave)) continue;
    chavesUsadas.add(chave);
    escolhidos.push(c);
  }
  // Não deu pra diversificar o suficiente (poucos horários livres) — completa com o que sobrar em
  // vez de devolver menos que `quantidade`.
  if (escolhidos.length < quantidade) {
    for (const c of livres) {
      if (escolhidos.length >= quantidade) break;
      if (!escolhidos.includes(c)) escolhidos.push(c);
    }
  }
  return escolhidos;
}
