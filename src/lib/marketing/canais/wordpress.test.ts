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

// 1x1 PNG transparente real (não placeholder) — mesmo payload de teste usado em fixtures públicas
// de "menor PNG válido possível". Decodifica pra 67 bytes de verdade, então serve pra testar a
// decodificação base64 -> Buffer com bytes reais, não uma string qualquer.
const PNG_1X1_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const DATA_URL_PNG_1X1 = `data:image/png;base64,${PNG_1X1_BASE64}`;

describe("criarAdaptadorWordPress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("criarRascunho chama a REST API com status draft e retorna o id remoto", async () => {
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 123, status: "draft", link: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
    });
    vi.stubGlobal("fetch", fetchFalso);

    const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com", credenciaisFalsas);
    const resultado = await adaptador.criarRascunho(conteudo);

    expect(resultado).toEqual({ idRemoto: "123", status: "rascunho", link: "https://teste.exemplo.com/como-limpar-nome-serasa/" });
    const [url, opcoes] = fetchFalso.mock.calls[0];
    expect(url).toBe("https://teste.exemplo.com/wp-json/wp/v2/posts");
    expect(opcoes.method).toBe("POST");
    const corpo = JSON.parse(opcoes.body);
    expect(corpo.status).toBe("draft");
    expect(corpo.slug).toBe("como-limpar-nome-serasa");
    expect(opcoes.headers.Authorization).toContain("Basic ");
  });

  it("criarRascunho sem imagemDestacadaId: payload idêntico ao comportamento anterior a esta task (regressão)", async () => {
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 123, status: "draft", link: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
    });
    vi.stubGlobal("fetch", fetchFalso);

    const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com", credenciaisFalsas);
    await adaptador.criarRascunho(conteudo);

    const [, opcoes] = fetchFalso.mock.calls[0];
    const corpo = JSON.parse(opcoes.body);
    // Comparação exata (não parcial) do objeto inteiro: nenhuma chave nova (featured_media ou
    // qualquer outra) pode aparecer quando imagemDestacadaId é omitido.
    expect(corpo).toEqual({
      title: conteudo.titulo,
      content: conteudo.corpoHtml,
      slug: conteudo.slug,
      status: "draft",
      meta: { _yoast_wpseo_title: conteudo.metaTitle, _yoast_wpseo_metadesc: conteudo.metaDescription },
    });
    expect(corpo).not.toHaveProperty("featured_media");
  });

  it("criarRascunho com imagemDestacadaId: featured_media aparece no payload com o valor correto", async () => {
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 123, status: "draft", link: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
    });
    vi.stubGlobal("fetch", fetchFalso);

    const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com", credenciaisFalsas);
    await adaptador.criarRascunho(conteudo, "789");

    const [, opcoes] = fetchFalso.mock.calls[0];
    const corpo = JSON.parse(opcoes.body);
    expect(corpo.featured_media).toBe("789");
    // Resto do payload permanece igual — só a chave nova foi adicionada.
    expect(corpo.slug).toBe(conteudo.slug);
    expect(corpo.status).toBe("draft");
  });

  // Fase 4e, Agente Agendador (20/08/2026).
  it("criarRascunho com agendadoPara: status vira future + date_gmt, e link vem no retorno", async () => {
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 123, status: "future", link: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
    });
    vi.stubGlobal("fetch", fetchFalso);

    const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com", credenciaisFalsas);
    const agendadoPara = new Date("2026-08-21T12:00:00.000Z");
    const resultado = await adaptador.criarRascunho(conteudo, undefined, agendadoPara);

    const [, opcoes] = fetchFalso.mock.calls[0];
    const corpo = JSON.parse(opcoes.body);
    expect(corpo.status).toBe("future");
    expect(corpo.date_gmt).toBe("2026-08-21T12:00:00.000Z");
    expect(resultado).toEqual({ idRemoto: "123", status: "rascunho", link: "https://teste.exemplo.com/como-limpar-nome-serasa/" });
  });

  it("criarRascunho sem agendadoPara: nem status future nem date_gmt aparecem no payload (regressão)", async () => {
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 123, status: "draft", link: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
    });
    vi.stubGlobal("fetch", fetchFalso);

    const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com", credenciaisFalsas);
    await adaptador.criarRascunho(conteudo);

    const [, opcoes] = fetchFalso.mock.calls[0];
    const corpo = JSON.parse(opcoes.body);
    expect(corpo.status).toBe("draft");
    expect(corpo).not.toHaveProperty("date_gmt");
  });

  // Agenda de Posts (20/08/2026) — um método único serve troca de foto, agendamento manual e
  // edição completa; testa cada subconjunto de campos independentemente.
  describe("atualizarPost", () => {
    it("envia POST /posts/{id} só com os campos informados (content + featuredMedia, ex.: troca de foto)", async () => {
      const fetchFalso = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ link: "https://teste.exemplo.com/post/" }) });
      vi.stubGlobal("fetch", fetchFalso);

      const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com", credenciaisFalsas);
      const resultado = await adaptador.atualizarPost("123", { content: "<p>Novo corpo</p>", featuredMedia: "789" });

      expect(resultado).toEqual({ link: "https://teste.exemplo.com/post/" });
      const [url, opcoes] = fetchFalso.mock.calls[0];
      expect(url).toBe("https://teste.exemplo.com/wp-json/wp/v2/posts/123");
      expect(opcoes.method).toBe("POST");
      const corpo = JSON.parse(opcoes.body);
      expect(corpo).toEqual({ content: "<p>Novo corpo</p>", featured_media: "789" });
    });

    it("envia status:future + date_gmt (ex.: reagendamento manual)", async () => {
      const fetchFalso = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ link: "https://teste.exemplo.com/post/" }) });
      vi.stubGlobal("fetch", fetchFalso);
      const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com", credenciaisFalsas);

      await adaptador.atualizarPost("123", { status: "future", dateGmt: "2026-08-25T12:00:00.000Z" });

      const [, opcoes] = fetchFalso.mock.calls[0];
      expect(JSON.parse(opcoes.body)).toEqual({ status: "future", date_gmt: "2026-08-25T12:00:00.000Z" });
    });

    it("envia title/slug/meta (ex.: edição completa do post)", async () => {
      const fetchFalso = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ link: "https://teste.exemplo.com/post/" }) });
      vi.stubGlobal("fetch", fetchFalso);
      const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com", credenciaisFalsas);

      await adaptador.atualizarPost("123", {
        title: "Novo título",
        slug: "novo-slug",
        meta: { _yoast_wpseo_title: "Meta title novo", _yoast_wpseo_metadesc: "Meta description nova" },
      });

      const [, opcoes] = fetchFalso.mock.calls[0];
      expect(JSON.parse(opcoes.body)).toEqual({
        title: "Novo título",
        slug: "novo-slug",
        meta: { _yoast_wpseo_title: "Meta title novo", _yoast_wpseo_metadesc: "Meta description nova" },
      });
    });

    it("não envia nenhum campo além do informado (payload vazio quando corpo vazio)", async () => {
      const fetchFalso = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ link: "https://teste.exemplo.com/post/" }) });
      vi.stubGlobal("fetch", fetchFalso);
      const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com", credenciaisFalsas);

      await adaptador.atualizarPost("123", {});

      const [, opcoes] = fetchFalso.mock.calls[0];
      expect(JSON.parse(opcoes.body)).toEqual({});
    });
  });

  it("enviarMidia sobe uma data URL (base64 real) pro endpoint /wp/v2/media e retorna idRemoto/url", async () => {
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 55, source_url: "https://teste.exemplo.com/wp-content/uploads/2026/08/capa.png" }),
    });
    vi.stubGlobal("fetch", fetchFalso);

    const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com", credenciaisFalsas);
    const resultado = await adaptador.enviarMidia(DATA_URL_PNG_1X1, "capa-como-limpar-nome-serasa.png", "Pessoa aliviada olhando notificação de nome limpo no celular");

    expect(resultado).toEqual({ idRemoto: "55", url: "https://teste.exemplo.com/wp-content/uploads/2026/08/capa.png" });
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    const [url, opcoes] = fetchFalso.mock.calls[0];
    expect(url).toBe(
      "https://teste.exemplo.com/wp-json/wp/v2/media?alt_text=" +
        encodeURIComponent("Pessoa aliviada olhando notificação de nome limpo no celular"),
    );
    expect(opcoes.method).toBe("POST");
    expect(opcoes.headers.Authorization).toContain("Basic ");
  });

  it("enviarMidia decodifica o base64 da data URL pros bytes binários exatos e monta os headers de upload corretos", async () => {
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 55, source_url: "https://teste.exemplo.com/wp-content/uploads/2026/08/capa.png" }),
    });
    vi.stubGlobal("fetch", fetchFalso);

    const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com", credenciaisFalsas);
    await adaptador.enviarMidia(DATA_URL_PNG_1X1, "capa-como-limpar-nome-serasa.png", "Alt text qualquer");

    const [, opcoes] = fetchFalso.mock.calls[0];
    expect(Buffer.isBuffer(opcoes.body)).toBe(true);
    expect(Buffer.compare(opcoes.body, Buffer.from(PNG_1X1_BASE64, "base64"))).toBe(0);
    expect(opcoes.headers["Content-Type"]).toBe("image/png");
    expect(opcoes.headers["Content-Disposition"]).toBe('attachment; filename="capa-como-limpar-nome-serasa.png"');
  });

  it("enviarMidia propaga o erro quando a API do WordPress responde com falha (não engole)", async () => {
    const fetchFalso = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchFalso);

    const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com", credenciaisFalsas);
    await expect(adaptador.enviarMidia(DATA_URL_PNG_1X1, "capa.png", "alt")).rejects.toThrow(/WordPress REST API respondeu 500/);
  });

  it("enviarMidia propaga o erro quando o fetch falha por rede (não engole)", async () => {
    const fetchFalso = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    vi.stubGlobal("fetch", fetchFalso);

    const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com", credenciaisFalsas);
    await expect(adaptador.enviarMidia(DATA_URL_PNG_1X1, "capa.png", "alt")).rejects.toThrow("ECONNRESET");
  });

  it("enviarMidia aceita uma URL http(s) de verdade como fallback: baixa via fetch antes de subir", async () => {
    const bytesOrigem = new Uint8Array([1, 2, 3, 4]);
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: (nome: string) => (nome === "content-type" ? "image/jpeg" : null) },
        arrayBuffer: async () => bytesOrigem.buffer,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 77, source_url: "https://teste.exemplo.com/wp-content/uploads/2026/08/foto.jpg" }),
      });
    vi.stubGlobal("fetch", fetchFalso);

    const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com", credenciaisFalsas);
    const resultado = await adaptador.enviarMidia("https://cdn.exemplo.com/foto-origem.jpg", "foto.jpg", "alt");

    expect(resultado).toEqual({ idRemoto: "77", url: "https://teste.exemplo.com/wp-content/uploads/2026/08/foto.jpg" });
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    expect(fetchFalso.mock.calls[0][0]).toBe("https://cdn.exemplo.com/foto-origem.jpg");
    const [, opcoesUpload] = fetchFalso.mock.calls[1];
    expect(Buffer.compare(opcoesUpload.body, Buffer.from(bytesOrigem))).toBe(0);
    expect(opcoesUpload.headers["Content-Type"]).toBe("image/jpeg");
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
