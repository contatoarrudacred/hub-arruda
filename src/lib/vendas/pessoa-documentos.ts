import { createClient } from "@/lib/supabase/server";

const BUCKET = "pessoa-documentos";

export type PessoaDocumento = {
  id: string;
  tipoDocumento: string;
  descricao: string | null;
  url: string;
  nomeArquivo: string;
  enviadoEm: string;
};

export async function listarDocumentosPessoa(pessoaId: string): Promise<PessoaDocumento[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pessoa_documentos")
    .select("id, tipo_documento, descricao, url, nome_arquivo, enviado_em")
    .eq("pessoa_id", pessoaId)
    .order("enviado_em", { ascending: false });
  if (error) throw new Error(`Falha ao listar documentos: ${error.message}`);

  return Promise.all(
    (data ?? []).map(async (linha) => {
      const { data: assinada } = await supabase.storage.from(BUCKET).createSignedUrl(linha.url, 3600);
      return {
        id: linha.id,
        tipoDocumento: linha.tipo_documento,
        descricao: linha.descricao,
        url: assinada?.signedUrl ?? "",
        nomeArquivo: linha.nome_arquivo,
        enviadoEm: linha.enviado_em,
      };
    }),
  );
}

export type EntradaEnviarDocumento = {
  pessoaId: string;
  tipoDocumento: string;
  descricao: string | null;
  nomeArquivo: string;
  conteudo: Blob;
};

export async function enviarDocumentoPessoa(entrada: EntradaEnviarDocumento): Promise<{ id: string }> {
  const supabase = await createClient();
  const caminho = `${entrada.pessoaId}/${Date.now()}-${entrada.nomeArquivo}`;

  const { error: erroUpload } = await supabase.storage.from(BUCKET).upload(caminho, entrada.conteudo);
  if (erroUpload) throw new Error(`Falha ao enviar arquivo: ${erroUpload.message}`);

  const { data, error } = await supabase
    .from("pessoa_documentos")
    .insert({
      pessoa_id: entrada.pessoaId,
      tipo_documento: entrada.tipoDocumento,
      descricao: entrada.descricao,
      url: caminho,
      nome_arquivo: entrada.nomeArquivo,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao registrar documento: ${error.message}`);
  return { id: data.id };
}

export async function excluirDocumentoPessoa(id: string): Promise<{ sucesso: true } | { sucesso: false; erro: string }> {
  const supabase = await createClient();
  try {
    const { data, error: erroBusca } = await supabase.from("pessoa_documentos").select("url").eq("id", id).single();
    if (erroBusca) throw new Error(`Falha ao buscar documento: ${erroBusca.message}`);

    // Remove o arquivo do Storage ANTES de apagar a linha do banco — documento de identificação é
    // dado sensível (LGPD). Se a remoção do Storage falhar, a linha do banco permanece intacta
    // (nada de arquivo órfão e sem como localizá-lo depois) e a exclusão pode ser tentada de novo.
    if (data?.url) {
      const { error: erroStorage } = await supabase.storage.from(BUCKET).remove([data.url]);
      if (erroStorage) throw new Error(`Falha ao remover arquivo do storage: ${erroStorage.message}`);
    }

    const { error: erroDelete } = await supabase.from("pessoa_documentos").delete().eq("id", id);
    if (erroDelete) throw new Error(`Falha ao excluir documento: ${erroDelete.message}`);

    return { sucesso: true };
  } catch (e) {
    console.error("Falha ao excluir documento da pessoa:", e);
    return { sucesso: false, erro: "Falha ao excluir documento. Tente novamente." };
  }
}
