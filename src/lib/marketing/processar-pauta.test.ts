// src/lib/marketing/processar-pauta.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { cotaDiariaAtingida, dentroDaJanela, processarProximaPauta } from "./processar-pauta";
import * as estrategista from "./estrategista";
import * as escritor from "./escritor";
import * as revisor from "./revisor";
import * as repositorio from "./repositorio";
import { criarAdaptadorWordPress } from "./canais/wordpress";
import { inserirLinksInternos } from "./links";

vi.mock("./canais/wordpress");
vi.mock("./links");

const pautaFalsa = {
  id: "pauta-1",
  matrizConteudoId: "matriz-1",
  personaId: null,
  palavraChavePrincipal: "limpar nome serasa",
  palavrasSecundarias: [],
  angulo: "passo_a_passo",
  geografia: null,
  tipoConteudo: "post_padrao" as const,
  funil: "topo" as const,
  status: "em_producao" as const,
  tentativas: 0,
  motivoUltimaReprovacao: null,
};

const propriedadeFalsa = {
  id: "prop-1",
  nome: "Site Teste",
  urlBase: "https://teste.exemplo.com",
  tipoCms: "wordpress" as const,
  maxTentativas: 3,
};

/**
 * Espiona registrarEtapa (Task 3, estendida em Task 5 pra também aceitar extrairTokens/
 * extrairDetalhes — ver repositorio.ts) sem bater no banco: repassa direto pra fn() e grava (a) a
 * ordem das etapas chamadas e (b) o que os extratores de tokens/detalhes de processar-pauta.ts
 * REALMENTE produzem a partir do resultado de fn() — sem isto, um bug de transposição
 * (tokensEntrada/tokensSaida trocados, ou um extrairDetalhes que nunca captura o motivo de uma
 * rejeição de negócio) compilaria e passaria a suíte inteira em silêncio, porque o mecanismo
 * genérico de registrarEtapa já é testado à parte em repositorio.test.ts com dados forjados à mão
 * — isto aqui testa as lambdas específicas que processar-pauta.ts passa pra ele.
 *
 * `etapa` é empilhada ANTES de aguardar fn() (mesma ordem do registrarEtapa real, que insere a
 * linha de log antes de rodar a etapa de negócio) — por isso etapasChamadas continua incluindo uma
 * etapa mesmo quando fn() lança. Os extratores só são invocados quando fn() resolve (replicando o
 * branch de sucesso do registrarEtapa real, onde eles de fato são chamados).
 */
function espiarRegistrarEtapa() {
  const etapasChamadas: string[] = [];
  const tokensExtraidos: Record<string, { tokensEntrada: number; tokensSaida: number } | undefined> = {};
  const detalhesExtraidos: Record<string, string | undefined> = {};
  const spy = vi
    .spyOn(repositorio, "registrarEtapa")
    .mockImplementation(async (_pautaId, etapa, fn, extrairTokens, extrairDetalhes) => {
      etapasChamadas.push(etapa);
      const resultado = await fn();
      if (extrairTokens) tokensExtraidos[etapa] = extrairTokens(resultado);
      if (extrairDetalhes) detalhesExtraidos[etapa] = extrairDetalhes(resultado);
      return resultado;
    });
  return { spy, etapasChamadas, tokensExtraidos, detalhesExtraidos };
}

describe("dentroDaJanela", () => {
  it("retorna true quando nenhuma janela está configurada", () => {
    expect(dentroDaJanela(undefined)).toBe(true);
  });

  it("retorna true quando o horário atual (convertido pra Brasília) está dentro da janela", () => {
    // 2026-08-18T13:00:00Z = 10:00 em America/Sao_Paulo (UTC-3, sem horário de verão desde 2019).
    const agora = new Date("2026-08-18T13:00:00Z");
    expect(dentroDaJanela({ inicio: "08:00", fim: "20:00" }, agora)).toBe(true);
  });

  it("retorna false quando o horário atual (convertido pra Brasília) está depois do fim da janela", () => {
    // 2026-08-18T23:30:00Z = 20:30 em America/Sao_Paulo.
    const agora = new Date("2026-08-18T23:30:00Z");
    expect(dentroDaJanela({ inicio: "08:00", fim: "20:00" }, agora)).toBe(false);
  });

  it("retorna false quando o horário atual (convertido pra Brasília) está antes do início da janela", () => {
    // 2026-08-18T10:59:00Z = 07:59 em America/Sao_Paulo.
    const agora = new Date("2026-08-18T10:59:00Z");
    expect(dentroDaJanela({ inicio: "08:00", fim: "20:00" }, agora)).toBe(false);
  });

  it("trata início e fim como inclusivos", () => {
    // 11:00Z = 08:00 BRT (início exato); 23:00Z = 20:00 BRT (fim exato).
    expect(dentroDaJanela({ inicio: "08:00", fim: "20:00" }, new Date("2026-08-18T11:00:00Z"))).toBe(true);
    expect(dentroDaJanela({ inicio: "08:00", fim: "20:00" }, new Date("2026-08-18T23:00:00Z"))).toBe(true);
  });
});

describe("cotaDiariaAtingida", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retorna false sem consultar o banco quando não há limite configurado", async () => {
    const contarSpy = vi.spyOn(repositorio, "contarPostsPublicadosDesde");

    expect(await cotaDiariaAtingida("prop-1", undefined)).toBe(false);
    expect(contarSpy).not.toHaveBeenCalled();
  });

  it("retorna true quando a contagem de publicados hoje já atingiu o limite", async () => {
    vi.spyOn(repositorio, "contarPostsPublicadosDesde").mockResolvedValue(3);

    expect(await cotaDiariaAtingida("prop-1", 3)).toBe(true);
  });

  it("retorna false quando a contagem ainda está abaixo do limite", async () => {
    vi.spyOn(repositorio, "contarPostsPublicadosDesde").mockResolvedValue(2);

    expect(await cotaDiariaAtingida("prop-1", 3)).toBe(false);
  });

  it("conta a partir da meia-noite do dia civil em Brasília (não do fuso do servidor)", async () => {
    const contarSpy = vi.spyOn(repositorio, "contarPostsPublicadosDesde").mockResolvedValue(0);
    // 2026-08-19T01:30:00Z = 2026-08-18T22:30 em America/Sao_Paulo — ainda dia 18 em Brasília,
    // mesmo já sendo dia 19 em UTC. Início do dia esperado: 2026-08-18T00:00:00-03:00.
    const agora = new Date("2026-08-19T01:30:00Z");

    await cotaDiariaAtingida("prop-1", 3, agora);

    expect(contarSpy).toHaveBeenCalledWith("prop-1", "2026-08-18T00:00:00-03:00");
  });
});

describe("processarProximaPauta", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("retorna fora_da_janela sem selecionar pauta quando o horário atual está fora da janela de publicação", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T23:30:00Z")); // 20:30 BRT, fora de 08:00-20:00
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue({
      ...propriedadeFalsa,
      janelaPublicacao: { inicio: "08:00", fim: "20:00" },
    });
    const selecionarSpy = vi.spyOn(estrategista, "selecionarPauta");

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "fora_da_janela" });
    expect(selecionarSpy).not.toHaveBeenCalled();
  });

  it("retorna fora_da_janela sem selecionar pauta quando a cota diária de posts já foi atingida", async () => {
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue({
      ...propriedadeFalsa,
      postsPorDia: 2,
    });
    vi.spyOn(repositorio, "contarPostsPublicadosDesde").mockResolvedValue(2);
    const selecionarSpy = vi.spyOn(estrategista, "selecionarPauta");

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "fora_da_janela" });
    expect(selecionarSpy).not.toHaveBeenCalled();
  });

  it("regressão: sem posts_por_dia nem janela_publicacao configurados, processa normalmente (comportamento da Fase 1)", async () => {
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue({
      ...pautaFalsa,
      tentativas: 3,
      motivoUltimaReprovacao: "Muito curto.",
    });
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa); // sem os dois campos
    const bloquearSpy = vi.spyOn(repositorio, "marcarPautaBloqueada").mockResolvedValue(undefined);
    const contarSpy = vi.spyOn(repositorio, "contarPostsPublicadosDesde");

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "bloqueada", pautaId: "pauta-1" });
    expect(bloquearSpy).toHaveBeenCalledWith("pauta-1", "Muito curto.");
    expect(contarSpy).not.toHaveBeenCalled(); // sem posts_por_dia, nem consulta o banco pra cota
  });

  it("publica quando a revisão aprova de primeira", async () => {
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
      resultado: {
        titulo: "Como Limpar o Nome no Serasa",
        conteudoHtml: "<h1>...</h1>",
        metaTitle: "Como Limpar Nome no Serasa",
        metaDescription: "Guia completo.",
        slug: "como-limpar-nome-serasa",
      },
      usage: { inputTokens: 1000, outputTokens: 2000 },
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({
      resultado: { aprovado: true, score: 92, motivo: null },
      usage: { inputTokens: 500, outputTokens: 50 },
    });
    vi.spyOn(repositorio, "criarPost").mockResolvedValue({ id: "post-1", pautaId: "pauta-1", propriedadeId: "prop-1", status: "rascunho" });
    vi.spyOn(repositorio, "atualizarStatusPost").mockResolvedValue(undefined);
    vi.spyOn(repositorio, "marcarPautaPublicada").mockResolvedValue(undefined);
    vi.mocked(inserirLinksInternos).mockResolvedValue("<h1>...</h1>");
    const { etapasChamadas, tokensExtraidos, detalhesExtraidos } = espiarRegistrarEtapa();

    const adaptadorFalso = {
      criarRascunho: vi.fn().mockResolvedValue({ idRemoto: "123", status: "rascunho" }),
      verificarRascunho: vi.fn().mockResolvedValue({ ok: true }),
      aprovarPublicar: vi.fn().mockResolvedValue({ urlPublicada: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
    };
    vi.mocked(criarAdaptadorWordPress).mockReturnValue(adaptadorFalso);

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "publicado", url: "https://teste.exemplo.com/como-limpar-nome-serasa/" });
    expect(adaptadorFalso.aprovarPublicar).toHaveBeenCalledWith("123");
    expect(inserirLinksInternos).toHaveBeenCalledWith("<h1>...</h1>", "prop-1", "post-1");
    expect(etapasChamadas).toEqual([
      "buscar_checklist",
      "gerar_conteudo",
      "revisar",
      "inserir_links",
      "sanitizar",
      "publicar",
      "registrar_resultado",
    ]);
    // Prova que a lambda de extração de tokens de gerar_conteudo/revisar (processar-pauta.ts)
    // mapeia usage.inputTokens/outputTokens pra tokensEntrada/tokensSaida SEM trocar os dois —
    // um bug de transposição compilaria e passaria o resto da suíte em silêncio sem este assert.
    expect(tokensExtraidos.gerar_conteudo).toEqual({ tokensEntrada: 1000, tokensSaida: 2000 });
    expect(tokensExtraidos.revisar).toEqual({ tokensEntrada: 500, tokensSaida: 50 });
    // Revisão aprovada e publicação bem-sucedida: nenhum motivo de rejeição de negócio pra gravar.
    expect(detalhesExtraidos.revisar).toBeUndefined();
    expect(detalhesExtraidos.publicar).toBeUndefined();
  });

  it("mantém o resultado publicado sem reprovar quando só o registro de metadados do post falha", async () => {
    // Regressão do bug de janela de publicação duplicada: se aprovarPublicar já teve sucesso
    // (post no ar) mas atualizarStatusPost falhar depois, NÃO pode cair em registrarReprovacaoPauta
    // — isso devolveria a pauta pra fila e geraria um segundo artigo publicado no próximo ciclo.
    // marcarPautaPublicada roda ANTES e com sucesso aqui (é o que tira a pauta do pool de reclaim),
    // então uma falha isolada em atualizarStatusPost (metadados secundários) não deve bloquear nada.
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
      resultado: {
        titulo: "Como Limpar o Nome no Serasa",
        conteudoHtml: "<h1>...</h1>",
        metaTitle: "Como Limpar Nome no Serasa",
        metaDescription: "Guia completo.",
        slug: "como-limpar-nome-serasa",
      },
      usage: { inputTokens: 1000, outputTokens: 2000 },
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({
      resultado: { aprovado: true, score: 92, motivo: null },
      usage: { inputTokens: 500, outputTokens: 50 },
    });
    vi.spyOn(repositorio, "criarPost").mockResolvedValue({ id: "post-1", pautaId: "pauta-1", propriedadeId: "prop-1", status: "rascunho" });
    const atualizarStatusPostSpy = vi.spyOn(repositorio, "atualizarStatusPost").mockRejectedValue(new Error("Falha ao gravar no banco"));
    const marcarPublicadaSpy = vi.spyOn(repositorio, "marcarPautaPublicada").mockResolvedValue(undefined);
    const bloquearSpy = vi.spyOn(repositorio, "marcarPautaBloqueada").mockResolvedValue(undefined);
    const reprovarSpy = vi.spyOn(repositorio, "registrarReprovacaoPauta").mockResolvedValue(undefined);
    const erroSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(inserirLinksInternos).mockResolvedValue("<h1>...</h1>");
    const { etapasChamadas } = espiarRegistrarEtapa();

    const adaptadorFalso = {
      criarRascunho: vi.fn().mockResolvedValue({ idRemoto: "123", status: "rascunho" }),
      verificarRascunho: vi.fn().mockResolvedValue({ ok: true }),
      aprovarPublicar: vi.fn().mockResolvedValue({ urlPublicada: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
    };
    vi.mocked(criarAdaptadorWordPress).mockReturnValue(adaptadorFalso);

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "publicado", url: "https://teste.exemplo.com/como-limpar-nome-serasa/" });
    expect(reprovarSpy).not.toHaveBeenCalled();
    expect(marcarPublicadaSpy).toHaveBeenCalledWith("pauta-1");
    expect(bloquearSpy).not.toHaveBeenCalled();
    expect(atualizarStatusPostSpy).toHaveBeenCalledWith(
      "post-1",
      "publicado",
      expect.objectContaining({ conteudoHtml: expect.any(String) }),
    );
    expect(erroSpy).toHaveBeenCalled();
    expect(etapasChamadas).toEqual([
      "buscar_checklist",
      "gerar_conteudo",
      "revisar",
      "inserir_links",
      "sanitizar",
      "publicar",
      "registrar_resultado",
    ]);

    erroSpy.mockRestore();
  });

  it("bloqueia a pauta pra revisão manual quando marcarPautaPublicada falha (não deixa recuperável via reclaim)", async () => {
    // Se marcarPautaPublicada falhar, a pauta ficaria em em_producao e o reclaim (item 3) a
    // re-selecionaria e republicaria dali a 10 minutos — a mesma duplicidade que este bloco existe
    // pra evitar. Por isso o fallback força "bloqueada" em vez de deixar recuperável via reclaim.
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
      resultado: {
        titulo: "Como Limpar o Nome no Serasa",
        conteudoHtml: "<h1>...</h1>",
        metaTitle: "Como Limpar Nome no Serasa",
        metaDescription: "Guia completo.",
        slug: "como-limpar-nome-serasa",
      },
      usage: { inputTokens: 1000, outputTokens: 2000 },
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({
      resultado: { aprovado: true, score: 92, motivo: null },
      usage: { inputTokens: 500, outputTokens: 50 },
    });
    vi.spyOn(repositorio, "criarPost").mockResolvedValue({ id: "post-1", pautaId: "pauta-1", propriedadeId: "prop-1", status: "rascunho" });
    const atualizarStatusPostSpy = vi.spyOn(repositorio, "atualizarStatusPost").mockResolvedValue(undefined);
    const marcarPublicadaSpy = vi.spyOn(repositorio, "marcarPautaPublicada").mockRejectedValue(new Error("Falha ao gravar no banco"));
    const bloquearSpy = vi.spyOn(repositorio, "marcarPautaBloqueada").mockResolvedValue(undefined);
    const reprovarSpy = vi.spyOn(repositorio, "registrarReprovacaoPauta").mockResolvedValue(undefined);
    const erroSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(inserirLinksInternos).mockResolvedValue("<h1>...</h1>");
    const { etapasChamadas } = espiarRegistrarEtapa();

    const adaptadorFalso = {
      criarRascunho: vi.fn().mockResolvedValue({ idRemoto: "123", status: "rascunho" }),
      verificarRascunho: vi.fn().mockResolvedValue({ ok: true }),
      aprovarPublicar: vi.fn().mockResolvedValue({ urlPublicada: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
    };
    vi.mocked(criarAdaptadorWordPress).mockReturnValue(adaptadorFalso);

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "publicado", url: "https://teste.exemplo.com/como-limpar-nome-serasa/" });
    expect(reprovarSpy).not.toHaveBeenCalled();
    expect(marcarPublicadaSpy).toHaveBeenCalledWith("pauta-1");
    expect(bloquearSpy).toHaveBeenCalledWith(
      "pauta-1",
      expect.stringContaining("https://teste.exemplo.com/como-limpar-nome-serasa/"),
    );
    // atualizarStatusPost não deve rodar: a pauta já foi resolvida (bloqueada) nesse ramo.
    expect(atualizarStatusPostSpy).not.toHaveBeenCalled();
    expect(erroSpy).toHaveBeenCalled();
    expect(etapasChamadas).toEqual([
      "buscar_checklist",
      "gerar_conteudo",
      "revisar",
      "inserir_links",
      "sanitizar",
      "publicar",
      "registrar_resultado",
    ]);

    erroSpy.mockRestore();
  });

  it("reprova sem publicar quando o WordPress rejeita o rascunho na verificação", async () => {
    // Cenário de "publicar falhou" que já existia na lógica de negócio (verificacao.ok === false),
    // mas ganhou uma forma nova de fluir pela etapa "publicar" (Task 5): não lança exceção — a
    // etapa "publicar" é registrada como concluída (sucesso: true, é a decisão de negócio de
    // reprovar, não uma exceção técnica). Essa mesma escolha de design foi aplicada à etapa
    // "revisar" nesta mesma task (nenhuma das duas era instrumentada antes) — extrairDetalhes grava
    // o motivo da rejeição na coluna detalhes mesmo sem exceção, pra não ficar indistinguível de
    // uma publicação real no log (ver assert de detalhesExtraidos.publicar abaixo).
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
      resultado: {
        titulo: "Como Limpar o Nome no Serasa",
        conteudoHtml: "<h1>...</h1>",
        metaTitle: "Como Limpar Nome no Serasa",
        metaDescription: "Guia completo.",
        slug: "como-limpar-nome-serasa",
      },
      usage: { inputTokens: 1000, outputTokens: 2000 },
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({
      resultado: { aprovado: true, score: 92, motivo: null },
      usage: { inputTokens: 500, outputTokens: 50 },
    });
    vi.spyOn(repositorio, "criarPost").mockResolvedValue({ id: "post-1", pautaId: "pauta-1", propriedadeId: "prop-1", status: "rascunho" });
    const atualizarStatusPostSpy = vi.spyOn(repositorio, "atualizarStatusPost").mockResolvedValue(undefined);
    const marcarPublicadaSpy = vi.spyOn(repositorio, "marcarPautaPublicada").mockResolvedValue(undefined);
    const reprovarSpy = vi.spyOn(repositorio, "registrarReprovacaoPauta").mockResolvedValue(undefined);
    vi.mocked(inserirLinksInternos).mockResolvedValue("<h1>...</h1>");
    const { etapasChamadas, detalhesExtraidos } = espiarRegistrarEtapa();

    const adaptadorFalso = {
      criarRascunho: vi.fn().mockResolvedValue({ idRemoto: "123", status: "rascunho" }),
      verificarRascunho: vi.fn().mockResolvedValue({ ok: false, detalhes: "Rascunho sem conteúdo renderizado." }),
      aprovarPublicar: vi.fn(),
    };
    vi.mocked(criarAdaptadorWordPress).mockReturnValue(adaptadorFalso);

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "reprovado", pautaId: "pauta-1" });
    expect(adaptadorFalso.aprovarPublicar).not.toHaveBeenCalled();
    expect(atualizarStatusPostSpy).toHaveBeenCalledWith("post-1", "falhou");
    expect(reprovarSpy).toHaveBeenCalledWith("pauta-1", "Rascunho sem conteúdo renderizado.");
    expect(marcarPublicadaSpy).not.toHaveBeenCalled();
    expect(etapasChamadas).toEqual(["buscar_checklist", "gerar_conteudo", "revisar", "inserir_links", "sanitizar", "publicar"]);
    // Important #1 da revisão: a linha de log da etapa "publicar" precisa carregar o motivo da
    // rejeição em `detalhes`, mesmo sucesso: true (rejeição de negócio, não exceção técnica) —
    // senão fica indistinguível de uma publicação real pra quem lê pautas_execucao_log.
    expect(detalhesExtraidos.publicar).toBe("Rascunho sem conteúdo renderizado.");
  });

  it("reprova sem publicar quando o score da revisão é baixo", async () => {
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
      resultado: {
        titulo: "Rascunho fraco",
        conteudoHtml: "<p>curto</p>",
        metaTitle: "x",
        metaDescription: "y",
        slug: "rascunho-fraco",
      },
      usage: { inputTokens: 300, outputTokens: 100 },
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({
      resultado: { aprovado: false, score: 40, motivo: "Muito curto." },
      usage: { inputTokens: 200, outputTokens: 20 },
    });
    const reprovarSpy = vi.spyOn(repositorio, "registrarReprovacaoPauta").mockResolvedValue(undefined);
    const { etapasChamadas, tokensExtraidos, detalhesExtraidos } = espiarRegistrarEtapa();

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "reprovado", pautaId: "pauta-1" });
    expect(reprovarSpy).toHaveBeenCalledWith("pauta-1", "Muito curto.");
    expect(etapasChamadas).toEqual(["buscar_checklist", "gerar_conteudo", "revisar"]);
    // Important #1 da revisão: o motivo da reprovação por score baixo precisa ir pra pautas_execucao_log
    // (coluna detalhes da etapa "revisar"), mesmo a linha sendo sucesso: true (não é exceção técnica).
    expect(detalhesExtraidos.revisar).toBe("Muito curto.");
    // Important #2 da revisão: confirma que a lambda de tokens de gerar_conteudo/revisar não troca
    // inputTokens/outputTokens também neste cenário (score baixo), não só no de sucesso.
    expect(tokensExtraidos.gerar_conteudo).toEqual({ tokensEntrada: 300, tokensSaida: 100 });
    expect(tokensExtraidos.revisar).toEqual({ tokensEntrada: 200, tokensSaida: 20 });
  });

  // Fase 3 (personas ricas), Task 5, spec seção 7 — o call-site novo em processar-pauta.ts: quando
  // a pauta selecionada tem personaId (nasceu do terceiro caminho do Estrategista, Task 4),
  // carregarPersona é chamado e o resultado passado pro Escritor.
  it("carrega a persona e passa pro Escritor quando a pauta tem personaId", async () => {
    const pautaComPersona = { ...pautaFalsa, personaId: "persona-1" };
    const personaFalsa = {
      id: "persona-1",
      nome: "Marcelo Andrade",
      dorEntrada: "Nome negativado no Serasa há meses.",
      angulosProntos: [],
      usadaPelaUltimaVezEm: null,
      conteudoCompleto: "## Bloco 1 — Ficha rápida\n...",
    };
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaComPersona);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    const carregarPersonaSpy = vi.spyOn(repositorio, "carregarPersona").mockResolvedValue(personaFalsa);
    const gerarConteudoSpy = vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
      resultado: {
        titulo: "Rascunho",
        conteudoHtml: "<p>...</p>",
        metaTitle: "x",
        metaDescription: "y",
        slug: "rascunho",
      },
      usage: { inputTokens: 300, outputTokens: 100 },
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({
      resultado: { aprovado: false, score: 40, motivo: "Muito curto." },
      usage: { inputTokens: 200, outputTokens: 20 },
    });
    vi.spyOn(repositorio, "registrarReprovacaoPauta").mockResolvedValue(undefined);

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "reprovado", pautaId: "pauta-1" });
    expect(carregarPersonaSpy).toHaveBeenCalledWith("persona-1");
    expect(gerarConteudoSpy).toHaveBeenCalledWith(pautaComPersona, [], personaFalsa);
  });

  // Regressão: pauta antiga/manual (personaId null) não deve pagar o custo de carregarPersona nem
  // quebrar o Escritor — persona chega como null, exatamente como fluía antes desta task.
  it("não carrega persona quando pauta.personaId é null (regressão)", async () => {
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    const carregarPersonaSpy = vi.spyOn(repositorio, "carregarPersona");
    const gerarConteudoSpy = vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
      resultado: {
        titulo: "Rascunho",
        conteudoHtml: "<p>...</p>",
        metaTitle: "x",
        metaDescription: "y",
        slug: "rascunho",
      },
      usage: { inputTokens: 300, outputTokens: 100 },
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({
      resultado: { aprovado: false, score: 40, motivo: "Muito curto." },
      usage: { inputTokens: 200, outputTokens: 20 },
    });
    vi.spyOn(repositorio, "registrarReprovacaoPauta").mockResolvedValue(undefined);

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "reprovado", pautaId: "pauta-1" });
    expect(carregarPersonaSpy).not.toHaveBeenCalled();
    expect(gerarConteudoSpy).toHaveBeenCalledWith(pautaFalsa, [], null);
  });

  it("bloqueia sem gerar quando o limite de tentativas já foi esgotado", async () => {
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue({
      ...pautaFalsa,
      tentativas: 3,
      motivoUltimaReprovacao: "Muito curto.",
    });
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    const bloquearSpy = vi.spyOn(repositorio, "marcarPautaBloqueada").mockResolvedValue(undefined);
    const gerarSpy = vi.spyOn(escritor, "gerarConteudo");

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "bloqueada", pautaId: "pauta-1" });
    expect(bloquearSpy).toHaveBeenCalledWith("pauta-1", "Muito curto.");
    expect(gerarSpy).not.toHaveBeenCalled();
  });

  it("reprova e não deixa a pauta presa quando uma etapa lança exceção inesperada", async () => {
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    vi.spyOn(escritor, "gerarConteudo").mockRejectedValue(new Error("Falha de rede"));
    const reprovarSpy = vi.spyOn(repositorio, "registrarReprovacaoPauta").mockResolvedValue(undefined);
    const { etapasChamadas } = espiarRegistrarEtapa();

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "reprovado", pautaId: "pauta-1" });
    expect(reprovarSpy).toHaveBeenCalledWith("pauta-1", "Falha de rede");
    // A etapa gerar_conteudo é registrada (linha de log com iniciado_em) mesmo lançando exceção —
    // registrarEtapa (real) marcaria sucesso: false; aqui só confirmamos que ela foi de fato
    // invocada antes de propagar o erro pro catch externo.
    expect(etapasChamadas).toEqual(["buscar_checklist", "gerar_conteudo"]);
  });
});
