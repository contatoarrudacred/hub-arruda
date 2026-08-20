// src/lib/marketing/escritor.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { gerarConteudo } from "./escritor";
import type { ItemChecklistCarregado, PautaCarregada, PersonaCarregada, PropriedadeCarregada } from "./tipos";

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
  personaId: null,
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
};

const pautaDePersona: PautaCarregada = {
  ...pauta,
  id: "pauta-2",
  personaId: "persona-1",
};

const persona: PersonaCarregada = {
  id: "persona-1",
  nome: "Marcelo Andrade",
  dorEntrada: "Nome negativado no Serasa há meses, sem conseguir crédito.",
  angulosProntos: [],
  usadaPelaUltimaVezEm: null,
  conteudoCompleto: "## Bloco 1 — Ficha rápida\nMarcelo, 34 anos...\n## Bloco 10 — Vocabulário\nFala 'apertado', evita jargão bancário.",
};

const checklist: ItemChecklistCarregado[] = [
  { id: "1", item: "H1 com a palavra-chave principal", peso: 10 },
  { id: "2", item: "Mínimo 1.800 palavras", peso: 10 },
];

const propriedade: PropriedadeCarregada = {
  id: "prop-1",
  nome: "Site Teste",
  urlBase: "https://teste.exemplo.com",
  tipoCms: "wordpress",
  maxTentativas: 3,
  autoria: null,
};

// Task 4 (Fase 4a), spec seção 3.1.2 — mesma propriedade, mas com instrucoesAdicionais
// cadastrado, pro teste que confirma o bloco aditivo no prompt.
const propriedadeComInstrucoes: PropriedadeCarregada = {
  ...propriedade,
  instrucoesAdicionais: "Evite jargão técnico neste site; sempre mencione que a consultoria é gratuita.",
};

describe("gerarConteudo", () => {
  // `create` (dentro do mock de @anthropic-ai/sdk) é um único vi.fn() compartilhado pelo módulo
  // inteiro (fora da factory de vi.mock), reusado por toda instância de Anthropic — inclusive o
  // singleton cacheado dentro de escritor.ts. Sem limpar entre testes, `mock.calls` acumularia
  // chamadas de testes anteriores e `calls[0]` deixaria de ser a chamada do teste atual (foi
  // exatamente o que aconteceu ao inserir o teste de persona no meio da suíte — RED por causa
  // disso, não por bug de implementação real).
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Regressão (Task 5, Fase 3): com persona `null` (pauta antiga/manual, sem persona_id), o prompt
  // tem que sair BYTE A BYTE igual ao de antes desta task — sem o bloco de persona, sem espaço em
  // branco extra. Guardamos o texto exato do prompt (não só `.toContain`) pra qualquer mudança
  // acidental de formatação introduzida por esta task quebrar o teste.
  it("monta o prompt com a pauta e o checklist, e retorna o conteúdo estruturado da ferramenta", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "registrar_conteudo",
          input: {
            titulo: "Como Limpar o Nome no Serasa: Passo a Passo Completo",
            conteudo_html: "<h1>Como Limpar o Nome no Serasa</h1><p>...</p>".repeat(50),
            meta_title: "Como Limpar Nome no Serasa | Passo a Passo",
            meta_description: "Aprenda o passo a passo completo para limpar seu nome no Serasa em 2026.",
            slug: "como-limpar-nome-serasa",
            relatorio: "Segui o ângulo passo a passo, usando fontes do Serasa e do BACEN.",
          },
        },
      ],
      usage: { input_tokens: 1234, output_tokens: 5678 },
    });

    const { resultado, usage } = await gerarConteudo(pauta, checklist, null, propriedade);

    expect(resultado.titulo).toContain("Serasa");
    expect(resultado.slug).toBe("como-limpar-nome-serasa");
    // Relatório do Escritor (19/08/2026, pedido do Luiz) — espelha o motivo do Revisor, pra dar
    // pra cruzar no Monitor de execução o que foi pedido com o que o Escritor diz ter feito.
    expect(resultado.relatorio).toBe("Segui o ângulo passo a passo, usando fontes do Serasa e do BACEN.");
    const argumentosChamada = mockCreate.mock.calls[0][0];
    const promptEnviado = argumentosChamada.messages[0].content;
    expect(promptEnviado).toContain("limpar nome serasa");
    expect(promptEnviado).toContain("H1 com a palavra-chave principal");
    expect(promptEnviado).toBe(
      [
        "Você é o Agente Escritor de um pipeline de geração de conteúdo para blog, otimizado tanto para SEO tradicional quanto para citação por IAs (AEO/GEO).",
        "Palavra-chave principal: limpar nome serasa",
        "Palavras secundárias: tirar nome do serasa",
        "Ângulo: passo_a_passo",
        "Funil: topo",
        "Formato: post_padrao",
        "Checklist de qualidade obrigatório — todo item precisa ser atendido:",
        "- H1 com a palavra-chave principal\n- Mínimo 1.800 palavras",
        "Regra adicional de citabilidade por IA: logo abaixo de cada H2, inclua uma resposta direta e extraível (contagem de palavras exata definida no item do checklist acima) antes de aprofundar — é a técnica mais concreta para aumentar a chance de citação por ChatGPT/Perplexity/Gemini.",
        "Regra de precisão em citação normativa: ao citar lei, resolução, artigo ou norma específica, só inclua número/ano depois de confirmar por busca (ver regra dura abaixo) — NUNCA invente ou chute um número de lei/resolução/artigo/súmula que pareça plausível, isso é uma alucinação factual grave (achado real de teste em produção: uma citação atribuiu incorretamente um prazo à \"Súmula 548 do STJ\", que trata de assunto diferente).",
        'Regra de verificação de links: para CADA link externo que for incluir no HTML, use a ferramenta web_search pra confirmar que a URL existe de verdade e que a página encontrada realmente sustenta a afirmação do texto — nunca invente ou chute uma URL só porque parece plausível. TÉCNICA DE BUSCA: formule a busca em torno da AFIRMAÇÃO ESPECÍFICA do parágrafo onde o link vai entrar, não só o nome do órgão — isso leva direto à página que sustenta aquela afirmação, em vez de uma homepage genérica. Exemplo: se o parágrafo diz "...Serasa informa mais de 83 milhões de brasileiros negativados...", a busca certa é algo como "quantos negativados tem no Brasil de acordo com o Serasa?" (a pergunta que a própria frase responde), não apenas "Serasa" — o resultado ideal é a página específica que traz esse dado (ex.: https://www.serasa.com.br/limpa-nome-online/blog/mapa-da-inadimplencia-e-renegociacao-de-dividas-no-brasil/), não a homepage do Serasa. A mesma técnica vale pra citação de lei/norma/jurisprudência: antes de citar um número de súmula, resolução ou artigo, busque o texto EXATO da afirmação (ex.: "prazo para baixa de negativação após pagamento súmula STJ") pra confirmar que a norma citada realmente trata desse tema — não assuma que um número que "parece certo" está certo. Depois de pesquisar o que for necessário, você DEVE terminar chamando a ferramenta registrar_conteudo com o resultado final — nunca finalize a resposta só com texto.',
        "REGRA DURA — nunca inventar, sempre comprovar com link: você NUNCA pode inventar um fato, número, estatística, data, prazo, citação legal/normativa ou afirmação atribuída a um órgão/entidade externa. Toda vez que o texto citar algo como fato — um dado numérico (\"a Serasa aponta X milhões de negativados\"), uma norma (\"conforme o art. Y do CDC\"), uma jurisprudência (\"segundo a Súmula Z do STJ\"), um prazo, ou qualquer afirmação atribuída a uma fonte externa —, essa frase É OBRIGATÓRIA de vir acompanhada de um link pra uma fonte oficial que comprove EXATAMENTE essa afirmação (busque por ela usando a técnica de busca por afirmação específica, acima, ANTES de escrever a frase — nunca depois). Se a busca não encontrar uma fonte oficial que comprove a afirmação específica, você NÃO PODE fazer essa afirmação: reescreva sem o dado/citação específica, ou remova o trecho inteiro. Não existe exceção nem meio-termo — nem um número que 'parece certo', nem uma norma 'que geralmente é essa', nem uma estatística lembrada de memória: toda citação de fato precisa ter uma fonte oficial linkada comprovando ela, sempre, sem exceção.",
        'REGRA DURA — âncora do link curta (1 a 3 palavras): ao inserir um link externo, a âncora (o texto dentro de <a>...</a>, o trecho que fica clicável/sublinhado) deve ser uma palavra-chave curta — no máximo 1 a 3 palavras, o termo específico que está sendo linkado — NUNCA a frase inteira nem um trecho longo. O resto da frase fica como texto normal, fora do <a>. Exemplo ERRADO: <a href="...">a Serasa informa mais de 83 milhões de brasileiros negativados</a>. Exemplo CERTO: a Serasa informa mais de 83 milhões de brasileiros negativados, segundo o <a href="...">mapa da inadimplência</a> — ou: segundo o <a href="...">Registrato do Banco Central</a>, é possível consultar todas as dívidas em aberto. A âncora deve nomear a FONTE ou o DOCUMENTO específico (ex.: "mapa da inadimplência", "Registrato", "art. 43 do CDC", "Súmula 548"), não repetir o dado ou a afirmação inteira.',
        "Use a ferramenta para registrar o resultado.",
      ].join("\n"),
    );
    expect(promptEnviado).not.toContain("Persona deste post");
    expect(promptEnviado).not.toContain("Instruções adicionais desta propriedade");
    expect(argumentosChamada.max_tokens).toBe(20000);
    // web_search (19/08/2026, pedido do Luiz) — disponível junto da ferramenta de saída, e
    // tool_choice precisa ser "auto" (não mais forçado) pra deixar o modelo livre pra buscar antes
    // de finalizar.
    expect(argumentosChamada.tools).toEqual([expect.objectContaining({ name: "registrar_conteudo" }), expect.objectContaining({ name: "web_search", type: "web_search_20250305" })]);
    expect(argumentosChamada.tool_choice).toEqual({ type: "auto" });
    expect(usage.inputTokens).toBe(1234);
    expect(usage.outputTokens).toBe(5678);
  });

  // Novo (Task 5, Fase 3, spec seção 7): com persona não-nula, o prompt ganha o bloco adicional
  // com `persona.conteudoCompleto`, texto exato de referência da spec — aditivo, sem tocar no
  // resto do prompt (mesmas linhas do teste de regressão acima, só com o bloco novo inserido antes
  // da instrução final).
  it("inclui o bloco de persona no prompt quando uma persona é fornecida", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "registrar_conteudo",
          input: {
            titulo: "Como Limpar o Nome no Serasa: Passo a Passo Completo",
            conteudo_html: "<h1>Como Limpar o Nome no Serasa</h1><p>...</p>".repeat(50),
            meta_title: "Como Limpar Nome no Serasa | Passo a Passo",
            meta_description: "Aprenda o passo a passo completo para limpar seu nome no Serasa em 2026.",
            slug: "como-limpar-nome-serasa",
            relatorio: "Segui o ângulo passo a passo, usando fontes do Serasa e do BACEN.",
          },
        },
      ],
      usage: { input_tokens: 1234, output_tokens: 5678 },
    });

    await gerarConteudo(pautaDePersona, checklist, persona, propriedade);

    const argumentosChamada = mockCreate.mock.calls[0][0];
    const promptEnviado = argumentosChamada.messages[0].content;
    expect(promptEnviado).toContain(
      `Persona deste post — escreva na voz/vocabulário dela, respeitando o que ela não quer ouvir:\n${persona.conteudoCompleto}`,
    );
    // A instrução final continua depois do bloco de persona — prova que a adição é ANTES dela, não
    // uma substituição/reordenação do resto do prompt.
    expect(promptEnviado.indexOf(persona.conteudoCompleto)).toBeLessThan(promptEnviado.indexOf("Use a ferramenta para registrar o resultado."));
    // Resto do prompt (pauta/checklist/regra de citabilidade) continua idêntico ao teste de
    // regressão acima — mesma ordem, nada reescrito.
    expect(promptEnviado).toContain("Checklist de qualidade obrigatório — todo item precisa ser atendido:\n- H1 com a palavra-chave principal\n- Mínimo 1.800 palavras");
  });

  // Novo (Task 4, Fase 4a, spec seção 3.1.2): com propriedade.instrucoesAdicionais preenchido, o
  // prompt ganha o bloco adicional — aditivo, mesmo padrão do bloco de persona acima, sem tocar no
  // resto do prompt.
  it("inclui o bloco de instruções adicionais no prompt quando a propriedade tem instrucoesAdicionais", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "registrar_conteudo",
          input: {
            titulo: "Como Limpar o Nome no Serasa: Passo a Passo Completo",
            conteudo_html: "<h1>Como Limpar o Nome no Serasa</h1><p>...</p>".repeat(50),
            meta_title: "Como Limpar Nome no Serasa | Passo a Passo",
            meta_description: "Aprenda o passo a passo completo para limpar seu nome no Serasa em 2026.",
            slug: "como-limpar-nome-serasa",
            relatorio: "Segui o ângulo passo a passo, usando fontes do Serasa e do BACEN.",
          },
        },
      ],
      usage: { input_tokens: 1234, output_tokens: 5678 },
    });

    await gerarConteudo(pauta, checklist, null, propriedadeComInstrucoes);

    const argumentosChamada = mockCreate.mock.calls[0][0];
    const promptEnviado = argumentosChamada.messages[0].content;
    expect(promptEnviado).toContain(
      `Instruções adicionais desta propriedade — siga além de tudo já pedido acima:\n${propriedadeComInstrucoes.instrucoesAdicionais}`,
    );
    // A instrução final continua depois do bloco — prova que a adição é ANTES dela, não uma
    // substituição/reordenação do resto do prompt.
    expect(promptEnviado.indexOf(propriedadeComInstrucoes.instrucoesAdicionais!)).toBeLessThan(
      promptEnviado.indexOf("Use a ferramenta para registrar o resultado."),
    );
    // Resto do prompt (pauta/checklist/regra de citabilidade) continua idêntico ao teste de
    // regressão — mesma ordem, nada reescrito.
    expect(promptEnviado).toContain("Checklist de qualidade obrigatório — todo item precisa ser atendido:\n- H1 com a palavra-chave principal\n- Mínimo 1.800 palavras");
  });

  // Achado do teste real de ponta a ponta da Fase 3 (19/08/2026): motivoUltimaReprovacao existia
  // em PautaCarregada desde o núcleo (Task 10) mas nunca era lido aqui — cada retry regenerava às
  // cegas. Este teste confirma que, quando a pauta já tem um motivo de reprovação anterior, ele
  // entra no prompt — aditivo, mesma posição/padrão do bloco de persona acima.
  it("inclui o motivo da reprovação anterior no prompt quando a pauta já foi reprovada antes", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "registrar_conteudo",
          input: {
            titulo: "Como Limpar o Nome no Serasa: Passo a Passo Completo",
            conteudo_html: "<h1>Como Limpar o Nome no Serasa</h1><p>...</p>".repeat(50),
            meta_title: "Como Limpar Nome no Serasa | Passo a Passo",
            meta_description: "Aprenda o passo a passo completo para limpar seu nome no Serasa em 2026.",
            slug: "como-limpar-nome-serasa",
            relatorio: "Segui o ângulo passo a passo, usando fontes do Serasa e do BACEN.",
          },
        },
      ],
      usage: { input_tokens: 1234, output_tokens: 5678 },
    });
    const pautaReprovadaAntes: PautaCarregada = {
      ...pauta,
      id: "pauta-3",
      tentativas: 1,
      motivoUltimaReprovacao: "Contagem de palavras insuficiente: só 1.200 de 1.800 exigidas.",
    };

    await gerarConteudo(pautaReprovadaAntes, checklist, null, propriedade);

    const argumentosChamada = mockCreate.mock.calls[0][0];
    const promptEnviado = argumentosChamada.messages[0].content;
    expect(promptEnviado).toContain(
      "Esta é uma nova tentativa — a versão anterior deste post foi reprovada pelo Revisor pelo seguinte motivo, e esta versão precisa corrigir especificamente isso:\nContagem de palavras insuficiente: só 1.200 de 1.800 exigidas.",
    );
    expect(promptEnviado.indexOf("Contagem de palavras insuficiente")).toBeLessThan(
      promptEnviado.indexOf("Use a ferramenta para registrar o resultado."),
    );
  });

  // Novo (19/08/2026, mesmo achado acima): quando existe ultimoRascunho salvo (salvarRascunho,
  // chamado por processar-pauta.ts a cada geração), o prompt pede REVISÃO desse texto específico
  // em vez do texto genérico "corrija isso" do teste anterior — inclui o HTML da versão anterior
  // pra o modelo editar em cima, não reescrever do zero.
  it("pede revisão do rascunho anterior (não reescrita do zero) quando ultimoRascunho está presente junto do motivo", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "registrar_conteudo",
          input: {
            titulo: "Como Limpar o Nome no Serasa: Passo a Passo Completo",
            conteudo_html: "<h1>Como Limpar o Nome no Serasa</h1><p>...</p>".repeat(50),
            meta_title: "Como Limpar Nome no Serasa | Passo a Passo",
            meta_description: "Aprenda o passo a passo completo para limpar seu nome no Serasa em 2026.",
            slug: "como-limpar-nome-serasa",
            relatorio: "Segui o ângulo passo a passo, usando fontes do Serasa e do BACEN.",
          },
        },
      ],
      usage: { input_tokens: 1234, output_tokens: 5678 },
    });
    const pautaComRascunhoAnterior: PautaCarregada = {
      ...pauta,
      id: "pauta-4",
      tentativas: 2,
      motivoUltimaReprovacao: "Meta title com 62 caracteres, acima do limite de 60.",
      ultimoRascunho: {
        titulo: "Título da versão anterior",
        conteudoHtml: "<h1>Título da versão anterior</h1><p>Corpo da versão anterior.</p>",
        metaTitle: "Meta title anterior, longo demais pro limite de sessenta",
        metaDescription: "Meta description anterior.",
        slug: "titulo-da-versao-anterior",
      },
    };

    await gerarConteudo(pautaComRascunhoAnterior, checklist, null, propriedade);

    const argumentosChamada = mockCreate.mock.calls[0][0];
    const promptEnviado = argumentosChamada.messages[0].content;
    // Instrução de revisão, o motivo, e o conteúdo da versão anterior (título + HTML) precisam
    // estar todos presentes — é isso que dá ao modelo o que editar, em vez de só o que evitar.
    expect(promptEnviado).toContain("Esta é uma revisão");
    expect(promptEnviado).toContain("EDIÇÃO CIRÚRGICA");
    expect(promptEnviado).toContain("Meta title com 62 caracteres, acima do limite de 60.");
    expect(promptEnviado).toContain("Título da versão anterior");
    expect(promptEnviado).toContain("<h1>Título da versão anterior</h1><p>Corpo da versão anterior.</p>");
    // Achado da revisão desta task: sem os campos de meta da versão anterior, uma reprovação
    // especificamente sobre meta title/description obrigaria o Escritor a adivinhar o valor
    // problemático em vez de editá-lo — os quatro campos precisam estar presentes, não só HTML.
    expect(promptEnviado).toContain("Meta title anterior, longo demais pro limite de sessenta");
    expect(promptEnviado).toContain("Meta description anterior.");
    expect(promptEnviado).toContain("titulo-da-versao-anterior");
    // O texto genérico "nova tentativa... corrigir especificamente isso" (sem o rascunho) NÃO deve
    // aparecer — prova que é um branch diferente, não os dois blocos concatenados.
    expect(promptEnviado).not.toContain("Esta é uma nova tentativa — a versão anterior deste post foi reprovada pelo Revisor pelo seguinte motivo, e esta versão precisa corrigir especificamente isso:");
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
          name: "registrar_conteudo",
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

    await expect(gerarConteudo(pauta, checklist, null, propriedade)).rejects.toThrow(/truncada por limite de tokens/);
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
          name: "registrar_conteudo",
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

    await expect(gerarConteudo(pauta, checklist, null, propriedade)).rejects.toThrow(/titulo/);
  });

  // Novo (19/08/2026, pedido do Luiz): relatorio é required na ferramenta igual aos demais campos —
  // sem ele, o cruzamento com o motivo do Revisor no Monitor não é possível.
  it("lança erro claro quando o relatório vem ausente", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue({
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          name: "registrar_conteudo",
          input: {
            titulo: "Como Limpar o Nome no Serasa",
            conteudo_html: "<p>...</p>",
            meta_title: "Como Limpar Nome no Serasa",
            meta_description: "Aprenda o passo a passo completo.",
            slug: "como-limpar-nome-serasa",
          },
        },
      ],
    });

    await expect(gerarConteudo(pauta, checklist, null, propriedade)).rejects.toThrow(/relatorio/);
  });

  // web_search (19/08/2026, pedido do Luiz) — server tool: aparece no content como blocos
  // `server_tool_use`/`web_search_tool_result`, tipos DIFERENTES de `tool_use`. Este teste garante
  // que o parsing não confunde essas invocações de busca com a chamada real da ferramenta de saída
  // — mesmo com blocos de busca ANTES dele no array `content` (ordem real: o modelo busca primeiro,
  // só depois chama registrar_conteudo).
  it("ignora blocos server_tool_use/web_search_tool_result e usa o tool_use de registrar_conteudo", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue({
      content: [
        { type: "text", text: "Vou verificar essa fonte antes de escrever." },
        { type: "server_tool_use", id: "srvtool_1", name: "web_search", input: { query: "BACEN cadastro positivo" } },
        { type: "web_search_tool_result", tool_use_id: "srvtool_1", content: [{ type: "web_search_result", title: "BACEN", url: "https://www.bcb.gov.br/real" }] },
        {
          type: "tool_use",
          name: "registrar_conteudo",
          input: {
            titulo: "Como Limpar o Nome no Serasa: Passo a Passo Completo",
            conteudo_html: "<h1>Como Limpar o Nome no Serasa</h1><p>...</p>".repeat(50),
            meta_title: "Como Limpar Nome no Serasa | Passo a Passo",
            meta_description: "Aprenda o passo a passo completo para limpar seu nome no Serasa em 2026.",
            slug: "como-limpar-nome-serasa",
            relatorio: "Busquei a fonte real do BACEN antes de citar.",
          },
        },
      ],
      usage: { input_tokens: 1500, output_tokens: 3000 },
    });

    const { resultado } = await gerarConteudo(pauta, checklist, null, propriedade);

    expect(resultado.titulo).toContain("Serasa");
    expect(resultado.relatorio).toBe("Busquei a fonte real do BACEN antes de citar.");
  });
});
