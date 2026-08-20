import { notFound } from "next/navigation";
import { buscarTemplateDocumentoPorId } from "@/lib/vendas/contrato-templates";
import { EditarTemplateClient } from "./editar-template-client";

export default async function EditarTemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;

  const template = await buscarTemplateDocumentoPorId(templateId);
  if (!template) notFound();

  return <EditarTemplateClient template={template} />;
}
