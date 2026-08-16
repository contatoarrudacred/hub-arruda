"use server";

import { createClient } from "@/lib/supabase/server";

// Utilitário de teste (16/08/2026, pedido de Luiz) — não é uma tela pensada pra uso diário, é pra
// resetar a conversa de WhatsApp real de um número de teste (o dele) sem precisar mexer direto no
// Supabase. Apaga pessoa/oportunidade/conversa/mensagens desse telefone — a próxima mensagem que
// esse número mandar cria tudo de novo do zero (ver carregarOuCriarConversaWhatsapp em
// persistencia.ts). Não tem cascade no banco (FKs sem ON DELETE), então a ordem de exclusão importa.

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

  const { data: conversas, error: erroConversas } = await supabase
    .from("conversas")
    .select("id")
    .eq("pessoa_id", pessoa.id);
  if (erroConversas) return { sucesso: false, erro: `Falha ao buscar conversas: ${erroConversas.message}` };
  const idsConversas = (conversas ?? []).map((c) => c.id);

  if (idsConversas.length > 0) {
    const { error: erroMensagens } = await supabase.from("mensagens").delete().in("conversa_id", idsConversas);
    if (erroMensagens) return { sucesso: false, erro: `Falha ao apagar mensagens: ${erroMensagens.message}` };

    const { error: erroFollowupEmails } = await supabase
      .from("followup_emails")
      .delete()
      .in("conversa_id", idsConversas);
    if (erroFollowupEmails) {
      return { sucesso: false, erro: `Falha ao apagar e-mails de follow-up: ${erroFollowupEmails.message}` };
    }

    const { error: erroConversasDel } = await supabase.from("conversas").delete().in("id", idsConversas);
    if (erroConversasDel) return { sucesso: false, erro: `Falha ao apagar conversas: ${erroConversasDel.message}` };
  }

  const { error: erroOportunidades } = await supabase.from("oportunidades").delete().eq("pessoa_id", pessoa.id);
  if (erroOportunidades) {
    return { sucesso: false, erro: `Falha ao apagar oportunidades: ${erroOportunidades.message}` };
  }

  const { error: erroPapeis } = await supabase.from("pessoa_papeis").delete().eq("pessoa_id", pessoa.id);
  if (erroPapeis) return { sucesso: false, erro: `Falha ao apagar papéis da pessoa: ${erroPapeis.message}` };

  const { error: erroPessoaDel } = await supabase.from("pessoas").delete().eq("id", pessoa.id);
  if (erroPessoaDel) return { sucesso: false, erro: `Falha ao apagar pessoa: ${erroPessoaDel.message}` };

  return { sucesso: true, encontrado: true };
}
