"use server";

import { substituirVariaveisTexto } from "@/lib/motor-fluxo/engine";
import { ehUltimoItemDaAgenda } from "@/lib/motor-fluxo/motor-followup";
import {
  carregarEtapasPorCodigo,
  carregarIdAgendaPadrao,
  carregarItensAgenda,
  type ItemAgendaFollowupCarregado,
} from "@/lib/motor-fluxo/repositorio";
import type { DadosConversa } from "@/lib/motor-fluxo/tipos";

// Preview da régua de follow-up no /simulador (16/08/2026) — o simulador não persiste nada (ver
// actions.ts), então este quadrinho não testa o cron de verdade, só mostra como cada mensagem da
// régua fica (com [Primeiro_Nome] já resolvido). Só leitura: nunca grava mensagem, e-mail, nem
// muda estágio de nenhuma oportunidade.

export type ItemPreviewFollowup = {
  ordem: number;
  intervaloValor: number;
  intervaloUnidade: ItemAgendaFollowupCarregado["intervaloUnidade"];
  canal: ItemAgendaFollowupCarregado["canal"];
  conteudo: string;
  encerraAtendimento: boolean;
  ultimoDaAgenda: boolean;
};

/**
 * Régua inteira que se aplicaria a essa etapa, na mesma regra de produção (agenda da própria
 * etapa, senão a agenda padrão — ver persistencia.ts `registrarTurnoMalala`). Retorna null quando
 * a etapa não existe ou não é do tipo "aguarda resposta" (não teria follow-up nenhum armado).
 */
export async function carregarPreviewFollowup(
  etapaCodigo: string,
  dados: DadosConversa,
): Promise<ItemPreviewFollowup[] | null> {
  const etapasPorCodigo = await carregarEtapasPorCodigo();
  const etapa = etapasPorCodigo[etapaCodigo];
  if (!etapa || !etapa.conteudo.aguarda_resposta) return null;

  const agendaId = etapa.agendaFollowupId ?? (await carregarIdAgendaPadrao());
  const itens = [...(await carregarItensAgenda(agendaId))].sort((a, b) => a.ordem - b.ordem);

  return itens.map((item) => ({
    ordem: item.ordem,
    intervaloValor: item.intervaloValor,
    intervaloUnidade: item.intervaloUnidade,
    canal: item.canal,
    conteudo: substituirVariaveisTexto(item.conteudo, dados, {}),
    encerraAtendimento: item.encerraAtendimento,
    ultimoDaAgenda: ehUltimoItemDaAgenda(itens, item),
  }));
}
