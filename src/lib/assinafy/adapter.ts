import { criarSignatario, solicitarAssinatura, uploadDocumento } from "./cliente";
import { buscarContratoPorId, atualizarStatusContrato } from "@/lib/vendas/contratos";
import { baixarPdfContrato } from "@/lib/vendas/geracao-pdf";
import { buscarPessoaCompleta } from "@/lib/vendas/pessoas";

/**
 * Envia o contrato pra assinatura eletrônica: baixa o PDF já gerado, sobe pra Assinafy, cria os 2
 * signatários (cliente + ArrudaCred) e solicita a assinatura via método "virtual".
 *
 * ⚠️ Achado na doc (docs/api_reference/Assinafy-API-Reference.md): **não existe endpoint pra
 * assinar programaticamente via API** — toda assinatura (inclusive a da ArrudaCred) passa pelo
 * link de assinatura de verdade (signing_urls), com signer-access-code. Não dá pra automatizar a
 * assinatura da ArrudaCred sem input humano com o que está documentado — resolve a pendência #7 da
 * spec (seção 8): o signatário da ArrudaCred recebe o link e assina manualmente, igual o cliente.
 */
export async function enviarContratoParaAssinatura(contratoId: string): Promise<void> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato) throw new Error("Contrato não encontrado.");
  if (!contrato.pdfUrl) throw new Error("Contrato ainda não tem PDF gerado.");
  const pessoaArrudaCredSignatarioId = contrato.pessoaArrudaCredSignatarioId;
  if (!pessoaArrudaCredSignatarioId) throw new Error("Venda comissionada não tem assinatura eletrônica — não deveria chegar aqui.");

  const pdf = await baixarPdfContrato(contrato.pdfUrl);
  const documento = await uploadDocumento(`contrato-${contratoId}.pdf`, pdf);

  const signerIds = await Promise.all(
    [contrato.pessoaSignatarioId, pessoaArrudaCredSignatarioId].map(async (pessoaId) => {
      const pessoa = await buscarPessoaCompleta(pessoaId);
      if (!pessoa) throw new Error(`Pessoa signatária ${pessoaId} não encontrada.`);
      if (!pessoa.email) throw new Error(`Pessoa "${pessoa.nomeRazaoSocial}" não tem e-mail cadastrado — obrigatório pra assinatura eletrônica.`);

      const signatario = await criarSignatario(pessoa.nomeRazaoSocial, pessoa.email);
      return signatario.id;
    }),
  );

  await solicitarAssinatura(documento.id, signerIds);

  await atualizarStatusContrato(contratoId, "aguardando_assinaturas", {
    assinafyDocumentId: documento.id,
    enviadoEm: new Date().toISOString(),
  });
}
