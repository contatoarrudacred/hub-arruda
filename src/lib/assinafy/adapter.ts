import { criarSignatario, solicitarAssinatura, uploadDocumento } from "./cliente";
import { buscarContratoPorId, atualizarStatusContrato } from "@/lib/vendas/contratos";
import { baixarPdfContrato } from "@/lib/vendas/geracao-pdf";
import { buscarOportunidadeParaFechamento } from "@/lib/vendas/oportunidades";
import { buscarPessoaCompleta } from "@/lib/vendas/pessoas";

/**
 * Remove acentos e qualquer caractere que não seja letra/número — usado só pra montar o nome do
 * arquivo do PDF (pedido do Luiz, 20/08/2026), nunca pro conteúdo/nome exibido em outro lugar.
 * NFD decompõe cada letra acentuada em base + marcador de acentuação separado (ex.: "é" vira "e" +
 * um marcador não-alfanumérico) — o filtro alfanumérico abaixo já descarta esse marcador junto
 * com espaço/pontuação, sem precisar de uma segunda regex só pra faixa de acentuação Unicode.
 */
function normalizarParaNomeArquivo(texto: string): string {
  return texto.normalize("NFD").replace(/[^a-zA-Z0-9]/g, "");
}

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

  const [pdf, oportunidade, pessoaCliente] = await Promise.all([
    baixarPdfContrato(contrato.pdfUrl),
    buscarOportunidadeParaFechamento(contrato.oportunidadeId),
    buscarPessoaCompleta(contrato.pessoaSignatarioId),
  ]);
  if (!pessoaCliente) throw new Error(`Pessoa signatária ${contrato.pessoaSignatarioId} não encontrada.`);

  // "contrato-arrudacred-<cliente>-<serviço>-<timestamp>.pdf" (pedido do Luiz, 20/08/2026) — antes
  // era só "contrato-<uuid>.pdf", sem nenhum jeito de identificar de que venda era só olhando o
  // nome na Assinafy.
  const nomeArquivo = `contrato-arrudacred-${normalizarParaNomeArquivo(pessoaCliente.nomeRazaoSocial)}-${normalizarParaNomeArquivo(oportunidade?.produtoNome ?? "servico")}-${Date.now()}.pdf`;
  const documento = await uploadDocumento(nomeArquivo, pdf);

  const signatarios = await Promise.all(
    [contrato.pessoaSignatarioId, pessoaArrudaCredSignatarioId].map(async (pessoaId) => {
      // Reaproveita a pessoa do cliente já buscada acima (Promise.all) em vez de buscar de novo.
      const pessoa = pessoaId === contrato.pessoaSignatarioId ? pessoaCliente : await buscarPessoaCompleta(pessoaId);
      if (!pessoa) throw new Error(`Pessoa signatária ${pessoaId} não encontrada.`);
      if (!pessoa.email) throw new Error(`Pessoa "${pessoa.nomeRazaoSocial}" não tem e-mail cadastrado — obrigatório pra assinatura eletrônica.`);

      const signatario = await criarSignatario(pessoa.nomeRazaoSocial, pessoa.email);
      return { pessoaId, nome: pessoa.nomeRazaoSocial, email: pessoa.email, signerId: signatario.id };
    }),
  );

  // Achado real em produção: o cliente e o signatário da ArrudaCred (configuracoes,
  // contrato_arrudacred_signatario) podem acabar sendo a MESMA Pessoa (dado de teste, ou erro de
  // configuração) — a Assinafy rejeita (400 "Existem signatários duplicados") mandar o mesmo id 2x
  // no mesmo assignment. Deduplica pra nunca quebrar por isso, mas cita os nomes/e-mails no erro se
  // sobrar só 1 signatário único — normalmente sinal de configuração errada, não comportamento
  // esperado (um contrato precisa de 2 partes distintas assinando).
  const signerIdsUnicos = [...new Set(signatarios.map((s) => s.signerId))];
  if (signerIdsUnicos.length < 2) {
    const lista = signatarios.map((s) => `${s.nome} <${s.email}>`).join(" e ");
    throw new Error(
      `Cliente e signatário da ArrudaCred resolveram pro mesmo signatário na Assinafy (${lista}) — confira se são a mesma Pessoa por engano (comparar o cliente desta venda com a configuração "contrato_arrudacred_signatario" em /admin/configuracoes).`,
    );
  }

  await solicitarAssinatura(documento.id, signerIdsUnicos);

  await atualizarStatusContrato(contratoId, "aguardando_assinaturas", {
    assinafyDocumentId: documento.id,
    enviadoEm: new Date().toISOString(),
  });
}
