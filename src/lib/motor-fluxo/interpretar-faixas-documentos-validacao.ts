// Parte pura de interpretar-faixas-documentos.ts, separada sem `server-only` de propósito — mesmo
// motivo de interpretacao-ia-validacao.ts (o SDK da Anthropic quebra o Vitest se importado direto).

import type { FaixaDocumentoCapturada } from "./tipos";

// --- Modo livre (texto por documento) — acumulação parcial entre tentativas -------------------
//
// Achado real (19/08/2026, log de produção): o extrator original pedia TODOS os documentos numa
// resposta só, sem lembrar nada de tentativas anteriores — cada resposta do lead era avaliada
// contra a pergunta ORIGINAL, do zero. Resultado: "menos de 10" (resposta clara ao "e o segundo
// CPF?") não fechava nada, porque o interpretador não sabia mais que o PRIMEIRO CPF já tinha sido
// confirmado 2 mensagens antes — ele voltava a perguntar "e o segundo CPF?" pra sempre, em loop.
//
// Correção: cada documento tem 3 estados possíveis — `null` (ainda não sabemos), `{valorAproximado:
// null}` (lead disse "não sei", resposta final válida), `{valorAproximado: number}` (valor
// conhecido). O estado parcial atravessa o turno codificado em `dados._faixas_parcial_valores`
// (CSV, um token por documento, na ordem de `documentos_tipos`) — a IA só precisa dizer o que ESTA
// resposta esclarece ou corrige (`atualizacoes`, por índice), nunca repetir o que já foi dito; a
// mesclagem determinística é feita em código (`mesclarAtualizacoesParciais`), não pela IA.

export type ItemAtualizacaoParcial = {
  indice: number;
  tipo: "cpf" | "cnpj";
  sabe_valor: boolean;
  valor_aproximado: number;
};

export type RespostaBrutaModoLivre = {
  status: "completo" | "incompleto" | "nao_entendi";
  atualizacoes: ItemAtualizacaoParcial[];
  pergunta_esclarecimento: string;
};

/** "20000,,nao_sei" -> token por posição: número, "" (ainda não sabemos) ou "nao_sei". */
export function codificarParcialFaixas(itens: (FaixaDocumentoCapturada | null)[]): string {
  return itens.map((item) => (item === null ? "" : item.valorAproximado === null ? "nao_sei" : String(item.valorAproximado))).join(",");
}

/** Contrapartida de `codificarParcialFaixas` — string vazia ou malformada vira "tudo ainda não sabido" (defensivo, nunca trava por estado inconsistente). */
export function decodificarParcialFaixas(csv: string, tiposEsperados: ("cpf" | "cnpj")[]): (FaixaDocumentoCapturada | null)[] {
  const tokens = csv.split(",");
  return tiposEsperados.map((tipo, i) => {
    const token = (tokens[i] ?? "").trim();
    if (token === "") return null;
    if (token === "nao_sei") return { tipo, valorAproximado: null };
    const valor = Number(token);
    return Number.isFinite(valor) ? { tipo, valorAproximado: valor } : null;
  });
}

/**
 * Aplica só as atualizações que a IA identificou nesta resposta sobre o estado parcial já
 * acumulado — índice fora do range, tipo que não bate com o esperado naquela posição, ou valor
 * absurdo (alucinação) são ignorados em vez de corromper o que já sabíamos.
 */
export function mesclarAtualizacoesParciais(
  parcialAnterior: (FaixaDocumentoCapturada | null)[],
  atualizacoes: ItemAtualizacaoParcial[],
  tiposEsperados: ("cpf" | "cnpj")[],
): (FaixaDocumentoCapturada | null)[] {
  const mesclado = [...parcialAnterior];
  for (const upd of atualizacoes ?? []) {
    const i = upd.indice - 1;
    if (!Number.isInteger(upd.indice) || i < 0 || i >= tiposEsperados.length) continue;
    if (upd.tipo !== tiposEsperados[i]) continue;

    if (!upd.sabe_valor) {
      mesclado[i] = { tipo: upd.tipo, valorAproximado: null };
      continue;
    }
    const valor = Number(upd.valor_aproximado);
    if (!Number.isFinite(valor) || valor <= 0 || valor > 50_000_000) continue;
    mesclado[i] = { tipo: upd.tipo, valorAproximado: valor };
  }
  return mesclado;
}

// --- Menu fechado (correção 18/08/2026, Luiz) — 2 rodadas: escolha de faixa no menu, depois
// confirmação. As 2 funções abaixo são as contrapartidas puras/testáveis das 2 chamadas de IA em
// interpretar-faixas-documentos.ts (ferramentaEscolhaMenu/ferramentaConfirmacaoFaixa).

export type RespostaBrutaEscolhaFaixaMenu = {
  status: "faixa_escolhida" | "acima_do_corte" | "quer_consulta_paga" | "nao_entendi";
  indice_faixa: number;
};

export type ResultadoEscolhaFaixaMenu =
  | { tipo: "faixa_escolhida"; indice: number }
  | { tipo: "acima_do_corte" }
  | { tipo: "quer_consulta_paga" }
  | { tipo: "nao_entendi" };

/** `indice_faixa` da IA é 1-based (mesma numeração do menu que o lead vê); o retorno já vem 0-based, pronto pra indexar a lista ordenada de faixas. `acima_do_corte` (spec 2026-08-20-agendamento-consultor-alto-valor.md) é a opção virtual do menu — não precisa de índice, não indexa `precos_por_faixa`. */
export function validarEscolhaFaixaMenu(bruta: RespostaBrutaEscolhaFaixaMenu, qtdFaixas: number): ResultadoEscolhaFaixaMenu {
  if (bruta.status === "quer_consulta_paga") return { tipo: "quer_consulta_paga" };
  if (bruta.status === "acima_do_corte") return { tipo: "acima_do_corte" };
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
