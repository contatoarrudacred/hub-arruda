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
      titulo: "Como Limpar o Nome no Serasa",
      conteudoHtml: "<h1>...</h1>",
      metaTitle: "Como Limpar Nome no Serasa",
      metaDescription: "Guia completo.",
      slug: "como-limpar-nome-serasa",
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({ aprovado: true, score: 92, motivo: null });
    vi.spyOn(repositorio, "criarPost").mockResolvedValue({ id: "post-1", pautaId: "pauta-1", propriedadeId: "prop-1", status: "rascunho" });
    vi.spyOn(repositorio, "atualizarStatusPost").mockResolvedValue(undefined);
    vi.spyOn(repositorio, "marcarPautaPublicada").mockResolvedValue(undefined);
    vi.mocked(inserirLinksInternos).mockResolvedValue("<h1>...</h1>");

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
      titulo: "Como Limpar o Nome no Serasa",
      conteudoHtml: "<h1>...</h1>",
      metaTitle: "Como Limpar Nome no Serasa",
      metaDescription: "Guia completo.",
      slug: "como-limpar-nome-serasa",
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({ aprovado: true, score: 92, motivo: null });
    vi.spyOn(repositorio, "criarPost").mockResolvedValue({ id: "post-1", pautaId: "pauta-1", propriedadeId: "prop-1", status: "rascunho" });
    const atualizarStatusPostSpy = vi.spyOn(repositorio, "atualizarStatusPost").mockRejectedValue(new Error("Falha ao gravar no banco"));
    const marcarPublicadaSpy = vi.spyOn(repositorio, "marcarPautaPublicada").mockResolvedValue(undefined);
    const bloquearSpy = vi.spyOn(repositorio, "marcarPautaBloqueada").mockResolvedValue(undefined);
    const reprovarSpy = vi.spyOn(repositorio, "registrarReprovacaoPauta").mockResolvedValue(undefined);
    const erroSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(inserirLinksInternos).mockResolvedValue("<h1>...</h1>");

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
      titulo: "Como Limpar o Nome no Serasa",
      conteudoHtml: "<h1>...</h1>",
      metaTitle: "Como Limpar Nome no Serasa",
      metaDescription: "Guia completo.",
      slug: "como-limpar-nome-serasa",
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({ aprovado: true, score: 92, motivo: null });
    vi.spyOn(repositorio, "criarPost").mockResolvedValue({ id: "post-1", pautaId: "pauta-1", propriedadeId: "prop-1", status: "rascunho" });
    const atualizarStatusPostSpy = vi.spyOn(repositorio, "atualizarStatusPost").mockResolvedValue(undefined);
    const marcarPublicadaSpy = vi.spyOn(repositorio, "marcarPautaPublicada").mockRejectedValue(new Error("Falha ao gravar no banco"));
    const bloquearSpy = vi.spyOn(repositorio, "marcarPautaBloqueada").mockResolvedValue(undefined);
    const reprovarSpy = vi.spyOn(repositorio, "registrarReprovacaoPauta").mockResolvedValue(undefined);
    const erroSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(inserirLinksInternos).mockResolvedValue("<h1>...</h1>");

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

    erroSpy.mockRestore();
  });

  it("reprova sem publicar quando o score da revisão é baixo", async () => {
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
      titulo: "Rascunho fraco",
      conteudoHtml: "<p>curto</p>",
      metaTitle: "x",
      metaDescription: "y",
      slug: "rascunho-fraco",
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({ aprovado: false, score: 40, motivo: "Muito curto." });
    const reprovarSpy = vi.spyOn(repositorio, "registrarReprovacaoPauta").mockResolvedValue(undefined);

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "reprovado", pautaId: "pauta-1" });
    expect(reprovarSpy).toHaveBeenCalledWith("pauta-1", "Muito curto.");
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

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "reprovado", pautaId: "pauta-1" });
    expect(reprovarSpy).toHaveBeenCalledWith("pauta-1", "Falha de rede");
  });
});
