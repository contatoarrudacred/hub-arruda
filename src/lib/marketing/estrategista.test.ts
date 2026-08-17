import { afterEach, describe, expect, it, vi } from "vitest";
import { selecionarPauta } from "./estrategista";
import * as repositorio from "./repositorio";

describe("selecionarPauta", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });
  it("seleciona a pauta pendente e marca como em produção", async () => {
    const pautaFalsa = {
      id: "pauta-1",
      matrizConteudoId: "matriz-1",
      palavraChavePrincipal: "limpar nome serasa",
      palavrasSecundarias: [],
      angulo: "passo_a_passo",
      geografia: null,
      tipoConteudo: "post_padrao" as const,
      funil: "topo" as const,
      status: "pendente" as const,
      tentativas: 0,
      motivoUltimaReprovacao: null,
    };
    vi.spyOn(repositorio, "selecionarProximaPautaPendente").mockResolvedValue(pautaFalsa);
    const marcarSpy = vi.spyOn(repositorio, "marcarPautaEmProducao").mockResolvedValue(undefined);

    const resultado = await selecionarPauta("matriz-1");

    expect(resultado).toEqual(pautaFalsa);
    expect(marcarSpy).toHaveBeenCalledWith("pauta-1");
  });

  it("retorna null sem marcar nada quando não há pauta pendente", async () => {
    vi.spyOn(repositorio, "selecionarProximaPautaPendente").mockResolvedValue(null);
    const marcarSpy = vi.spyOn(repositorio, "marcarPautaEmProducao").mockResolvedValue(undefined);

    const resultado = await selecionarPauta("matriz-1");

    expect(resultado).toBeNull();
    expect(marcarSpy).not.toHaveBeenCalled();
  });
});
