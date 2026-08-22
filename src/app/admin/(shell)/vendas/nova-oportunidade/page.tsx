import { listarProdutosParaVenda } from "@/lib/vendas/produtos";
import { NovaOportunidadeClient } from "./nova-oportunidade-client";

// Server Actions herdam o maxDuration da página que os chama, não do arquivo actions.ts (mesmo
// padrão documentado em admin/configuracoes/assinafy-webhook/page.tsx). Achado da auditoria de
// 21/08/2026 (pendência registrada desde 19/08): o submit desta tela dispara
// tentarEmitirContrato — Puppeteer (lançar Chromium + renderizar PDF) + upload pro Storage +
// upload do PDF na Assinafy + criar 2 signatários + solicitar assinatura, tudo síncrono antes da
// resposta. Sem isso, um estouro do timeout padrão deixava o contrato preso em "emitindo_contrato"
// sem nenhum erro registrado (a função morre no meio, antes do catch de progressao.ts rodar).
export const maxDuration = 60;

export default async function NovaOportunidadePage() {
  const produtos = await listarProdutosParaVenda();
  return <NovaOportunidadeClient produtos={produtos} />;
}
