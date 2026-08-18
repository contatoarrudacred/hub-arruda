"use server";

import {
  enviarDocumentoPessoa,
  excluirDocumentoPessoa as excluirDocumentoPessoaRepo,
  listarDocumentosPessoa,
  type PessoaDocumento,
} from "@/lib/vendas/pessoa-documentos";
import { enviarFotoPessoa, buscarFotoMaisRecente } from "@/lib/vendas/pessoa-fotos";

export async function listarDocumentosPessoaAction(pessoaId: string): Promise<PessoaDocumento[]> {
  return listarDocumentosPessoa(pessoaId);
}

export type ResultadoEnviarDocumento = { sucesso: true } | { sucesso: false; erro: string };

export async function enviarDocumentoPessoaAction(formData: FormData): Promise<ResultadoEnviarDocumento> {
  const pessoaId = formData.get("pessoaId") as string;
  const tipoDocumento = formData.get("tipoDocumento") as string;
  const descricao = (formData.get("descricao") as string) || null;
  const arquivo = formData.get("arquivo") as File;

  if (!arquivo || arquivo.size === 0) {
    return { sucesso: false, erro: "Selecione um arquivo." };
  }
  if (!tipoDocumento) {
    return { sucesso: false, erro: "Selecione o tipo do documento." };
  }

  await enviarDocumentoPessoa({ pessoaId, tipoDocumento, descricao, nomeArquivo: arquivo.name, conteudo: arquivo });
  return { sucesso: true };
}

export async function excluirDocumentoPessoaAction(id: string): Promise<void> {
  await excluirDocumentoPessoaRepo(id);
}

export async function buscarFotoMaisRecenteAction(pessoaId: string): Promise<string | null> {
  return buscarFotoMaisRecente(pessoaId);
}

export type ResultadoEnviarFoto = { sucesso: true; url: string } | { sucesso: false; erro: string };

export async function enviarFotoPessoaAction(formData: FormData): Promise<ResultadoEnviarFoto> {
  const pessoaId = formData.get("pessoaId") as string;
  const arquivo = formData.get("arquivo") as File;
  if (!arquivo || arquivo.size === 0) {
    return { sucesso: false, erro: "Selecione uma foto." };
  }
  const extensao = arquivo.name.split(".").pop() ?? "jpg";
  const resultado = await enviarFotoPessoa(pessoaId, arquivo, extensao);
  return { sucesso: true, url: resultado.url };
}
