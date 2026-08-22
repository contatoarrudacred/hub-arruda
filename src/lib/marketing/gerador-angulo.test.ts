// src/lib/marketing/gerador-angulo.test.ts
import { describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { gerarAngulo } from "./gerador-angulo";
import { NOME_TIPO_ANGULO } from "./tipos";
import type { PersonaCarregada, TipoAngulo } from "./tipos";

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  return { default: vi.fn(function () { return { messages: { create } }; }) };
});

const persona: PersonaCarregada = {
  id: "persona-1",
  nome: "Marta, 42 anos, autônoma",
  dorEntrada: "Nome negativado, sem conseguir crédito pro negócio.",
  angulosProntos: [],
  usadaPelaUltimaVezEm: "2026-08-01T00:00:00Z",
  conteudoCompleto: "## Bloco 1 — Perfil\nMarta é autônoma, mãe de dois filhos...\n## Bloco 11 — Ângulos\n- **\"citação\"** (explicação)",
};

const angulosUsados = ["Como Marta limpou o nome sozinha", "Passo a passo para negociar dívida no Serasa"];
const tipoRequerido: TipoAngulo = "mito_ou_verdade";

function respostaValida(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    stop_reason: "tool_use",
    content: [
      {
        type: "tool_use",
        input: {
          angulo_texto: "Como reconhecer golpes de falsa negociação de dívida",
          palavra_chave_principal: "golpe negociação de dívida",
          palavras_secundarias: ["golpe serasa", "falsa negociação"],
          funil: "meio",
          tipo_conteudo: "post_padrao",
          ...overrides,
        },
      },
    ],
    usage: { input_tokens: 900, output_tokens: 150 },
  };
}

describe("gerarAngulo", () => {
  it("monta o prompt com o conteúdo completo da persona e a lista de ângulos usados, e retorna o ângulo estruturado", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue(respostaValida());

    const { resultado, usage } = await gerarAngulo(persona, angulosUsados, tipoRequerido);

    expect(resultado.anguloTexto).toBe("Como reconhecer golpes de falsa negociação de dívida");
    expect(resultado.palavraChavePrincipal).toBe("golpe negociação de dívida");
    expect(resultado.palavrasSecundarias).toEqual(["golpe serasa", "falsa negociação"]);
    expect(resultado.funil).toBe("meio");
    expect(resultado.tipoConteudo).toBe("post_padrao");
    expect(usage.inputTokens).toBe(900);
    expect(usage.outputTokens).toBe(150);

    const argumentosChamada = mockCreate.mock.calls[0][0];
    const prompt = argumentosChamada.messages[0].content as string;
    expect(prompt).toContain("Marta é autônoma, mãe de dois filhos");
    expect(prompt).toContain("Como Marta limpou o nome sozinha");
    expect(prompt).toContain("Passo a passo para negociar dívida no Serasa");
    expect(argumentosChamada.tool_choice).toEqual({ type: "tool", name: "registrar_angulo" });
  });

  it("inclui o label e a descrição do tipo sorteado no prompt, como instrução obrigatória", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue(respostaValida());

    await gerarAngulo(persona, angulosUsados, tipoRequerido);

    const argumentosChamada = mockCreate.mock.calls[0][0];
    const prompt = argumentosChamada.messages[0].content as string;
    expect(prompt).toContain(NOME_TIPO_ANGULO[tipoRequerido].label);
    expect(prompt).toContain(NOME_TIPO_ANGULO[tipoRequerido].descricao);
  });

  it("lança erro claro quando a resposta é truncada por limite de tokens", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue({ ...respostaValida(), stop_reason: "max_tokens" });

    await expect(gerarAngulo(persona, angulosUsados, tipoRequerido)).rejects.toThrow(/truncada por limite de tokens/);
  });

  it("lança erro claro quando um campo obrigatório vem ausente/vazio", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue(respostaValida({ angulo_texto: "" }));

    await expect(gerarAngulo(persona, angulosUsados, tipoRequerido)).rejects.toThrow(/angulo_texto/);
  });

  it("lança erro claro quando a palavra-chave principal vem vazia", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue(respostaValida({ palavra_chave_principal: "   " }));

    await expect(gerarAngulo(persona, angulosUsados, tipoRequerido)).rejects.toThrow(/palavra_chave_principal/);
  });

  it("lança erro claro quando o funil retornado não é um valor válido", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue(respostaValida({ funil: "invalido" }));

    await expect(gerarAngulo(persona, angulosUsados, tipoRequerido)).rejects.toThrow(/funil/);
  });

  it("lança erro claro quando o tipo de conteúdo retornado não é um valor válido", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue(respostaValida({ tipo_conteudo: "video" }));

    await expect(gerarAngulo(persona, angulosUsados, tipoRequerido)).rejects.toThrow(/tipo_conteudo/);
  });

  it("aceita lista de ângulos usados vazia (primeira geração de fallback)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue(respostaValida());

    const { resultado } = await gerarAngulo(persona, [], tipoRequerido);

    expect(resultado.anguloTexto).toBe("Como reconhecer golpes de falsa negociação de dívida");
  });
});
