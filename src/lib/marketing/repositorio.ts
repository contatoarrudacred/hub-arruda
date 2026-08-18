// src/lib/marketing/repositorio.ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ConteudoGerado,
  ItemChecklistCarregado,
  PautaCarregada,
  PostCriado,
  PropriedadeCarregada,
  StatusPost,
} from "./tipos";

const CAMPOS_PAUTA =
  "id, matriz_conteudo_id, palavra_chave_principal, palavras_secundarias, angulo, geografia, tipo_conteudo, funil, status, tentativas, motivo_ultima_reprovacao";

const RECLAIM_MINUTOS = 10; // pauta em_producao com atualizado_em mais antigo que isto é considerada travada

function mapearPauta(data: {
  id: string;
  matriz_conteudo_id: string;
  palavra_chave_principal: string;
  palavras_secundarias: unknown;
  angulo: string;
  geografia: string | null;
  tipo_conteudo: PautaCarregada["tipoConteudo"];
  funil: PautaCarregada["funil"];
  status: PautaCarregada["status"];
  tentativas: number;
  motivo_ultima_reprovacao: string | null;
}): PautaCarregada {
  return {
    id: data.id,
    matrizConteudoId: data.matriz_conteudo_id,
    palavraChavePrincipal: data.palavra_chave_principal,
    palavrasSecundarias: (data.palavras_secundarias as string[]) ?? [],
    angulo: data.angulo,
    geografia: data.geografia,
    tipoConteudo: data.tipo_conteudo,
    funil: data.funil,
    status: data.status,
    tentativas: data.tentativas,
    motivoUltimaReprovacao: data.motivo_ultima_reprovacao,
  };
}

/**
 * Seleciona a próxima pauta a processar: pautas "pendente" normalmente, mas também faz reclaim de
 * pautas "em_producao" cujo atualizado_em seja mais antigo que RECLAIM_MINUTOS — sinal de que a
 * função de cron anterior morreu (timeout) no meio do processamento e deixou a pauta travada, sem
 * nada que a re-selecionasse. Duas queries separadas (uma por status) em vez de `.or()` porque cada
 * uma precisa da própria ordenação por prioridade_score/created_at; pendentes têm prioridade sobre
 * reclaims quando ambas existem.
 */
export async function selecionarProximaPautaPendente(matrizConteudoId: string): Promise<PautaCarregada | null> {
  const supabase = createAdminClient();

  const { data: pendente, error: erroPendente } = await supabase
    .from("pautas")
    .select(CAMPOS_PAUTA)
    .eq("matriz_conteudo_id", matrizConteudoId)
    .eq("status", "pendente")
    .order("prioridade_score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (erroPendente) throw new Error(`Falha ao selecionar próxima pauta: ${erroPendente.message}`);
  if (pendente) return mapearPauta(pendente);

  const limiteReclaim = new Date(Date.now() - RECLAIM_MINUTOS * 60 * 1000).toISOString();
  const { data: travada, error: erroTravada } = await supabase
    .from("pautas")
    .select(CAMPOS_PAUTA)
    .eq("matriz_conteudo_id", matrizConteudoId)
    .eq("status", "em_producao")
    .lt("atualizado_em", limiteReclaim)
    .order("prioridade_score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (erroTravada) throw new Error(`Falha ao selecionar pauta travada para reclaim: ${erroTravada.message}`);
  if (!travada) return null;

  return mapearPauta(travada);
}

export async function carregarPropriedade(propriedadeId: string): Promise<PropriedadeCarregada> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("propriedades_digitais")
    .select("id, nome, url_base, tipo_cms, config_pipeline")
    .eq("id", propriedadeId)
    .single();

  if (error || !data) throw new Error(`Falha ao carregar propriedade ${propriedadeId}: ${error?.message ?? "não encontrada"}`);

  const config = data.config_pipeline as { max_tentativas?: number };
  return {
    id: data.id,
    nome: data.nome,
    urlBase: data.url_base,
    tipoCms: data.tipo_cms,
    maxTentativas: config.max_tentativas ?? 3,
  };
}

export async function carregarChecklistAtivo(propriedadeId: string): Promise<ItemChecklistCarregado[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("checklist_qa_itens")
    .select("id, item, peso")
    .eq("propriedade_id", propriedadeId)
    .eq("ativo", true);

  if (error) throw new Error(`Falha ao carregar checklist da propriedade ${propriedadeId}: ${error.message}`);
  return (data ?? []).map((linha) => ({ id: linha.id, item: linha.item, peso: linha.peso }));
}

export async function marcarPautaEmProducao(pautaId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("pautas")
    .update({ status: "em_producao", atualizado_em: new Date().toISOString() })
    .eq("id", pautaId);
  if (error) throw new Error(`Falha ao marcar pauta ${pautaId} em produção: ${error.message}`);
}

export async function registrarReprovacaoPauta(pautaId: string, motivo: string): Promise<void> {
  const supabase = createAdminClient();
  const { data, error: erroLeitura } = await supabase.from("pautas").select("tentativas").eq("id", pautaId).single();
  if (erroLeitura || !data) throw new Error(`Falha ao ler tentativas da pauta ${pautaId}: ${erroLeitura?.message}`);

  const { error } = await supabase
    .from("pautas")
    .update({
      status: "pendente",
      tentativas: data.tentativas + 1,
      motivo_ultima_reprovacao: motivo,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", pautaId);
  if (error) throw new Error(`Falha ao registrar reprovação da pauta ${pautaId}: ${error.message}`);
}

export async function marcarPautaBloqueada(pautaId: string, motivo: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("pautas")
    .update({ status: "bloqueada", motivo_ultima_reprovacao: motivo, atualizado_em: new Date().toISOString() })
    .eq("id", pautaId);
  if (error) throw new Error(`Falha ao bloquear pauta ${pautaId}: ${error.message}`);
}

export async function marcarPautaPublicada(pautaId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("pautas")
    .update({ status: "publicado", atualizado_em: new Date().toISOString() })
    .eq("id", pautaId);
  if (error) throw new Error(`Falha ao marcar pauta ${pautaId} como publicada: ${error.message}`);
}

export async function criarPost(params: {
  pautaId: string;
  propriedadeId: string;
  conteudo: ConteudoGerado;
  scoreQa: number;
}): Promise<PostCriado> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("posts")
    .insert({
      pauta_id: params.pautaId,
      propriedade_id: params.propriedadeId,
      titulo: params.conteudo.titulo,
      conteudo_html: params.conteudo.conteudoHtml,
      meta_title: params.conteudo.metaTitle,
      meta_description: params.conteudo.metaDescription,
      slug: params.conteudo.slug,
      score_qa: params.scoreQa,
      status: "rascunho",
    })
    .select("id, pauta_id, propriedade_id, status")
    .single();

  if (error || !data) throw new Error(`Falha ao criar post para pauta ${params.pautaId}: ${error?.message}`);
  return { id: data.id, pautaId: data.pauta_id, propriedadeId: data.propriedade_id, status: data.status };
}

export async function atualizarStatusPost(
  postId: string,
  status: StatusPost,
  extra?: { canais?: Record<string, unknown>; publicadoEm?: string },
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("posts")
    .update({
      status,
      ...(extra?.canais ? { canais: extra.canais } : {}),
      ...(extra?.publicadoEm ? { publicado_em: extra.publicadoEm } : {}),
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", postId);
  if (error) throw new Error(`Falha ao atualizar status do post ${postId}: ${error.message}`);
}
