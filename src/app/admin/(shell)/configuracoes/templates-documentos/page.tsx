import { listarTemplatesDocumento } from "@/lib/vendas/contrato-templates";
import { listarProdutosParaVenda } from "@/lib/vendas/produtos";
import { TemplatesDocumentosClient } from "./templates-documentos-client";

export default async function TemplatesDocumentosPage() {
  const [templates, produtos] = await Promise.all([listarTemplatesDocumento(), listarProdutosParaVenda()]);
  return <TemplatesDocumentosClient templatesIniciais={templates} produtos={produtos} />;
}
