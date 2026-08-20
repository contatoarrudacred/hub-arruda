import { describe, expect, it } from "vitest";
import { calcularHorariosDisponiveis, type JanelaDisponibilidade } from "./agenda-consultor";

// Disponibilidade padrão pedida por Luiz: seg-sex 10h-21h, sáb 10h-15h, sem domingo.
const DISPONIBILIDADE_PADRAO: JanelaDisponibilidade[] = [
  { diaSemana: 1, horaInicio: 10, horaFim: 21 },
  { diaSemana: 2, horaInicio: 10, horaFim: 21 },
  { diaSemana: 3, horaInicio: 10, horaFim: 21 },
  { diaSemana: 4, horaInicio: 10, horaFim: 21 },
  { diaSemana: 5, horaInicio: 10, horaFim: 21 },
  { diaSemana: 6, horaInicio: 10, horaFim: 15 },
];

describe("calcularHorariosDisponiveis", () => {
  it("quinta 08h SP: oferece 2 horários no mesmo dia (turnos diferentes) quando o dia inteiro está livre", () => {
    const agora = new Date("2026-08-20T11:00:00Z"); // quinta, 08h São Paulo
    const resultado = calcularHorariosDisponiveis({ disponibilidade: DISPONIBILIDADE_PADRAO, agendamentosExistentes: [], agora });

    expect(resultado).toEqual([
      { inicio: new Date("2026-08-20T13:00:00Z"), fim: new Date("2026-08-20T14:00:00Z") }, // 10h SP
      { inicio: new Date("2026-08-20T15:00:00Z"), fim: new Date("2026-08-20T16:00:00Z") }, // 12h SP (próximo turno)
    ]);
  });

  it("diversifica por DIA quando só há 1 horário livre por dia", () => {
    const disponibilidadeEstreita: JanelaDisponibilidade[] = [
      { diaSemana: 4, horaInicio: 20, horaFim: 20 }, // quinta, só 20h
      { diaSemana: 5, horaInicio: 10, horaFim: 10 }, // sexta, só 10h
    ];
    const agora = new Date("2026-08-20T11:00:00Z"); // quinta, 08h SP
    const resultado = calcularHorariosDisponiveis({ disponibilidade: disponibilidadeEstreita, agendamentosExistentes: [], agora });

    expect(resultado.map((r) => r.inicio.toISOString())).toEqual([
      "2026-08-20T23:00:00.000Z", // quinta 20h SP
      "2026-08-21T13:00:00.000Z", // sexta 10h SP
    ]);
  });

  it("nunca oferece domingo, mesmo se a disponibilidade tiver uma entrada pra ele", () => {
    const comDomingo: JanelaDisponibilidade[] = [
      { diaSemana: 0, horaInicio: 10, horaFim: 15 }, // não devia nunca ser usado
      { diaSemana: 6, horaInicio: 10, horaFim: 15 },
    ];
    const agora = new Date("2026-08-22T11:00:00Z"); // sábado, 08h SP (janela hoje+1 = sábado + domingo)
    const resultado = calcularHorariosDisponiveis({ disponibilidade: comDomingo, agendamentosExistentes: [], agora });

    expect(resultado.length).toBeGreaterThan(0);
    for (const r of resultado) {
      const diaSemana = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(r.inicio);
      expect(diaSemana).not.toBe("Sun");
    }
  });

  it("nunca oferece horário que já passou", () => {
    const agora = new Date("2026-08-20T17:01:00Z"); // quinta, 14h01 SP — 10h a 14h já passaram
    const resultado = calcularHorariosDisponiveis({ disponibilidade: DISPONIBILIDADE_PADRAO, agendamentosExistentes: [], agora });

    for (const r of resultado) {
      expect(r.inicio.getTime()).toBeGreaterThan(agora.getTime());
    }
    // primeiro horário livre do dia é 15h SP (18h UTC) — 14h já passou
    expect(resultado[0].inicio.toISOString()).toBe("2026-08-20T18:00:00.000Z");
  });

  it("pula horário que sobrepõe um agendamento já confirmado", () => {
    const agora = new Date("2026-08-20T11:00:00Z"); // quinta, 08h SP
    const ocupado = { inicio: new Date("2026-08-20T13:00:00Z"), fim: new Date("2026-08-20T14:00:00Z") }; // 10h SP já marcado
    const resultado = calcularHorariosDisponiveis({ disponibilidade: DISPONIBILIDADE_PADRAO, agendamentosExistentes: [ocupado], agora });

    expect(resultado[0].inicio.toISOString()).not.toBe("2026-08-20T13:00:00.000Z");
    expect(resultado.some((r) => r.inicio.getTime() === ocupado.inicio.getTime())).toBe(false);
  });

  it("completa com o mesmo dia/turno quando não há horários suficientes pra diversificar (nunca devolve menos que o disponível)", () => {
    const disponibilidadeMinima: JanelaDisponibilidade[] = [{ diaSemana: 4, horaInicio: 10, horaFim: 11 }]; // só quinta, 2 horas, mesmo turno
    const agora = new Date("2026-08-20T11:00:00Z");
    const resultado = calcularHorariosDisponiveis({ disponibilidade: disponibilidadeMinima, agendamentosExistentes: [], agora });

    expect(resultado.map((r) => r.inicio.toISOString())).toEqual(["2026-08-20T13:00:00.000Z", "2026-08-20T14:00:00.000Z"]);
  });

  it("não inventa horário quando não há nenhum disponível na janela hoje+1", () => {
    const agora = new Date("2026-08-20T11:00:00Z");
    const resultado = calcularHorariosDisponiveis({ disponibilidade: [], agendamentosExistentes: [], agora });
    expect(resultado).toEqual([]);
  });

  it("respeita duração customizada (não usa o padrão de 60min)", () => {
    const agora = new Date("2026-08-20T11:00:00Z");
    const resultado = calcularHorariosDisponiveis({
      disponibilidade: DISPONIBILIDADE_PADRAO,
      agendamentosExistentes: [],
      agora,
      duracaoMinutos: 30,
      quantidade: 1,
    });
    expect(resultado[0].fim.getTime() - resultado[0].inicio.getTime()).toBe(30 * 60 * 1000);
  });
});
