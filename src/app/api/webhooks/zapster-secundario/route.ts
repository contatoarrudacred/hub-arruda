import { after } from "next/server";
import { registrarMensagemLead } from "@/lib/motor-fluxo/persistencia";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarSegredoWebhook } from "@/lib/whatsapp/verificar-segredo-webhook";
import { enviarMensagemTexto } from "@/lib/whatsapp/zapster";

// Webhook da instância SECUNDÁRIA do Zapster (ver
// docs/superpowers/specs/2026-08-22-comunicacao-centralizada-crm-design.md) — rota separada da
// principal (src/app/api/webhooks/zapster/route.ts) de propósito: aqui NUNCA roda o motor de
// fluxo automatizado. Esse número é só pra disparo automático de outros módulos (Vendas,
// Financeiro...); se o lead responder aqui mesmo assim, só manda uma resposta fixa e amigável
// pedindo pra migrar pro oficial — decisão de Luiz, 22/08/2026.

export const maxDuration = 30;

const RESPOSTA_FIXA_SECUNDARIO =
  "Oi! Esse número é só para envio automático e não consegue responder mensagens, desculpa a " +
  "confusão. Se precisar de ajuda, fale com a gente pelo nosso WhatsApp oficial — te mandamos o " +
  "link em instantes 🙂";

/**
 * Busca a conversa secundária pelo telefone do remetente. Duas queries separadas (pessoas por
 * `whatsapp`, depois conversas por `pessoa_id` + `canal` + `instancia`) em vez de
 * `.eq("pessoas.whatsapp", telefone)` — supabase-js não filtra por coluna de tabela relacionada
 * sem um `!inner` join explícito no `.select()`, mesmo padrão já usado em
 * `buscarOuCriarConversaSecundaria` (src/lib/comunicacao/repositorio.ts).
 *
 * Achado real (19/08/2026, mesmo caso já corrigido em `carregarOuCriarConversaWhatsapp`,
 * src/lib/motor-fluxo/persistencia.ts): `pessoas.whatsapp` não tem constraint de único no banco —
 * um mesmo número pode estar ligado a mais de uma pessoa. `.maybeSingle()` na busca por telefone
 * quebra com "multiple rows returned" nesse caso, e a mensagem recebida nunca é registrada. Busca
 * aceita N linhas e, havendo mais de uma pessoa, prefere a que já tem conversa secundária
 * existente; sem nenhuma, usa a última da lista (mesmo fallback de `carregarOuCriarConversaWhatsapp`).
 */
async function buscarConversaSecundariaPorTelefone(telefone: string): Promise<{ id: string } | null> {
  const supabase = createAdminClient();

  const { data: pessoasComTelefone, error: erroPessoas } = await supabase.from("pessoas").select("id").eq("whatsapp", telefone);
  if (erroPessoas) throw new Error(`Falha ao buscar pessoas pelo telefone ${telefone}: ${erroPessoas.message}`);
  if (!pessoasComTelefone || pessoasComTelefone.length === 0) return null;

  let pessoaId: string;
  if (pessoasComTelefone.length === 1) {
    pessoaId = pessoasComTelefone[0].id;
  } else {
    const ids = pessoasComTelefone.map((p) => p.id);
    const { data: comConversaSecundaria, error: erroComConversa } = await supabase
      .from("conversas")
      .select("pessoa_id")
      .in("pessoa_id", ids)
      .eq("canal", "whatsapp")
      .eq("instancia", "secundaria")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (erroComConversa) {
      throw new Error(`Falha ao buscar conversa secundária entre pessoas duplicadas do telefone ${telefone}: ${erroComConversa.message}`);
    }
    pessoaId = comConversaSecundaria ? comConversaSecundaria.pessoa_id : pessoasComTelefone[pessoasComTelefone.length - 1].id;
  }

  const { data: conversa, error: erroConversa } = await supabase
    .from("conversas")
    .select("id")
    .eq("pessoa_id", pessoaId)
    .eq("canal", "whatsapp")
    .eq("instancia", "secundaria")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroConversa) throw new Error(`Falha ao buscar conversa secundária pra pessoa ${pessoaId}: ${erroConversa.message}`);

  return conversa ?? null;
}

async function processarMensagemRecebidaSecundario(telefone: string, texto: string): Promise<void> {
  try {
    const conversa = await buscarConversaSecundariaPorTelefone(telefone);

    if (!conversa) {
      console.error(`[webhook zapster-secundario] mensagem recebida de número sem conversa secundária conhecida: ${telefone}`);
      return;
    }

    await registrarMensagemLead(conversa.id, texto, null, null);
    await enviarMensagemTexto(telefone, RESPOSTA_FIXA_SECUNDARIO, "secundaria");
  } catch (e) {
    console.error("[webhook zapster-secundario] erro ao processar:", e);
  }
}

export async function POST(request: Request) {
  if (!verificarSegredoWebhook(request, "ZAPSTER_SECUNDARIO_WEBHOOK_SECRET")) {
    return new Response("Não autorizado", { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  console.log("[webhook zapster-secundario] payload recebido:", JSON.stringify(payload));
  if (!payload || payload.type !== "message.received") {
    return Response.json({ ignorado: true });
  }

  const data = payload.data;
  const telefone: string | undefined = data?.sender?.phone_number;
  const texto: string | undefined = data?.content?.text;
  if (!telefone || !texto) {
    return Response.json({ ignorado: true, motivo: "sem phone_number ou texto no payload" });
  }

  after(() => processarMensagemRecebidaSecundario(telefone, texto));
  return Response.json({ recebido: true });
}
