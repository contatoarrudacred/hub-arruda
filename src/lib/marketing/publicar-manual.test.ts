// src/lib/marketing/publicar-manual.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { agendarPostManualmente } from "./publicar-manual";
import * as repositorio from "./repositorio";
import { criarAdaptadorWordPress } from "./canais/wordpress";
import type { PostDetalhado } from "./repositorio";
import type { PropriedadeCarregada } from "./tipos";

vi.mock("./canais/wordpress");

const propriedadeFalsa: PropriedadeCarregada = {
  id: "prop-1",
  nome: "Site Teste",
  urlBase: "https://teste.exemplo.com",
  tipoCms: "wordpress",
  maxTentativas: 3,
  autoria: null,
};

const postBaseFalso: PostDetalhado = {
  id: "post-1",
  pautaId: "pauta-1",
  propriedadeId: "prop-1",
  titulo: "Como Limpar o Nome",
  slug: "como-limpar-o-nome",
  metaTitle: "Como Limpar o Nome | Guia",
  metaDescription: "Guia completo.",
  conteudoHtml: "<h1>Como Limpar o Nome</h1><p>...</p>",
  status: "rascunho",
  imagemDestaqueUrl: null,
  imagemDestaqueMediaId: "media-1",
  imagensSecundarias: [],
  rascunhoIdWordpress: null,
  agendadoPara: null,
};

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("agendarPostManualmente", () => {
  it("primeira vez (sem rascunhoIdWordpress): cria no WordPress já agendado e marca a pauta como publicada", async () => {
    vi.spyOn(repositorio, "carregarPostDetalhado").mockResolvedValue(postBaseFalso);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    const atualizarStatusPostSpy = vi.spyOn(repositorio, "atualizarStatusPost").mockResolvedValue(undefined);
    const marcarPautaPublicadaSpy = vi.spyOn(repositorio, "marcarPautaPublicada").mockResolvedValue(undefined);

    const adaptadorFalso = {
      criarRascunho: vi.fn().mockResolvedValue({ idRemoto: "123", status: "rascunho", link: "https://teste.exemplo.com/post/" }),
      verificarRascunho: vi.fn(),
      aprovarPublicar: vi.fn(),
      enviarMidia: vi.fn(),
      atualizarPost: vi.fn(),
    };
    vi.mocked(criarAdaptadorWordPress).mockReturnValue(adaptadorFalso);

    const agendadoPara = new Date("2026-08-25T12:00:00.000Z");
    const resultado = await agendarPostManualmente("post-1", agendadoPara);

    expect(resultado).toEqual({ url: "https://teste.exemplo.com/post/" });
    expect(adaptadorFalso.criarRascunho).toHaveBeenCalledWith(
      { titulo: "Como Limpar o Nome", corpoHtml: "<h1>Como Limpar o Nome</h1><p>...</p>", slug: "como-limpar-o-nome", metaTitle: "Como Limpar o Nome | Guia", metaDescription: "Guia completo." },
      "media-1",
      agendadoPara,
    );
    expect(adaptadorFalso.atualizarPost).not.toHaveBeenCalled();
    expect(atualizarStatusPostSpy).toHaveBeenCalledWith(
      "post-1",
      "publicado",
      expect.objectContaining({
        canais: { wordpress: { rascunho_id: "123", status: "agendado", url: "https://teste.exemplo.com/post/" } },
        agendadoPara: "2026-08-25T12:00:00.000Z",
      }),
    );
    expect(marcarPautaPublicadaSpy).toHaveBeenCalledWith("pauta-1");
  });

  it("reagendamento (já tem rascunhoIdWordpress): só atualiza status/date_gmt no WordPress, não mexe na pauta", async () => {
    const postJaAgendado: PostDetalhado = {
      ...postBaseFalso,
      status: "publicado",
      rascunhoIdWordpress: "123",
      agendadoPara: "2026-08-24T12:00:00.000Z",
    };
    vi.spyOn(repositorio, "carregarPostDetalhado").mockResolvedValue(postJaAgendado);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    const atualizarStatusPostSpy = vi.spyOn(repositorio, "atualizarStatusPost").mockResolvedValue(undefined);
    const marcarPautaPublicadaSpy = vi.spyOn(repositorio, "marcarPautaPublicada").mockResolvedValue(undefined);

    const adaptadorFalso = {
      criarRascunho: vi.fn(),
      verificarRascunho: vi.fn(),
      aprovarPublicar: vi.fn(),
      enviarMidia: vi.fn(),
      atualizarPost: vi.fn().mockResolvedValue({ link: "https://teste.exemplo.com/post/" }),
    };
    vi.mocked(criarAdaptadorWordPress).mockReturnValue(adaptadorFalso);

    const novoAgendadoPara = new Date("2026-08-26T15:00:00.000Z");
    const resultado = await agendarPostManualmente("post-1", novoAgendadoPara);

    expect(resultado).toEqual({ url: "https://teste.exemplo.com/post/" });
    expect(adaptadorFalso.criarRascunho).not.toHaveBeenCalled();
    expect(adaptadorFalso.atualizarPost).toHaveBeenCalledWith("123", { status: "future", dateGmt: "2026-08-26T15:00:00.000Z" });
    expect(atualizarStatusPostSpy).toHaveBeenCalledWith("post-1", "publicado", { agendadoPara: "2026-08-26T15:00:00.000Z" });
    expect(marcarPautaPublicadaSpy).not.toHaveBeenCalled();
  });

  it("lança erro claro quando o post não existe", async () => {
    vi.spyOn(repositorio, "carregarPostDetalhado").mockResolvedValue(null);

    await expect(agendarPostManualmente("post-x", new Date())).rejects.toThrow(/Post post-x não encontrado/);
  });
});
