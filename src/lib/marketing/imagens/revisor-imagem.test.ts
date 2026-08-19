// src/lib/marketing/imagens/revisor-imagem.test.ts
import { describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { revisarImagem } from "./revisor-imagem";

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  return { default: vi.fn(function () { return { messages: { create } }; }) };
});

function obterMockCreate() {
  process.env.ANTHROPIC_API_KEY = "sk-test";
  const clienteFalso = new Anthropic({ apiKey: "sk-test" });
  return clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
}

const imagemUrl = "https://exemplo-openai-images.com/gerada-123.png";
const trechoFonte =
  "O prazo para negativação sair do CPF é de 5 anos, conforme o art. 43 do CDC. Não há garantia de aprovação de crédito.";

describe("revisarImagem", () => {
  // Cenário 1: imagem aprovada — sem alucinação, fiel ao trecho-fonte, sem problema de qualidade.
  it("imagem aprovada retorna motivo: null", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          input: { aprovada: true, motivo: null },
        },
      ],
      usage: { input_tokens: 1200, output_tokens: 50 },
    });

    const { resultado, usage } = await revisarImagem(imagemUrl, trechoFonte);

    expect(resultado.aprovada).toBe(true);
    expect(resultado.motivo).toBeNull();
    expect(usage.inputTokens).toBe(1200);
    expect(usage.outputTokens).toBe(50);

    // A chamada precisa ser multimodal: bloco de imagem (fonte URL) + bloco de texto com o prompt,
    // e a ferramenta precisa ser forçada via tool_choice (mesmo padrão de revisor.ts/escritor.ts).
    const chamada = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0];
    expect(chamada.tool_choice).toEqual({ type: "tool", name: "registrar_revisao_imagem" });
    const conteudoEnviado = chamada.messages[0].content;
    expect(Array.isArray(conteudoEnviado)).toBe(true);
    const blocoImagem = conteudoEnviado.find((b: { type: string }) => b.type === "image");
    expect(blocoImagem.source).toEqual({ type: "url", url: imagemUrl });
    const blocoTexto = conteudoEnviado.find((b: { type: string }) => b.type === "text");
    expect(blocoTexto.text).toContain(trechoFonte);
  });

  // Cenário 2: imagem reprovada por alucinação — motivo específico mencionando o que a imagem
  // mostra que o trechoFonte não sustenta (não uma string genérica).
  it("imagem reprovada por alucinação retorna motivo específico mencionando o que não está sustentado pelo trechoFonte", async () => {
    const motivoEsperado =
      "Alucinação: a imagem mostra um selo \"aprovação garantida\" e o texto \"3 anos\" sobre o prazo de negativação — o trechoFonte fala em 5 anos (art. 43 do CDC) e não menciona garantia de aprovação de crédito. Regenerar sem esses dois elementos.";
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          input: { aprovada: false, motivo: motivoEsperado },
        },
      ],
      usage: { input_tokens: 1100, output_tokens: 70 },
    });

    const { resultado } = await revisarImagem(imagemUrl, trechoFonte);

    expect(resultado.aprovada).toBe(false);
    expect(resultado.motivo).toBe(motivoEsperado);
    expect(resultado.motivo).toContain("5 anos");
    expect(resultado.motivo).toContain("garantia de aprovação");
  });

  // Cenário 3: erro de rede/API precisa propagar (lançar), nunca virar um falso "aprovada: false"
  // silencioso — mesmo padrão de revisor.ts/escritor.ts (que não engolem erro de infraestrutura).
  it("erro de rede/API lança, não é engolido em um resultado silencioso", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockRejectedValue(new Error("ECONNRESET: conexão com a API da Anthropic caiu."));

    await expect(revisarImagem(imagemUrl, trechoFonte)).rejects.toThrow(
      "ECONNRESET: conexão com a API da Anthropic caiu.",
    );
  });

  it("lança quando o modelo não retorna o bloco de ferramenta esperado", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "sem ferramenta" }], usage: { input_tokens: 10, output_tokens: 5 } });

    await expect(revisarImagem(imagemUrl, trechoFonte)).rejects.toThrow(/não retornou/i);
  });

  it("lança quando reprovada sem motivo (campo obrigatório ausente)", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValue({
      content: [{ type: "tool_use", input: { aprovada: false, motivo: null } }],
      usage: { input_tokens: 900, output_tokens: 20 },
    });

    await expect(revisarImagem(imagemUrl, trechoFonte)).rejects.toThrow(/motivo/i);
  });

  // Task 7 — a OpenAI (GPT Image, ver gerador-imagem-openai.ts) nunca devolve URL pros modelos
  // GPT Image, só base64. `gerarImagemOpenAI` empacota isso como data URL
  // (`data:image/png;base64,...`) e passa pra `revisarImagem` no mesmo parâmetro `imagemUrl` —
  // este teste confirma que uma data URL vira um bloco `base64` (não `url`, que a Anthropic
  // tentaria buscar por HTTP e falharia).
  it("aceita data URL base64 (formato produzido pela OpenAI) e monta bloco base64, não url", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValue({
      content: [{ type: "tool_use", input: { aprovada: true, motivo: null } }],
      usage: { input_tokens: 500, output_tokens: 10 },
    });

    const dataUrl = "data:image/png;base64,aGVsbG8tbXVuZG8=";
    await revisarImagem(dataUrl, trechoFonte);

    const chamada = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0];
    const blocoImagem = chamada.messages[0].content.find((b: { type: string }) => b.type === "image");
    expect(blocoImagem.source).toEqual({
      type: "base64",
      media_type: "image/png",
      data: "aGVsbG8tbXVuZG8=",
    });
  });
});
