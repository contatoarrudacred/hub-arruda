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
