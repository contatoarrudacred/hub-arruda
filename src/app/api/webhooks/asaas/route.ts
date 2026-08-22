import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { concluirVenda, deveConcluirAoConfirmarParcela } from "@/lib/vendas/conclusao-venda";
import { buscarContratoPorAsaasCheckoutId, buscarContratoPorId, marcarParcelaPaga } from "@/lib/vendas/contratos";

export const maxDuration = 30;

/**
 * Webhook da Asaas — clone estrutural de src/app/api/webhooks/zapster/route.ts, mas com uma
 * diferença real: **a Asaas assina o webhook nativamente** por header (confirmado na doc oficial),
 * então o segredo vai no header `asaas-access-token` (configurado por nós ao registrar o webhook
 * via `POST /v3/webhooks`, campo `authToken`) — não precisa do padrão de query param do
 * Zapster/Assinafy, que não têm esse recurso.
 *
 * Payload confirmado na doc: {id, event, dateCreated, payment: {id, status, value, ...}} —
 * payment.id é o asaas_payment_id que já gravamos em contrato_parcelas ao criar a cobrança.
 *
 * `CHECKOUT_PAID`: payload traz um objeto `checkout` (mesmo formato "irmão" de `CHECKOUT_CREATED`,
 * confirmado na doc) com `checkout.id`, que bate com `contratos.asaas_checkout_id` já gravado ao
 * gerar o link (`src/lib/asaas/adapter.ts`). Cartão: o cliente já pagou o valor cheio pra Asaas no
 * ato da compra, então conclui a venda na hora, sem esperar nenhuma parcela — diferente de
 * boleto/pix. Captura do parcelamento real e chargeback/estorno são escopo do futuro módulo
 * Financeiro (ver docs/superpowers/specs/2026-08-21-vendas-checkout-cartao-recebiveis-design.md,
 * seção 0), não implementados aqui.
 */
function segredosBatem(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

type PayloadAsaas = {
  event?: string;
  payment?: { id?: string };
  checkout?: { id?: string };
};

async function processarCheckoutPago(asaasCheckoutId: string): Promise<void> {
  try {
    const contrato = await buscarContratoPorAsaasCheckoutId(asaasCheckoutId);
    if (!contrato) {
      console.error(`[webhook asaas] contrato não encontrado pro checkout ${asaasCheckoutId}`);
      return;
    }

    await concluirVenda(contrato);

    // TODO(módulo Operação, fora de escopo desta sub-frente): handoff pra Ordem de Serviço — a
    // Oportunidade "ganha" já carrega tudo que a OS vai precisar (spec seção 3.5).
  } catch (e) {
    console.error("[webhook asaas] erro ao processar checkout pago:", e);
  }
}

async function processarPagamentoConfirmado(asaasPaymentId: string): Promise<void> {
  try {
    const parcelaPaga = await marcarParcelaPaga(asaasPaymentId, new Date().toISOString());
    if (!parcelaPaga) {
      console.error(`[webhook asaas] parcela não encontrada pra cobrança ${asaasPaymentId}`);
      return;
    }

    const contrato = await buscarContratoPorId(parcelaPaga.contratoId);
    if (!contrato) {
      console.error(`[webhook asaas] contrato ${parcelaPaga.contratoId} não encontrado`);
      return;
    }

    // Só a 1ª parcela paga conclui a venda — as demais só ficam marcadas como pagas, sem mudar o
    // estágio (regra confirmada com o Luiz: "Pagamento Primeira Parcela" é o marco de conclusão).
    if (!deveConcluirAoConfirmarParcela(contrato.metodoPagamento, parcelaPaga.numero)) return;

    await concluirVenda(contrato);

    // TODO(módulo Operação, fora de escopo desta sub-frente): handoff pra Ordem de Serviço — a
    // Oportunidade "ganha" já carrega tudo que a OS vai precisar (spec seção 3.5).
  } catch (e) {
    console.error("[webhook asaas] erro ao processar pagamento confirmado:", e);
  }
}

export async function POST(request: Request) {
  const segredo = process.env.ASAAS_WEBHOOK_SECRET;
  const recebido = request.headers.get("asaas-access-token") ?? "";

  if (!segredo) {
    if (process.env.VERCEL) {
      console.error("[webhook asaas] ASAAS_WEBHOOK_SECRET não configurada em produção — rejeitando.");
      return new Response("Não autorizado", { status: 401 });
    }
  } else if (!segredosBatem(recebido, segredo)) {
    return new Response("Não autorizado", { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as PayloadAsaas | null;
  console.log("[webhook asaas] payload recebido:", JSON.stringify(payload));

  if (!payload || !payload.event) {
    return Response.json({ ignorado: true, motivo: "payload vazio ou incompleto" });
  }

  if (payload.event === "PAYMENT_RECEIVED" || payload.event === "PAYMENT_CONFIRMED") {
    if (!payload.payment?.id) return Response.json({ ignorado: true, motivo: "payload sem payment.id" });
    after(() => processarPagamentoConfirmado(payload.payment!.id!));
    return Response.json({ recebido: true });
  }

  if (payload.event === "CHECKOUT_PAID") {
    if (!payload.checkout?.id) return Response.json({ ignorado: true, motivo: "payload sem checkout.id" });
    after(() => processarCheckoutPago(payload.checkout!.id!));
    return Response.json({ recebido: true });
  }

  return Response.json({ ignorado: true, motivo: `evento "${payload.event}" ainda não tratado` });
}
