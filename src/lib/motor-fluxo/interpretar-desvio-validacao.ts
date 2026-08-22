// Parte pura de interpretar-desvio.ts, separada sem `server-only` de propósito — mesmo motivo de
// interpretacao-ia-validacao.ts / interpretar-faixas-documentos-validacao.ts (o SDK da Anthropic
// quebra o Vitest se importado direto).

import type { FaqParaDesvio, ObjecaoParaDesvio } from "./tipos";

export type RespostaBrutaDesvio = {
  status: "faq" | "objecao" | "escalar" | "ambiguo";
  indice_faq: number;
  indice_objecao: number;
};

/**
 * Resolução intermediária (antes da geração de texto, que precisa de IA — fica em interpretar-
 * desvio.ts) — resolve o índice bruto que a IA devolveu pro objeto de verdade (FAQ ou objeção).
 */
export type ResolucaoDesvio =
  | { status: "faq"; faq: FaqParaDesvio }
  | { status: "objecao"; objecao: ObjecaoParaDesvio }
  | { status: "escalar" }
  | { status: "ambiguo" };

/**
 * Valida a resposta bruta da IA contra as listas de verdade — nunca confia cegamente no índice que o
 * modelo devolveu (mesmo padrão de `validarEscolhaFaixaMenu`). `ambiguo` é o fallback seguro: qualquer
 * inconsistência (índice fora do range, status desconhecido) cai em `ambiguo`, nunca em `escalar` —
 * depois da bateria completa de 21/08/2026 (achado: `escalar` sendo usado demais), `escalar` só deve
 * acontecer quando a IA teve certeza suficiente pra pedir isso explicitamente.
 */
export function resolverRespostaDesvio(bruta: RespostaBrutaDesvio, faqsAtivas: FaqParaDesvio[], objecoesAtivas: ObjecaoParaDesvio[]): ResolucaoDesvio {
  if (bruta.status === "faq") {
    const faq = faqsAtivas[bruta.indice_faq - 1]; // IA responde 1-based, array é 0-based
    return faq ? { status: "faq", faq } : { status: "ambiguo" };
  }

  if (bruta.status === "objecao") {
    const objecao = objecoesAtivas[bruta.indice_objecao - 1];
    return objecao ? { status: "objecao", objecao } : { status: "ambiguo" };
  }

  if (bruta.status === "escalar") return { status: "escalar" };

  return { status: "ambiguo" };
}

// ---------------------------------------------------------------------------------------------
// Conteúdo extra embutido numa resposta JÁ reconhecida (achado 22/08/2026, ver
// docs/superpowers/plans/2026-08-21-desvio-escalar-quando-nao-sabe.md) — reaproveitado pelos 4
// interpretadores (interpretacao-ia.ts, faixas_documentos, negociacao_pagamento, lista_documentos)
// pra detectar, na MESMA chamada de IA que já reconhece a resposta, se ela TAMBÉM carrega uma
// pergunta/objeção embutida. Só os campos, sem "escalar": uma resposta já reconhecida nunca deve
// ser escalada por causa de algo extra — na pior hipótese, simplesmente não prepend nada.
// ---------------------------------------------------------------------------------------------

export type RespostaBrutaConteudoExtra = { indice_faq_extra?: number; indice_objecao_extra?: number };

export type ResolucaoConteudoExtra = { tipo: "faq"; faq: FaqParaDesvio } | { tipo: "objecao"; objecao: ObjecaoParaDesvio } | null;

/** Mesma filosofia defensiva de `resolverRespostaDesvio`: qualquer índice fora do range (alucinação) ou ausente vira `null`, nunca escala nem cita a FAQ/objeção errada. */
export function resolverConteudoExtra(
  bruta: RespostaBrutaConteudoExtra | undefined,
  faqsAtivas: FaqParaDesvio[],
  objecoesAtivas: ObjecaoParaDesvio[],
): ResolucaoConteudoExtra {
  if (!bruta) return null;

  if (bruta.indice_faq_extra) {
    const faq = faqsAtivas[bruta.indice_faq_extra - 1];
    if (faq) return { tipo: "faq", faq };
  }

  if (bruta.indice_objecao_extra) {
    const objecao = objecoesAtivas[bruta.indice_objecao_extra - 1];
    if (objecao) return { tipo: "objecao", objecao };
  }

  return null;
}

/** Campos opcionais que qualquer ferramenta de tool-use dos 4 interpretadores pode incluir no `input_schema` pra detectar conteúdo extra na mesma chamada — sem isto ser obrigatório (a maioria das respostas não tem nada extra). */
export function propriedadesSchemaConteudoExtra(qtdFaqs: number, qtdObjecoes: number) {
  return {
    indice_faq_extra: {
      type: "number",
      description: `Preencha SÓ se, ALÉM de responder isso, o lead TAMBÉM fez uma pergunta lateral que bate com uma das FAQs cadastradas abaixo (número de 1 a ${qtdFaqs}) — deixe 0/vazio na grande maioria das respostas, que não têm nada extra.`,
    },
    indice_objecao_extra: {
      type: "number",
      description: `Preencha SÓ se, ALÉM de responder isso, o lead TAMBÉM demonstrou uma objeção/hesitação real (medo, achar caro, querer adiar) que bate com uma das objeções cadastradas abaixo (número de 1 a ${qtdObjecoes}) — deixe 0/vazio na grande maioria das respostas.`,
    },
  };
}

/** Bloco de prompt (FAQs + objeções cadastradas + instrução) a anexar no prompt de qualquer um dos 4 interpretadores — vazio quando não há FAQ nem objeção ativa cadastrada (não vale a pena instruir a IA a procurar algo que não existe). */
export function blocoPromptConteudoExtra(faqsAtivas: FaqParaDesvio[], objecoesAtivas: ObjecaoParaDesvio[]): string {
  if (faqsAtivas.length === 0 && objecoesAtivas.length === 0) return "";

  const listaFaqs = faqsAtivas.map((f, i) => `${i + 1}. ${f.pergunta}`).join("\n");
  const listaObjecoes = objecoesAtivas.map((o, i) => `${i + 1}. ${o.objecao}`).join("\n");

  return [
    "",
    "Além do resultado principal acima, verifique se a resposta do lead TAMBÉM carrega algo extra, embutido na MESMA mensagem — uma pergunta lateral que bate com uma FAQ, ou uma objeção/hesitação real que bate com uma objeção cadastrada. Isso é raro (a maioria das respostas só responde o que foi perguntado) — só preencha os índices extras com certeza real de match, nunca force uma correspondência fraca.",
    faqsAtivas.length > 0 ? `FAQs cadastradas:\n${listaFaqs}` : null,
    objecoesAtivas.length > 0 ? `Objeções cadastradas:\n${listaObjecoes}` : null,
  ]
    .filter((linha): linha is string => linha !== null)
    .join("\n");
}
