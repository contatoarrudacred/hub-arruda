"use server";

import {
  enviarDocumentoPessoa,
  excluirDocumentoPessoa as excluirDocumentoPessoaRepo,
  listarDocumentosPessoa,
  type PessoaDocumento,
} from "@/lib/vendas/pessoa-documentos";
import { enviarFotoPessoa, buscarFotoMaisRecente } from "@/lib/vendas/pessoa-fotos";
import { normalizarTipoDocumentoPessoa } from "@/lib/vendas/tipos-documento";

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

  try {
    await enviarDocumentoPessoa({ pessoaId, tipoDocumento, descricao, nomeArquivo: arquivo.name, conteudo: arquivo });
    return { sucesso: true };
  } catch {
    return { sucesso: false, erro: "Falha ao enviar arquivo. Tente novamente." };
  }
}

/**
 * Salva os arquivos que o Leitor de Documento IA acabou de ler, junto com o cadastro da pessoa —
 * mesmo bucket/tabela do upload manual. Chamado só quando a pessoa já é conhecida no momento da
 * leitura (pessoa existente); pra pessoa nova, o pessoaId ainda não existe nesse ponto, e o
 * documento fica pra ser anexado depois (Detalhes da Venda), como já indicado na tela.
 *
 * Best-effort: uma falha ao salvar um arquivo não derruba os outros nem o preenchimento dos dados
 * (que já aconteceu antes desta chamada) — só fica de fora da lista de documentos anexados.
 */
export async function salvarDocumentosExtraidosAction(
  pessoaId: string,
  tipoDocumentoSugerido: string,
  formData: FormData,
): Promise<{ salvos: number }> {
  const arquivos = formData.getAll("arquivos") as File[];
  const tipoDocumento = normalizarTipoDocumentoPessoa(tipoDocumentoSugerido);
  let salvos = 0;
  for (const arquivo of arquivos) {
    if (!arquivo || arquivo.size === 0) continue;
    try {
      await enviarDocumentoPessoa({
        pessoaId,
        tipoDocumento,
        descricao: "Lido automaticamente pela IA",
        nomeArquivo: arquivo.name,
        conteudo: arquivo,
      });
      salvos++;
    } catch (e) {
      console.error("Falha ao salvar documento extraído pela IA:", e);
    }
  }
  return { salvos };
}

export type ResultadoExcluirDocumento = { sucesso: true } | { sucesso: false; erro: string };

export async function excluirDocumentoPessoaAction(id: string): Promise<ResultadoExcluirDocumento> {
  try {
    return await excluirDocumentoPessoaRepo(id);
  } catch {
    return { sucesso: false, erro: "Falha ao excluir documento. Tente novamente." };
  }
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
  try {
    const resultado = await enviarFotoPessoa(pessoaId, arquivo, extensao);
    return { sucesso: true, url: resultado.url };
  } catch {
    return { sucesso: false, erro: "Falha ao enviar foto. Tente novamente." };
  }
}
