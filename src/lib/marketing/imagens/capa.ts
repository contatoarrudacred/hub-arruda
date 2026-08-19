// src/lib/marketing/imagens/capa.ts
// Orquestrador da capa (Fase 4b, spec seção 4.2; fluxo detalhado em
// docs/insumos-externos/especificacao_automacao_capa_post_persona.md) — as 5 etapas do documento
// de capa, seguidas como estão, sem improvisar uma estrutura diferente:
//   1. Resumo estratégico do post (Claude)      — seção 4 do doc de capa
//   2. Resumo psicológico-visual da persona (Claude) — seção 5
//   3. Cruzamento: uma única ideia visual (Claude)    — seção 6
//   4. Prompt final da imagem + metadados (Claude)    — seção 7 ("Regra final": 1 emoção, 1
//      conflito, 1 momento, 1 ambiente; lista de clichês visuais a evitar)
//   5. Geração (gerarImagemOpenAI) + revisão (revisarImagem, Task 6) — seção 8
//
// Metadados (ALT/slug/title, spec núcleo seção 4.5): dobrados na MESMA chamada da etapa 4, não
// numa chamada de texto separada — decisão de implementação explicitamente permitida pela spec
// ("Gerados na mesma chamada do revisor de imagem ou numa chamada de texto simples logo depois").
// A etapa 4 já tem título + resumo do post + resumo da persona no contexto, que é exatamente o
// "mesmo material usado pra gerar a imagem" que a spec pede — uma 5ª chamada Claude só pra
// metadados repetiria esse contexto sem ganho.
//
// persona: null — a spec do doc de capa assume persona sempre presente (fluxo "TÍTULO + POST
// COMPLETO + PERSONA COMPLETA"), mas PautaCarregada.personaId pode ser null (pautas antigas/
// manuais, ver tipos.ts). Em vez de travar o pipeline nesse caso (que hoje é raro mas existe),
// degradamos graciosamente: a etapa 2 roda com um resumo-placeholder dizendo que não há persona
// associada, e as etapas seguintes (cruzamento, prompt) recebem esse placeholder em vez do
// resumo-persona real — a cena passa a se apoiar só no conteúdo emocional do próprio post
// (Princípio 1 da spec: "o post determina o assunto", a persona só ajuda a "sentir" o assunto; sem
// persona, a cena ainda pode ser construída em cima só do assunto). Fica documentado aqui porque é
// uma decisão de design que preenche uma lacuna real da spec, não um comportamento óbvio.
//
// Global Constraint (plano mestre): esta função NUNCA lança — qualquer falha em qualquer etapa
// (Claude, OpenAI, revisor, limite de tentativas de imagem esgotado) devolve
// `{ resultado: null, usage: <acumulado até a falha> }`. Um post sem capa é degradação aceitável;
// um post que falha de publicar por causa da capa não é.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ConteudoGerado, PautaCarregada, PersonaCarregada, UsageTokens } from "../tipos";
import { gerarImagemOpenAI } from "./gerador-imagem-openai";
import { revisarImagem } from "./revisor-imagem";

const MODELO_CAPA = "claude-sonnet-5";

// Limite de tentativas de geração de imagem (spec seção 4.4/8, sugestão do plano: 2 — menor que
// o do texto, pra não estourar custo de imagem numa reprovação persistente).
const LIMITE_TENTATIVAS_IMAGEM = 2;

const RESUMO_PERSONA_AUSENTE =
  "Nenhuma persona está associada a este post — a cena deve se basear apenas no assunto, conflito e emoção do próprio post, sem direcionamento psicológico de uma persona específica.";

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

function somarUsage(acumulado: UsageTokens, novo: UsageTokens): UsageTokens {
  return {
    inputTokens: acumulado.inputTokens + novo.inputTokens,
    outputTokens: acumulado.outputTokens + novo.outputTokens,
  };
}

function usageDaResposta(resposta: Anthropic.Message): UsageTokens {
  return {
    inputTokens: resposta.usage?.input_tokens ?? 0,
    outputTokens: resposta.usage?.output_tokens ?? 0,
  };
}

function extrairFerramenta<T>(resposta: Anthropic.Message, nomeEsperado: string): T {
  const bloco = resposta.content.find((b) => b.type === "tool_use");
  if (!bloco || bloco.type !== "tool_use") {
    throw new Error(`Capa (${nomeEsperado}): resposta sem bloco de ferramenta estruturado.`);
  }
  return bloco.input as T;
}

// ETAPA 1 — resumo estratégico do post (spec seção 4).
const FERRAMENTA_RESUMO_POST = {
  name: "registrar_resumo_post",
  description: "Registra o resumo estratégico do post, destinado exclusivamente à criação posterior da imagem de capa.",
  input_schema: {
    type: "object" as const,
    properties: {
      resumo: {
        type: "string",
        description:
          "Um único parágrafo de ~100-180 palavras: assunto central, promessa/descoberta principal, conflito, emoção de entrada e de saída, até 3 situações visualizáveis, elementos visuais relevantes concretos e o gancho de curiosidade. Não invente fatos, não escreva copy/headline, não descreva ainda a imagem final.",
      },
    },
    required: ["resumo"],
  },
};

async function gerarResumoPost(titulo: string, conteudoHtml: string): Promise<{ resumo: string; usage: UsageTokens }> {
  const cliente = obterCliente();
  const prompt = [
    "Você é um especialista em marketing, neuromarketing, comportamento humano, storytelling e direção criativa.",
    "Analise o artigo completo e produza um RESUMO ESTRATÉGICO destinado exclusivamente à criação posterior da imagem de capa — não um resumo convencional. Extraia somente informações úteis para criar uma imagem foto-realista, emocional e capaz de despertar curiosidade: assunto central, promessa/descoberta principal, problema/conflito central, emoção de entrada, emoção de saída, até 3 situações visualizáveis (priorize humanas e cotidianas), elementos visuais relevantes concretos, e o gancho de curiosidade.",
    "Regras: não invente fatos; não escreva copy, headline ou chamada publicitária; não sugira textos para a imagem; não descreva ainda a imagem final; priorize o conflito principal e o aspecto emocional com maior potencial visual.",
    "",
    `TÍTULO DO POST:\n${titulo}`,
    "",
    `POST COMPLETO:\n${conteudoHtml}`,
    "",
    "Use a ferramenta para registrar o resultado.",
  ].join("\n");

  const resposta = await cliente.messages.create({
    model: MODELO_CAPA,
    max_tokens: 1500,
    tools: [FERRAMENTA_RESUMO_POST],
    tool_choice: { type: "tool", name: "registrar_resumo_post" },
    messages: [{ role: "user", content: prompt }],
  });

  const { resumo } = extrairFerramenta<{ resumo: string }>(resposta, "resumo do post");
  if (typeof resumo !== "string" || resumo.trim() === "") {
    throw new Error("Capa (resumo do post): campo obrigatório \"resumo\" ausente ou vazio.");
  }
  return { resumo, usage: usageDaResposta(resposta) };
}

// ETAPA 2 — resumo psicológico-visual da persona (spec seção 5).
const FERRAMENTA_RESUMO_PERSONA = {
  name: "registrar_resumo_persona",
  description: "Registra o resumo psicológico-visual da persona, destinado exclusivamente à criação posterior de imagens de capa.",
  input_schema: {
    type: "object" as const,
    properties: {
      resumo: {
        type: "string",
        description:
          "Um único parágrafo de ~120-200 palavras: quem é a pessoa, situação atual, problema, objetivo aparente, desejo profundo, emoção dominante, principais medos, identidade ameaçada, relações importantes, situações cotidianas visualmente relevantes. Não invente características ausentes, não transforme em caricatura, não descreva ainda a imagem final.",
      },
    },
    required: ["resumo"],
  },
};

async function gerarResumoPersona(persona: PersonaCarregada | null): Promise<{ resumo: string; usage: UsageTokens }> {
  if (!persona) {
    return { resumo: RESUMO_PERSONA_AUSENTE, usage: { inputTokens: 0, outputTokens: 0 } };
  }

  const cliente = obterCliente();
  const prompt = [
    "Você é um especialista em psicologia do consumidor, neuromarketing, comportamento humano, storytelling e direção criativa.",
    "Analise a persona completa e produza um RESUMO PSICOLÓGICO-VISUAL destinado exclusivamente à criação posterior de imagens de capa — não um resumo convencional. Extraia somente características capazes de influenciar personagem, situação, emoção, expressão, linguagem corporal, ambiente, objetos, relações humanas e narrativa visual: quem é essa pessoa, situação atual, objetivo aparente, desejo profundo, dor emocional central, até 3 medos mais profundos, identidade ameaçada, pessoas emocionalmente importantes, até 3 momentos de maior tensão (potencialmente fotografáveis), até 3 momentos de desejo, ambientes/objetos do universo da persona, e gatilhos de identificação.",
    "Regras: não invente características ausentes; não transforme a persona em caricatura; não escreva anúncio ou copy; não sugira frases para a imagem; não descreva ainda a imagem final; diferencie objetivo funcional de desejo emocional; priorize emoções demonstráveis visualmente.",
    "",
    `PERSONA COMPLETA:\n${persona.conteudoCompleto}`,
    "",
    "Use a ferramenta para registrar o resultado.",
  ].join("\n");

  const resposta = await cliente.messages.create({
    model: MODELO_CAPA,
    max_tokens: 1500,
    tools: [FERRAMENTA_RESUMO_PERSONA],
    tool_choice: { type: "tool", name: "registrar_resumo_persona" },
    messages: [{ role: "user", content: prompt }],
  });

  const { resumo } = extrairFerramenta<{ resumo: string }>(resposta, "resumo da persona");
  if (typeof resumo !== "string" || resumo.trim() === "") {
    throw new Error("Capa (resumo da persona): campo obrigatório \"resumo\" ausente ou vazio.");
  }
  return { resumo, usage: usageDaResposta(resposta) };
}

// ETAPA 3 — cruzamento estratégico: uma única ideia visual (spec seção 6, cadeia de decisão
// emoção central → conflito → momento visual → personagem → ambiente → objeto/sinal → lacuna de
// curiosidade).
const FERRAMENTA_CRUZAMENTO = {
  name: "registrar_cruzamento",
  description: "Registra a ideia visual única resultante do cruzamento entre o post e a persona.",
  input_schema: {
    type: "object" as const,
    properties: {
      ideia_visual: {
        type: "string",
        description:
          "Um único parágrafo descrevendo UMA ideia visual (não várias cenas/medos/promessas combinados), seguindo a cadeia: emoção central → conflito relacionado ao post → momento visual (entendível em 1-2 segundos) → personagem → ambiente → objeto/sinal narrativo → lacuna de curiosidade.",
      },
    },
    required: ["ideia_visual"],
  },
};

async function gerarCruzamento(titulo: string, resumoPost: string, resumoPersona: string): Promise<{ ideiaVisual: string; usage: UsageTokens }> {
  const cliente = obterCliente();
  const prompt = [
    "Você é um diretor de arte e estrategista de conteúdo. Cruze o título, o resumo do post e o resumo da persona abaixo pra encontrar a interseção entre o assunto do post e a psicologia da persona.",
    "Não escolha simplesmente a característica mais dramática da persona. Não escolha simplesmente uma ilustração literal do título.",
    "Pergunte internamente: qual parte do problema do post toca mais profundamente essa persona? Qual emoção da persona é ativada especificamente por este assunto? Em qual situação cotidiana essa combinação poderia acontecer? Qual momento pode ser entendido visualmente em 1-2 segundos? Qual cena cria identificação sem revelar toda a resposta do artigo? Qual detalhe cria uma pequena lacuna de curiosidade? Essa cena continuaria fazendo sentido sem nenhum texto sobreposto?",
    "Escolha UMA única ideia visual principal — não tente combinar várias cenas, vários medos ou várias promessas na mesma imagem.",
    "",
    `TÍTULO:\n${titulo}`,
    "",
    `RESUMO DO POST:\n${resumoPost}`,
    "",
    `RESUMO DA PERSONA:\n${resumoPersona}`,
    "",
    "Use a ferramenta para registrar o resultado.",
  ].join("\n");

  const resposta = await cliente.messages.create({
    model: MODELO_CAPA,
    max_tokens: 1000,
    tools: [FERRAMENTA_CRUZAMENTO],
    tool_choice: { type: "tool", name: "registrar_cruzamento" },
    messages: [{ role: "user", content: prompt }],
  });

  const { ideia_visual: ideiaVisual } = extrairFerramenta<{ ideia_visual: string }>(resposta, "cruzamento");
  if (typeof ideiaVisual !== "string" || ideiaVisual.trim() === "") {
    throw new Error("Capa (cruzamento): campo obrigatório \"ideia_visual\" ausente ou vazio.");
  }
  return { ideiaVisual, usage: usageDaResposta(resposta) };
}

// ETAPA 4 — prompt final da imagem + metadados (spec seção 7, "Prompt Mestre"; metadados dobrados
// na mesma chamada, spec núcleo seção 4.5).
const FERRAMENTA_PROMPT_CAPA = {
  name: "registrar_prompt_capa",
  description: "Registra o prompt final de geração de imagem (foto-realista) e os metadados da imagem de capa.",
  input_schema: {
    type: "object" as const,
    properties: {
      prompt_imagem: {
        type: "string",
        description:
          "Prompt em INGLÊS (melhor fidelidade nos modelos de geração de imagem) para um modelo de geração de imagem foto-realista, seguindo a 'Regra final': a cena contém exatamente 1 emoção dominante, 1 conflito principal, 1 momento narrativo, 1 ambiente coerente e 1 ou poucos sinais visuais importantes. Estética fotográfica/editorial/cinematográfica, pessoas brasileiras quando houver personagens, anatomia natural, iluminação natural/cinematográfica coerente. NÃO deve parecer banco de imagens genérico, propaganda financeira clichê, ilustração digital, render 3D, ou imagem típica de IA. Evite clichês salvo indispensável ao contexto real: dinheiro voando, chuva de notas, correntes, cadeados gigantes, gráficos flutuantes, ícones financeiros, documentos gigantes, CPF gigante, pessoa segurando a cabeça teatralmente, expressão exagerada de desespero, executivo genérico olhando gráficos, aperto de mãos corporativo sem contexto, personagem olhando direto pra câmera sem razão narrativa. Não inclua título, slogan, headline, legenda, chamada publicitária, logotipo ou grandes blocos de texto — texto incidental (celular, placa, documento), quando estritamente necessário à cena, deve ser curto e em PORTUGUÊS DO BRASIL. Composição 16:9 horizontal, elemento emocional principal reconhecível em miniatura.",
      },
      alt: {
        type: "string",
        description: "ALT text da imagem, derivado do mesmo material usado pra gerar a imagem (banco fechado) — descreve a cena literalmente, sem inventar elementos.",
      },
      slug: {
        type: "string",
        description: "Slug de arquivo em kebab-case, sem acentos, com palavra-chave relevante — nunca um hash aleatório.",
      },
      titulo: {
        type: "string",
        description: "Title attribute da imagem — curto, descreve a cena.",
      },
    },
    required: ["prompt_imagem", "alt", "slug", "titulo"],
  },
};

type ResultadoEtapa4 = { promptImagem: string; alt: string; slug: string; titulo: string };

async function gerarPromptCapa(titulo: string, resumoPost: string, resumoPersona: string): Promise<{ resultado: ResultadoEtapa4; usage: UsageTokens }> {
  const cliente = obterCliente();
  const prompt = [
    "Você é um diretor de arte, fotógrafo publicitário e especialista em neuromarketing, comportamento humano e comunicação emocional.",
    "Crie o prompt para uma imagem FOTO-REALISTA, para ser usada como capa de um artigo de blog no WordPress, a partir das informações abaixo. A imagem não deve simplesmente ilustrar literalmente o título — deve representar visualmente a situação, conflito, desejo ou emoção mais importante que conecta o conteúdo do artigo à persona, criando identificação + emoção + curiosidade, sem tentar explicar visualmente todo o artigo (uma imagem = uma ideia dominante).",
    "",
    `TÍTULO:\n${titulo}`,
    "",
    `RESUMO ESTRATÉGICO DO POST:\n${resumoPost}`,
    "",
    `RESUMO PSICOLÓGICO-VISUAL DA PERSONA:\n${resumoPersona}`,
    "",
    "Além do prompt de imagem, gere os metadados (ALT, slug, título) derivados do mesmo material.",
    "Use a ferramenta para registrar o resultado.",
  ].join("\n");

  const resposta = await cliente.messages.create({
    model: MODELO_CAPA,
    max_tokens: 2000,
    tools: [FERRAMENTA_PROMPT_CAPA],
    tool_choice: { type: "tool", name: "registrar_prompt_capa" },
    messages: [{ role: "user", content: prompt }],
  });

  const bruta = extrairFerramenta<{ prompt_imagem: string; alt: string; slug: string; titulo: string }>(resposta, "prompt final");
  const camposObrigatorios: Array<keyof typeof bruta> = ["prompt_imagem", "alt", "slug", "titulo"];
  for (const campo of camposObrigatorios) {
    if (typeof bruta[campo] !== "string" || bruta[campo].trim() === "") {
      throw new Error(`Capa (prompt final): campo obrigatório "${campo}" ausente ou vazio.`);
    }
  }

  return {
    resultado: { promptImagem: bruta.prompt_imagem, alt: bruta.alt, slug: bruta.slug, titulo: bruta.titulo },
    usage: usageDaResposta(resposta),
  };
}

export async function gerarCapa(
  pauta: PautaCarregada,
  conteudo: ConteudoGerado,
  persona: PersonaCarregada | null,
): Promise<{ resultado: { url: string; alt: string; slug: string; titulo: string } | null; usage: UsageTokens }> {
  let usage: UsageTokens = { inputTokens: 0, outputTokens: 0 };

  try {
    // Etapas 1-4 — falha em qualquer uma delas (infra Claude, campo ausente) é uma falha de
    // pipeline: sem prompt de imagem não há o que gerar. Cai no catch geral, devolve null.
    const etapa1 = await gerarResumoPost(conteudo.titulo, conteudo.conteudoHtml);
    usage = somarUsage(usage, etapa1.usage);

    const etapa2 = await gerarResumoPersona(persona);
    usage = somarUsage(usage, etapa2.usage);

    const etapa3 = await gerarCruzamento(conteudo.titulo, etapa1.resumo, etapa2.resumo);
    usage = somarUsage(usage, etapa3.usage);

    const etapa4 = await gerarPromptCapa(conteudo.titulo, etapa1.resumo, etapa2.resumo);
    usage = somarUsage(usage, etapa4.usage);

    // Etapa 5 — geração (OpenAI) + revisão (Claude com visão, Task 6), com retry até
    // LIMITE_TENTATIVAS_IMAGEM. trechoFonte é o post inteiro (conteudoHtml) porque a capa
    // representa o post inteiro, não uma passagem específica (diferente das imagens secundárias,
    // Task 8, onde o trecho-fonte é um trecho específico).
    let promptTentativa = etapa4.resultado.promptImagem;
    for (let tentativa = 1; tentativa <= LIMITE_TENTATIVAS_IMAGEM; tentativa++) {
      const geracao = await gerarImagemOpenAI(promptTentativa, "16:9");
      // custoUsd da OpenAI não faz parte de UsageTokens (só tokens Anthropic) — não é acumulado
      // aqui; ver observação no relatório da task sobre esse gap.

      const revisao = await revisarImagem(geracao.url, conteudo.conteudoHtml);
      usage = somarUsage(usage, revisao.usage);

      if (revisao.resultado.aprovada) {
        return {
          resultado: {
            url: geracao.url,
            alt: etapa4.resultado.alt,
            slug: etapa4.resultado.slug,
            titulo: etapa4.resultado.titulo,
          },
          usage,
        };
      }

      // Reprovada — dobra o motivo no prompt da próxima tentativa (mesmo padrão de
      // escritor.ts/revisor.ts: motivo concreto pra corrigir, não reescrever do zero).
      promptTentativa = [
        etapa4.resultado.promptImagem,
        "",
        `CORREÇÃO OBRIGATÓRIA — a tentativa anterior foi reprovada pelo motivo abaixo. Gere novamente evitando especificamente esse problema:`,
        revisao.resultado.motivo ?? "",
      ].join("\n");
    }

    // Limite de tentativas esgotado sem aprovação — degradação aceitável (Global Constraint).
    return { resultado: null, usage };
  } catch {
    // Qualquer falha de infraestrutura (Claude, OpenAI, revisor) em qualquer etapa — não derruba
    // o pipeline. Um post sem capa é um resultado aceitável; um post que falha de publicar por
    // causa da capa não é.
    return { resultado: null, usage };
  }
}
