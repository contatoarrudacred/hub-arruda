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

  // Achado real (19/08/2026): desde que o núcleo de Contrato do Vendas entrou (migration 036,
  // 18/08/2026), resetar um número que já chegou a gerar contrato (Fechamento de Venda/Nova
  // Oportunidade) passou a falhar — `contratos.oportunidade_id`/`comissoes_fornecedor_receber.
  // oportunidade_id` referenciam `oportunidades(id)` SEM cascade (correto pra dado real: um
  // contrato não pode sumir só porque a oportunidade some por engano em outro lugar), então a
  // cascata de `pessoas` → `oportunidades` (essa sim, com cascade) trava no meio do caminho.
  // Como esta é uma ferramenta só de teste, apaga esses dependentes primeiro, escopados às
  // oportunidades DESTA pessoa (nunca por pessoa_signatario_id/pessoa_arrudacred_signatario_id
  // soltos — um contrato de outra pessoa poderia ter esta pessoa como representante legal ou
  // como signatário da ArrudaCred, e apagar por esses campos arriscaria apagar contrato alheio).
  // contrato_parcelas cascateia de contratos, não precisa mexer nela separado.
  const { data: oportunidades, error: erroOportunidades } = await supabase
    .from("oportunidades")
    .select("id")
    .eq("pessoa_id", pessoa.id);
  if (erroOportunidades) return { sucesso: false, erro: `Falha ao buscar oportunidades: ${erroOportunidades.message}` };

  const oportunidadeIds = (oportunidades ?? []).map((o) => o.id);
  if (oportunidadeIds.length > 0) {
    const { error: erroContratos } = await supabase.from("contratos").delete().in("oportunidade_id", oportunidadeIds);
    if (erroContratos) return { sucesso: false, erro: `Falha ao apagar contratos: ${erroContratos.message}` };

    const { error: erroComissoes } = await supabase
      .from("comissoes_fornecedor_receber")
      .delete()
      .in("oportunidade_id", oportunidadeIds);
    if (erroComissoes) return { sucesso: false, erro: `Falha ao apagar comissões: ${erroComissoes.message}` };
  }

  const { error: erroPessoaDel } = await supabase.from("pessoas").delete().eq("id", pessoa.id);
  if (erroPessoaDel) return { sucesso: false, erro: `Falha ao apagar pessoa: ${erroPessoaDel.message}` };

  return { sucesso: true, encontrado: true };
}
