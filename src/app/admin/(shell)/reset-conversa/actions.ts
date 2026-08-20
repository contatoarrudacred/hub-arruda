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
//
// Achado real #2 (19/08/2026, mesmo dia) — `pessoas.whatsapp` não tem constraint de único no
// banco, então caminhos de cadastro diferentes (webhook do WhatsApp, Nova Oportunidade do Vendas)
// podem colidir no mesmo número em momentos diferentes, sem se avisar. Aconteceu de verdade com o
// número de teste do próprio Luiz. `.maybeSingle()` quebra com "multiple rows returned" nesse
// caso — trocado por uma busca que aceita 0, 1 ou N linhas e nunca decide sozinho qual apagar
// quando há mais de uma (perigoso demais pra essa ferramenta adivinhar).

export type ResultadoResetarConversa =
  | { status: "apagado_tudo" }
  | { status: "bloqueado_por_venda"; quantidadeContratos: number; quantidadeComissoes: number }
  | { status: "multiplas_pessoas"; nomes: string[] }
  | { status: "nao_encontrado" }
  | { status: "erro"; mensagem: string };

export type ResultadoResetarApenasConversa =
  | { status: "apagado" }
  | { status: "nao_encontrado" }
  | { status: "erro"; mensagem: string };

function normalizarTelefone(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

async function buscarPessoasPorTelefone(
  supabase: Awaited<ReturnType<typeof createClient>>,
  telefone: string,
): Promise<{ id: string; nome: string }[] | { erro: string }> {
  const { data, error } = await supabase.from("pessoas").select("id, nome_razao_social").eq("whatsapp", telefone);
  if (error) return { erro: `Falha ao buscar pessoa: ${error.message}` };
  return (data ?? []).map((p) => ({ id: p.id, nome: p.nome_razao_social }));
}

export async function resetarConversaAction(telefoneBruto: string): Promise<ResultadoResetarConversa> {
  const telefone = normalizarTelefone(telefoneBruto);
  if (!telefone) return { status: "erro", mensagem: "Informe um número de telefone." };

  const supabase = await createClient();

  const pessoas = await buscarPessoasPorTelefone(supabase, telefone);
  if ("erro" in pessoas) return { status: "erro", mensagem: pessoas.erro };
  if (pessoas.length === 0) return { status: "nao_encontrado" };
  if (pessoas.length > 1) {
    // Não decide sozinho qual das duas apagar — apagar a errada por adivinhação é pior do que
    // travar aqui. "Apagar só a conversa" (abaixo) continua funcionando nesse caso, escopado por
    // telefone, não por id de pessoa específica.
    return { status: "multiplas_pessoas", nomes: pessoas.map((p) => p.nome) };
  }
  const pessoa = pessoas[0];

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

/**
 * Alternativa quando `resetarConversaAction` bloqueia (venda existente, ou mais de uma pessoa com
 * o mesmo telefone) — apaga só as conversas ligadas a esse número (cascateia mensagens/
 * followup_emails), mantém pessoa(s)/oportunidade/contrato/comissão intactos. Escopado por
 * telefone (todas as pessoas que compartilham o número), não por um id de pessoa específico —
 * funciona mesmo no caso de duplicidade, sem precisar desambiguar qual pessoa é "a certa".
 */
export async function resetarApenasConversaAction(telefoneBruto: string): Promise<ResultadoResetarApenasConversa> {
  const telefone = normalizarTelefone(telefoneBruto);
  if (!telefone) return { status: "erro", mensagem: "Informe um número de telefone." };

  const supabase = await createClient();

  const pessoas = await buscarPessoasPorTelefone(supabase, telefone);
  if ("erro" in pessoas) return { status: "erro", mensagem: pessoas.erro };
  if (pessoas.length === 0) return { status: "nao_encontrado" };

  const { error: erroConversas } = await supabase
    .from("conversas")
    .delete()
    .in("pessoa_id", pessoas.map((p) => p.id));
  if (erroConversas) return { status: "erro", mensagem: `Falha ao apagar conversa: ${erroConversas.message}` };

  return { status: "apagado" };
}
