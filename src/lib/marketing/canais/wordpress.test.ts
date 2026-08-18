import { afterEach, describe, expect, it, vi } from "vitest";
import { criarAdaptadorWordPress } from "./wordpress";
import type { ConteudoCanal } from "./tipos";

const conteudo: ConteudoCanal = {
  titulo: "Como Limpar o Nome no Serasa",
  corpoHtml: "<h1>Como Limpar o Nome no Serasa</h1><p>...</p>",
  slug: "como-limpar-nome-serasa",
  metaTitle: "Como Limpar Nome no Serasa",
  metaDescription: "Guia completo.",
};

const credenciaisFalsas = { usuario: "claude-conteudo", senhaApp: "senha-app-teste" };

describe("criarAdaptadorWordPress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("criarRascunho chama a REST API com status draft e retorna o id remoto", async () => {
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 123, status: "draft" }),
    });
    vi.stubGlobal("fetch", fetchFalso);

    const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com", credenciaisFalsas);
    const resultado = await adaptador.criarRascunho(conteudo);

    expect(resultado).toEqual({ idRemoto: "123", status: "rascunho" });
    const [url, opcoes] = fetchFalso.mock.calls[0];
    expect(url).toBe("https://teste.exemplo.com/wp-json/wp/v2/posts");
    expect(opcoes.method).toBe("POST");
    const corpo = JSON.parse(opcoes.body);
    expect(corpo.status).toBe("draft");
    expect(corpo.slug).toBe("como-limpar-nome-serasa");
    expect(opcoes.headers.Authorization).toContain("Basic ");
  });

  it("aprovarPublicar atualiza o status para publish e retorna a URL", async () => {
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 123, status: "publish", link: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
    });
    vi.stubGlobal("fetch", fetchFalso);

    const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com", credenciaisFalsas);
    const resultado = await adaptador.aprovarPublicar("123");

    expect(resultado).toEqual({ urlPublicada: "https://teste.exemplo.com/como-limpar-nome-serasa/" });
    const [, opcoes] = fetchFalso.mock.calls[0];
    expect(JSON.parse(opcoes.body).status).toBe("publish");
  });

  it("verificarRascunho retorna { ok: true } quando o post tem conteúdo renderizado", async () => {
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "draft", content: { rendered: "<h1>Como Limpar o Nome no Serasa</h1><p>...</p>" } }),
    });
    vi.stubGlobal("fetch", fetchFalso);

    const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com", credenciaisFalsas);
    const resultado = await adaptador.verificarRascunho("123");

    expect(resultado).toEqual({ ok: true });
  });

  it("verificarRascunho retorna { ok: false, detalhes: ... } quando o conteúdo vem vazio", async () => {
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "draft", content: { rendered: "" } }),
    });
    vi.stubGlobal("fetch", fetchFalso);

    const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com", credenciaisFalsas);
    const resultado = await adaptador.verificarRascunho("123");

    expect(resultado).toEqual({ ok: false, detalhes: "Rascunho sem conteúdo renderizado." });
  });

  it("lança erro claro quando as credenciais estão vazias", async () => {
    const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com", { usuario: "", senhaApp: "" });
    await expect(adaptador.criarRascunho(conteudo)).rejects.toThrow(/Credenciais de WordPress/);
  });
});
