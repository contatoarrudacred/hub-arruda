// src/lib/marketing/imagens/capa.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { gerarCapa, gerarImagemComPrompt } from "./capa";
import * as geradorImagemOpenAI from "./gerador-imagem-openai";
import * as revisorImagem from "./revisor-imagem";
import type { ConteudoGerado, PautaCarregada, PersonaCarregada } from "../tipos";

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

const pauta: PautaCarregada = {
  id: "pauta-1",
  matrizConteudoId: "matriz-1",
  personaId: "persona-1",
  palavraChavePrincipal: "limpar nome serasa",
  palavrasSecundarias: ["tirar nome do serasa"],
  angulo: "passo_a_passo",
  geografia: null,
  tipoConteudo: "post_padrao",
  funil: "topo",
  status: "em_producao",
  tentativas: 0,
  motivoUltimaReprovacao: null,
  ultimoRascunho: null,
  agendamentoForcado: null,
};

const conteudo: ConteudoGerado = {
  titulo: "Como limpar seu nome no Serasa em 2026",
  conteudoHtml: "<h1>Como limpar seu nome no Serasa em 2026</h1><p>O prazo para negativação sair do CPF é de 5 anos...</p>",
  metaTitle: "Como limpar seu nome no Serasa | Guia 2026",
  metaDescription: "Veja o passo a passo para limpar seu nome no Serasa. Saiba os prazos e como negociar.",
  slug: "como-limpar-nome-serasa",
};

const persona: PersonaCarregada = {
  id: "persona-1",
  nome: "Marcelo Andrade",
  dorEntrada: "Nome negativado no Serasa há meses, sem conseguir crédito.",
  angulosProntos: [],
  usadaPelaUltimaVezEm: null,
  conteudoCompleto: "## Bloco 1 — Ficha rápida\nMarcelo, 34 anos, mecânico autônomo...",
};

// Cada uma das 4 chamadas ao Claude (resumo do post, resumo da persona, cruzamento, prompt final
// + metadados) usa uma ferramenta com nome diferente — simulamos a sequência via
// mockImplementationOnce encadeado, na ordem que capa.ts dispara.
function respostaFerramenta(nomeFerramenta: string, input: Record<string, unknown>, tokens = { input_tokens: 100, output_tokens: 50 }) {
  return {
    content: [{ type: "tool_use", name: nomeFerramenta, input }],
    usage: tokens,
  };
}

function mockarQuatroEtapasClaude(mockCreate: ReturnType<typeof vi.fn>) {
  mockCreate
    .mockResolvedValueOnce(respostaFerramenta("registrar_resumo_post", { resumo: "Resumo estratégico do post sobre negativação no Serasa." }))
    .mockResolvedValueOnce(respostaFerramenta("registrar_resumo_persona", { resumo: "Marcelo, mecânico autônomo, envergonhado da negativação." }))
    .mockResolvedValueOnce(respostaFerramenta("registrar_cruzamento", { ideia_visual: "Marcelo escondendo o celular com notificação de negativa da família." }))
    .mockResolvedValueOnce(
      respostaFerramenta("registrar_prompt_capa", {
        prompt_imagem: "Fotografia editorial, homem escondendo o celular, cozinha de casa, luz natural.",
        alt: "Homem escondendo notificação de negativa de crédito no celular da família",
        slug: "homem-escondendo-negativa-credito-familia",
        titulo: "Homem escondendo negativa de crédito da família",
      }),
    );
}

describe("gerarCapa", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Cenário 1: fluxo feliz completo — as 5 etapas rodam em sequência, revisor aprova de primeira,
  // gerarCapa devolve a URL/alt/slug/titulo vindos da etapa 4 e a URL vinda da OpenAI.
  it("orquestra as 5 etapas e devolve resultado aprovado de primeira", async () => {
    const mockCreate = obterMockCreate();
    mockarQuatroEtapasClaude(mockCreate);

    vi.mocked(geradorImagemOpenAI.gerarImagemOpenAI).mockResolvedValue({
      url: "data:image/png;base64,aGVsbG8=",
      usage: { custoUsd: 0.041 },
    });
    vi.mocked(revisorImagem.revisarImagem).mockResolvedValue({
      resultado: { aprovada: true, motivo: null },
      usage: { inputTokens: 200, outputTokens: 30 },
    });

    const { resultado, usage, custoUsdOpenAi } = await gerarCapa(pauta, conteudo, persona);

    expect(resultado).not.toBeNull();
    expect(resultado?.url).toBe("data:image/png;base64,aGVsbG8=");
    expect(resultado?.alt).toBe("Homem escondendo notificação de negativa de crédito no celular da família");
    expect(resultado?.slug).toBe("homem-escondendo-negativa-credito-familia");
    expect(resultado?.titulo).toBe("Homem escondendo negativa de crédito da família");
    // Custo real da OpenAI (19/08/2026) — 1 tentativa de geração de imagem, $0.041.
    expect(custoUsdOpenAi).toBe(0.041);

    // 4 chamadas Claude (resumo post, resumo persona, cruzamento, prompt final) contam pro usage.
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);

    // gerarImagemOpenAI chamado com formato 16:9.
    expect(geradorImagemOpenAI.gerarImagemOpenAI).toHaveBeenCalledWith(expect.any(String), "16:9");

    // revisarImagem chamado com trechoFonte = conteudoHtml inteiro (banco fechado é o post inteiro).
    expect(revisorImagem.revisarImagem).toHaveBeenCalledWith(expect.any(String), conteudo.conteudoHtml);

    // Só 1 tentativa de geração de imagem — aprovado de primeira.
    expect(geradorImagemOpenAI.gerarImagemOpenAI).toHaveBeenCalledTimes(1);
  });

  // Cenário 2: cada uma das 4 etapas Claude é testável isoladamente — o prompt da etapa 2 (resumo
  // da persona) usa persona.conteudoCompleto, e o prompt da etapa 1 usa título + corpo do post.
  it("etapa 1 usa título e corpo do post; etapa 2 usa conteudoCompleto da persona", async () => {
    const mockCreate = obterMockCreate();
    mockarQuatroEtapasClaude(mockCreate);
    vi.mocked(geradorImagemOpenAI.gerarImagemOpenAI).mockResolvedValue({
      url: "data:image/png;base64,aGVsbG8=",
      usage: { custoUsd: 0.041 },
    });
    vi.mocked(revisorImagem.revisarImagem).mockResolvedValue({
      resultado: { aprovada: true, motivo: null },
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    await gerarCapa(pauta, conteudo, persona);

    const chamadaEtapa1 = mockCreate.mock.calls[0][0];
    expect(chamadaEtapa1.messages[0].content).toContain(conteudo.titulo);
    expect(chamadaEtapa1.messages[0].content).toContain(conteudo.conteudoHtml);

    const chamadaEtapa2 = mockCreate.mock.calls[1][0];
    expect(chamadaEtapa2.messages[0].content).toContain(persona.conteudoCompleto);
  });

  // Cenário 3: revisor reprova na 1ª tentativa com motivo, gerarCapa regenera a imagem dobrando o
  // motivo no prompt, e aprova na 2ª — resultado não-nulo, 2 chamadas de geração de imagem.
  it("revisor reprova a 1ª tentativa, regenera com o motivo, aprova na 2ª (limite de 2 tentativas)", async () => {
    const mockCreate = obterMockCreate();
    mockarQuatroEtapasClaude(mockCreate);

    vi.mocked(geradorImagemOpenAI.gerarImagemOpenAI)
      .mockResolvedValueOnce({ url: "data:image/png;base64,primeira=", usage: { custoUsd: 0.041 } })
      .mockResolvedValueOnce({ url: "data:image/png;base64,segunda=", usage: { custoUsd: 0.041 } });

    vi.mocked(revisorImagem.revisarImagem)
      .mockResolvedValueOnce({
        resultado: { aprovada: false, motivo: "Selo de garantia de aprovação não sustentado pelo trecho-fonte." },
        usage: { inputTokens: 10, outputTokens: 10 },
      })
      .mockResolvedValueOnce({
        resultado: { aprovada: true, motivo: null },
        usage: { inputTokens: 10, outputTokens: 10 },
      });

    const { resultado, custoUsdOpenAi } = await gerarCapa(pauta, conteudo, persona);

    expect(resultado).not.toBeNull();
    expect(resultado?.url).toBe("data:image/png;base64,segunda=");
    expect(geradorImagemOpenAI.gerarImagemOpenAI).toHaveBeenCalledTimes(2);
    // Custo real da OpenAI soma as DUAS tentativas (a reprovada também custou $) — $0.082.
    expect(custoUsdOpenAi).toBe(0.082);

    // A 2ª chamada de geração precisa incluir o motivo da reprovação no prompt.
    const promptSegundaTentativa = vi.mocked(geradorImagemOpenAI.gerarImagemOpenAI).mock.calls[1][0];
    expect(promptSegundaTentativa).toContain("Selo de garantia de aprovação não sustentado pelo trecho-fonte.");
  });

  // Cenário 4: revisor reprova as 2 tentativas (limite atingido) — gerarCapa devolve resultado
  // null (Global Constraint: nunca lança), acumulando o usage de tudo que rodou até aqui.
  it("revisor reprova as 2 tentativas → resultado null, usage acumulado, não lança", async () => {
    const mockCreate = obterMockCreate();
    mockarQuatroEtapasClaude(mockCreate);

    vi.mocked(geradorImagemOpenAI.gerarImagemOpenAI).mockResolvedValue({
      url: "data:image/png;base64,x=",
      usage: { custoUsd: 0.041 },
    });
    vi.mocked(revisorImagem.revisarImagem).mockResolvedValue({
      resultado: { aprovada: false, motivo: "Elemento visual fora do trecho-fonte." },
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const { resultado, usage } = await gerarCapa(pauta, conteudo, persona);

    expect(resultado).toBeNull();
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(geradorImagemOpenAI.gerarImagemOpenAI).toHaveBeenCalledTimes(2);
    expect(revisorImagem.revisarImagem).toHaveBeenCalledTimes(2);
  });

  // Cenário 5: falha de infraestrutura da API OpenAI (gerarImagemOpenAI lança) → gerarCapa
  // devolve resultado null em vez de propagar o erro (Global Constraint do plano: "OPENAI_API_KEY
  // ausente não pode derrubar o pipeline de texto... segue sem imagem").
  it("falha da API OpenAI (gerarImagemOpenAI lança) → resultado null, não lança", async () => {
    const mockCreate = obterMockCreate();
    mockarQuatroEtapasClaude(mockCreate);

    vi.mocked(geradorImagemOpenAI.gerarImagemOpenAI).mockRejectedValue(new Error("OPENAI_API_KEY não configurada."));

    await expect(gerarCapa(pauta, conteudo, persona)).resolves.toEqual(
      expect.objectContaining({ resultado: null }),
    );
  });

  // Cenário 6: falha do revisor de imagem (erro de rede/API, não reprovação) também degrada pra
  // null em vez de lançar — mesma Global Constraint.
  it("falha de infraestrutura do revisor de imagem → resultado null, não lança", async () => {
    const mockCreate = obterMockCreate();
    mockarQuatroEtapasClaude(mockCreate);
    vi.mocked(geradorImagemOpenAI.gerarImagemOpenAI).mockResolvedValue({
      url: "data:image/png;base64,x=",
      usage: { custoUsd: 0.041 },
    });
    vi.mocked(revisorImagem.revisarImagem).mockRejectedValue(new Error("ECONNRESET"));

    const { resultado } = await gerarCapa(pauta, conteudo, persona);
    expect(resultado).toBeNull();
  });

  // Cenário 7: falha de uma das etapas Claude (ex.: resumo do post) também degrada pra null —
  // nenhuma etapa deste módulo pode derrubar o pipeline.
  it("falha numa etapa Claude (ex.: resumo do post) → resultado null, não lança", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockRejectedValueOnce(new Error("ANTHROPIC_API_KEY não configurada."));

    const { resultado } = await gerarCapa(pauta, conteudo, persona);
    expect(resultado).toBeNull();
    expect(geradorImagemOpenAI.gerarImagemOpenAI).not.toHaveBeenCalled();
  });

  // Cenário 8: persona null — não lança, degrada graciosamente. Etapa 2 (resumo da persona) NÃO
  // chama o Claude nesse caso (não há persona pra resumir) — só 3 chamadas Claude no total
  // (resumo do post, cruzamento, prompt final), com um resumo-placeholder no lugar do resumo da
  // persona real, documentado em capa.ts.
  it("persona null não quebra — pipeline segue baseado só no post, sem chamar Claude na etapa 2", async () => {
    const mockCreate = obterMockCreate();
    mockCreate
      .mockResolvedValueOnce(respostaFerramenta("registrar_resumo_post", { resumo: "Resumo estratégico do post." }))
      .mockResolvedValueOnce(respostaFerramenta("registrar_cruzamento", { ideia_visual: "Ideia visual baseada só no post." }))
      .mockResolvedValueOnce(
        respostaFerramenta("registrar_prompt_capa", {
          prompt_imagem: "Fotografia editorial baseada só no post.",
          alt: "Alt baseado só no post",
          slug: "slug-baseado-so-no-post",
          titulo: "Título baseado só no post",
        }),
      );
    vi.mocked(geradorImagemOpenAI.gerarImagemOpenAI).mockResolvedValue({
      url: "data:image/png;base64,x=",
      usage: { custoUsd: 0.041 },
    });
    vi.mocked(revisorImagem.revisarImagem).mockResolvedValue({
      resultado: { aprovada: true, motivo: null },
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const { resultado } = await gerarCapa(pauta, conteudo, null);
    expect(resultado).not.toBeNull();
    expect(mockCreate).toHaveBeenCalledTimes(3);

    // Etapa 3 (cruzamento) recebe um resumo-placeholder, não o conteúdo de uma persona real.
    const chamadaEtapa3 = mockCreate.mock.calls[1][0];
    expect(chamadaEtapa3.messages[0].content).not.toContain(persona.conteudoCompleto);
    expect(chamadaEtapa3.messages[0].content).toMatch(/nenhuma persona/i);
  });
});

// Agenda de Posts (Trocar Foto, 20/08/2026) — versão "prompt explícito" da etapa 5 de gerarCapa,
// sem as etapas 1-4 (que derivam o prompt automaticamente a partir do post).
describe("gerarImagemComPrompt", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("gera e aprova de primeira, sem nenhuma chamada Claude de derivação de prompt", async () => {
    const mockCreate = obterMockCreate();
    vi.mocked(geradorImagemOpenAI.gerarImagemOpenAI).mockResolvedValue({
      url: "data:image/png;base64,aGVsbG8=",
      usage: { custoUsd: 0.041 },
    });
    vi.mocked(revisorImagem.revisarImagem).mockResolvedValue({
      resultado: { aprovada: true, motivo: null },
      usage: { inputTokens: 200, outputTokens: 30 },
    });

    const { resultado, custoUsdOpenAi } = await gerarImagemComPrompt("um prompt digitado pelo Luiz", "trecho pra revisão");

    expect(resultado).toEqual({ url: "data:image/png;base64,aGVsbG8=" });
    expect(custoUsdOpenAi).toBe(0.041);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(geradorImagemOpenAI.gerarImagemOpenAI).toHaveBeenCalledWith("um prompt digitado pelo Luiz", "16:9");
    expect(revisorImagem.revisarImagem).toHaveBeenCalledWith("data:image/png;base64,aGVsbG8=", "trecho pra revisão");
  });

  it("reprovada na 1ª tentativa: tenta de novo com o motivo anexado ao prompt original", async () => {
    obterMockCreate();
    vi.mocked(geradorImagemOpenAI.gerarImagemOpenAI)
      .mockResolvedValueOnce({ url: "data:image/png;base64,primeira=", usage: { custoUsd: 0.041 } })
      .mockResolvedValueOnce({ url: "data:image/png;base64,segunda=", usage: { custoUsd: 0.041 } });
    vi.mocked(revisorImagem.revisarImagem)
      .mockResolvedValueOnce({ resultado: { aprovada: false, motivo: "Tem bandeira dos EUA na cena." }, usage: { inputTokens: 1, outputTokens: 1 } })
      .mockResolvedValueOnce({ resultado: { aprovada: true, motivo: null }, usage: { inputTokens: 1, outputTokens: 1 } });

    const { resultado } = await gerarImagemComPrompt("prompt original", "trecho");

    expect(resultado).toEqual({ url: "data:image/png;base64,segunda=" });
    expect(geradorImagemOpenAI.gerarImagemOpenAI).toHaveBeenCalledTimes(2);
    const promptSegundaTentativa = vi.mocked(geradorImagemOpenAI.gerarImagemOpenAI).mock.calls[1][0];
    expect(promptSegundaTentativa).toContain("prompt original");
    expect(promptSegundaTentativa).toContain("Tem bandeira dos EUA na cena.");
  });

  it("esgota LIMITE_TENTATIVAS_IMAGEM sem aprovação → resultado null, não lança", async () => {
    obterMockCreate();
    vi.mocked(geradorImagemOpenAI.gerarImagemOpenAI).mockResolvedValue({ url: "data:image/png;base64,x=", usage: { custoUsd: 0.041 } });
    vi.mocked(revisorImagem.revisarImagem).mockResolvedValue({
      resultado: { aprovada: false, motivo: "Sempre reprovado." },
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const { resultado } = await gerarImagemComPrompt("prompt", "trecho");

    expect(resultado).toBeNull();
    expect(geradorImagemOpenAI.gerarImagemOpenAI).toHaveBeenCalledTimes(2);
  });

  it("falha de infraestrutura (gerarImagemOpenAI lança) → resultado null, não lança", async () => {
    obterMockCreate();
    vi.mocked(geradorImagemOpenAI.gerarImagemOpenAI).mockRejectedValue(new Error("OPENAI_API_KEY não configurada."));

    const { resultado } = await gerarImagemComPrompt("prompt", "trecho");

    expect(resultado).toBeNull();
  });
});
