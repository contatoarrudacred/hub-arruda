"use server";

import { lerDocumentoComIA, type DadosExtraidosDocumento } from "@/lib/vendas/leitura-documento-ia";

export type ResultadoLerDocumento = { sucesso: true; dados: DadosExtraidosDocumento } | { sucesso: false; erro: string };

export async function lerDocumentoAction(formData: FormData): Promise<ResultadoLerDocumento> {
  const arquivos = formData.getAll("arquivos") as File[];
  if (arquivos.length === 0) {
    return { sucesso: false, erro: "Selecione ao menos um arquivo." };
  }

  const arquivosBase64 = await Promise.all(
    arquivos.map(async (arquivo) => {
      const bytes = await arquivo.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      return { base64, mediaType: arquivo.type };
    }),
  );

  const dados = await lerDocumentoComIA(arquivosBase64);
  if (!dados) {
    return { sucesso: false, erro: "Não consegui ler o documento. Tente uma foto mais nítida ou preencha manualmente." };
  }
  return { sucesso: true, dados };
}
