import { buscarStatusWebhook, type StatusWebhookAssinafy } from "@/lib/assinafy/cliente";
import { AssinafyWebhookClient } from "./assinafy-webhook-client";

export default async function AssinafyWebhookPage() {
  let statusInicial: StatusWebhookAssinafy | null = null;
  let erroInicial: string | null = null;
  try {
    statusInicial = await buscarStatusWebhook();
  } catch (erro) {
    erroInicial = erro instanceof Error ? erro.message : "Falha ao consultar o status.";
  }

  return <AssinafyWebhookClient statusInicial={statusInicial} erroInicial={erroInicial} />;
}
