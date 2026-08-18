// src/lib/marketing/processar-pauta.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { processarProximaPauta } from "./processar-pauta";
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

describe("processarProximaPauta", () => {
  afterEach(() => {
    vi.clearAllMocks();
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

  it("mantém o resultado publicado sem reprovar quando o registro pós-publicação falha", async () => {
    // Regressão do bug de janela de publicação duplicada: se aprovarPublicar já teve sucesso
    // (post no ar) mas atualizarStatusPost falhar depois, NÃO pode cair em registrarReprovacaoPauta
    // — isso devolveria a pauta pra fila e geraria um segundo artigo publicado no próximo ciclo.
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
    vi.spyOn(repositorio, "atualizarStatusPost").mockRejectedValue(new Error("Falha ao gravar no banco"));
    const marcarPublicadaSpy = vi.spyOn(repositorio, "marcarPautaPublicada").mockResolvedValue(undefined);
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
    expect(marcarPublicadaSpy).not.toHaveBeenCalled();
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
