// src/lib/marketing/escritor.test.ts
import { describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { gerarConteudo } from "./escritor";
import type { ItemChecklistCarregado, PautaCarregada } from "./tipos";

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  return {
    default: vi.fn(function () {
      return { messages: { create } };
    }),
  };
});

const pauta: PautaCarregada = {
  id: "pauta-1",
  matrizConteudoId: "matriz-1",
  palavraChavePrincipal: "limpar nome serasa",
  palavrasSecundarias: ["tirar nome do serasa"],
  angulo: "passo_a_passo",
  geografia: null,
  tipoConteudo: "post_padrao",
  funil: "topo",
  status: "em_producao",
  tentativas: 0,
  motivoUltimaReprovacao: null,
};

const checklist: ItemChecklistCarregado[] = [
  { id: "1", item: "H1 com a palavra-chave principal", peso: 10 },
  { id: "2", item: "Mínimo 1.800 palavras", peso: 10 },
];

describe("gerarConteudo", () => {
  it("monta o prompt com a pauta e o checklist, e retorna o conteúdo estruturado da ferramenta", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          input: {
            titulo: "Como Limpar o Nome no Serasa: Passo a Passo Completo",
            conteudo_html: "<h1>Como Limpar o Nome no Serasa</h1><p>...</p>".repeat(50),
            meta_title: "Como Limpar Nome no Serasa | Passo a Passo",
            meta_description: "Aprenda o passo a passo completo para limpar seu nome no Serasa em 2026.",
            slug: "como-limpar-nome-serasa",
          },
        },
      ],
      usage: { input_tokens: 1234, output_tokens: 5678 },
    });

    const { resultado, usage } = await gerarConteudo(pauta, checklist);

    expect(resultado.titulo).toContain("Serasa");
    expect(resultado.slug).toBe("como-limpar-nome-serasa");
    const argumentosChamada = mockCreate.mock.calls[0][0];
    expect(argumentosChamada.messages[0].content).toContain("limpar nome serasa");
    expect(argumentosChamada.messages[0].content).toContain("H1 com a palavra-chave principal");
    expect(argumentosChamada.max_tokens).toBe(16000);
    expect(usage.inputTokens).toBe(1234);
    expect(usage.outputTokens).toBe(5678);
  });

  it("lança erro claro quando a resposta é truncada por limite de tokens", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue({
      stop_reason: "max_tokens",
      content: [
        {
          type: "tool_use",
          input: {
            titulo: "Como Limpar o Nome no Serasa",
            conteudo_html: "<h1>...",
            meta_title: "Como Limpar Nome no Serasa",
            meta_description: "Guia incompleto",
            slug: "como-limpar-nome-serasa",
          },
        },
      ],
    });

    await expect(gerarConteudo(pauta, checklist)).rejects.toThrow(/truncada por limite de tokens/);
  });

  it("lança erro claro quando um campo obrigatório vem ausente/vazio", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue({
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          input: {
            titulo: "",
            conteudo_html: "<h1>Como Limpar o Nome no Serasa</h1><p>...</p>",
            meta_title: "Como Limpar Nome no Serasa",
            meta_description: "Aprenda o passo a passo completo.",
            slug: "como-limpar-nome-serasa",
          },
        },
      ],
    });

    await expect(gerarConteudo(pauta, checklist)).rejects.toThrow(/titulo/);
  });
});
