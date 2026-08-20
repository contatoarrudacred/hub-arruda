"use server";

import {
  atualizarMetadadosTemplateDocumento,
  criarTemplateDocumento,
  excluirTemplateDocumento,
  type EntradaCriarTemplateDocumento,
} from "@/lib/vendas/contrato-templates";

export type ResultadoCriarTemplate = { sucesso: true; id: string } | { sucesso: false; erro: string };

export async function criarTemplateDocumentoAction(entrada: EntradaCriarTemplateDocumento): Promise<ResultadoCriarTemplate> {
  if (!entrada.nome.trim()) {
    return { sucesso: false, erro: "Informe um nome pra este documento." };
  }
  if (entrada.tipo === "contrato" && !entrada.produtoId) {
    return { sucesso: false, erro: "Documento do tipo Contrato precisa de um produto vinculado." };
  }
  if (entrada.tipo !== "contrato" && entrada.produtoId) {
    return { sucesso: false, erro: "Só documentos do tipo Contrato podem ter um produto vinculado." };
  }

  try {
    const { id } = await criarTemplateDocumento(entrada);
    return { sucesso: true, id };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha ao criar o documento. Tente novamente.";
    return { sucesso: false, erro: mensagem };
  }
}

export type ResultadoAcaoSimples = { sucesso: true } | { sucesso: false; erro: string };

export async function atualizarMetadadosTemplateAction(
  templateId: string,
  nome: string,
  ativo: boolean,
): Promise<ResultadoAcaoSimples> {
  if (!nome.trim()) return { sucesso: false, erro: "Informe um nome pra este documento." };
  try {
    await atualizarMetadadosTemplateDocumento(templateId, { nome, ativo });
    return { sucesso: true };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha ao atualizar. Tente novamente.";
    return { sucesso: false, erro: mensagem };
  }
}

export async function excluirTemplateDocumentoAction(templateId: string): Promise<ResultadoAcaoSimples> {
  try {
    await excluirTemplateDocumento(templateId);
    return { sucesso: true };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha ao excluir. Tente novamente.";
    return { sucesso: false, erro: mensagem };
  }
}
