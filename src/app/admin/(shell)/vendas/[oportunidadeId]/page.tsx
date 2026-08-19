import { notFound } from "next/navigation";
import { buscarContratoPorOportunidade } from "@/lib/vendas/contratos";
import { buscarOportunidadeParaFechamento } from "@/lib/vendas/oportunidades";
import { buscarPessoaCompleta } from "@/lib/vendas/pessoas";
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

  return (
    <DetalhesVendaClient
      oportunidade={oportunidade}
      pessoa={pessoa}
      contrato={contrato}
      timeline={timeline}
      comissoes={comissoes}
      pdfUrlAssinada={pdfUrlAssinada}
    />
  );
}
