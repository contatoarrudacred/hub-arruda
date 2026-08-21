import { notFound } from "next/navigation";
import { buscarContratoPorOportunidade } from "@/lib/vendas/contratos";
import { buscarTemplateDocumentoPorId } from "@/lib/vendas/contrato-templates";
import { buscarEnderecoPorPessoa } from "@/lib/vendas/endereco";
import { buscarOportunidadeParaFechamento, listarDocumentosPacote } from "@/lib/vendas/oportunidades";
import { buscarPessoaCompleta } from "@/lib/vendas/pessoas";
import { buscarRepresentanteCompleto } from "@/lib/vendas/pessoa-representantes";
import { listarTimelineVenda } from "@/lib/vendas/timeline";
import { listarComissoesDaVenda } from "@/lib/vendas/comissoes";
import { gerarUrlAssinadaContrato } from "@/lib/vendas/geracao-pdf";
import { DetalhesVendaClient } from "./detalhes-venda-client";

export default async function DetalhesVendaPage({ params }: { params: Promise<{ oportunidadeId: string }> }) {
  const { oportunidadeId } = await params;

  const oportunidade = await buscarOportunidadeParaFechamento(oportunidadeId);
  if (!oportunidade) notFound();

  const [pessoa, contrato] = await Promise.all([
    buscarPessoaCompleta(oportunidade.pessoaId),
    buscarContratoPorOportunidade(oportunidadeId),
  ]);
  if (!pessoa) notFound();

  const [timeline, comissoes, pdfUrlAssinada] = await Promise.all([
    contrato ? listarTimelineVenda(contrato, oportunidadeId) : Promise.resolve([]),
    oportunidade.produtoTipo === "comissionado" ? listarComissoesDaVenda(oportunidadeId) : Promise.resolve([]),
    contrato?.pdfUrl ? gerarUrlAssinadaContrato(contrato.pdfUrl) : Promise.resolve(null),
  ]);

  // Achado real (Luiz, 20/08/2026): a tela só mostrava assinatura/parcelas/etc. condicionado ao
  // estágio atual do contrato — numa venda já concluída não dava mais pra ver quem assinou, por
  // exemplo. Busca tudo aqui sempre; a tela decide como exibir (ver detalhes-venda-client.tsx).
  const [enderecoCliente, pessoaArrudaCred, representante, fornecedor, template, documentosPacote] = await Promise.all([
    buscarEnderecoPorPessoa(pessoa.id),
    contrato?.pessoaArrudaCredSignatarioId ? buscarPessoaCompleta(contrato.pessoaArrudaCredSignatarioId) : Promise.resolve(null),
    pessoa.tipoPessoa === "pj" ? buscarRepresentanteCompleto(pessoa.id) : Promise.resolve(null),
    contrato?.fornecedorId ? buscarPessoaCompleta(contrato.fornecedorId) : Promise.resolve(null),
    contrato?.contratoTemplateId ? buscarTemplateDocumentoPorId(contrato.contratoTemplateId) : Promise.resolve(null),
    listarDocumentosPacote(oportunidadeId),
  ]);

  return (
    <DetalhesVendaClient
      oportunidade={oportunidade}
      pessoa={pessoa}
      contrato={contrato}
      timeline={timeline}
      comissoes={comissoes}
      pdfUrlAssinada={pdfUrlAssinada}
      enderecoCliente={enderecoCliente}
      pessoaArrudaCred={pessoaArrudaCred}
      representante={representante}
      fornecedor={fornecedor}
      template={template}
      documentosPacote={documentosPacote}
    />
  );
}
