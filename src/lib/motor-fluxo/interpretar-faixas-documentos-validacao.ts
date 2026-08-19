// Parte pura de interpretar-faixas-documentos.ts, separada sem `server-only` de propósito — mesmo
// motivo de interpretacao-ia-validacao.ts (o SDK da Anthropic quebra o Vitest se importado direto).

import type { FaixaDocumentoCapturada, ResultadoInterpretacaoFaixasDocumentos } from "./tipos";

export type ItemBrutoFaixaDocumento = {
  tipo: "cpf" | "cnpj";
  sabe_valor: boolean;
  valor_aproximado: number;
};

export type RespostaBrutaFaixasDocumentos = {
  status: "completo" | "incompleto" | "nao_entendi";
  itens: ItemBrutoFaixaDocumento[];
  pergunta_esclarecimento: string;
};

/**
 * Valida a resposta bruta da IA contra a lista de documentos já conhecida (`documentos_tipos`) —
 * só aceita "completo" quando `itens` tem exatamente uma entrada por documento, na mesma ordem e
 * tipo (nunca confia cegamente que o modelo preservou isso sozinho).
 */
export function validarRespostaFaixasDocumentos(
  bruta: RespostaBrutaFaixasDocumentos,
  tiposEsperados: ("cpf" | "cnpj")[],
): ResultadoInterpretacaoFaixasDocumentos {
  if (bruta.status === "incompleto") {
    const pergunta = bruta.pergunta_esclarecimento?.trim();
    if (!pergunta) return { status: "nao_entendi" };
    return { status: "incompleto", perguntaEsclarecimento: pergunta };
  }

  if (bruta.status !== "completo") return { status: "nao_entendi" };
  if (!Array.isArray(bruta.itens) || bruta.itens.length !== tiposEsperados.length) {
    return { status: "nao_entendi" };
  }

  const itens: FaixaDocumentoCapturada[] = [];
  for (let i = 0; i < tiposEsperados.length; i++) {
    const item = bruta.itens[i];
    if (!item || item.tipo !== tiposEsperados[i]) return { status: "nao_entendi" };

    if (!item.sabe_valor) {
      itens.push({ tipo: item.tipo, valorAproximado: null });
      continue;
    }
    const valor = Number(item.valor_aproximado);
    if (!Number.isFinite(valor) || valor <= 0 || valor > 50_000_000) return { status: "nao_entendi" };
    itens.push({ tipo: item.tipo, valorAproximado: valor });
  }

  return { status: "completo", itens };
}

// --- Menu fechado (correção 18/08/2026, Luiz) — 2 rodadas: escolha de faixa no menu, depois
// confirmação. As 2 funções abaixo são as contrapartidas puras/testáveis das 2 chamadas de IA em
// interpretar-faixas-documentos.ts (ferramentaEscolhaMenu/ferramentaConfirmacaoFaixa).

export type RespostaBrutaEscolhaFaixaMenu = {
  status: "faixa_escolhida" | "quer_consulta_paga" | "nao_entendi";
  indice_faixa: number;
};

export type ResultadoEscolhaFaixaMenu =
  | { tipo: "faixa_escolhida"; indice: number }
  | { tipo: "quer_consulta_paga" }
  | { tipo: "nao_entendi" };

/** `indice_faixa` da IA é 1-based (mesma numeração do menu que o lead vê); o retorno já vem 0-based, pronto pra indexar a lista ordenada de faixas. */
export function validarEscolhaFaixaMenu(bruta: RespostaBrutaEscolhaFaixaMenu, qtdFaixas: number): ResultadoEscolhaFaixaMenu {
  if (bruta.status === "quer_consulta_paga") return { tipo: "quer_consulta_paga" };
  if (bruta.status !== "faixa_escolhida") return { tipo: "nao_entendi" };

  const indice = Number(bruta.indice_faixa);
  if (!Number.isInteger(indice) || indice < 1 || indice > qtdFaixas) return { tipo: "nao_entendi" };
  return { tipo: "faixa_escolhida", indice: indice - 1 };
}

export type RespostaBrutaConfirmacaoFaixa = {
  status: "confirmado" | "quer_consulta_paga" | "nao_confirmado";
};

export type ResultadoConfirmacaoFaixa = "confirmado" | "quer_consulta_paga" | "nao_confirmado";

/** Qualquer coisa que não seja explicitamente "confirmado" ou "quer_consulta_paga" vira "nao_confirmado" — defensivo, é o caminho que cai pra extração livre por documento, então não tem risco de assumir errado. */
export function validarConfirmacaoFaixa(bruta: RespostaBrutaConfirmacaoFaixa): ResultadoConfirmacaoFaixa {
  if (bruta.status === "confirmado") return "confirmado";
  if (bruta.status === "quer_consulta_paga") return "quer_consulta_paga";
  return "nao_confirmado";
}
