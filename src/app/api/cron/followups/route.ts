import { createAdminClient } from "@/lib/supabase/admin";
import { dispararItemFollowup } from "@/lib/motor-fluxo/persistencia";
import { calcularProximoDisparo, podeDispararAgora } from "@/lib/motor-fluxo/motor-followup";
import { carregarItensAgenda, type ItemAgendaFollowupCarregado } from "@/lib/motor-fluxo/repositorio";

// Cron de disparo de follow-up (Fase 6) — chamado periodicamente pelo Vercel Cron (ver
// vercel.json). Varre conversas "aguardando resposta" e dispara o próximo item da agenda que já
// venceu, respeitando a janela comercial — considera a régua inteira, incluindo os itens de
// e-mail depois da Perdida (Luiz, 15/08/2026). Ainda não entrega de verdade (nem WhatsApp — Zapster
// não conectado, Fase 7 —, nem e-mail — Resend não conectado ainda): só registra, via
// dispararItemFollowup (persistencia.ts), pronto pra plugar o envio real de cada canal depois.
//
// Protegido por CRON_SECRET: o Vercel manda esse header automaticamente quando a variável de
// ambiente CRON_SECRET está configurada no projeto — ver aviso no PLANO_MESTRE sobre configurar
// isso manualmente no painel da Vercel.

type ConversaElegivel = {
  id: string;
  oportunidade_id: string | null;
  agenda_followup_id: string | null;
  aguardando_resposta_desde: string;
  proximo_item_agenda: number;
};

const ID_LOCK_CRON = "followups";
// 4 min: menor que os 5 min entre execuções do cron-job.org, então uma execução normal sempre
// libera a trava antes da próxima começar; se o processo morrer sem liberar (crash, timeout da
// Vercel), a trava expira sozinha antes do próximo disparo em vez de travar o cron pra sempre.
const DURACAO_LOCK_SEGUNDOS = 240;

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (segredo && request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return new Response("Não autorizado", { status: 401 });
  }

  const supabase = createAdminClient();
  const agora = new Date();

  // Evita disparo duplicado se duas execuções do cron se sobrepuserem (ex.: disparo manual +
  // agendado ao mesmo tempo, ou retry do cron-job.org) — sem isso, as duas leriam a mesma conversa
  // "aguardando resposta" e disparariam o mesmo item de follow-up duas vezes.
  const { data: obtido, error: erroLock } = await supabase.rpc("fn_tentar_lock_cron", {
    p_id: ID_LOCK_CRON,
    p_duracao_segundos: DURACAO_LOCK_SEGUNDOS,
  });
  if (erroLock) {
    return Response.json({ erro: `Falha ao obter lock do cron: ${erroLock.message}` }, { status: 500 });
  }
  if (!obtido) {
    return Response.json({ ignorado: "outra execução do cron já está em andamento" });
  }

  try {
    const { data: conversas, error } = await supabase
      .from("conversas")
      .select("id, oportunidade_id, agenda_followup_id, aguardando_resposta_desde, proximo_item_agenda")
      .eq("status", "ativa")
      .eq("sob_supervisor", false)
      .not("aguardando_resposta_desde", "is", null)
      .not("agenda_followup_id", "is", null)
      .returns<ConversaElegivel[]>();

    if (error) {
      return Response.json({ erro: `Falha ao carregar conversas: ${error.message}` }, { status: 500 });
    }

    const itensPorAgenda = new Map<string, ItemAgendaFollowupCarregado[]>();
    let disparados = 0;
    let foraDaJanela = 0;
    const erros: string[] = [];

    for (const conversa of conversas ?? []) {
      if (!conversa.agenda_followup_id || !conversa.oportunidade_id) continue;

      try {
        let itens = itensPorAgenda.get(conversa.agenda_followup_id);
        if (!itens) {
          itens = await carregarItensAgenda(conversa.agenda_followup_id);
          itensPorAgenda.set(conversa.agenda_followup_id, itens);
        }

        const proximoItem = calcularProximoDisparo(
          itens,
          conversa.proximo_item_agenda,
          new Date(conversa.aguardando_resposta_desde),
          agora,
        );
        if (!proximoItem) continue;

        if (!podeDispararAgora(proximoItem, agora)) {
          foraDaJanela += 1;
          continue; // fica pra uma próxima execução do cron, dentro da janela comercial
        }

        await dispararItemFollowup(conversa.id, conversa.oportunidade_id, proximoItem, itens);
        disparados += 1;
      } catch (e) {
        erros.push(`conversa ${conversa.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return Response.json({
      verificadas: conversas?.length ?? 0,
      disparados,
      foraDaJanela,
      erros,
    });
  } finally {
    await supabase.rpc("fn_liberar_lock_cron", { p_id: ID_LOCK_CRON });
  }
}
