import { describe, expect, it } from "vitest";
import { decidirProximoHorario } from "./agendador";

describe("decidirProximoHorario", () => {
  it("escolhe o horário de hoje quando ele ainda não passou", () => {
    // 2026-08-18T13:00:00Z = 10:00 em America/Sao_Paulo (UTC-3, sem horário de verão desde 2019).
    const agora = new Date("2026-08-18T13:00:00Z");
    const resultado = decidirProximoHorario(["11:00", "15:00"], [], agora);
    // 11:00 em São Paulo = 14:00Z.
    expect(resultado.toISOString()).toBe("2026-08-18T14:00:00.000Z");
  });

  it("pula pro primeiro horário de amanhã quando todos os de hoje já passaram", () => {
    // 2026-08-18T23:30:00Z = 20:30 em São Paulo — depois dos dois horários configurados.
    const agora = new Date("2026-08-18T23:30:00Z");
    const resultado = decidirProximoHorario(["09:00", "15:00"], [], agora);
    // 09:00 de amanhã em São Paulo = 2026-08-19T12:00:00Z.
    expect(resultado.toISOString()).toBe("2026-08-19T12:00:00.000Z");
  });

  it("pula pro próximo horário livre quando o primeiro já está ocupado por outro post agendado", () => {
    const agora = new Date("2026-08-18T13:00:00Z"); // 10:00 em São Paulo
    const jaAgendados = [new Date("2026-08-18T14:00:00Z")]; // 11:00 em São Paulo, já ocupado
    const resultado = decidirProximoHorario(["11:00", "15:00"], jaAgendados, agora);
    // 15:00 em São Paulo = 18:00Z.
    expect(resultado.toISOString()).toBe("2026-08-18T18:00:00.000Z");
  });

  it("pula pro dia seguinte quando todos os horários de hoje já estão ocupados", () => {
    const agora = new Date("2026-08-18T13:00:00Z"); // 10:00 em São Paulo
    const jaAgendados = [
      new Date("2026-08-18T14:00:00Z"), // 11:00 SP, ocupado
      new Date("2026-08-18T18:00:00Z"), // 15:00 SP, ocupado
    ];
    const resultado = decidirProximoHorario(["11:00", "15:00"], jaAgendados, agora);
    // 11:00 de amanhã em São Paulo = 2026-08-19T14:00:00Z.
    expect(resultado.toISOString()).toBe("2026-08-19T14:00:00.000Z");
  });

  it("lança erro quando chamado sem nenhum horário configurado", () => {
    expect(() => decidirProximoHorario([], [], new Date())).toThrow(/sem horários/);
  });
});
