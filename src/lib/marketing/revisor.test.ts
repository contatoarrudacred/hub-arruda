// src/lib/marketing/revisor.test.ts
import { describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { revisarConteudo } from "./revisor";
import type { ConteudoGerado, ItemChecklistCarregado, PropriedadeCarregada } from "./tipos";

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

/** Propriedade sem NENHUM campo de calibração — o caso de uma propriedade cadastrada antes da
 * Fase 4a existir, que precisa continuar se comportando exatamente como antes desta mudança. */
const propriedadeSemCalibracao: PropriedadeCarregada = {
  id: "prop-1",
  nome: "ArrudaCred",
  urlBase: "https://exemplo.com",
  tipoCms: "wordpress",
  maxTentativas: 3,
  autoria: null,
};

const postsRecentesVazio: { titulo: string; angulo: string }[] = [];

function obterMockCreate() {
  process.env.ANTHROPIC_API_KEY = "sk-test";
  const clienteFalso = new Anthropic({ apiKey: "sk-test" });
  return clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
}

describe("revisarConteudo", () => {
  // Cenário 1 (regressão): propriedade sem nenhum campo de calibração precisa se comportar
  // exatamente como o Revisor se comportava antes da Fase 4a — score >= 80 aprova, score < 80
  // reprova — desde que o modelo também devolva os três gates novos como `true` (senão reprovaria
  // por padrão, já que `checar*` ausente = `true`, gate ativo). O que está sendo travado aqui é o
  // default: propriedade legada não fica "mais rígida" só porque a feature passou a existir.
  it("regressão: sem calibração, score >= 80 e os três gates true aprova (comportamento idêntico ao pré-Fase 4a)", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "registrar_revisao",
          input: {
            score: 90,
            motivo: null,
            precisao_factual_adequada: true,
            fontes_especificas: true,
            originalidade_adequada: true,
          },
        },
      ],
      usage: { input_tokens: 800, output_tokens: 40 },
    });

    const { resultado, usage } = await revisarConteudo(conteudo, checklist, propriedadeSemCalibracao, postsRecentesVazio, 1);

    expect(resultado.aprovado).toBe(true);
    expect(resultado.score).toBe(90);
    expect(usage.inputTokens).toBe(800);
    expect(usage.outputTokens).toBe(40);
  });

  it("regressão: sem calibração, score < 80 reprova e exige motivo (mesmo com os três gates true)", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "registrar_revisao",
          input: {
            score: 60,
            motivo: "Faltam links externos para fontes oficiais.",
            precisao_factual_adequada: true,
            fontes_especificas: true,
            originalidade_adequada: true,
          },
        },
      ],
      usage: { input_tokens: 700, output_tokens: 30 },
    });

    const { resultado, usage } = await revisarConteudo(conteudo, checklist, propriedadeSemCalibracao, postsRecentesVazio, 1);

    expect(resultado.aprovado).toBe(false);
    expect(resultado.motivo).toBe("Faltam links externos para fontes oficiais.");
    expect(usage.inputTokens).toBe(700);
    expect(usage.outputTokens).toBe(30);
  });

  // Cenário 2: a prova central da regra multiplicativa — score alto não compensa gate false.
  it("reprova com score 95 quando precisao_factual_adequada é false (regra multiplicativa, não média)", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "registrar_revisao",
          input: {
            score: 95,
            motivo: "Afirma que a dívida some do CPF após 3 anos sem citar a lei; corrija citando o art. 43 do CDC (5 anos) com link direto.",
            precisao_factual_adequada: false,
            fontes_especificas: true,
            originalidade_adequada: true,
          },
        },
      ],
      usage: { input_tokens: 900, output_tokens: 60 },
    });

    const { resultado } = await revisarConteudo(conteudo, checklist, propriedadeSemCalibracao, postsRecentesVazio, 1);

    expect(resultado.score).toBe(95);
    expect(resultado.aprovado).toBe(false);
    expect(resultado.precisaoFactualAdequada).toBe(false);
  });

  // Cenário 3: checarOriginalidade: false faz o gate não entrar na conta, mesmo que o modelo
  // devolva originalidade_adequada: false.
  it("checarOriginalidade: false não bloqueia aprovação mesmo com originalidade_adequada: false", async () => {
    const propriedade: PropriedadeCarregada = { ...propriedadeSemCalibracao, checarOriginalidade: false };
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "registrar_revisao",
          input: {
            score: 90,
            motivo: null,
            precisao_factual_adequada: true,
            fontes_especificas: true,
            originalidade_adequada: false,
          },
        },
      ],
      usage: { input_tokens: 800, output_tokens: 40 },
    });

    const { resultado } = await revisarConteudo(conteudo, checklist, propriedade, postsRecentesVazio, 1);

    expect(resultado.aprovado).toBe(true);
    expect(resultado.originalidadeAdequada).toBe(false);
  });

  // Cenário 4: scoreMinimoAprovacao customizado é respeitado.
  it("scoreMinimoAprovacao: 90 reprova score 85 (que aprovaria no default 80)", async () => {
    const propriedade: PropriedadeCarregada = { ...propriedadeSemCalibracao, scoreMinimoAprovacao: 90 };
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "registrar_revisao",
          input: {
            score: 85,
            motivo: "Faltou aprofundar a seção de simulação; adicione um exemplo numérico completo.",
            precisao_factual_adequada: true,
            fontes_especificas: true,
            originalidade_adequada: true,
          },
        },
      ],
      usage: { input_tokens: 800, output_tokens: 40 },
    });

    const { resultado } = await revisarConteudo(conteudo, checklist, propriedade, postsRecentesVazio, 1);

    expect(resultado.score).toBe(85);
    expect(resultado.aprovado).toBe(false);
  });

  // Cenário 5: rigorYmyl muda o TEXTO do prompt enviado ao modelo — asserção no prompt, não no
  // resultado. "alto", "baixo" e "desativado" precisam produzir textos de instrução distintos
  // entre si (e distintos do baseline "medio").
  it("rigorYmyl interpola textos de instrução diferentes no prompt (alto/baixo/desativado/medio)", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValue({
      content: [
        { type: "tool_use", name: "registrar_revisao", input: { score: 90, motivo: null, precisao_factual_adequada: true, fontes_especificas: true, originalidade_adequada: true } },
      ],
      usage: { input_tokens: 800, output_tokens: 40 },
    });

    const niveis: NonNullable<PropriedadeCarregada["rigorYmyl"]>[] = ["alto", "baixo", "desativado", "medio"];
    const prompts: Record<string, string> = {};

    for (const rigorYmyl of niveis) {
      const propriedade: PropriedadeCarregada = { ...propriedadeSemCalibracao, rigorYmyl };
      await revisarConteudo(conteudo, checklist, propriedade, postsRecentesVazio, 1);
      const chamada = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0];
      prompts[rigorYmyl] = chamada.messages[0].content as string;
    }

    // Cada um dos quatro textos precisa ser distinto de todos os outros três.
    const textos = Object.values(prompts);
    const textosUnicos = new Set(textos);
    expect(textosUnicos.size).toBe(textos.length);

    expect(prompts.alto).toMatch(/ALTO/);
    expect(prompts.baixo).toMatch(/BAIXO/);
    expect(prompts.desativado).toMatch(/DESATIVADO/);
  });

  // Cenário 6: reprovado → motivo contém diagnóstico E sugestão de correção — teste de conteúdo
  // específico no mock retornado (não só presença de string).
  it("reprovado: motivo carrega diagnóstico específico e sugestão concreta de correção, sem alteração", async () => {
    const motivoCompleto =
      "Diagnóstico: a seção 'Como funciona a negativação' cita prazo de 3 anos sem fonte, o correto é 5 anos (art. 43 do CDC). Correção sugerida: reescrever o parágrafo citando o art. 43 do CDC com link direto para o texto de lei no site do Planalto.";
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "registrar_revisao",
          input: {
            score: 50,
            motivo: motivoCompleto,
            precisao_factual_adequada: false,
            fontes_especificas: true,
            originalidade_adequada: true,
          },
        },
      ],
      usage: { input_tokens: 800, output_tokens: 40 },
    });

    const { resultado } = await revisarConteudo(conteudo, checklist, propriedadeSemCalibracao, postsRecentesVazio, 1);

    expect(resultado.aprovado).toBe(false);
    expect(resultado.motivo).toContain("Diagnóstico:");
    expect(resultado.motivo).toContain("Correção sugerida:");
    expect(resultado.motivo).toBe(motivoCompleto);

    // O prompt precisa instruir explicitamente o modelo a incluir os dois (não só o diagnóstico).
    const chamada = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0];
    const promptEnviado = chamada.messages[0].content as string;
    expect(promptEnviado).toMatch(/sugestão concreta/i);
  });

  it("inclui os títulos e ângulos de postsRecentes no prompt, pro julgamento de originalidade", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValue({
      content: [
        { type: "tool_use", name: "registrar_revisao", input: { score: 90, motivo: null, precisao_factual_adequada: true, fontes_especificas: true, originalidade_adequada: true } },
      ],
      usage: { input_tokens: 800, output_tokens: 40 },
    });

    const postsRecentes = [{ titulo: "Como Limpar Nome no SPC", angulo: "guia passo a passo" }];
    await revisarConteudo(conteudo, checklist, propriedadeSemCalibracao, postsRecentes, 1);

    const chamada = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0];
    const promptEnviado = chamada.messages[0].content as string;
    expect(promptEnviado).toContain("Como Limpar Nome no SPC");
    expect(promptEnviado).toContain("guia passo a passo");
  });

  // Achado do teste de ponta a ponta em produção (19/08/2026): o Revisor, ao "estimar" a extensão
  // de um texto longo só de olhar o HTML, chutou "~1.400-1.500 palavras" pra um texto com 2.595
  // palavras reais — reprovação falsa por extensão. Contagem programática elimina essa fonte de
  // erro; este teste garante que o número correto (excluindo o script JSON-LD, que não é prosa)
  // chega ao prompt.
  it("inclui a contagem real de palavras do corpo no prompt, excluindo o script JSON-LD", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValue({
      content: [
        { type: "tool_use", name: "registrar_revisao", input: { score: 90, motivo: null, precisao_factual_adequada: true, fontes_especificas: true, originalidade_adequada: true } },
      ],
      usage: { input_tokens: 800, output_tokens: 40 },
    });

    const conteudoComScript: ConteudoGerado = {
      ...conteudo,
      // Corpo com exatamente 4 palavras de prosa + um bloco JSON-LD com dezenas de "palavras" que
      // não devem entrar na contagem.
      conteudoHtml: `<h1>Uma duas três quatro</h1><script type="application/ld+json">{"a":"muitas palavras soltas aqui dentro que nao sao prosa real do artigo"}</script>`,
    };

    await revisarConteudo(conteudoComScript, checklist, propriedadeSemCalibracao, postsRecentesVazio, 1);

    const chamada = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0];
    const promptEnviado = chamada.messages[0].content as string;
    expect(promptEnviado).toContain("Contagem REAL de palavras do corpo do artigo (calculada programaticamente, não estime por conta própria): 4 palavras.");
  });

  // Calibração dupla Escritor/Revisor (Fase 4b, 19/08/2026, pedido do Luiz) — achado real do teste
  // de ponta a ponta: itens de faixa numérica estreita (ex.: "40-60 palavras") são difíceis do
  // Escritor acertar em TODAS as seções de um artigo simultaneamente. itemParaRevisor permite o
  // Revisor aceitar uma faixa mais tolerante que o alvo pedido ao Escritor pro mesmo item.
  it("usa itemParaRevisor no prompt quando preenchido, em vez do item padrão do Escritor", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValue({
      content: [
        { type: "tool_use", name: "registrar_revisao", input: { score: 90, motivo: null, precisao_factual_adequada: true, fontes_especificas: true, originalidade_adequada: true } },
      ],
      usage: { input_tokens: 800, output_tokens: 40 },
    });
    const checklistComCalibracaoDupla: ItemChecklistCarregado[] = [
      { id: "1", item: "Resposta direta (40-60 palavras) logo abaixo de cada H2", peso: 1, itemParaRevisor: "Resposta direta (20-80 palavras) logo abaixo de cada H2" },
    ];

    await revisarConteudo(conteudo, checklistComCalibracaoDupla, propriedadeSemCalibracao, postsRecentesVazio, 1);

    const chamada = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0];
    const promptEnviado = chamada.messages[0].content as string;
    expect(promptEnviado).toContain("Resposta direta (20-80 palavras) logo abaixo de cada H2");
    expect(promptEnviado).not.toContain("40-60 palavras");
  });

  it("usa o item padrão (mesmo texto do Escritor) quando itemParaRevisor é null/ausente", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValue({
      content: [
        { type: "tool_use", name: "registrar_revisao", input: { score: 90, motivo: null, precisao_factual_adequada: true, fontes_especificas: true, originalidade_adequada: true } },
      ],
      usage: { input_tokens: 800, output_tokens: 40 },
    });
    const checklistSemOverride: ItemChecklistCarregado[] = [{ id: "1", item: "Mínimo 1.800 palavras", peso: 1, itemParaRevisor: null }];

    await revisarConteudo(conteudo, checklistSemOverride, propriedadeSemCalibracao, postsRecentesVazio, 1);

    const chamada = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0];
    const promptEnviado = chamada.messages[0].content as string;
    expect(promptEnviado).toContain("Mínimo 1.800 palavras");
  });

  // Regra dura pedida pelo Luiz (19/08/2026): reprovar só por defeito real, e a partir da 2ª
  // revisão da mesma pauta reforçar a leniência — não vale a pena reprovar de novo só por um item
  // "pode melhorar". A instrução de triagem (defeito real vs pode melhorar) sempre aparece; o
  // reforço específico de "já houve correção anterior" só aparece quando numeroTentativa > 1.
  it("sempre inclui a regra de triagem defeito-real-vs-pode-melhorar, mas só reforça a leniência a partir da 2ª revisão", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValue({
      content: [
        { type: "tool_use", name: "registrar_revisao", input: { score: 90, motivo: null, precisao_factual_adequada: true, fontes_especificas: true, originalidade_adequada: true } },
      ],
      usage: { input_tokens: 800, output_tokens: 40 },
    });

    await revisarConteudo(conteudo, checklist, propriedadeSemCalibracao, postsRecentesVazio, 1);
    const promptPrimeiraTentativa = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0].messages[0].content as string;
    expect(promptPrimeiraTentativa).toContain("Reprovação só por motivo real");
    expect(promptPrimeiraTentativa).not.toContain("já houve pelo menos uma correção anterior");

    await revisarConteudo(conteudo, checklist, propriedadeSemCalibracao, postsRecentesVazio, 2);
    const promptSegundaTentativa = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0].messages[0].content as string;
    expect(promptSegundaTentativa).toContain("Reprovação só por motivo real");
    expect(promptSegundaTentativa).toContain("Esta é a 2ª revisão desta pauta");
    expect(promptSegundaTentativa).toContain("já houve pelo menos uma correção anterior");
  });

  // Achado real de teste em produção (19/08/2026, apontado pelo Luiz): o Revisor reprovou
  // precisao_factual_adequada tratando "fevereiro de 2026" como data FUTURA e portanto inválida —
  // mas a data real do sistema já era agosto de 2026 nesse teste, então fevereiro de 2026 já tinha
  // passado. O modelo não tem como saber "que dia é hoje" sozinho; a data real precisa vir no
  // prompt, mesmo princípio de contarPalavrasCorpo (fato calculado, não estimado).
  it("injeta a data real de hoje no prompt, pro Revisor não confundir uma data passada com uma data futura", async () => {
    const mockCreate = obterMockCreate();
    mockCreate.mockResolvedValue({
      content: [
        { type: "tool_use", name: "registrar_revisao", input: { score: 90, motivo: null, precisao_factual_adequada: true, fontes_especificas: true, originalidade_adequada: true } },
      ],
      usage: { input_tokens: 800, output_tokens: 40 },
    });

    await revisarConteudo(conteudo, checklist, propriedadeSemCalibracao, postsRecentesVazio, 1);

    const promptEnviado = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0].messages[0].content as string;
    const dataEsperada = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
    expect(promptEnviado).toContain(`Data de hoje (real, calculada pelo sistema — não estime nem assuma outra data): ${dataEsperada}.`);
    expect(promptEnviado).toContain('Uma data anterior a hoje NÃO é "futura"');
  });
});
