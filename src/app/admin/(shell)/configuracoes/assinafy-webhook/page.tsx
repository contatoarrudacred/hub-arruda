import { buscarStatusWebhook, type StatusWebhookAssinafy } from "@/lib/assinafy/cliente";
import { AssinafyWebhookClient } from "./assinafy-webhook-client";

// Server Actions herdam o maxDuration da página que os chama, não do arquivo actions.ts (ver
// node_modules/next/dist/docs/.../maxDuration.md — "set the maxDuration at the page level").
// Sem isso, uma chamada à Assinafy que trava fica presa no limite padrão da função — sintoma
// real: botão "Configurando..." travado pra sempre (achado do Luiz).
export const maxDuration = 30;

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
