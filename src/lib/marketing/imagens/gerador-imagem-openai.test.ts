// src/lib/marketing/imagens/gerador-imagem-openai.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { gerarImagemOpenAI } from "./gerador-imagem-openai";

vi.mock("openai", () => {
  const generate = vi.fn();
  return { default: vi.fn(function () { return { images: { generate } }; }) };
});

function obterMockGenerate() {
  process.env.OPENAI_API_KEY = "sk-test-openai";
  const clienteFalso = new OpenAI({ apiKey: "sk-test-openai" });
  return clienteFalso.images.generate as unknown as ReturnType<typeof vi.fn>;
}

describe("gerarImagemOpenAI", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Cenário 1: geração bem-sucedida — a resposta real da OpenAI pros modelos GPT Image só tem
  // b64_json (nunca url, ver comentário no cabeçalho do módulo), então o wrapper precisa
  // empacotar isso como data URL e devolver um custoUsd fixo e sourced (não inventado).
  it("gera imagem e devolve data URL + custoUsd, chamando com model/size/quality corretos", async () => {
    const mockGenerate = obterMockGenerate();
    mockGenerate.mockResolvedValue({
      data: [{ b64_json: "aGVsbG8tbXVuZG8=" }],
    });

    const { url, usage } = await gerarImagemOpenAI("uma foto realista de...", "16:9");

    expect(url).toBe("data:image/png;base64,aGVsbG8tbXVuZG8=");
    expect(usage.custoUsd).toBeGreaterThan(0);
    expect(typeof usage.custoUsd).toBe("number");

    const chamada = mockGenerate.mock.calls[mockGenerate.mock.calls.length - 1][0];
    expect(chamada.model).toBe("gpt-image-2");
    expect(chamada.prompt).toBe("uma foto realista de...");
    expect(chamada.size).toBe("1536x1024");
    expect(chamada.quality).toBe("medium");
    expect(chamada.output_format).toBe("png");
  });

  // Cenário 2: resposta sem b64_json (formato inesperado) — lança, não devolve URL vazia/quebrada
  // silenciosamente. Quem decide engolir isso e degradar sem imagem é o chamador (capa.ts).
  it("lança quando a resposta não tem b64_json", async () => {
    const mockGenerate = obterMockGenerate();
    mockGenerate.mockResolvedValue({ data: [{}] });

    await expect(gerarImagemOpenAI("prompt qualquer", "16:9")).rejects.toThrow(/b64_json/i);
  });

  // Cenário 3: erro de rede/API da OpenAI propaga (não é engolido aqui) — mesmo padrão dos
  // agentes Anthropic do módulo (revisor.ts/escritor.ts/revisor-imagem.ts).
  it("erro de rede/API da OpenAI propaga, não é engolido em um resultado silencioso", async () => {
    const mockGenerate = obterMockGenerate();
    mockGenerate.mockRejectedValue(new Error("ECONNRESET: conexão com a API da OpenAI caiu."));

    await expect(gerarImagemOpenAI("prompt qualquer", "16:9")).rejects.toThrow(
      "ECONNRESET: conexão com a API da OpenAI caiu.",
    );
  });

  it("lança quando OPENAI_API_KEY não está configurada", async () => {
    const chaveOriginal = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    vi.resetModules();
    try {
      const { gerarImagemOpenAI: gerarSemChave } = await import("./gerador-imagem-openai");
      await expect(gerarSemChave("prompt", "16:9")).rejects.toThrow(/OPENAI_API_KEY/);
    } finally {
      if (chaveOriginal) process.env.OPENAI_API_KEY = chaveOriginal;
      vi.resetModules();
    }
  });
});
