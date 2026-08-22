import { afterEach, describe, expect, it, vi } from "vitest";
import { selecionarPauta } from "./estrategista";
import * as repositorio from "./repositorio";
import * as geradorAngulo from "./gerador-angulo";
import { CATALOGO_TIPOS_ANGULO } from "./tipos";
import type { PautaCarregada, PersonaAtiva, PersonaCarregada, TipoAngulo } from "./tipos";

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
  agendamentoForcado: null,
  tipoAngulo: null,
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

/** Todos os 15 tipos do catálogo começam `null` (nunca usados) — sobrescreve só os que o cenário
 * precisa, igual ao que `carregarUltimoUsoPorTipoAngulo` (repositorio.ts) devolveria de verdade. */
function ultimoUsoPorTipoFalso(overrides: Partial<Record<TipoAngulo, string | null>> = {}): Record<TipoAngulo, string | null> {
  const base = Object.fromEntries(CATALOGO_TIPOS_ANGULO.map((tipo) => [tipo, null])) as Record<TipoAngulo, string | null>;
  return { ...base, ...overrides };
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

  // Cenário 3 (novo, sub-caso A, histórico de tipo vazio): nem pendente nem reclaim, mas ao menos
  // uma persona ativa ainda tem ângulo pronto do Bloco 11 — sorteia (tipo, persona, ângulo) SEM
  // chamar o Gerador de Ângulo (zero custo de IA). Ambas as personas têm ângulo pronto do MESMO
  // tipo ("comparativo", o 5º do catálogo, não o 1º) — com histórico de tipo totalmente vazio, o
  // sort estável percorre e PULA os 4 tipos anteriores (nenhuma persona tem ângulo desses tipos)
  // até achar "comparativo", provando que o loop de tipos funciona mesmo quando o primeiro do
  // catálogo não tem match. Duas personas com ângulo pronto pra provar que a menos usada
  // recentemente (null = nunca usada) é a escolhida DENTRO do tipo sorteado.
  it("cenário 3 (sub-caso A, histórico vazio): pula tipos sem persona candidata e sorteia sem chamar gerarAngulo", async () => {
    vi.spyOn(repositorio, "selecionarProximaPautaPendente").mockResolvedValue(null);
    vi.spyOn(repositorio, "carregarUltimoUsoPorTipoAngulo").mockResolvedValue(ultimoUsoPorTipoFalso());
    const personaUsadaHaPouco = personaFalsa({
      id: "persona-usada",
      angulosProntos: [{ texto: "Ângulo da persona usada", tipo: "comparativo" }],
      usadaPelaUltimaVezEm: "2026-08-18T10:00:00Z",
    });
    const personaNuncaUsada = personaFalsa({
      id: "persona-nunca-usada",
      dorEntrada: "Restrição no nome atrapalhando abertura de empresa.",
      angulosProntos: [{ texto: "Único ângulo pronto disponível", tipo: "comparativo" }],
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
      tipoAngulo: "comparativo",
    };
    const criarPautaSpy = vi.spyOn(repositorio, "criarPautaDePersona").mockResolvedValue(pautaCriada);

    const resultado = await selecionarPauta("matriz-1", "prop-1");

    expect(resultado).toEqual(pautaCriada);
    expect(gerarAnguloSpy).not.toHaveBeenCalled();
    expect(criarPautaSpy).toHaveBeenCalledWith({
      matrizConteudoId: "matriz-1",
      personaId: "persona-nunca-usada", // nunca usada (null) vence a usada há 18/08, dentro do tipo "comparativo"
      angulo: "Único ângulo pronto disponível",
      palavraChavePrincipal: "Restrição no nome atrapalhando abertura de empresa.",
      palavrasSecundarias: [],
      funil: "meio",
      tipoConteudo: "post_padrao",
      tipoAngulo: "comparativo",
    });
  });

  // Cenário 3b (novo, histórico parcial): prova que a prioridade é por TIPO, não por persona — a
  // persona da direita nunca foi usada pessoalmente (usadaPelaUltimaVezEm: null), mas seu ângulo é
  // de um tipo já usado recentemente; a persona da esquerda foi usada ontem, mas o tipo dela nunca
  // foi usado. O tipo nunca usado vence, então a persona da esquerda é escolhida — o oposto do que
  // o sorteio antigo (só por persona) escolheria.
  it("cenário 3b (sub-caso A, histórico parcial): tipo nunca usado vence mesmo com a persona dele usada mais recentemente", async () => {
    vi.spyOn(repositorio, "selecionarProximaPautaPendente").mockResolvedValue(null);
    vi.spyOn(repositorio, "carregarUltimoUsoPorTipoAngulo").mockResolvedValue(
      ultimoUsoPorTipoFalso({ urgencia_temporal: "2026-08-10T00:00:00Z", duvida_ceticismo: null }),
    );
    const personaTipoNuncaUsado = personaFalsa({
      id: "persona-tipo-nunca-usado",
      angulosProntos: [{ texto: "Ângulo de dúvida/ceticismo", tipo: "duvida_ceticismo" }],
      usadaPelaUltimaVezEm: "2026-08-19T10:00:00Z", // persona usada ontem — mas o TIPO dela nunca foi usado
    });
    const personaTipoUsadoRecente = personaFalsa({
      id: "persona-tipo-usado-recente",
      angulosProntos: [{ texto: "Ângulo de urgência", tipo: "urgencia_temporal" }],
      usadaPelaUltimaVezEm: null, // persona nunca usada — mas o TIPO dela já foi usado em 10/08
    });
    vi.spyOn(repositorio, "listarPersonasAtivasComAngulosDisponiveis").mockResolvedValue([
      personaTipoUsadoRecente,
      personaTipoNuncaUsado,
    ]);
    const gerarAnguloSpy = vi.spyOn(geradorAngulo, "gerarAngulo");
    const pautaCriada: PautaCarregada = { ...pautaPendenteFalsa, id: "pauta-persona-3b", status: "em_producao", tipoAngulo: "duvida_ceticismo" };
    const criarPautaSpy = vi.spyOn(repositorio, "criarPautaDePersona").mockResolvedValue(pautaCriada);

    const resultado = await selecionarPauta("matriz-1", "prop-1");

    expect(resultado).toEqual(pautaCriada);
    expect(gerarAnguloSpy).not.toHaveBeenCalled();
    expect(criarPautaSpy).toHaveBeenCalledWith(
      expect.objectContaining({ personaId: "persona-tipo-nunca-usado", tipoAngulo: "duvida_ceticismo" }),
    );
  });

  // Cenário 3c (novo, histórico cheio): com todos os tipos candidatos já usados alguma vez, o
  // menos recente (mais antigo) vence — mesmo comparador de recência ascendente usado pra persona,
  // agora aplicado ao eixo de tipo.
  it("cenário 3c (sub-caso A, histórico cheio): tipo usado há mais tempo vence", async () => {
    vi.spyOn(repositorio, "selecionarProximaPautaPendente").mockResolvedValue(null);
    vi.spyOn(repositorio, "carregarUltimoUsoPorTipoAngulo").mockResolvedValue(
      ultimoUsoPorTipoFalso({ mito_ou_verdade: "2026-08-01T00:00:00Z", ranking_lista: "2026-08-15T00:00:00Z" }),
    );
    const personaMitoOuVerdade = personaFalsa({
      id: "persona-mito",
      angulosProntos: [{ texto: "Ângulo de mito ou verdade", tipo: "mito_ou_verdade" }],
    });
    const personaRanking = personaFalsa({
      id: "persona-ranking",
      angulosProntos: [{ texto: "Ângulo de ranking", tipo: "ranking_lista" }],
    });
    vi.spyOn(repositorio, "listarPersonasAtivasComAngulosDisponiveis").mockResolvedValue([personaRanking, personaMitoOuVerdade]);
    const pautaCriada: PautaCarregada = { ...pautaPendenteFalsa, id: "pauta-persona-3c", status: "em_producao", tipoAngulo: "mito_ou_verdade" };
    const criarPautaSpy = vi.spyOn(repositorio, "criarPautaDePersona").mockResolvedValue(pautaCriada);

    const resultado = await selecionarPauta("matriz-1", "prop-1");

    expect(resultado).toEqual(pautaCriada);
    expect(criarPautaSpy).toHaveBeenCalledWith(expect.objectContaining({ personaId: "persona-mito", tipoAngulo: "mito_ou_verdade" }));
  });

  // Cenário 4 (novo, sub-caso B): nem pendente nem reclaim, e TODAS as personas ativas esgotaram
  // os ângulos prontos — sorteia persona (ponderado por menos usada recentemente) entre TODAS as
  // ativas, sorteia o tipo (histórico vazio → primeiro do catálogo, "informacional_direto") e
  // chama gerarAngulo com esse tipo + o histórico completo de ângulos usados da persona.
  it("cenário 4 (sub-caso B): todas as personas esgotaram os ângulos prontos — sorteia persona e tipo, chama gerarAngulo com o tipo sorteado", async () => {
    vi.spyOn(repositorio, "selecionarProximaPautaPendente").mockResolvedValue(null);
    vi.spyOn(repositorio, "carregarUltimoUsoPorTipoAngulo").mockResolvedValue(ultimoUsoPorTipoFalso());
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
      tipoAngulo: "informacional_direto",
    };
    const criarPautaSpy = vi.spyOn(repositorio, "criarPautaDePersona").mockResolvedValue(pautaCriada);

    const resultado = await selecionarPauta("matriz-1", "prop-1");

    expect(resultado).toEqual(pautaCriada);
    expect(carregarAngulosSpy).toHaveBeenCalledWith("persona-antiga");
    expect(carregarPersonaSpy).toHaveBeenCalledWith("persona-antiga");
    expect(gerarAnguloSpy).toHaveBeenCalledWith(personaCompletaAntiga, angulosUsadosDaPersonaAntiga, "informacional_direto");
    expect(criarPautaSpy).toHaveBeenCalledWith({
      matrizConteudoId: "matriz-1",
      personaId: "persona-antiga",
      angulo: "Como recuperar o score depois de anos negativado",
      palavraChavePrincipal: "recuperar score negativado",
      palavrasSecundarias: ["score de crédito", "financiamento veículo"],
      funil: "fundo",
      tipoConteudo: "post_storytelling",
      tipoAngulo: "informacional_direto",
    });
  });

  // Cenário 5 (borda): nenhuma persona ativa pra propriedade (estado antes de qualquer importação,
  // ou todas desativadas) — retorna null sem quebrar, sem chamar nada relacionado a persona/IA/tipo.
  it("cenário 5 (borda): sem pendente, sem reclaim e sem persona ativa — retorna null sem quebrar", async () => {
    vi.spyOn(repositorio, "selecionarProximaPautaPendente").mockResolvedValue(null);
    vi.spyOn(repositorio, "listarPersonasAtivasComAngulosDisponiveis").mockResolvedValue([]);
    const carregarUltimoUsoSpy = vi.spyOn(repositorio, "carregarUltimoUsoPorTipoAngulo");
    const gerarAnguloSpy = vi.spyOn(geradorAngulo, "gerarAngulo");
    const criarPautaSpy = vi.spyOn(repositorio, "criarPautaDePersona");

    const resultado = await selecionarPauta("matriz-1", "prop-1");

    expect(resultado).toBeNull();
    expect(carregarUltimoUsoSpy).not.toHaveBeenCalled();
    expect(gerarAnguloSpy).not.toHaveBeenCalled();
    expect(criarPautaSpy).not.toHaveBeenCalled();
  });
});
