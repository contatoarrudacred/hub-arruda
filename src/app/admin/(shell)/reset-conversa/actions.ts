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
//
// Correção 19/08/2026 (Luiz) — achado real: desde que o núcleo de Contrato do Vendas entrou
// (migration 036, 18/08/2026), resetar um número que já gerou contrato/comissão passou a falhar
// por violação de FK (`contratos.oportunidade_id`/`comissoes_fornecedor_receber.oportunidade_id`
// não cascateiam de `oportunidades`, de propósito — um contrato não pode sumir só porque a
// oportunidade some por engano em outro lugar). Uma tentativa anterior desta correção apagava
// esses registros pra destravar o delete — o Luiz corrigiu essa decisão: **pessoa que já gerou
// contrato NUNCA pode ser apagada** (não pode dar inconsistência em registro de venda emitido).
// Agora o fluxo é: detecta ANTES de tentar apagar; se houver venda de verdade, bloqueia e devolve
// a contagem pro usuário decidir; a UI oferece `resetarApenasConversaAction` como alternativa —
// apaga só `conversas` (e o que cascateia dela: mensagens, followup_emails), mantém pessoa,
// oportunidade, contrato e comissão intactos.

export type ResultadoResetarConversa =
  | { status: "apagado_tudo" }
  | { status: "bloqueado_por_venda"; quantidadeContratos: number; quantidadeComissoes: number }
  | { status: "nao_encontrado" }
  | { status: "erro"; mensagem: string };

export type ResultadoResetarApenasConversa =
  | { status: "apagado" }
  | { status: "nao_encontrado" }
  | { status: "erro"; mensagem: string };

function normalizarTelefone(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

async function buscarPessoaPorTelefone(
  supabase: Awaited<ReturnType<typeof createClient>>,
  telefone: string,
): Promise<{ id: string } | null | { erro: string }> {
  const { data: pessoa, error } = await supabase.from("pessoas").select("id").eq("whatsapp", telefone).maybeSingle();
  if (error) return { erro: `Falha ao buscar pessoa: ${error.message}` };
  return pessoa;
}

export async function resetarConversaAction(telefoneBruto: string): Promise<ResultadoResetarConversa> {
  const telefone = normalizarTelefone(telefoneBruto);
  if (!telefone) return { status: "erro", mensagem: "Informe um número de telefone." };

  const supabase = await createClient();

  const pessoa = await buscarPessoaPorTelefone(supabase, telefone);
  if (pessoa && "erro" in pessoa) return { status: "erro", mensagem: pessoa.erro };
  if (!pessoa) return { status: "nao_encontrado" };

  const { data: oportunidades, error: erroOportunidades } = await supabase
    .from("oportunidades")
    .select("id")
    .eq("pessoa_id", pessoa.id);
  if (erroOportunidades) return { status: "erro", mensagem: `Falha ao buscar oportunidades: ${erroOportunidades.message}` };

  const oportunidadeIds = (oportunidades ?? []).map((o) => o.id);
  if (oportunidadeIds.length > 0) {
    const [respostaContratos, respostaComissoes] = await Promise.all([
      supabase.from("contratos").select("id", { count: "exact", head: true }).in("oportunidade_id", oportunidadeIds),
      supabase
        .from("comissoes_fornecedor_receber")
        .select("id", { count: "exact", head: true })
        .in("oportunidade_id", oportunidadeIds),
    ]);
    if (respostaContratos.error) return { status: "erro", mensagem: `Falha ao checar contratos: ${respostaContratos.error.message}` };
    if (respostaComissoes.error) return { status: "erro", mensagem: `Falha ao checar comissões: ${respostaComissoes.error.message}` };

    const quantidadeContratos = respostaContratos.count ?? 0;
    const quantidadeComissoes = respostaComissoes.count ?? 0;
    if (quantidadeContratos > 0 || quantidadeComissoes > 0) {
      return { status: "bloqueado_por_venda", quantidadeContratos, quantidadeComissoes };
    }
  }

  const { error: erroPessoaDel } = await supabase.from("pessoas").delete().eq("id", pessoa.id);
  if (erroPessoaDel) return { status: "erro", mensagem: `Falha ao apagar pessoa: ${erroPessoaDel.message}` };

  return { status: "apagado_tudo" };
}

/** Alternativa quando `resetarConversaAction` bloqueia por venda existente — apaga só a conversa (cascateia mensagens/followup_emails), mantém pessoa/oportunidade/contrato/comissão intactos. */
export async function resetarApenasConversaAction(telefoneBruto: string): Promise<ResultadoResetarApenasConversa> {
  const telefone = normalizarTelefone(telefoneBruto);
  if (!telefone) return { status: "erro", mensagem: "Informe um número de telefone." };

  const supabase = await createClient();

  const pessoa = await buscarPessoaPorTelefone(supabase, telefone);
  if (pessoa && "erro" in pessoa) return { status: "erro", mensagem: pessoa.erro };
  if (!pessoa) return { status: "nao_encontrado" };

  const { error: erroConversas } = await supabase.from("conversas").delete().eq("pessoa_id", pessoa.id);
  if (erroConversas) return { status: "erro", mensagem: `Falha ao apagar conversa: ${erroConversas.message}` };

  return { status: "apagado" };
}
