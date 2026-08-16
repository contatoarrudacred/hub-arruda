"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { ehUltimoItemDaAgenda } from "@/lib/motor-fluxo/motor-followup";
import { dispararItemFollowup } from "@/lib/motor-fluxo/persistencia";
import { carregarItensAgenda, type ItemAgendaFollowupCarregado } from "@/lib/motor-fluxo/repositorio";

// Server Actions do quadrinho "Teste do follow-up" (src/app/simulador/teste-followup.tsx) — deixa
// avançar manualmente pela agenda de follow-up de uma conversa simulada, sem esperar o tempo real
// passar nem depender do cron. Dispara pelo mesmo caminho que o cron usa de verdade
// (dispararItemFollowup em persistencia.ts), só ignorando o prazo e a janela comercial de
// propósito — é um botão de teste, não uma simulação de horário.

export type ProximoItemFollowupPreview = {
  ordem: number;
  intervaloValor: number;
  intervaloUnidade: ItemAgendaFollowupCarregado["intervaloUnidade"];
  canal: ItemAgendaFollowupCarregado["canal"];
};

export type EstadoFollowupTeste = {
  aguardandoDesde: string | null;
  proximoItem: ProximoItemFollowupPreview | null;
};

async function proximoItemPendente(
  agendaId: string,
  proximoItemAgenda: number,
): Promise<{ itens: ItemAgendaFollowupCarregado[]; proximo: ItemAgendaFollowupCarregado | null }> {
  const itens = await carregarItensAgenda(agendaId);
  const proximo =
    itens.filter((i) => i.ordem > proximoItemAgenda).sort((a, b) => a.ordem - b.ordem)[0] ?? null;
  return { itens, proximo };
}

export async function obterEstadoFollowupTeste(conversaId: string): Promise<EstadoFollowupTeste> {
  const supabase = createAdminClient();
  const { data: conversa, error } = await supabase
    .from("conversas")
    .select("agenda_followup_id, aguardando_resposta_desde, proximo_item_agenda")
    .eq("id", conversaId)
    .single();

  if (error || !conversa || !conversa.agenda_followup_id) {
    return { aguardandoDesde: conversa?.aguardando_resposta_desde ?? null, proximoItem: null };
  }

  const { proximo } = await proximoItemPendente(conversa.agenda_followup_id, conversa.proximo_item_agenda);

  return {
    aguardandoDesde: conversa.aguardando_resposta_desde,
    proximoItem: proximo
      ? {
          ordem: proximo.ordem,
          intervaloValor: proximo.intervaloValor,
          intervaloUnidade: proximo.intervaloUnidade,
          canal: proximo.canal,
        }
      : null,
  };
}

export type ResultadoAvancoFollowupTeste = {
  disparado: boolean;
  canal: ItemAgendaFollowupCarregado["canal"] | null;
  conteudo: string | null;
  encerrouAtendimento: boolean;
  finalizouCadencia: boolean;
};

export async function avancarFollowupTeste(
  conversaId: string,
  oportunidadeId: string,
): Promise<ResultadoAvancoFollowupTeste> {
  const supabase = createAdminClient();
  const { data: conversa, error } = await supabase
    .from("conversas")
    .select("agenda_followup_id, proximo_item_agenda")
    .eq("id", conversaId)
    .single();

  const vazio: ResultadoAvancoFollowupTeste = {
    disparado: false,
    canal: null,
    conteudo: null,
    encerrouAtendimento: false,
    finalizouCadencia: false,
  };
  if (error || !conversa || !conversa.agenda_followup_id) return vazio;

  const { itens, proximo } = await proximoItemPendente(conversa.agenda_followup_id, conversa.proximo_item_agenda);
  if (!proximo) return vazio;

  const conteudoSubstituido = await dispararItemFollowup(conversaId, oportunidadeId, proximo, itens);

  return {
    disparado: true,
    canal: proximo.canal,
    conteudo: conteudoSubstituido,
    encerrouAtendimento: proximo.encerraAtendimento,
    finalizouCadencia: ehUltimoItemDaAgenda(itens, proximo),
  };
}
