// Gestão do lead fictício "Testando da Silva" — criar do zero, ler os efeitos gravados no banco
// depois de cada cenário, e apagar tudo antes do próximo (reaproveita a mesma ideia de
// reset-conversa/actions.ts: apagar a pessoa cascateia conversas/mensagens/notas_internas/
// notificacoes/agendamentos_consultor/oportunidades — migration 20260816040000).

import { createAdminClient } from "@/lib/supabase/admin";
import type { EfeitosBancoEspelho } from "./tipos";

export const NOME_LEAD_TESTE = "Testando da Silva";

/** Apaga qualquer resquício de uma rodada anterior com este telefone — idempotente, seguro de
 * chamar mesmo se não existir nada ainda. */
export async function apagarLeadTeste(telefone: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: pessoas, error } = await supabase.from("pessoas").select("id").eq("whatsapp", telefone);
  if (error) throw new Error(`Falha ao buscar lead de teste pra apagar: ${error.message}`);
  for (const pessoa of pessoas ?? []) {
    const { error: erroDelete } = await supabase.from("pessoas").delete().eq("id", pessoa.id);
    if (erroDelete) throw new Error(`Falha ao apagar lead de teste ${pessoa.id}: ${erroDelete.message}`);
  }
}

/** Troca o nome "Lead (WhatsApp)" (default de `carregarOuCriarConversaWhatsapp`) por um nome
 * reconhecível — chamar logo depois do primeiro turno da conversa (é quando a pessoa é criada). */
export async function nomearLeadTeste(telefone: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("pessoas").update({ nome_razao_social: NOME_LEAD_TESTE }).eq("whatsapp", telefone);
  if (error) throw new Error(`Falha ao nomear lead de teste: ${error.message}`);
}

/** Lê de volta tudo que o cenário gravou de verdade no banco — é o que prova (ou desmente) que um
 * handoff realmente aconteceu, não só que a Malala "disse" que ia transferir. */
export async function lerEfeitosBanco(telefone: string): Promise<EfeitosBancoEspelho | null> {
  const supabase = createAdminClient();

  const { data: pessoa, error: erroPessoa } = await supabase
    .from("pessoas")
    .select("id")
    .eq("whatsapp", telefone)
    .maybeSingle();
  if (erroPessoa) throw new Error(`Falha ao buscar pessoa do lead de teste: ${erroPessoa.message}`);
  if (!pessoa) return null;

  const { data: conversa, error: erroConversa } = await supabase
    .from("conversas")
    .select("id, sob_supervisor, oportunidades(etapa_kanban)")
    .eq("pessoa_id", pessoa.id)
    .maybeSingle();
  if (erroConversa) throw new Error(`Falha ao buscar conversa do lead de teste: ${erroConversa.message}`);
  if (!conversa) return null;

  const [{ data: notas, error: erroNotas }, { data: notificacoes, error: erroNotificacoes }, { data: agendamento, error: erroAgendamento }] =
    await Promise.all([
      supabase
        .from("notas_internas")
        .select("autor_id, texto, usuarios_sistema(pessoas(nome_razao_social))")
        .eq("conversa_id", conversa.id)
        .order("created_at", { ascending: true }),
      supabase.from("notificacoes").select("tipo").eq("conversa_id", conversa.id),
      supabase.from("agendamentos_consultor").select("motivo, inicio, fim").eq("conversa_id", conversa.id).maybeSingle(),
    ]);
  if (erroNotas) throw new Error(`Falha ao buscar notas internas: ${erroNotas.message}`);
  if (erroNotificacoes) throw new Error(`Falha ao buscar notificações: ${erroNotificacoes.message}`);
  if (erroAgendamento) throw new Error(`Falha ao buscar agendamento: ${erroAgendamento.message}`);

  const oportunidade = conversa.oportunidades as unknown as { etapa_kanban: string } | null;

  return {
    sobSupervisor: conversa.sob_supervisor,
    etapaKanban: oportunidade?.etapa_kanban ?? null,
    notasInternas: (notas ?? []).map((n) => {
      const autorInfo = n.usuarios_sistema as unknown as { pessoas: { nome_razao_social: string } | null } | null;
      return {
        autor: n.autor_id === null ? "Malala (sistema)" : (autorInfo?.pessoas?.nome_razao_social ?? "Atendente"),
        texto: n.texto,
      };
    }),
    notificacoes: (notificacoes ?? []).map((n) => ({ tipo: n.tipo })),
    agendamento: agendamento ? { motivo: agendamento.motivo, inicio: agendamento.inicio, fim: agendamento.fim } : null,
  };
}
