// src/lib/marketing/links-externos.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { extrairLinksExternos, verificarLinksExternos } from "./links-externos";

describe("extrairLinksExternos", () => {
  it("extrai URLs http(s) únicas de tags <a href>", () => {
    const html =
      '<p>Veja <a href="https://www.bcb.gov.br/pagina">o BACEN</a> e ' +
      '<a href="https://www.serasa.com.br/limpa-nome">o Serasa</a>.</p>';

    expect(extrairLinksExternos(html)).toEqual(["https://www.bcb.gov.br/pagina", "https://www.serasa.com.br/limpa-nome"]);
  });

  it("ignora mailto:, tel: e âncoras internas (não têm esquema http(s))", () => {
    const html =
      '<a href="mailto:contato@exemplo.com">e-mail</a>' +
      '<a href="tel:+5511999999999">telefone</a>' +
      '<a href="#faq-1">pergunta 1</a>';

    expect(extrairLinksExternos(html)).toEqual([]);
  });

  it("deduplica a mesma URL citada mais de uma vez", () => {
    const html = '<a href="https://www.bcb.gov.br/x">1</a><a href="https://www.bcb.gov.br/x">2</a>';

    expect(extrairLinksExternos(html)).toEqual(["https://www.bcb.gov.br/x"]);
  });

  it("retorna array vazio quando não há links", () => {
    expect(extrairLinksExternos("<p>Sem links aqui.</p>")).toEqual([]);
  });
});

describe("verificarLinksExternos", () => {
  const fetchOriginal = global.fetch;

  afterEach(() => {
    global.fetch = fetchOriginal;
    vi.restoreAllMocks();
  });

  it("marca como ok um link que responde 200 no HEAD", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);

    const resultado = await verificarLinksExternos(["https://exemplo.com/ok"]);

    expect(resultado).toEqual([{ url: "https://exemplo.com/ok", ok: true }]);
    expect(global.fetch).toHaveBeenCalledWith("https://exemplo.com/ok", expect.objectContaining({ method: "HEAD" }));
  });

  it("marca como falha um link que responde 404", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);

    const resultado = await verificarLinksExternos(["https://exemplo.com/quebrado"]);

    expect(resultado).toEqual([{ url: "https://exemplo.com/quebrado", ok: false, motivo: "HTTP 404" }]);
  });

  it("cai pra GET quando o HEAD responde 405 (método não permitido)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 405 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response);
    global.fetch = fetchMock;

    const resultado = await verificarLinksExternos(["https://exemplo.com/sem-head"]);

    expect(resultado).toEqual([{ url: "https://exemplo.com/sem-head", ok: true }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "GET" });
  });

  it("cai pra GET quando o HEAD lança (conexão recusada, não um status HTTP limpo)", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("conexão recusada")).mockResolvedValueOnce({ ok: true, status: 200 } as Response);
    global.fetch = fetchMock;

    const resultado = await verificarLinksExternos(["https://exemplo.com/head-recusado"]);

    expect(resultado).toEqual([{ url: "https://exemplo.com/head-recusado", ok: true }]);
  });

  it("marca como falha quando GET também lança depois do HEAD falhar", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("conexão recusada")).mockRejectedValueOnce(new Error("timeout de verdade"));
    global.fetch = fetchMock;

    const resultado = await verificarLinksExternos(["https://exemplo.com/fora-do-ar"]);

    expect(resultado).toEqual([{ url: "https://exemplo.com/fora-do-ar", ok: false, motivo: "timeout de verdade" }]);
  });

  it("verifica múltiplos links em paralelo, cada um com seu próprio resultado", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => (url.includes("ok") ? { ok: true, status: 200 } : { ok: false, status: 404 }));

    const resultado = await verificarLinksExternos(["https://exemplo.com/ok", "https://exemplo.com/quebrado"]);

    expect(resultado).toEqual([
      { url: "https://exemplo.com/ok", ok: true },
      { url: "https://exemplo.com/quebrado", ok: false, motivo: "HTTP 404" },
    ]);
  });

  it("retorna array vazio pra lista vazia (nenhum request feito)", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const resultado = await verificarLinksExternos([]);

    expect(resultado).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
