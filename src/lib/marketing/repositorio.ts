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

export async function selecionarProximaPautaPendente(matrizConteudoId: string): Promise<PautaCarregada | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pautas")
    .select(
      "id, matriz_conteudo_id, palavra_chave_principal, palavras_secundarias, angulo, geografia, tipo_conteudo, funil, status, tentativas, motivo_ultima_reprovacao",
    )
    .eq("matriz_conteudo_id", matrizConteudoId)
    .eq("status", "pendente")
    .order("prioridade_score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Falha ao selecionar próxima pauta: ${error.message}`);
  if (!data) return null;

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
  const { error } = await supabase.from("pautas").update({ status: "em_producao" }).eq("id", pautaId);
  if (error) throw new Error(`Falha ao marcar pauta ${pautaId} em produção: ${error.message}`);
}

export async function registrarReprovacaoPauta(pautaId: string, motivo: string): Promise<void> {
  const supabase = createAdminClient();
  const { data, error: erroLeitura } = await supabase.from("pautas").select("tentativas").eq("id", pautaId).single();
  if (erroLeitura || !data) throw new Error(`Falha ao ler tentativas da pauta ${pautaId}: ${erroLeitura?.message}`);

  const { error } = await supabase
    .from("pautas")
    .update({ status: "pendente", tentativas: data.tentativas + 1, motivo_ultima_reprovacao: motivo })
    .eq("id", pautaId);
  if (error) throw new Error(`Falha ao registrar reprovação da pauta ${pautaId}: ${error.message}`);
}

export async function marcarPautaBloqueada(pautaId: string, motivo: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("pautas")
    .update({ status: "bloqueada", motivo_ultima_reprovacao: motivo })
    .eq("id", pautaId);
  if (error) throw new Error(`Falha ao bloquear pauta ${pautaId}: ${error.message}`);
}

export async function marcarPautaPublicada(pautaId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("pautas").update({ status: "publicado" }).eq("id", pautaId);
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
