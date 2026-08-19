// Parte pura de interpretar-lista-documentos.ts, separada sem `server-only` de propósito — mesmo
// motivo de interpretacao-ia-validacao.ts (o SDK da Anthropic quebra o Vitest se importado direto).

import type { DadosConversa, ItemDocumentoPendente, ResultadoInterpretacaoListaDocumentos } from "./tipos";

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
 *
 * Correção 19/08/2026 (Luiz, "corrigir tudo de forma global") — quando `incompleto` carrega uma
 * proposta de contagem específica (ex.: "Perfeito! Você quer limpar 1 CPF e 1 CNPJ, é isso?"), essa
 * proposta precisa atravessar o turno em `dadosParciais`, senão a resposta seguinte ("sim") não tem
 * como ser entendida — mesmo problema/solução já aplicado em `faixas_documentos`.
 */
export function validarRespostaListaDocumentos(
  bruta: RespostaBrutaListaDocumentos,
): ResultadoInterpretacaoListaDocumentos {
  if (bruta.status === "incompleto") {
    const pergunta = bruta.pergunta_esclarecimento?.trim();
    if (!pergunta) return { status: "nao_entendi" };

    const dadosParciais: DadosConversa = { _doc_pergunta_pendente: pergunta };
    const qtdCpfProposta = Number.isInteger(bruta.quantidade_cpf) ? bruta.quantidade_cpf : 0;
    const qtdCnpjProposta = Number.isInteger(bruta.quantidade_cnpj) ? bruta.quantidade_cnpj : 0;
    if (qtdCpfProposta > 0 || qtdCnpjProposta > 0) {
      dadosParciais._doc_cpf_proposto = String(qtdCpfProposta);
      dadosParciais._doc_cnpj_proposto = String(qtdCnpjProposta);
    }
    return { status: "incompleto", perguntaEsclarecimento: pergunta, dadosParciais };
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
