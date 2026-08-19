import { notFound } from "next/navigation";
import { listarProdutos } from "@/lib/motor-fluxo/repositorio-admin";
import { buscarTemplateAtivoPorProduto } from "@/lib/vendas/contrato-templates";
import { ContratoTemplateClient } from "./contrato-template-client";

export default async function ContratoTemplatePage({ params }: { params: Promise<{ produtoId: string }> }) {
  const { produtoId } = await params;

  const [produtos, template] = await Promise.all([listarProdutos(), buscarTemplateAtivoPorProduto(produtoId)]);
  const produto = produtos.find((p) => p.id === produtoId);
  if (!produto) notFound();

  return <ContratoTemplateClient produto={produto} conteudoHtmlInicial={template?.conteudoHtml ?? ""} />;
}
