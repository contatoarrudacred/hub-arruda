// src/lib/marketing/revisor.ts
// Estágio 2 do pipeline — valida o rascunho contra o checklist da propriedade + checagem de
// alucinação factual, score mínimo 80/100 por padrão (mesmo padrão do plano original da QMARKA,
// agora calibrável por propriedade — ver spec Fase 4a, seção 3.1.1).
//
// Fase 4a (19/08/2026, spec docs/superpowers/specs/2026-08-19-fase4-precisao-imagens-distribuicao-design.md
// seções 3.1/3.1.1) estende a decisão de aprovação de "só score" pra "score E três gates
// multiplicativos" (precisão factual, fontes específicas, originalidade) — um score alto não
// compensa mais um `false` em nenhum dos três, decisão deliberada pra não deixar a média do
// checklist "engolir" um problema factual/legal sério (ver calcularAprovacao abaixo).

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ConteudoGerado, ItemChecklistCarregado, PropriedadeCarregada, ResultadoRevisao, UsageTokens } from "./tipos";

const MODELO_REVISOR = "claude-sonnet-5";

/** Default aplicado quando a propriedade não configura `scoreMinimoAprovacao` em `config_pipeline`
 * — mesmo valor hardcoded de antes da Fase 4a, preservado como default pra propriedade nenhuma
 * mudar de comportamento só por existir esta feature (regressão coberta em revisor.test.ts). */
const SCORE_MINIMO_APROVACAO_PADRAO = 80;

/** Post recente da mesma propriedade, pro Revisor julgar `originalidade_adequada` (spec seção
 * 3.1, "Contexto novo no prompt do Revisor") — título + ângulo, não o conteúdo inteiro. Quem monta
 * esta lista (join posts/pautas publicados) é responsabilidade de processar-pauta.ts / Task 3, não
 * deste módulo. */
type PostRecenteResumo = { titulo: string; angulo: string };

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

const FERRAMENTA_REVISOR = {
  name: "registrar_revisao",
  description: "Registra o resultado da revisão de qualidade do rascunho.",
  input_schema: {
    type: "object" as const,
    properties: {
      score: { type: "number", description: "Score de 0 a 100, ponderado pelo peso de cada item do checklist." },
      precisao_factual_adequada: {
        type: "boolean",
        description:
          "false se alguma afirmação jurídica/financeira sensível carece de sustentação ou está tecnicamente incorreta.",
      },
      fontes_especificas: {
        type: "boolean",
        description: "false se alguma fonte citada aponta pra homepage genérica em vez de página/documento específico.",
      },
      originalidade_adequada: {
        type: "boolean",
        description:
          "false se, removendo a persona e a palavra-chave, o rascunho for essencialmente igual a um post já publicado desta propriedade.",
      },
      motivo: {
        type: "string",
        description:
          "Obrigatório quando reprovado (score abaixo do mínimo OU qualquer um dos três campos booleanos acima for false): contém o diagnóstico específico do que falhou E uma sugestão concreta do que corrigir, pro Escritor (ou um humano) usar na próxima tentativa. Null quando aprovado.",
      },
    },
    required: ["score", "precisao_factual_adequada", "fontes_especificas", "originalidade_adequada"],
  },
};

/** Texto de instrução interpolado no prompt a partir de `propriedade.rigorYmyl` — spec seção
 * 3.1.1: "alto" pesa nichos YMYL (financeiro/jurídico/saúde, caso da ArrudaCred), "baixo" é pra
 * nicho de baixo risco, "desativado" mantém o campo preenchido honestamente mas sinaliza que o
 * critério não é prioritário (o gate correspondente pode estar desligado via `checarPrecisaoFactual`
 * — são dois parâmetros independentes: um calibra o TEXTO da instrução, o outro liga/desliga o
 * GATE na decisão de aprovação). "medio" é a redação-base, equivalente à instrução única que
 * existia antes da Fase 4a. */
const TEXTOS_RIGOR_YMYL: Record<NonNullable<PropriedadeCarregada["rigorYmyl"]>, string> = {
  alto: "Rigor YMYL ALTO para esta propriedade (nicho sensível — financeiro, jurídico ou saúde): qualquer afirmação jurídica ou financeira sensível sem lastro claro reprova precisao_factual_adequada, mesmo que pareça plausível. Aqui o custo de deixar passar um erro é muito maior que o de ser conservador demais.",
  medio: "Rigor YMYL padrão para esta propriedade: reprove precisao_factual_adequada quando alguma afirmação sensível parecer inventada, desatualizada ou tecnicamente incorreta.",
  baixo: "Rigor YMYL BAIXO para esta propriedade (nicho de baixo risco): reprove precisao_factual_adequada só diante de erro factual claro e grave — não penalize incerteza menor ou simplificação razoável de um tema não sensível.",
  desativado: "Rigor YMYL DESATIVADO para esta propriedade: ainda preencha precisao_factual_adequada com uma avaliação honesta, mas este não é o critério prioritário aqui — a calibração desta propriedade pode inclusive não usar este campo na decisão final de aprovação.",
};

/**
 * Contagem real de palavras do corpo do artigo — achado do teste de ponta a ponta em produção
 * (19/08/2026): pedir pro próprio Revisor "estimar" a extensão olhando o HTML produz estimativas
 * muito abaixo da realidade em textos longos (visto na prática: modelo estimou "~1.400-1.500
 * palavras" para um texto com 2.595 palavras reais — quase o dobro), reprovando por extensão um
 * rascunho que já atendia ao mínimo. Contar programaticamente e entregar o número pronto no prompt
 * elimina essa fonte de erro por inteiro — mesmo princípio de secundarias.ts (Task 8): número que o
 * código consegue calcular com exatidão não deve ser deixado pro modelo estimar de cabeça. Remove o
 * bloco `<script>` (JSON-LD do FAQPage/Article, que não é prosa) antes de contar.
 */
function contarPalavrasCorpo(html: string): number {
  const semScript = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const semTags = semScript.replace(/<[^>]+>/g, " ");
  return semTags.split(/\s+/).filter(Boolean).length;
}

function montarPrompt(
  conteudo: ConteudoGerado,
  checklist: ItemChecklistCarregado[],
  propriedade: PropriedadeCarregada,
  postsRecentes: PostRecenteResumo[],
): string {
  // Calibração dupla Escritor/Revisor (Fase 4b, 19/08/2026, pedido do Luiz) — itemParaRevisor,
  // quando preenchido, substitui o texto que o Revisor vê pra este item (ex.: Escritor mira
  // "40-60 palavras", Revisor aceita "20-80 palavras"); ausente/null usa o mesmo `item` do
  // Escritor (comportamento padrão, idêntico a antes desta calibração existir).
  const linhasChecklist = checklist.map((c) => `- (peso ${c.peso}) ${c.itemParaRevisor ?? c.item}`).join("\n");
  const contagemPalavras = contarPalavrasCorpo(conteudo.conteudoHtml);
  const scoreMinimo = propriedade.scoreMinimoAprovacao ?? SCORE_MINIMO_APROVACAO_PADRAO;
  const textoRigor = TEXTOS_RIGOR_YMYL[propriedade.rigorYmyl ?? "medio"];
  const linhasPostsRecentes = postsRecentes.length
    ? postsRecentes.map((p) => `- "${p.titulo}" (ângulo: ${p.angulo})`).join("\n")
    : "(nenhum post publicado recente registrado pra esta propriedade)";

  return [
    "Você é o Agente QA/Revisor de um pipeline de geração de conteúdo. Avalie o rascunho abaixo contra o checklist, incluindo checagem de alucinação factual (dados numéricos citados precisam ser plausíveis, não inventados).",
    "",
    // Achado real de teste em produção (19/08/2026, pedido do Luiz): sem esta instrução, o
    // Revisor tendia a reportar só 2-3 problemas por rodada — o Escritor corrigia exatamente
    // esses, e a rodada seguinte reprovava por OUTROS problemas que já existiam desde o início,
    // mas nunca tinham sido mencionados. Isso multiplicava o número de tentativas necessárias (e
    // o custo de cada uma) sem motivo — o texto já tinha o segundo problema na 1ª versão, só
    // ninguém tinha avisado. Instrução explícita pra evitar reprovação "em fatias".
    "Revisão sistemática obrigatória: percorra o CHECKLIST INTEIRO, item por item, contra o TEXTO COMPLETO do rascunho (do título ao final do FAQ) antes de decidir o resultado — não pare no primeiro problema encontrado nem generalize a partir de uma amostra. Se o rascunho for reprovado, o motivo precisa listar TODOS os problemas reais encontrados nesta passada completa, não só os 1-2 primeiros — o objetivo é que o Escritor consiga corrigir tudo de uma vez na próxima tentativa, em vez de descobrir um problema novo a cada rodada.",
    "",
    `Contagem REAL de palavras do corpo do artigo (calculada programaticamente, não estime por conta própria): ${contagemPalavras} palavras. Use este número exato para avaliar qualquer item do checklist sobre extensão mínima/máxima — não tente contar ou estimar visualmente, o número acima já é preciso.`,
    "",
    `Score mínimo para aprovação: ${scoreMinimo}/100.`,
    "",
    textoRigor,
    "",
    "Fontes específicas: reprove fontes_especificas se alguma fonte citada no rascunho apontar pra homepage genérica de um site em vez de uma página ou documento específico (ex.: citar \"gov.br\" solto em vez do link direto pra norma/página que sustenta a afirmação).",
    "",
    "Originalidade: compare o rascunho abaixo com os posts já publicados desta propriedade (títulos e ângulos listados a seguir). Se, removendo a persona e trocando a palavra-chave principal, o rascunho for essencialmente o mesmo conteúdo de um post já publicado, reprove originalidade_adequada.",
    "Posts recentes já publicados desta propriedade:",
    linhasPostsRecentes,
    "",
    "Checklist:",
    linhasChecklist,
    "",
    `Título: ${conteudo.titulo}`,
    `Meta title: ${conteudo.metaTitle}`,
    `Meta description: ${conteudo.metaDescription}`,
    `Conteúdo HTML:\n"""\n${conteudo.conteudoHtml}\n"""`,
    "",
    "Use a ferramenta para registrar o resultado. Se o rascunho for reprovado (score abaixo do mínimo OU algum dos três campos booleanos for false), o campo motivo é obrigatório e precisa conter, pra CADA problema real encontrado na revisão completa (não só o primeiro), tanto o diagnóstico específico (o que exatamente falhou) quanto uma sugestão concreta do que corrigir — não basta apontar o problema, aponte a correção. O texto será lido tanto por um Escritor automático quanto por um humano revisando manualmente.",
  ].join("\n");
}

type ResultadoBrutoFerramenta = {
  score: number;
  motivo?: string | null;
  precisao_factual_adequada: boolean;
  fontes_especificas: boolean;
  originalidade_adequada: boolean;
};

/**
 * Regra de aprovação multiplicativa (spec seção 3.1, "Regra de aprovação") — deliberadamente NÃO
 * é uma média nem soma ponderada: cada gate calibrável (`checar*`) que estiver ativo precisa ser
 * `true` E o score precisa bater o mínimo calibrado, todos ao mesmo tempo. Um score 95 com
 * `precisao_factual_adequada: false` reprova do mesmo jeito — é exatamente o problema que motivou
 * esta mudança (checklist ponderado conseguia "diluir" um problema factual/legal sério dentro de
 * uma média alta). Cada `checar*` ausente na propriedade é tratado como `true` (gate ativo por
 * padrão) — ver PropriedadeCarregada em tipos.ts.
 */
function calcularAprovacao(bruta: ResultadoBrutoFerramenta, propriedade: PropriedadeCarregada): boolean {
  const scoreMinimo = propriedade.scoreMinimoAprovacao ?? SCORE_MINIMO_APROVACAO_PADRAO;
  const checarPrecisaoFactual = propriedade.checarPrecisaoFactual ?? true;
  const checarFontesEspecificas = propriedade.checarFontesEspecificas ?? true;
  const checarOriginalidade = propriedade.checarOriginalidade ?? true;

  return (
    bruta.score >= scoreMinimo &&
    (!checarPrecisaoFactual || bruta.precisao_factual_adequada) &&
    (!checarFontesEspecificas || bruta.fontes_especificas) &&
    (!checarOriginalidade || bruta.originalidade_adequada)
  );
}

export async function revisarConteudo(
  conteudo: ConteudoGerado,
  checklist: ItemChecklistCarregado[],
  propriedade: PropriedadeCarregada,
  postsRecentes: PostRecenteResumo[],
): Promise<{ resultado: ResultadoRevisao; usage: UsageTokens }> {
  const cliente = obterCliente();
  const prompt = montarPrompt(conteudo, checklist, propriedade, postsRecentes);

  const resposta = await cliente.messages.create({
    model: MODELO_REVISOR,
    // 1000 (valor original, núcleo da Fase 1) estourava e cortava o tool_use no meio depois da
    // Fase 4a: o campo `motivo` passou a exigir diagnóstico + sugestão concreta (bem mais longo
    // que antes), e a ferramenta ganhou 3 campos booleanos a mais — achado real via teste de
    // ponta a ponta em produção (19/08/2026): usage.outputTokens batendo exatamente 1000 numa
    // reprovação sem motivo nenhum registrado, sinal de truncamento, não de decisão do modelo.
    max_tokens: 2000,
    tools: [FERRAMENTA_REVISOR],
    tool_choice: { type: "tool", name: "registrar_revisao" },
    messages: [{ role: "user", content: prompt }],
  });

  const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
  if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") {
    throw new Error("Revisor não retornou resultado estruturado.");
  }

  const bruta = blocoFerramenta.input as ResultadoBrutoFerramenta;
  const aprovado = calcularAprovacao(bruta, propriedade);

  return {
    resultado: {
      aprovado,
      score: bruta.score,
      motivo: aprovado ? null : (bruta.motivo ?? "Reprovado sem motivo detalhado."),
      precisaoFactualAdequada: bruta.precisao_factual_adequada,
      fontesEspecificas: bruta.fontes_especificas,
      originalidadeAdequada: bruta.originalidade_adequada,
    },
    usage: {
      inputTokens: resposta.usage?.input_tokens ?? 0,
      outputTokens: resposta.usage?.output_tokens ?? 0,
    },
  };
}
