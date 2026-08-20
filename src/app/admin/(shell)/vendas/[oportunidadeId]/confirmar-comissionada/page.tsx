import { notFound } from "next/navigation";
import { buscarOportunidadeParaFechamento } from "@/lib/vendas/oportunidades";
import { buscarPessoaCompleta } from "@/lib/vendas/pessoas";
import { ConfirmarComissionadaClient } from "./confirmar-comissionada-client";

export default async function ConfirmarComissionadaPage({ params }: { params: Promise<{ oportunidadeId: string }> }) {
  const { oportunidadeId } = await params;

  const oportunidade = await buscarOportunidadeParaFechamento(oportunidadeId);
  if (!oportunidade) notFound();

  const pessoa = await buscarPessoaCompleta(oportunidade.pessoaId);
  if (!pessoa) notFound();

  return <ConfirmarComissionadaClient oportunidade={oportunidade} pessoa={pessoa} />;
}
