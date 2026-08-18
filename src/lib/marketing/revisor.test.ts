// src/lib/marketing/revisor.test.ts
import { describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { revisarConteudo } from "./revisor";
import type { ConteudoGerado, ItemChecklistCarregado } from "./tipos";

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  return { default: vi.fn(function () { return { messages: { create } }; }) };
});

const conteudo: ConteudoGerado = {
  titulo: "Como Limpar o Nome no Serasa",
  conteudoHtml: "<h1>...</h1>".repeat(20),
  metaTitle: "Como Limpar Nome no Serasa",
  metaDescription: "Guia completo.",
  slug: "como-limpar-nome-serasa",
};

const checklist: ItemChecklistCarregado[] = [{ id: "1", item: "Mínimo 1.800 palavras", peso: 10 }];

describe("revisarConteudo", () => {
  it("aprova quando o score é >= 80", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue({
      content: [{ type: "tool_use", input: { score: 90, motivo: null } }],
      usage: { input_tokens: 800, output_tokens: 40 },
    });

    const { resultado, usage } = await revisarConteudo(conteudo, checklist);

    expect(resultado.aprovado).toBe(true);
    expect(resultado.score).toBe(90);
    expect(usage.inputTokens).toBe(800);
    expect(usage.outputTokens).toBe(40);
  });

  it("reprova quando o score é < 80 e exige motivo", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue({
      content: [{ type: "tool_use", input: { score: 60, motivo: "Faltam links externos para fontes oficiais." } }],
      usage: { input_tokens: 700, output_tokens: 30 },
    });

    const { resultado, usage } = await revisarConteudo(conteudo, checklist);

    expect(resultado.aprovado).toBe(false);
    expect(resultado.motivo).toBe("Faltam links externos para fontes oficiais.");
    expect(usage.inputTokens).toBe(700);
    expect(usage.outputTokens).toBe(30);
  });
});
