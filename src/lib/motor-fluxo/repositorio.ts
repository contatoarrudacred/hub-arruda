import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConfigPrecificacaoLimpaNome, FaixaPreco } from "./regras-limpeza-nome";
import type { ConteudoEtapa, EtapaCarregada } from "./tipos";

// Camada de I/O do motor de fluxo — único lugar que fala com o Supabase. O motor em si
// (engine.ts) e as regras de produto (regras-limpeza-nome.ts) continuam puros/testáveis sem banco.
// Usa o cliente admin (service_role) porque o backend do atendimento não roda no contexto de um
// usuário logado — mesma decisão já registrada no PLANO_MESTRE ("backend acessa via service_role").

/** Carrega TODAS as etapas de TODOS os fluxos, indexadas pelo código estável (não pelo id da linha) — é assim que o motor navega entre fluxos (ex.: da triagem pro fluxo do produto). */
export async function carregarEtapasPorCodigo(): Promise<Record<string, EtapaCarregada>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("etapas_fluxo")
    .select("id, fluxo_id, ordem, campo_salvo, agenda_followup_id, conteudo");

  if (error) {
    throw new Error(`Falha ao carregar etapas_fluxo: ${error.message}`);
  }

  const mapa: Record<string, EtapaCarregada> = {};
  for (const linha of data ?? []) {
    const conteudo = linha.conteudo as ConteudoEtapa;
    mapa[conteudo.codigo] = {
      id: linha.id,
      fluxoId: linha.fluxo_id,
      ordem: linha.ordem,
      campoSalvo: linha.campo_salvo,
      agendaFollowupId: linha.agenda_followup_id,
      conteudo,
    };
  }
  return mapa;
}

/** Id da agenda de follow-up usada quando uma etapa não define uma própria (`etapas_fluxo.agenda_followup_id` nulo). */
export async function carregarIdAgendaPadrao(): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("agendas_followup")
    .select("id")
    .eq("nome", "Padrão")
    .single();

  if (error || !data) {
    throw new Error(`Falha ao carregar agenda de follow-up padrão: ${error?.message ?? "não encontrada"}`);
  }
  return data.id;
}

export type ItemAgendaFollowupCarregado = {
  id: string;
  ordem: number;
  intervaloValor: number;
  intervaloUnidade: "minutos" | "horas" | "dias";
  canal: "whatsapp" | "email";
  respeitaJanelaComercial: boolean;
  conteudo: string;
  encerraAtendimento: boolean;
};

/** Itens de uma agenda de follow-up, em ordem — usado pelo motor de disparo (motor-followup.ts) pra decidir o que vem a seguir. */
export async function carregarItensAgenda(agendaId: string): Promise<ItemAgendaFollowupCarregado[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("agenda_itens")
    .select(
      "id, ordem, intervalo_valor, intervalo_unidade, canal, respeita_janela_comercial, conteudo, encerra_atendimento",
    )
    .eq("agenda_id", agendaId)
    .order("ordem");

  if (error) {
    throw new Error(`Falha ao carregar agenda_itens: ${error.message}`);
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    ordem: linha.ordem,
    intervaloValor: linha.intervalo_valor,
    intervaloUnidade: linha.intervalo_unidade,
    canal: linha.canal,
    respeitaJanelaComercial: linha.respeita_janela_comercial,
    conteudo: linha.conteudo,
    encerraAtendimento: linha.encerra_atendimento,
  }));
}

/**
 * Carrega a tabela de preço por faixa. Simplificação do MVP1: não filtra por produto porque só
 * existe um produto automatizado ainda (Limpeza de Nome) — quando o segundo produto ganhar tabela
 * própria, isto passa a receber um `produtoId`.
 */
export async function carregarFaixasPreco(): Promise<FaixaPreco[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("precos_por_faixa")
    .select(
      "faixa_min, faixa_max, preco_cheio, preco_avista, parcelas_boleto_qtd, parcelas_boleto_valor, parcelas_cartao_max, voucher_avista, voucher_parcelas_qtd, voucher_parcelas_valor",
    )
    .eq("ativo", true)
    .order("faixa_min");

  if (error) {
    throw new Error(`Falha ao carregar precos_por_faixa: ${error.message}`);
  }

  return (data ?? []).map((linha) => ({
    faixaMin: Number(linha.faixa_min),
    faixaMax: linha.faixa_max === null ? null : Number(linha.faixa_max),
    precoCheio: linha.preco_cheio === null ? null : Number(linha.preco_cheio),
    precoAvista: linha.preco_avista === null ? null : Number(linha.preco_avista),
    parcelasBoletoQtd: linha.parcelas_boleto_qtd,
    parcelasBoletoValor:
      linha.parcelas_boleto_valor === null ? null : Number(linha.parcelas_boleto_valor),
    parcelasCartaoMax: linha.parcelas_cartao_max,
    voucherAvista: linha.voucher_avista === null ? null : Number(linha.voucher_avista),
    voucherParcelasQtd: linha.voucher_parcelas_qtd,
    voucherParcelasValor:
      linha.voucher_parcelas_valor === null ? null : Number(linha.voucher_parcelas_valor),
  }));
}

/** Lê os valores configuráveis (`configuracoes`) e monta o objeto que regras-limpeza-nome.ts espera. Mesma simplificação de "produto único" acima. */
export async function carregarConfigPrecificacao(): Promise<ConfigPrecificacaoLimpaNome> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("configuracoes").select("chave, valor");

  if (error) {
    throw new Error(`Falha ao carregar configuracoes: ${error.message}`);
  }

  const porChave = Object.fromEntries((data ?? []).map((linha) => [linha.chave, linha.valor])) as Record<
    string,
    unknown
  >;

  const parcelado = porChave.limpanome_investimento_minimo_parcelado as
    | { qtd?: number; valor?: number }
    | undefined;
  const formula = porChave.limpanome_formula_alto_valor as
    | { valor_fixo?: number; percentual?: number }
    | undefined;

  return {
    investimentoMinimoAvista: Number(porChave.limpanome_investimento_minimo_avista ?? 0),
    investimentoMinimoParcelasQtd: Number(parcelado?.qtd ?? 0),
    investimentoMinimoParcelasValor: Number(parcelado?.valor ?? 0),
    altoValorFixo: Number(formula?.valor_fixo ?? 0),
    altoValorPercentual: Number(formula?.percentual ?? 0),
    corteAltoValor: Number(porChave.limpanome_corte_alto_valor ?? 0),
  };
}
