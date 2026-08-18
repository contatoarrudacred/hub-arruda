// Parte pura de interpretar-lista-documentos.ts, separada sem `server-only` de propósito — mesmo
// motivo de interpretacao-ia-validacao.ts (o SDK da Anthropic quebra o Vitest se importado direto).

import type { ItemDocumentoPendente, ResultadoInterpretacaoListaDocumentos } from "./tipos";

export type RespostaBrutaListaDocumentos = {
  status: "completo" | "incompleto" | "nao_entendi";
  quantidade_cpf: number;
  quantidade_cnpj: number;
  pergunta_esclarecimento: string;
};

/**
 * Converte a resposta bruta do modelo (contagem por tipo) numa lista de itens — e defende contra
 * respostas inconsistentes (ex.: status "completo" mas quantidade_cpf + quantidade_cnpj = 0, ou
 * números negativos/absurdos) tratando como "não entendi" em vez de confiar cegamente.
 */
export function validarRespostaListaDocumentos(
  bruta: RespostaBrutaListaDocumentos,
): ResultadoInterpretacaoListaDocumentos {
  if (bruta.status === "incompleto") {
    const pergunta = bruta.pergunta_esclarecimento?.trim();
    if (!pergunta) return { status: "nao_entendi" };
    return { status: "incompleto", perguntaEsclarecimento: pergunta };
  }

  if (bruta.status !== "completo") return { status: "nao_entendi" };

  const qtdCpf = Number.isInteger(bruta.quantidade_cpf) ? bruta.quantidade_cpf : 0;
  const qtdCnpj = Number.isInteger(bruta.quantidade_cnpj) ? bruta.quantidade_cnpj : 0;
  const total = qtdCpf + qtdCnpj;
  // Limite alto o suficiente pra nunca travar um pacote real, baixo o suficiente pra pegar o
  // modelo "alucinando" um número absurdo.
  if (total <= 0 || total > 20 || qtdCpf < 0 || qtdCnpj < 0) return { status: "nao_entendi" };

  const itens: ItemDocumentoPendente[] = [
    ...Array(qtdCpf).fill({ tipo: "cpf" as const }),
    ...Array(qtdCnpj).fill({ tipo: "cnpj" as const }),
  ];
  return { status: "completo", itens };
}
