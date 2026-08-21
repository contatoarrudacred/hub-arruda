import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { sincronizarPdfCertificado } from "@/lib/assinafy/adapter";
import { atualizarStatusContrato, buscarContratoPorAssinafyDocumentId } from "@/lib/vendas/contratos";
import { sincronizarEtapaKanban } from "@/lib/vendas/oportunidades";

export const maxDuration = 30;

/**
 * Webhook da Assinafy — clone estrutural de src/app/api/webhooks/zapster/route.ts.
 *
 * Autenticação: a Assinafy não assina o payload (confirmado na doc — o único jeito de
 * configurar um webhook é `PUT /accounts/:id/webhooks/subscriptions` com só {events, is_active,
 * url, email}, sem campo de segredo/assinatura). Por isso o segredo mora na própria URL do
 * webhook (?secret=...), mesmo padrão do Zapster/CRON_SECRET.
 *
 * Payload confirmado na doc: {id, event, object: {id, name, type}, subject: {...}, account_id} —
 * object.id é o assinafy_document_id que já gravamos em contratos ao enviar pra assinatura.
 */
function segredosBatem(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

type PayloadAssinafy = {
  event?: string;
  object?: { id?: string };
};

async function processarDocumentoAssinado(assinafyDocumentId: string): Promise<void> {
  try {
    const contrato = await buscarContratoPorAssinafyDocumentId(assinafyDocumentId);
    if (!contrato) {
      console.error(`[webhook assinafy] contrato não encontrado pro documento ${assinafyDocumentId}`);
      return;
    }

    try {
      await sincronizarPdfCertificado(contrato, assinafyDocumentId);
    } catch (erroPdf) {
      console.error("[webhook assinafy] contrato assinado, mas falhou ao baixar/sobrescrever o PDF certificado:", erroPdf);
    }

    await atualizarStatusContrato(contrato.id, "aguardando_assinaturas", { assinadoEm: new Date().toISOString() });
    await sincronizarEtapaKanban(contrato.oportunidadeId, "pagamento");

    // Encadeia a criação da cobrança na Asaas — só quando a conta estiver configurada (sem
    // ASAAS_API_KEY, a venda fica parada em "aguardando_assinaturas" até alguém rodar isso manualmente depois).
    if (process.env.ASAAS_API_KEY) {
      try {
        const { tentarGerarFinanceiro } = await import("@/lib/vendas/progressao");
        await tentarGerarFinanceiro(contrato.id);
      } catch (erroAsaas) {
        console.error("[webhook assinafy] contrato assinado, mas falhou ao criar cobrança na Asaas:", erroAsaas);
      }
    }
  } catch (e) {
    console.error("[webhook assinafy] erro ao processar documento assinado:", e);
  }
}

async function processarDocumentoRecusado(assinafyDocumentId: string): Promise<void> {
  try {
    const contrato = await buscarContratoPorAssinafyDocumentId(assinafyDocumentId);
    if (!contrato) {
      console.error(`[webhook assinafy] contrato não encontrado pro documento ${assinafyDocumentId}`);
      return;
    }

    await atualizarStatusContrato(contrato.id, "cancelada", { motivoCancelamento: "Assinatura recusada por um dos signatários." });
    await sincronizarEtapaKanban(contrato.oportunidadeId, "perdida");
  } catch (e) {
    console.error("[webhook assinafy] erro ao processar documento recusado:", e);
  }
}

export async function POST(request: Request) {
  const segredo = process.env.ASSINAFY_WEBHOOK_SECRET;

  if (!segredo) {
    if (process.env.VERCEL) {
      console.error("[webhook assinafy] ASSINAFY_WEBHOOK_SECRET não configurada em produção — rejeitando.");
      return new Response("Não autorizado", { status: 401 });
    }
  } else {
    const secretDaUrl = new URL(request.url).searchParams.get("secret") ?? "";
    if (!segredosBatem(secretDaUrl, segredo)) {
      return new Response("Não autorizado", { status: 401 });
    }
  }

  const payload = (await request.json().catch(() => null)) as PayloadAssinafy | null;
  console.log("[webhook assinafy] payload recebido:", JSON.stringify(payload));

  if (!payload || !payload.event || !payload.object?.id) {
    return Response.json({ ignorado: true, motivo: "payload vazio ou incompleto" });
  }

  const documentId = payload.object.id;

  if (payload.event === "document_ready") {
    after(() => processarDocumentoAssinado(documentId));
    return Response.json({ recebido: true });
  }

  if (payload.event === "signer_rejected_document") {
    after(() => processarDocumentoRecusado(documentId));
    return Response.json({ recebido: true });
  }

  return Response.json({ ignorado: true, motivo: `evento "${payload.event}" ainda não tratado` });
}
