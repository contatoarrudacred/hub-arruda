import { describe, expect, it } from "vitest";
import {
  calcularSeloRisco,
  combinarSeloRisco,
  nivelRiscoEstagnada,
  nivelRiscoNaoReconhecimento,
  nivelRiscoTempoSemResposta,
} from "./selo-risco";

const AGORA = new Date("2026-08-17T20:00:00Z");

describe("nivelRiscoTempoSemResposta", () => {
  it("sem aguardando_resposta_desde não há risco", () => {
    expect(nivelRiscoTempoSemResposta(null, AGORA, 4, 24)).toBe("baixo");
  });

  it("abaixo do limiar amarelo é baixo", () => {
    const desde = new Date(AGORA.getTime() - 2 * 3_600_000).toISOString();
    expect(nivelRiscoTempoSemResposta(desde, AGORA, 4, 24)).toBe("baixo");
  });

  it("entre amarelo e vermelho é medio", () => {
    const desde = new Date(AGORA.getTime() - 10 * 3_600_000).toISOString();
    expect(nivelRiscoTempoSemResposta(desde, AGORA, 4, 24)).toBe("medio");
  });

  it("acima do limiar vermelho é alto", () => {
    const desde = new Date(AGORA.getTime() - 30 * 3_600_000).toISOString();
    expect(nivelRiscoTempoSemResposta(desde, AGORA, 4, 24)).toBe("alto");
  });
});

describe("nivelRiscoNaoReconhecimento", () => {
  it("0 ou 1 é baixo", () => {
    expect(nivelRiscoNaoReconhecimento(0)).toBe("baixo");
    expect(nivelRiscoNaoReconhecimento(1)).toBe("baixo");
  });

  it("2 é medio", () => {
    expect(nivelRiscoNaoReconhecimento(2)).toBe("medio");
  });

  it("3 ou mais é alto", () => {
    expect(nivelRiscoNaoReconhecimento(3)).toBe("alto");
    expect(nivelRiscoNaoReconhecimento(5)).toBe("alto");
  });
});

describe("nivelRiscoEstagnada", () => {
  it("null é baixo", () => {
    expect(nivelRiscoEstagnada(null)).toBe("baixo");
  });

  it("qualquer data é alto (sinal binário)", () => {
    expect(nivelRiscoEstagnada(AGORA.toISOString())).toBe("alto");
  });
});

describe("combinarSeloRisco", () => {
  it("qualquer alto vence", () => {
    expect(combinarSeloRisco(["baixo", "alto", "medio"])).toBe("alto");
  });

  it("sem alto, medio vence", () => {
    expect(combinarSeloRisco(["baixo", "medio", "baixo"])).toBe("medio");
  });

  it("tudo baixo é baixo", () => {
    expect(combinarSeloRisco(["baixo", "baixo", "baixo"])).toBe("baixo");
  });
});

describe("calcularSeloRisco", () => {
  it("combina os 3 sinais de verdade", () => {
    expect(
      calcularSeloRisco({
        aguardandoRespostaDesde: null,
        contadorNaoReconhecimento: 0,
        estagnadoDesde: null,
        horasAmarelo: 4,
        horasVermelho: 24,
        agora: AGORA,
      }),
    ).toBe("baixo");

    expect(
      calcularSeloRisco({
        aguardandoRespostaDesde: null,
        contadorNaoReconhecimento: 0,
        estagnadoDesde: AGORA.toISOString(),
        horasAmarelo: 4,
        horasVermelho: 24,
        agora: AGORA,
      }),
    ).toBe("alto");

    expect(
      calcularSeloRisco({
        aguardandoRespostaDesde: null,
        contadorNaoReconhecimento: 2,
        estagnadoDesde: null,
        horasAmarelo: 4,
        horasVermelho: 24,
        agora: AGORA,
      }),
    ).toBe("medio");
  });
});
