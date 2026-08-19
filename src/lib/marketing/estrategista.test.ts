import { afterEach, describe, expect, it, vi } from "vitest";
import { selecionarPauta } from "./estrategista";
import * as repositorio from "./repositorio";
import * as geradorAngulo from "./gerador-angulo";
import type { PautaCarregada, PersonaAtiva, PersonaCarregada } from "./tipos";

const pautaPendenteFalsa: PautaCarregada = {
  id: "pauta-1",
  matrizConteudoId: "matriz-1",
  personaId: null,
  palavraChavePrincipal: "limpar nome serasa",
  palavrasSecundarias: [],
  angulo: "passo_a_passo",
  geografia: null,
  tipoConteudo: "post_padrao",
  funil: "topo",
  status: "pendente",
  tentativas: 0,
  motivoUltimaReprovacao: null,
  ultimoRascunho: null,
};

const pautaReclaimFalsa: PautaCarregada = {
  ...pautaPendenteFalsa,
  id: "pauta-travada-1",
  status: "em_producao",
  tentativas: 1, // reclaim já incrementou tentativas (repositorio.ts) antes de devolver
};

function personaFalsa(overrides: Partial<PersonaAtiva> = {}): PersonaAtiva {
  return {
    id: "persona-1",
    nome: "Marcelo Andrade",
    dorEntrada: "Nome negativado no Serasa há meses, sem conseguir crédito.",
    angulosProntos: [],
    usadaPelaUltimaVezEm: null,
    ...overrides,
  };
}

describe("selecionarPauta", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Cenário 1 (regressão): pauta pendente na fila — comportamento original, inalterado. A lógica
  // de persona (terceiro caminho, Fase 3) nem deve ser consultada.
  it("cenário 1 (regressão): existe pauta pendente — retorna via caminho existente, sem tocar em persona", async () => {
    vi.spyOn(repositorio, "selecionarProximaPautaPendente").mockResolvedValue(pautaPendenteFalsa);
    const marcarSpy = vi.spyOn(repositorio, "marcarPautaEmProducao").mockResolvedValue(undefined);
    const listarPersonasSpy = vi.spyOn(repositorio, "listarPersonasAtivasComAngulosDisponiveis");

    const resultado = await selecionarPauta("matriz-1", "prop-1");

    expect(resultado).toEqual(pautaPendenteFalsa);
    expect(marcarSpy).toHaveBeenCalledWith("pauta-1");
    expect(listarPersonasSpy).not.toHaveBeenCalled();
  });

  // Cenário 2 (regressão): sem pendente, mas existe uma travada elegível pra reclaim —
  // `selecionarProximaPautaPendente` (repositorio.ts) já resolve isso internamente; do ponto de
  // vista do Estrategista, o comportamento é idêntico ao cenário 1 (marca em_producao, retorna,
  // nunca consulta persona) — só o conteúdo da pauta devolvida (já em em_producao, tentativas
  // incrementadas pelo reclaim) muda.
  it("cenário 2 (regressão): sem pendente mas existe travada pra reclaim — retorna via caminho existente, sem tocar em persona", async () => {
    vi.spyOn(repositorio, "selecionarProximaPautaPendente").mockResolvedValue(pautaReclaimFalsa);
    const marcarSpy = vi.spyOn(repositorio, "marcarPautaEmProducao").mockResolvedValue(undefined);
    const listarPersonasSpy = vi.spyOn(repositorio, "listarPersonasAtivasComAngulosDisponiveis");

    const resultado = await selecionarPauta("matriz-1", "prop-1");

    expect(resultado).toEqual(pautaReclaimFalsa);
    expect(marcarSpy).toHaveBeenCalledWith("pauta-travada-1");
    expect(listarPersonasSpy).not.toHaveBeenCalled();
  });

  // Cenário 3 (novo, sub-caso A): nem pendente nem reclaim, mas ao menos uma persona ativa ainda
  // tem ângulo pronto do Bloco 11 — sorteia (persona, ângulo) SEM chamar o Gerador de Ângulo
  // (zero custo de IA). Duas personas com ângulo pronto pra provar que a menos usada recentemente
  // (null = nunca usada) é a escolhida, e cada uma com um único ângulo pronto pra manter o sorteio
  // do ângulo determinístico sem precisar mockar Math.random().
  it("cenário 3 (sub-caso A): existe ângulo pronto disponível — sorteia sem chamar gerarAngulo e cria a pauta", async () => {
    vi.spyOn(repositorio, "selecionarProximaPautaPendente").mockResolvedValue(null);
    const personaUsadaHaPouco = personaFalsa({
      id: "persona-usada",
      angulosProntos: ["Ângulo da persona usada"],
      usadaPelaUltimaVezEm: "2026-08-18T10:00:00Z",
    });
    const personaNuncaUsada = personaFalsa({
      id: "persona-nunca-usada",
      dorEntrada: "Restrição no nome atrapalhando abertura de empresa.",
      angulosProntos: ["Único ângulo pronto disponível"],
      usadaPelaUltimaVezEm: null,
    });
    vi.spyOn(repositorio, "listarPersonasAtivasComAngulosDisponiveis").mockResolvedValue([personaUsadaHaPouco, personaNuncaUsada]);
    const gerarAnguloSpy = vi.spyOn(geradorAngulo, "gerarAngulo");
    const pautaCriada: PautaCarregada = {
      ...pautaPendenteFalsa,
      id: "pauta-persona-1",
      status: "em_producao",
      angulo: "Único ângulo pronto disponível",
      palavraChavePrincipal: "Restrição no nome atrapalhando abertura de empresa.",
    };
    const criarPautaSpy = vi.spyOn(repositorio, "criarPautaDePersona").mockResolvedValue(pautaCriada);

    const resultado = await selecionarPauta("matriz-1", "prop-1");

    expect(resultado).toEqual(pautaCriada);
    expect(gerarAnguloSpy).not.toHaveBeenCalled();
    expect(criarPautaSpy).toHaveBeenCalledWith({
      matrizConteudoId: "matriz-1",
      personaId: "persona-nunca-usada", // nunca usada (null) vence a usada há 18/08
      angulo: "Único ângulo pronto disponível",
      palavraChavePrincipal: "Restrição no nome atrapalhando abertura de empresa.",
      palavrasSecundarias: [],
      funil: "meio",
      tipoConteudo: "post_padrao",
    });
  });

  // Cenário 4 (novo, sub-caso B): nem pendente nem reclaim, e TODAS as personas ativas esgotaram
  // os ângulos prontos — sorteia persona (ponderado por menos usada recentemente) entre TODAS as
  // ativas e chama gerarAngulo com o histórico completo de ângulos usados dela.
  it("cenário 4 (sub-caso B): todas as personas esgotaram os ângulos prontos — sorteia persona e chama gerarAngulo", async () => {
    vi.spyOn(repositorio, "selecionarProximaPautaPendente").mockResolvedValue(null);
    const personaEsgotadaRecente = personaFalsa({
      id: "persona-recente",
      angulosProntos: [],
      usadaPelaUltimaVezEm: "2026-08-18T10:00:00Z",
    });
    const personaEsgotadaAntiga = personaFalsa({
      id: "persona-antiga",
      dorEntrada: "Score baixo travando financiamento de veículo.",
      angulosProntos: [],
      usadaPelaUltimaVezEm: "2026-07-01T10:00:00Z", // menos usada recentemente — deve ser a escolhida
    });
    vi.spyOn(repositorio, "listarPersonasAtivasComAngulosDisponiveis").mockResolvedValue([personaEsgotadaRecente, personaEsgotadaAntiga]);
    const angulosUsadosDaPersonaAntiga = ["Ângulo já usado 1", "Ângulo já usado 2"];
    const carregarAngulosSpy = vi.spyOn(repositorio, "carregarAngulosUsadosPorPersona").mockResolvedValue(angulosUsadosDaPersonaAntiga);
    const personaCompletaAntiga: PersonaCarregada = {
      ...personaEsgotadaAntiga,
      conteudoCompleto: "## Bloco 1 — Ficha rápida\n...(persona antiga)",
    };
    const carregarPersonaSpy = vi.spyOn(repositorio, "carregarPersona").mockResolvedValue(personaCompletaAntiga);
    const gerarAnguloSpy = vi.spyOn(geradorAngulo, "gerarAngulo").mockResolvedValue({
      resultado: {
        anguloTexto: "Como recuperar o score depois de anos negativado",
        palavraChavePrincipal: "recuperar score negativado",
        palavrasSecundarias: ["score de crédito", "financiamento veículo"],
        funil: "fundo",
        tipoConteudo: "post_storytelling",
      },
      usage: { inputTokens: 900, outputTokens: 150 },
    });
    const pautaCriada: PautaCarregada = {
      ...pautaPendenteFalsa,
      id: "pauta-persona-2",
      status: "em_producao",
      angulo: "Como recuperar o score depois de anos negativado",
      palavraChavePrincipal: "recuperar score negativado",
      palavrasSecundarias: ["score de crédito", "financiamento veículo"],
      funil: "fundo",
      tipoConteudo: "post_storytelling",
    };
    const criarPautaSpy = vi.spyOn(repositorio, "criarPautaDePersona").mockResolvedValue(pautaCriada);

    const resultado = await selecionarPauta("matriz-1", "prop-1");

    expect(resultado).toEqual(pautaCriada);
    expect(carregarAngulosSpy).toHaveBeenCalledWith("persona-antiga");
    expect(carregarPersonaSpy).toHaveBeenCalledWith("persona-antiga");
    expect(gerarAnguloSpy).toHaveBeenCalledWith(personaCompletaAntiga, angulosUsadosDaPersonaAntiga);
    expect(criarPautaSpy).toHaveBeenCalledWith({
      matrizConteudoId: "matriz-1",
      personaId: "persona-antiga",
      angulo: "Como recuperar o score depois de anos negativado",
      palavraChavePrincipal: "recuperar score negativado",
      palavrasSecundarias: ["score de crédito", "financiamento veículo"],
      funil: "fundo",
      tipoConteudo: "post_storytelling",
    });
  });

  // Cenário 5 (borda): nenhuma persona ativa pra propriedade (estado antes de qualquer importação,
  // ou todas desativadas) — retorna null sem quebrar, sem chamar nada relacionado a persona/IA.
  it("cenário 5 (borda): sem pendente, sem reclaim e sem persona ativa — retorna null sem quebrar", async () => {
    vi.spyOn(repositorio, "selecionarProximaPautaPendente").mockResolvedValue(null);
    vi.spyOn(repositorio, "listarPersonasAtivasComAngulosDisponiveis").mockResolvedValue([]);
    const gerarAnguloSpy = vi.spyOn(geradorAngulo, "gerarAngulo");
    const criarPautaSpy = vi.spyOn(repositorio, "criarPautaDePersona");

    const resultado = await selecionarPauta("matriz-1", "prop-1");

    expect(resultado).toBeNull();
    expect(gerarAnguloSpy).not.toHaveBeenCalled();
    expect(criarPautaSpy).not.toHaveBeenCalled();
  });
});
