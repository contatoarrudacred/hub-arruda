"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buscarLembretePendente, obterUsuarioSistemaAtual, type LembreteAgendamento } from "@/lib/motor-fluxo/repositorio-atendimento";

export async function sair() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

/** Polling do lembrete de agendamento (spec 2026-08-20-agendamento-consultor-alto-valor.md) — chamado pelo layout raiz do admin, em qualquer tela. `null` quando não há nada pendente agora (a maioria das chamadas). */
export async function verificarLembreteAgendamentoAction(): Promise<LembreteAgendamento | null> {
  const usuario = await obterUsuarioSistemaAtual();
  if (!usuario.ehConsultor) return null;
  return buscarLembretePendente(usuario.id);
}
