"use server";

import { createClient } from "@/lib/supabase/server";

// Utilitário de teste (16/08/2026, pedido de Luiz) — não é uma tela pensada pra uso diário, é pra
// resetar a conversa de WhatsApp real de um número de teste (o dele) sem precisar mexer direto no
// Supabase. Apaga a pessoa desse telefone e tudo que pertence só a ela — a próxima mensagem que
// esse número mandar cria tudo de novo do zero (ver carregarOuCriarConversaWhatsapp em
// persistencia.ts).
//
// Migration 20260816040000 acrescentou ON DELETE CASCADE de pessoas para conversas/mensagens/
// followup_emails/oportunidades/pessoa_papeis/identidades_canal/enderecos/cliques_rastreio — um
// delete só na pessoa resolve tudo isso agora (antes era apagar na ordem certa manualmente, e três
// dessas tabelas nem estavam cobertas). Deliberadamente NÃO cascateia pessoa_representantes nem
// usuarios_sistema.pessoa_id — se o telefone informado pertencer a um representante legal de PJ ou
// a um usuário do sistema, o delete falha com erro de FK em vez de apagar em silêncio, o que é o
// comportamento certo pra essa ferramenta de teste.

export type ResultadoResetarConversa =
  | { sucesso: true; encontrado: true }
  | { sucesso: true; encontrado: false }
  | { sucesso: false; erro: string };

function normalizarTelefone(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

export async function resetarConversaAction(telefoneBruto: string): Promise<ResultadoResetarConversa> {
  const telefone = normalizarTelefone(telefoneBruto);
  if (!telefone) {
    return { sucesso: false, erro: "Informe um número de telefone." };
  }

  const supabase = await createClient();

  const { data: pessoa, error: erroPessoa } = await supabase
    .from("pessoas")
    .select("id")
    .eq("whatsapp", telefone)
    .maybeSingle();
  if (erroPessoa) return { sucesso: false, erro: `Falha ao buscar pessoa: ${erroPessoa.message}` };
  if (!pessoa) return { sucesso: true, encontrado: false };

  const { error: erroPessoaDel } = await supabase.from("pessoas").delete().eq("id", pessoa.id);
  if (erroPessoaDel) return { sucesso: false, erro: `Falha ao apagar pessoa: ${erroPessoaDel.message}` };

  return { sucesso: true, encontrado: true };
}
