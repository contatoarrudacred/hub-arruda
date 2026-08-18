"use server";

import { enviarImagemTemplate, salvarTemplate } from "@/lib/vendas/contrato-templates";

export type ResultadoSalvarTemplate = { sucesso: true } | { sucesso: false; erro: string };

export async function salvarTemplateAction(produtoId: string, conteudoHtml: string): Promise<ResultadoSalvarTemplate> {
  try {
    await salvarTemplate(produtoId, conteudoHtml);
    return { sucesso: true };
  } catch {
    return { sucesso: false, erro: "Falha ao salvar o template. Tente novamente." };
  }
}

export type ResultadoEnviarImagem = { sucesso: true; url: string } | { sucesso: false; erro: string };

export async function enviarImagemTemplateAction(formData: FormData): Promise<ResultadoEnviarImagem> {
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    return { sucesso: false, erro: "Nenhum arquivo enviado." };
  }

  try {
    const { url } = await enviarImagemTemplate(arquivo, arquivo.name);
    return { sucesso: true, url };
  } catch {
    return { sucesso: false, erro: "Falha ao enviar a imagem. Tente novamente." };
  }
}
