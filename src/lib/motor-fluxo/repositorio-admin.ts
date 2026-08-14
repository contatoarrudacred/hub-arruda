import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { tipoEtapaDb } from "./db";
import type { ConteudoEtapa } from "./tipos";

// Camada de I/O usada pelo painel admin (leitura E escrita) — separada de repositorio.ts, que é
// só leitura e serve o motor de fluxo em tempo real. Mesma razão de usar o cliente admin
// (service_role): o admin autentica via Supabase Auth, não precisa de RLS por linha aqui (nível
// único ADMIN/MASTER, MODELAGEM_DADOS_ARRUDACRED.md).

export type FluxoAdmin = { id: string; nome: string; produtoId: string | null };

export async function listarFluxos(): Promise<FluxoAdmin[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("fluxos").select("id, nome, produto_id").order("nome");

  if (error) {
    throw new Error(`Falha ao listar fluxos: ${error.message}`);
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    nome: linha.nome,
    produtoId: linha.produto_id,
  }));
}

export type EtapaAdmin = {
  id: string;
  fluxoId: string;
  ordem: number;
  campoSalvo: string | null;
  agendaFollowupId: string | null;
  conteudo: ConteudoEtapa;
};

export async function carregarEtapasDoFluxo(fluxoId: string): Promise<EtapaAdmin[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("etapas_fluxo")
    .select("id, fluxo_id, ordem, campo_salvo, agenda_followup_id, conteudo")
    .eq("fluxo_id", fluxoId)
    .order("ordem");

  if (error) {
    throw new Error(`Falha ao carregar etapas do fluxo: ${error.message}`);
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    fluxoId: linha.fluxo_id,
    ordem: linha.ordem,
    campoSalvo: linha.campo_salvo,
    agendaFollowupId: linha.agenda_followup_id,
    conteudo: linha.conteudo as ConteudoEtapa,
  }));
}

/** Id + código de toda etapa que existe hoje, em qualquer fluxo — a navegação do motor cruza fluxos (ex.: triagem → produto), então validar referências e colisão de código precisa considerar tudo, não só o fluxo aberto no editor. */
export async function carregarResumoDeTodasEtapas(): Promise<{ id: string; codigo: string }[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("etapas_fluxo").select("id, conteudo");

  if (error) {
    throw new Error(`Falha ao carregar etapas existentes: ${error.message}`);
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    codigo: (linha.conteudo as ConteudoEtapa).codigo,
  }));
}

export type AgendaAdmin = { id: string; nome: string };

export async function listarAgendasFollowup(): Promise<AgendaAdmin[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("agendas_followup").select("id, nome").order("nome");

  if (error) {
    throw new Error(`Falha ao listar agendas de follow-up: ${error.message}`);
  }

  return data ?? [];
}

export type EntradaSalvarEtapa = {
  id: string | null;
  fluxoId: string;
  ordem: number;
  campoSalvo: string | null;
  agendaFollowupId: string | null;
  conteudo: ConteudoEtapa;
};

export async function salvarEtapa(entrada: EntradaSalvarEtapa): Promise<{ id: string }> {
  const supabase = createAdminClient();
  const linha = {
    fluxo_id: entrada.fluxoId,
    ordem: entrada.ordem,
    tipo_etapa: tipoEtapaDb(entrada.conteudo),
    conteudo: entrada.conteudo,
    campo_salvo: entrada.campoSalvo,
    agenda_followup_id: entrada.agendaFollowupId,
  };

  if (entrada.id) {
    const { error } = await supabase.from("etapas_fluxo").update(linha).eq("id", entrada.id);
    if (error) throw new Error(`Falha ao atualizar etapa: ${error.message}`);
    return { id: entrada.id };
  }

  const { data, error } = await supabase.from("etapas_fluxo").insert(linha).select("id").single();
  if (error) throw new Error(`Falha ao criar etapa: ${error.message}`);
  return { id: data.id };
}

export async function excluirEtapa(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("etapas_fluxo").delete().eq("id", id);
  if (error) throw new Error(`Falha ao excluir etapa: ${error.message}`);
}
