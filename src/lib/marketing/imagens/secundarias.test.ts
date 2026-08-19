// src/lib/marketing/imagens/secundarias.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { gerarImagensSecundarias } from "./secundarias";
import * as geradorImagemOpenAI from "./gerador-imagem-openai";
import * as revisorImagem from "./revisor-imagem";
import type { ConteudoGerado } from "../tipos";

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  return { default: vi.fn(function () { return { messages: { create } }; }) };
});

vi.mock("./gerador-imagem-openai", () => ({
  gerarImagemOpenAI: vi.fn(),
}));

vi.mock("./revisor-imagem", () => ({
  revisarImagem: vi.fn(),
}));

function obterMockCreate() {
  process.env.ANTHROPIC_API_KEY = "sk-test";
  const clienteFalso = new Anthropic({ apiKey: "sk-test" });
  return clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
}

const conteudo: ConteudoGerado = {
  titulo: "Como limpar seu nome no Serasa em 2026",
  conteudoHtml:
    "<h1>Como limpar seu nome no Serasa em 2026</h1>" +
    "<h2>Passo a passo</h2><p>1. Acesse o site do Serasa. 2. Consulte o CPF. 3. Negocie a dívida. 4. Aguarde a baixa.</p>" +
    "<h2>Prazos</h2><p>A negativação sai do CPF em até 5 anos, mesmo sem pagamento.</p>",
  metaTitle: "Como limpar seu nome no Serasa | Guia 2026",
  metaDescription: "Veja o passo a passo para limpar seu nome no Serasa. Saiba os prazos e como negociar.",
  slug: "como-limpar-nome-serasa",
};

// Uma "oportunidade" completa e aprovada (nota total 36/40, ganho de compreensão 9/10) — usada
// como base pelos helpers abaixo, sobrescrevendo só os campos que cada teste precisa variar.
function oportunidadeAprovada(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tipo_visual: "passo a passo visual",
    titulo_imagem: "Os 4 passos para negociar no Serasa",
    objetivo_didatico: "Mostrar a sequência de etapas do processo de negociação.",
    trecho_fonte_integral: "1. Acesse o site do Serasa. 2. Consulte o CPF. 3. Negocie a dívida. 4. Aguarde a baixa.",
    informacoes_que_podem_aparecer: "As 4 etapas: acessar o site, consultar o CPF, negociar a dívida, aguardar a baixa.",
    estrutura_visual_sugerida: "Passo a passo numerado, um bloco por etapa, seta conectando os blocos.",
    posicao_sugerida: "Depois da seção 'Passo a passo'",
    alt: "Passo a passo com 4 etapas para negociar dívida no Serasa",
    slug: "passo-a-passo-negociar-serasa",
    legenda: "As 4 etapas para negociar sua dívida no Serasa.",
    ganho_de_compreensao: 9,
    densidade_informacional: 9,
    adequacao_visual: 9,
    relevancia_para_o_argumento: 9,
    ...overrides,
  };
}

function respostaIdentificacao(oportunidades: unknown[], tokens = { input_tokens: 300, output_tokens: 150 }) {
  return {
    content: [{ type: "tool_use", name: "registrar_oportunidades_imagens_secundarias", input: { oportunidades } }],
    usage: tokens,
  };
}

describe("gerarImagensSecundarias", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Cenário 1 (brief): zero oportunidades aprovadas → array vazio, SEM nunca chamar
  // gerarImagemOpenAI. "Zero é uma resposta válida e desejável" — não pode vazar custo num post
  // que não precisa de imagens.
  it("zero oportunidades aprovadas → resultado vazio, nunca chama gerarImagemOpenAI", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValueOnce(respostaIdentificacao([]));

    const { resultado, usage } = await gerarImagensSecundarias(conteudo);

    expect(resultado).toEqual([]);
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(geradorImagemOpenAI.gerarImagemOpenAI).not.toHaveBeenCalled();
    expect(revisorImagem.revisarImagem).not.toHaveBeenCalled();
  });

  // Cenário 2 (brief): até 3 aprovadas → cada uma gera uma imagem, cada uma passa por
  // revisarImagem com O SEU PRÓPRIO trechoFonte (não o post inteiro).
  it("3 oportunidades aprovadas → 3 imagens, cada uma revisada com seu próprio trecho-fonte", async () => {
    const mockCreate = obterMockCreate();
    const oportunidades = [
      oportunidadeAprovada({ trecho_fonte_integral: "TRECHO A — passo a passo.", slug: "img-a", titulo_imagem: "Título A", posicao_sugerida: "após seção A" }),
      oportunidadeAprovada({ trecho_fonte_integral: "TRECHO B — prazos.", slug: "img-b", titulo_imagem: "Título B", posicao_sugerida: "após seção B" }),
      oportunidadeAprovada({ trecho_fonte_integral: "TRECHO C — comparativo.", slug: "img-c", titulo_imagem: "Título C", posicao_sugerida: "após seção C" }),
    ];
    mockCreate.mockResolvedValueOnce(respostaIdentificacao(oportunidades));

    vi.mocked(geradorImagemOpenAI.gerarImagemOpenAI)
      .mockResolvedValueOnce({ url: "data:image/png;base64,aaa=", usage: { custoUsd: 0.041 } })
      .mockResolvedValueOnce({ url: "data:image/png;base64,bbb=", usage: { custoUsd: 0.041 } })
      .mockResolvedValueOnce({ url: "data:image/png;base64,ccc=", usage: { custoUsd: 0.041 } });

    vi.mocked(revisorImagem.revisarImagem).mockResolvedValue({
      resultado: { aprovada: true, motivo: null },
      usage: { inputTokens: 20, outputTokens: 10 },
    });

    const { resultado } = await gerarImagensSecundarias(conteudo);

    expect(resultado).toHaveLength(3);
    expect(resultado.map((r) => r.slug)).toEqual(["img-a", "img-b", "img-c"]);
    expect(resultado.map((r) => r.posicaoAposSecao)).toEqual(["após seção A", "após seção B", "após seção C"]);

    expect(revisorImagem.revisarImagem).toHaveBeenCalledTimes(3);
    expect(revisorImagem.revisarImagem).toHaveBeenNthCalledWith(1, expect.any(String), "TRECHO A — passo a passo.");
    expect(revisorImagem.revisarImagem).toHaveBeenNthCalledWith(2, expect.any(String), "TRECHO B — prazos.");
    expect(revisorImagem.revisarImagem).toHaveBeenNthCalledWith(3, expect.any(String), "TRECHO C — comparativo.");

    // legenda faz parte do retorno (gap que a capa não tinha).
    expect(resultado[0].legenda).toBe("As 4 etapas para negociar sua dívida no Serasa.");
  });

  // Cenário 3 (brief, "o mais importante"): modelo propõe 4 candidatas mas uma tem
  // ganho_de_compreensao 6/10 (abaixo do limiar 8, mesmo com nota total alta) — é descartada, só
  // as outras 3 seguem pra geração. Não afrouxar o filtro.
  it("candidata com ganho_de_compreensao abaixo de 8 é descartada mesmo com nota total alta", async () => {
    const mockCreate = obterMockCreate();
    const oportunidades = [
      oportunidadeAprovada({ slug: "aprovada-1", trecho_fonte_integral: "trecho 1" }),
      // Nota total = 10+10+10+6 = 36 >= 30, mas ganho_de_compreensao = 6 < 8 → reprovada.
      oportunidadeAprovada({
        slug: "reprovada-por-ganho",
        trecho_fonte_integral: "trecho reprovado",
        ganho_de_compreensao: 6,
        densidade_informacional: 10,
        adequacao_visual: 10,
        relevancia_para_o_argumento: 10,
      }),
      oportunidadeAprovada({ slug: "aprovada-2", trecho_fonte_integral: "trecho 2" }),
    ];
    mockCreate.mockResolvedValueOnce(respostaIdentificacao(oportunidades));

    vi.mocked(geradorImagemOpenAI.gerarImagemOpenAI).mockResolvedValue({
      url: "data:image/png;base64,xxx=",
      usage: { custoUsd: 0.041 },
    });
    vi.mocked(revisorImagem.revisarImagem).mockResolvedValue({
      resultado: { aprovada: true, motivo: null },
      usage: { inputTokens: 5, outputTokens: 5 },
    });

    const { resultado } = await gerarImagensSecundarias(conteudo);

    expect(resultado).toHaveLength(2);
    expect(resultado.map((r) => r.slug)).toEqual(["aprovada-1", "aprovada-2"]);
    expect(revisorImagem.revisarImagem).not.toHaveBeenCalledWith(expect.any(String), "trecho reprovado");
    expect(revisorImagem.revisarImagem).toHaveBeenCalledTimes(2);
  });

  // Também cobre nota total abaixo de 30 (mesmo com ganho_de_compreensao alto) — os dois
  // critérios são exigidos ao mesmo tempo, não um OU o outro.
  it("candidata com nota total abaixo de 30 é descartada mesmo com ganho_de_compreensao 8+", async () => {
    const mockCreate = obterMockCreate();
    const oportunidades = [
      // 8+5+5+5 = 23 < 30, mesmo com ganho_de_compreensao = 8.
      oportunidadeAprovada({
        slug: "reprovada-por-nota-total",
        ganho_de_compreensao: 8,
        densidade_informacional: 5,
        adequacao_visual: 5,
        relevancia_para_o_argumento: 5,
      }),
    ];
    mockCreate.mockResolvedValueOnce(respostaIdentificacao(oportunidades));

    const { resultado } = await gerarImagensSecundarias(conteudo);

    expect(resultado).toEqual([]);
    expect(geradorImagemOpenAI.gerarImagemOpenAI).not.toHaveBeenCalled();
  });

  // Cenário 4 (brief): uma candidata falha (reprovada nas 2 tentativas) → é descartada, as
  // outras candidatas seguem e aparecem no resultado.
  it("uma candidata falha após esgotar tentativas → é descartada, as outras seguem normalmente", async () => {
    const mockCreate = obterMockCreate();
    const oportunidades = [
      oportunidadeAprovada({ slug: "falha-sempre", trecho_fonte_integral: "trecho que sempre falha" }),
      oportunidadeAprovada({ slug: "sucesso", trecho_fonte_integral: "trecho que sempre passa" }),
    ];
    mockCreate.mockResolvedValueOnce(respostaIdentificacao(oportunidades));

    vi.mocked(geradorImagemOpenAI.gerarImagemOpenAI).mockResolvedValue({
      url: "data:image/png;base64,xxx=",
      usage: { custoUsd: 0.041 },
    });

    // Candidata 1: reprovada nas 2 tentativas. Candidata 2: aprovada de primeira.
    vi.mocked(revisorImagem.revisarImagem)
      .mockResolvedValueOnce({ resultado: { aprovada: false, motivo: "Elemento fora do trecho-fonte." }, usage: { inputTokens: 1, outputTokens: 1 } })
      .mockResolvedValueOnce({ resultado: { aprovada: false, motivo: "Ainda fora do trecho-fonte." }, usage: { inputTokens: 1, outputTokens: 1 } })
      .mockResolvedValueOnce({ resultado: { aprovada: true, motivo: null }, usage: { inputTokens: 1, outputTokens: 1 } });

    const { resultado } = await gerarImagensSecundarias(conteudo);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].slug).toBe("sucesso");
    // 2 tentativas pra candidata 1 (limite esgotado) + 1 tentativa pra candidata 2 = 3 gerações.
    expect(geradorImagemOpenAI.gerarImagemOpenAI).toHaveBeenCalledTimes(3);
    expect(revisorImagem.revisarImagem).toHaveBeenCalledTimes(3);
  });

  // Falha de infraestrutura (OpenAI lança) numa candidata específica também é isolada — não
  // derruba as demais, nem lança pra fora da função.
  it("falha de infraestrutura (OpenAI lança) numa candidata → isolada, as outras seguem", async () => {
    const mockCreate = obterMockCreate();
    const oportunidades = [
      oportunidadeAprovada({ slug: "erro-openai", trecho_fonte_integral: "trecho com erro" }),
      oportunidadeAprovada({ slug: "sucesso", trecho_fonte_integral: "trecho ok" }),
    ];
    mockCreate.mockResolvedValueOnce(respostaIdentificacao(oportunidades));

    vi.mocked(geradorImagemOpenAI.gerarImagemOpenAI)
      .mockRejectedValueOnce(new Error("OpenAI: erro de rede"))
      .mockResolvedValueOnce({ url: "data:image/png;base64,ok=", usage: { custoUsd: 0.041 } });

    vi.mocked(revisorImagem.revisarImagem).mockResolvedValue({
      resultado: { aprovada: true, motivo: null },
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const { resultado } = await gerarImagensSecundarias(conteudo);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].slug).toBe("sucesso");
  });

  // Retry-then-succeed: candidata reprovada na 1ª tentativa, aprovada na 2ª — resultado inclui a
  // imagem da 2ª tentativa, e o prompt da 2ª tentativa carrega o motivo da reprovação.
  it("candidata reprovada na 1ª tentativa, aprovada na 2ª (retry com motivo)", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValueOnce(respostaIdentificacao([oportunidadeAprovada({ slug: "retry" })]));

    vi.mocked(geradorImagemOpenAI.gerarImagemOpenAI)
      .mockResolvedValueOnce({ url: "data:image/png;base64,primeira=", usage: { custoUsd: 0.041 } })
      .mockResolvedValueOnce({ url: "data:image/png;base64,segunda=", usage: { custoUsd: 0.041 } });

    vi.mocked(revisorImagem.revisarImagem)
      .mockResolvedValueOnce({ resultado: { aprovada: false, motivo: "Número inventado fora do trecho-fonte." }, usage: { inputTokens: 1, outputTokens: 1 } })
      .mockResolvedValueOnce({ resultado: { aprovada: true, motivo: null }, usage: { inputTokens: 1, outputTokens: 1 } });

    const { resultado } = await gerarImagensSecundarias(conteudo);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].url).toBe("data:image/png;base64,segunda=");
    expect(geradorImagemOpenAI.gerarImagemOpenAI).toHaveBeenCalledTimes(2);

    const promptSegundaTentativa = vi.mocked(geradorImagemOpenAI.gerarImagemOpenAI).mock.calls[1][0];
    expect(promptSegundaTentativa).toContain("Número inventado fora do trecho-fonte.");
  });

  // Falha na própria identificação (Etapa 1) degrada a função inteira — resultado vazio, nunca
  // lança, e gerarImagemOpenAI nunca é chamado (não há candidata nenhuma pra gerar).
  it("falha na identificação (Etapa 1) → resultado vazio, não lança, nunca chama gerarImagemOpenAI", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockRejectedValueOnce(new Error("ANTHROPIC_API_KEY não configurada."));

    const { resultado, usage } = await gerarImagensSecundarias(conteudo);

    expect(resultado).toEqual([]);
    expect(usage).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(geradorImagemOpenAI.gerarImagemOpenAI).not.toHaveBeenCalled();
  });

  // O prompt de identificação (Etapa 1) usa título + post completo, e nunca afrouxa a instrução
  // do limiar de aprovação — checagem de sanidade do prompt em si.
  it("prompt de identificação usa título + post completo e menciona os limiares de aprovação", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValueOnce(respostaIdentificacao([]));

    await gerarImagensSecundarias(conteudo);

    const chamada = mockCreate.mock.calls[0][0];
    const textoPrompt = chamada.messages[0].content as string;
    expect(textoPrompt).toContain(conteudo.titulo);
    expect(textoPrompt).toContain(conteudo.conteudoHtml);
    expect(textoPrompt).toContain(">= 30");
    expect(textoPrompt).toContain(">= 8");
  });
});
