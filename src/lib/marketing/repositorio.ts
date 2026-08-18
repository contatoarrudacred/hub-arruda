// src/lib/marketing/repositorio.ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { cifrar } from "./criptografia";
import type {
  ConteudoGerado,
  DadosItemChecklist,
  DadosMatriz,
  DadosPropriedade,
  EtapaLog,
  ItemChecklistAdmin,
  ItemChecklistCarregado,
  JanelaPublicacao,
  MatrizAdmin,
  PautaCarregada,
  PersonaFormulario,
  PostAdmin,
  PostCriado,
  PostRelacionado,
  PropriedadeAdmin,
  PropriedadeCarregada,
  ResumoPropriedade,
  ResumoVisaoGeral,
  StatusPauta,
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

  // Reclaim conta como tentativa — sem isto, uma pauta que sempre mata a função (ex.: host de
  // WordPress que sempre dá timeout) seria re-selecionada a cada 10min pra sempre, com tentativas
  // congelado, nunca batendo em propriedade.maxTentativas (o circuit breaker do pipeline) e
  // queimando tokens da Anthropic indefinidamente. Select-then-update (não atômico) é o mesmo
  // padrão já usado em registrarReprovacaoPauta logo acima — aceitável porque o lock por matriz
  // no cron garante no máximo um processo mexendo nesta pauta por vez.
  const tentativasIncrementadas = travada.tentativas + 1;
  const { error: erroIncrementoReclaim } = await supabase
    .from("pautas")
    .update({ tentativas: tentativasIncrementadas })
    .eq("id", travada.id);
  if (erroIncrementoReclaim) {
    throw new Error(`Falha ao incrementar tentativas da pauta travada ${travada.id} durante reclaim: ${erroIncrementoReclaim.message}`);
  }

  return mapearPauta({ ...travada, tentativas: tentativasIncrementadas });
}

export async function carregarPropriedade(propriedadeId: string): Promise<PropriedadeCarregada> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("propriedades_digitais")
    .select("id, nome, url_base, tipo_cms, config_pipeline")
    .eq("id", propriedadeId)
    .single();

  if (error || !data) throw new Error(`Falha ao carregar propriedade ${propriedadeId}: ${error?.message ?? "não encontrada"}`);

  // Reaproveita o mesmo parser de config_pipeline usado pelas telas de admin (mapearConfigPipeline,
  // definido mais abaixo neste arquivo) — evita duas leituras divergentes do mesmo jsonb.
  const config = mapearConfigPipeline(data.config_pipeline);
  return {
    id: data.id,
    nome: data.nome,
    urlBase: data.url_base,
    tipoCms: data.tipo_cms,
    maxTentativas: config.maxTentativas,
    postsPorDia: config.postsPorDia ?? undefined,
    janelaPublicacao: config.janelaPublicacao ?? undefined,
  };
}

/**
 * Conta posts "publicado" da propriedade desde um instante (ISO com offset) — usado pelo gating de
 * cota diária (cotaDiariaAtingida em processar-pauta.ts). `desdeIso` já vem pronto (início do dia
 * civil em horário de Brasília, calculado pelo chamador) — este repositório só executa a contagem.
 */
export async function contarPostsPublicadosDesde(propriedadeId: string, desdeIso: string): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("propriedade_id", propriedadeId)
    .eq("status", "publicado")
    .gte("publicado_em", desdeIso);
  if (error) throw new Error(`Falha ao contar posts publicados da propriedade ${propriedadeId}: ${error.message}`);
  return count ?? 0;
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

/**
 * Até 6 posts publicados da mesma propriedade, mais recentes primeiro — usados pelo Agente de
 * Links (src/lib/marketing/links.ts) pra montar a seção "Posts relacionados" ao final do artigo.
 * A URL vem de canais.wordpress.url (jsonb), preenchido em atualizarStatusPost no momento da
 * publicação; posts sem essa URL (não deveria acontecer pra status "publicado", mas por segurança)
 * são descartados.
 */
export async function carregarPostsPublicadosDaPropriedade(
  propriedadeId: string,
  excluirPostId?: string,
): Promise<PostRelacionado[]> {
  const supabase = createAdminClient();
  // O .limit() roda ANTES do filtro por url válida (abaixo) — se buscássemos só 6 e alguns viessem
  // sem url, poderíamos acabar com menos de 6 válidos mesmo havendo 6+ de verdade disponíveis.
  // Busca uma margem maior (12) e só depois filtra/corta pros 6 finais.
  const LIMITE_BUSCA = 12;
  const MAXIMO_RELACIONADOS = 6;

  let query = supabase
    .from("posts")
    .select("titulo, canais, publicado_em")
    .eq("propriedade_id", propriedadeId)
    .eq("status", "publicado")
    .order("publicado_em", { ascending: false })
    .limit(LIMITE_BUSCA);

  if (excluirPostId) {
    query = query.neq("id", excluirPostId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao carregar posts publicados da propriedade ${propriedadeId}: ${error.message}`);

  return (data ?? [])
    .map((linha) => {
      const canais = linha.canais as { wordpress?: { url?: string } } | null;
      return { titulo: linha.titulo as string, url: canais?.wordpress?.url ?? "" };
    })
    .filter((post) => post.url !== "")
    .slice(0, MAXIMO_RELACIONADOS);
}

export async function atualizarStatusPost(
  postId: string,
  status: StatusPost,
  extra?: { canais?: Record<string, unknown>; publicadoEm?: string; conteudoHtml?: string },
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("posts")
    .update({
      status,
      ...(extra?.canais ? { canais: extra.canais } : {}),
      ...(extra?.publicadoEm ? { publicado_em: extra.publicadoEm } : {}),
      // Grava o HTML final de verdade publicado (com links internos + sanitização já aplicados) —
      // sem isto, posts.conteudo_html ficava com a saída crua do Escritor, diferente do que
      // realmente está no ar no WordPress (auditoria/republicação futura leriam um documento errado).
      ...(extra?.conteudoHtml ? { conteudo_html: extra.conteudoHtml } : {}),
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", postId);
  if (error) throw new Error(`Falha ao atualizar status do post ${postId}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Telas de admin (Fase 2) — CRUD de configuração (propriedades, matrizes, personas,
// checklist) + leitura pras telas de operação (fila de pautas, posts, visão geral) +
// registrarEtapa (log de execução, usada pela Task 5, não pelas telas). Ver
// docs/superpowers/specs/2026-08-18-pipeline-conteudo-marketing-telas-design.md.
// ---------------------------------------------------------------------------

function mapearConfigPipeline(bruto: unknown): {
  maxTentativas: number;
  postsPorDia: number | null;
  janelaPublicacao: JanelaPublicacao | null;
} {
  const config = (bruto as { max_tentativas?: number; posts_por_dia?: number | null; janela_publicacao?: JanelaPublicacao | null }) ?? {};
  return {
    maxTentativas: config.max_tentativas ?? 3,
    postsPorDia: config.posts_por_dia ?? null,
    janelaPublicacao: config.janela_publicacao ?? null,
  };
}

/**
 * Nunca inclui a senha (nem cifrada nem decifrada) no que volta pra tela — só se um canal está
 * configurado ou não. Ver seção 8 da spec: campo de senha na UI é sempre write-only.
 */
function mapearCredenciais(bruto: unknown): PropriedadeAdmin["credenciais"] {
  const credenciais = (bruto as Record<string, { usuario?: string; senha_cifrada?: string }>) ?? {};
  const resultado: PropriedadeAdmin["credenciais"] = {};
  for (const [canal, valor] of Object.entries(credenciais)) {
    resultado[canal] = { usuario: valor?.usuario ?? null, senhaConfigurada: Boolean(valor?.senha_cifrada) };
  }
  return resultado;
}

function mapearPropriedadeAdmin(data: {
  id: string;
  nome: string;
  url_base: string;
  tipo_cms: PropriedadeAdmin["tipoCms"];
  ativo: boolean;
  config_pipeline: unknown;
  credenciais_canais: unknown;
}): PropriedadeAdmin {
  const config = mapearConfigPipeline(data.config_pipeline);
  return {
    id: data.id,
    nome: data.nome,
    urlBase: data.url_base,
    tipoCms: data.tipo_cms,
    ativo: data.ativo,
    maxTentativas: config.maxTentativas,
    postsPorDia: config.postsPorDia,
    janelaPublicacao: config.janelaPublicacao,
    credenciais: mapearCredenciais(data.credenciais_canais),
  };
}

const CAMPOS_PROPRIEDADE_ADMIN = "id, nome, url_base, tipo_cms, ativo, config_pipeline, credenciais_canais";

export async function listarPropriedades(): Promise<PropriedadeAdmin[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("propriedades_digitais").select(CAMPOS_PROPRIEDADE_ADMIN).order("nome", { ascending: true });
  if (error) throw new Error(`Falha ao listar propriedades: ${error.message}`);
  return (data ?? []).map((linha) => mapearPropriedadeAdmin(linha as Parameters<typeof mapearPropriedadeAdmin>[0]));
}

/**
 * Cria (sem `dados.id`) ou atualiza uma propriedade. Em atualização, lê o config_pipeline atual
 * antes de gravar e faz merge dos campos novos (max_tentativas/posts_por_dia/janela_publicacao)
 * por cima — sem isto, salvar o formulário desta tela apagaria silenciosamente
 * `canais_distribuicao` (chave do mesmo jsonb, gerenciada por outra frente, distribuição
 * multi-canal) toda vez que o Luiz editasse o nome de uma propriedade.
 *
 * `pessoaId`/`unidadeNegocioId`: a constraint `chk_propriedade_tem_dono` do banco exige pelo
 * menos um dos dois preenchido na criação — a validação de qual/se foi informado é
 * responsabilidade da action da tela (Task 7), este repositório só repassa o que vier.
 */
export async function salvarPropriedade(dados: DadosPropriedade): Promise<PropriedadeAdmin> {
  const supabase = createAdminClient();

  let configPipelineExistente: Record<string, unknown> = {};
  if (dados.id) {
    const { data: atual, error: erroLeitura } = await supabase
      .from("propriedades_digitais")
      .select("config_pipeline")
      .eq("id", dados.id)
      .single();
    if (erroLeitura || !atual) {
      throw new Error(`Falha ao carregar propriedade ${dados.id} para atualização: ${erroLeitura?.message ?? "não encontrada"}`);
    }
    configPipelineExistente = (atual.config_pipeline as Record<string, unknown>) ?? {};
  }

  const configPipeline = {
    ...configPipelineExistente,
    max_tentativas: dados.maxTentativas,
    posts_por_dia: dados.postsPorDia ?? null,
    janela_publicacao: dados.janelaPublicacao ?? null,
  };

  const linha = {
    nome: dados.nome,
    url_base: dados.urlBase,
    tipo_cms: dados.tipoCms,
    ativo: dados.ativo ?? true,
    config_pipeline: configPipeline,
    ...(dados.pessoaId !== undefined ? { pessoa_id: dados.pessoaId } : {}),
    ...(dados.unidadeNegocioId !== undefined ? { unidade_negocio_id: dados.unidadeNegocioId } : {}),
  };

  const query = dados.id
    ? supabase.from("propriedades_digitais").update(linha).eq("id", dados.id)
    : supabase.from("propriedades_digitais").insert(linha);

  const { data, error } = await query.select(CAMPOS_PROPRIEDADE_ADMIN).single();
  if (error || !data) throw new Error(`Falha ao salvar propriedade "${dados.nome}": ${error?.message ?? "sem retorno"}`);
  return mapearPropriedadeAdmin(data as Parameters<typeof mapearPropriedadeAdmin>[0]);
}

/**
 * `senhaPlana` vazia = mantém a credencial cifrada já salva (write-only na tela — o campo de
 * senha nunca vem preenchido com o valor salvo, então "não digitou nada" precisa significar
 * "não mexer", não "apagar a senha"). `usuario` vazio se comporta igual: só sobrescreve se
 * vier preenchido.
 */
export async function salvarCredencialCanal(propriedadeId: string, canal: string, usuario: string, senhaPlana: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: atual, error: erroLeitura } = await supabase
    .from("propriedades_digitais")
    .select("credenciais_canais")
    .eq("id", propriedadeId)
    .single();
  if (erroLeitura || !atual) {
    throw new Error(`Falha ao carregar credenciais da propriedade ${propriedadeId}: ${erroLeitura?.message ?? "não encontrada"}`);
  }

  const credenciaisAtuais = (atual.credenciais_canais as Record<string, { usuario?: string; senha_cifrada?: string }>) ?? {};
  const credencialAtualDoCanal = credenciaisAtuais[canal] ?? {};

  const credenciais = {
    ...credenciaisAtuais,
    [canal]: {
      usuario: usuario || credencialAtualDoCanal.usuario || "",
      senha_cifrada: senhaPlana ? cifrar(senhaPlana) : credencialAtualDoCanal.senha_cifrada,
    },
  };

  const { error } = await supabase.from("propriedades_digitais").update({ credenciais_canais: credenciais }).eq("id", propriedadeId);
  if (error) throw new Error(`Falha ao salvar credencial do canal ${canal} da propriedade ${propriedadeId}: ${error.message}`);
}

function mapearMatrizAdmin(data: { id: string; propriedade_id: string; nome: string; ativo: boolean; eixos: unknown }): MatrizAdmin {
  const eixos = (data.eixos as { temas?: string[]; angulos?: string[]; geografias?: string[] | null }) ?? {};
  return {
    id: data.id,
    propriedadeId: data.propriedade_id,
    nome: data.nome,
    ativo: data.ativo,
    temas: eixos.temas ?? [],
    angulos: eixos.angulos ?? [],
    geografias: eixos.geografias ?? null,
  };
}

const CAMPOS_MATRIZ_ADMIN = "id, propriedade_id, nome, ativo, eixos";

export async function listarMatrizes(propriedadeId: string): Promise<MatrizAdmin[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("matrizes_conteudo")
    .select(CAMPOS_MATRIZ_ADMIN)
    .eq("propriedade_id", propriedadeId)
    .order("nome", { ascending: true });
  if (error) throw new Error(`Falha ao listar matrizes da propriedade ${propriedadeId}: ${error.message}`);
  return (data ?? []).map((linha) => mapearMatrizAdmin(linha as Parameters<typeof mapearMatrizAdmin>[0]));
}

/**
 * Só nome/ativo são editáveis nesta fase (Task 8) — `eixos` (temas/ângulos/geografias) fica de
 * fora do payload de update de propósito, preservando o que já estiver lá (populado pelo
 * Construtor de Matriz, ainda não construído, ou inserido direto no banco).
 */
export async function salvarMatriz(dados: DadosMatriz): Promise<MatrizAdmin> {
  const supabase = createAdminClient();
  const linha = { propriedade_id: dados.propriedadeId, nome: dados.nome, ativo: dados.ativo ?? true };

  const query = dados.id
    ? supabase.from("matrizes_conteudo").update(linha).eq("id", dados.id)
    : supabase.from("matrizes_conteudo").insert(linha);

  const { data, error } = await query.select(CAMPOS_MATRIZ_ADMIN).single();
  if (error || !data) throw new Error(`Falha ao salvar matriz "${dados.nome}": ${error?.message ?? "sem retorno"}`);
  return mapearMatrizAdmin(data as Parameters<typeof mapearMatrizAdmin>[0]);
}

export async function carregarPersona(matrizId: string): Promise<PersonaFormulario | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("matrizes_conteudo").select("eixos").eq("id", matrizId).single();
  if (error || !data) throw new Error(`Falha ao carregar persona da matriz ${matrizId}: ${error?.message ?? "não encontrada"}`);

  const eixos = (data.eixos as { persona?: Partial<PersonaFormulario> }) ?? {};
  if (!eixos.persona) return null;

  const persona = eixos.persona;
  return {
    nome: persona.nome ?? "",
    perfilDemografico: persona.perfilDemografico ?? "",
    tomDeVoz: persona.tomDeVoz ?? "",
    nivelConhecimento: persona.nivelConhecimento ?? "iniciante",
    doresNecessidades: persona.doresNecessidades ?? "",
    objecoesTipicas: persona.objecoesTipicas ?? [],
    vocabularioPreferido: persona.vocabularioPreferido ?? [],
    vocabularioEvitar: persona.vocabularioEvitar ?? [],
  };
}

/**
 * Mescla a persona só na chave `eixos.persona` — lê o `eixos` inteiro primeiro e escreve de
 * volta com o resto intacto. Gravar `{ eixos: { persona } }` direto (sem ler antes) apagaria
 * `temas`/`angulos`/`geografias` já preenchidos por matriz, porque `eixos` é uma coluna jsonb
 * única (update substitui o valor inteiro, não faz merge automático de chaves).
 */
export async function salvarPersona(matrizId: string, persona: PersonaFormulario): Promise<void> {
  const supabase = createAdminClient();
  const { data: atual, error: erroLeitura } = await supabase.from("matrizes_conteudo").select("eixos").eq("id", matrizId).single();
  if (erroLeitura || !atual) {
    throw new Error(`Falha ao carregar eixos da matriz ${matrizId} para salvar persona: ${erroLeitura?.message ?? "não encontrada"}`);
  }

  const eixosAtuais = (atual.eixos as Record<string, unknown>) ?? {};
  const eixos = { ...eixosAtuais, persona };

  const { error } = await supabase.from("matrizes_conteudo").update({ eixos }).eq("id", matrizId);
  if (error) throw new Error(`Falha ao salvar persona da matriz ${matrizId}: ${error.message}`);
}

export async function listarChecklistPorPropriedade(propriedadeId: string): Promise<ItemChecklistAdmin[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("checklist_qa_itens")
    .select("id, propriedade_id, item, peso, ativo")
    .eq("propriedade_id", propriedadeId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Falha ao listar checklist da propriedade ${propriedadeId}: ${error.message}`);
  return (data ?? []).map((linha) => ({
    id: linha.id as string,
    propriedadeId: linha.propriedade_id as string,
    item: linha.item as string,
    peso: linha.peso as number,
    ativo: linha.ativo as boolean,
  }));
}

export async function salvarItemChecklist(dados: DadosItemChecklist): Promise<ItemChecklistAdmin> {
  const supabase = createAdminClient();
  const linha = { propriedade_id: dados.propriedadeId, item: dados.item, peso: dados.peso, ativo: dados.ativo ?? true };

  const query = dados.id
    ? supabase.from("checklist_qa_itens").update(linha).eq("id", dados.id)
    : supabase.from("checklist_qa_itens").insert(linha);

  const { data, error } = await query.select("id, propriedade_id, item, peso, ativo").single();
  if (error || !data) throw new Error(`Falha ao salvar item de checklist "${dados.item}": ${error?.message ?? "sem retorno"}`);
  return { id: data.id, propriedadeId: data.propriedade_id, item: data.item, peso: data.peso, ativo: data.ativo };
}

export async function excluirItemChecklist(itemId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("checklist_qa_itens").delete().eq("id", itemId);
  if (error) throw new Error(`Falha ao excluir item de checklist ${itemId}: ${error.message}`);
}

/**
 * `propriedadeId` filtra via join com matrizes_conteudo (pautas não tem propriedade_id direto,
 * só matriz_conteudo_id) — `!inner` porque o filtro por coluna do recurso embutido
 * (`matrizes_conteudo.propriedade_id`) só funciona no PostgREST quando o embed é inner join.
 */
export async function listarPautasPorStatus(status?: StatusPauta, propriedadeId?: string): Promise<PautaCarregada[]> {
  const supabase = createAdminClient();
  // Tipado explicitamente como `string` (não literal) — senão o supabase-js tenta fazer parse
  // estático da string de select (magia de tipos por template literal) e falha ao reconhecer o
  // embed `matrizes_conteudo!inner(...)`, quebrando a inferência de tipo do retorno.
  const campos: string = propriedadeId ? `${CAMPOS_PAUTA}, matrizes_conteudo!inner(propriedade_id)` : CAMPOS_PAUTA;
  let query = supabase.from("pautas").select(campos);

  if (status) query = query.eq("status", status);
  if (propriedadeId) query = query.eq("matrizes_conteudo.propriedade_id", propriedadeId);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao listar pautas por status: ${error.message}`);
  return (data ?? []).map((linha) => mapearPauta(linha as unknown as Parameters<typeof mapearPauta>[0]));
}

/** Reabre pra `pendente` e limpa o motivo de reprovação — deliberadamente não mexe em `tentativas`
 * (histórico de quantas vezes já tentou continua contando pro circuit breaker de maxTentativas). */
export async function reabrirPauta(pautaId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("pautas")
    .update({ status: "pendente", motivo_ultima_reprovacao: null, atualizado_em: new Date().toISOString() })
    .eq("id", pautaId);
  if (error) throw new Error(`Falha ao reabrir pauta ${pautaId}: ${error.message}`);
}

export async function listarPostsPublicados(propriedadeId?: string): Promise<PostAdmin[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("posts")
    .select("id, titulo, canais, score_qa, publicado_em, tentativas")
    .eq("status", "publicado")
    .order("publicado_em", { ascending: false });

  if (propriedadeId) query = query.eq("propriedade_id", propriedadeId);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao listar posts publicados: ${error.message}`);
  return (data ?? []).map((linha) => {
    const canais = linha.canais as { wordpress?: { url?: string } } | null;
    return {
      id: linha.id as string,
      titulo: linha.titulo as string,
      url: canais?.wordpress?.url ?? "",
      scoreQa: linha.score_qa as number | null,
      publicadoEm: linha.publicado_em as string | null,
      tentativas: linha.tentativas as number,
    };
  });
}

/**
 * Envolve uma etapa do pipeline com uma linha de log (início/fim/sucesso/detalhes) —
 * ver spec seção 6. Usada pela Task 5, não pelas telas.
 *
 * Decisão deliberada: falha ao GRAVAR o log (insert ou update) nunca impede a etapa de negócio
 * de rodar nem mascara o resultado dela — só grava um `console.error` e segue. Log é
 * observabilidade, não pode virar um novo ponto de falha do pipeline de publicação (isso é
 * especialmente relevante agora: a tabela pautas_execucao_log ainda não existe em produção,
 * migration pendente de aplicação — ver Task 1). O erro de `fn()`, esse sim, sempre repropaga.
 */
export async function registrarEtapa<T>(pautaId: string, etapa: EtapaLog, fn: () => Promise<T>): Promise<T> {
  const supabase = createAdminClient();
  const { data: log, error: erroInsercao } = await supabase
    .from("pautas_execucao_log")
    .insert({ pauta_id: pautaId, etapa })
    .select("id")
    .single();
  if (erroInsercao || !log) {
    console.error(`Falha ao registrar início da etapa ${etapa} da pauta ${pautaId}: ${erroInsercao?.message ?? "sem retorno"}`);
  }

  try {
    const resultado = await fn();
    if (log) {
      const { error } = await supabase
        .from("pautas_execucao_log")
        .update({ concluido_em: new Date().toISOString(), sucesso: true })
        .eq("id", log.id);
      if (error) console.error(`Falha ao registrar conclusão da etapa ${etapa} da pauta ${pautaId}: ${error.message}`);
    }
    return resultado;
  } catch (erroEtapa) {
    if (log) {
      const detalhes = erroEtapa instanceof Error ? erroEtapa.message : "Erro desconhecido";
      const { error } = await supabase
        .from("pautas_execucao_log")
        .update({ concluido_em: new Date().toISOString(), sucesso: false, detalhes })
        .eq("id", log.id);
      if (error) console.error(`Falha ao registrar falha da etapa ${etapa} da pauta ${pautaId}: ${error.message}`);
    }
    throw erroEtapa;
  }
}

/**
 * Contagens + custo pra tela Visão Geral. Decisões de escopo (documentadas no relatório da
 * task): "taxa de aprovação do Revisor" = aprovados / total de execuções concluídas da etapa
 * "revisar" (não distingue reprovação por score baixo de erro técnico); "custo acumulado" =
 * soma de tokens_entrada/tokens_saida de TODO o histórico em pautas_execucao_log (não filtrado
 * por período — a Task 12 usa isso só como tokens brutos, sem preço em R$).
 */
export async function carregarResumoVisaoGeral(): Promise<ResumoVisaoGeral> {
  const supabase = createAdminClient();

  const { data: propriedades, error: erroPropriedades } = await supabase.from("propriedades_digitais").select("id, nome").eq("ativo", true);
  if (erroPropriedades) throw new Error(`Falha ao carregar propriedades para o resumo: ${erroPropriedades.message}`);

  const { data: matrizes, error: erroMatrizes } = await supabase.from("matrizes_conteudo").select("id, propriedade_id");
  if (erroMatrizes) throw new Error(`Falha ao carregar matrizes para o resumo: ${erroMatrizes.message}`);

  const { data: pautas, error: erroPautas } = await supabase
    .from("pautas")
    .select("matriz_conteudo_id, status")
    .in("status", ["pendente", "em_producao", "bloqueada"]);
  if (erroPautas) throw new Error(`Falha ao carregar pautas para o resumo: ${erroPautas.message}`);

  const propriedadeIdPorMatriz = new Map((matrizes ?? []).map((m) => [m.id as string, m.propriedade_id as string]));

  const porPropriedade = new Map<string, ResumoPropriedade>();
  for (const propriedade of propriedades ?? []) {
    porPropriedade.set(propriedade.id as string, {
      propriedadeId: propriedade.id as string,
      propriedadeNome: propriedade.nome as string,
      pendentes: 0,
      emProducao: 0,
      bloqueadas: 0,
    });
  }
  for (const pauta of pautas ?? []) {
    const propriedadeId = propriedadeIdPorMatriz.get(pauta.matriz_conteudo_id as string);
    const resumo = propriedadeId ? porPropriedade.get(propriedadeId) : undefined;
    if (!resumo) continue;
    if (pauta.status === "pendente") resumo.pendentes += 1;
    else if (pauta.status === "em_producao") resumo.emProducao += 1;
    else if (pauta.status === "bloqueada") resumo.bloqueadas += 1;
  }

  const inicioDaSemana = new Date();
  inicioDaSemana.setDate(inicioDaSemana.getDate() - 7);
  const { count: publicadosNaSemana, error: erroPosts } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("status", "publicado")
    .gte("publicado_em", inicioDaSemana.toISOString());
  if (erroPosts) throw new Error(`Falha ao contar posts publicados na semana: ${erroPosts.message}`);

  const { data: revisoes, error: erroRevisoes } = await supabase
    .from("pautas_execucao_log")
    .select("sucesso")
    .eq("etapa", "revisar")
    .not("concluido_em", "is", null);
  if (erroRevisoes) throw new Error(`Falha ao carregar histórico de revisões para o resumo: ${erroRevisoes.message}`);

  const totalRevisoes = (revisoes ?? []).length;
  const aprovadas = (revisoes ?? []).filter((r) => r.sucesso === true).length;
  const taxaAprovacaoRevisor = totalRevisoes > 0 ? aprovadas / totalRevisoes : null;

  const { data: tokens, error: erroTokens } = await supabase.from("pautas_execucao_log").select("tokens_entrada, tokens_saida");
  if (erroTokens) throw new Error(`Falha ao carregar tokens acumulados para o resumo: ${erroTokens.message}`);

  const tokensEntradaTotal = (tokens ?? []).reduce((soma, linha) => soma + ((linha.tokens_entrada as number) ?? 0), 0);
  const tokensSaidaTotal = (tokens ?? []).reduce((soma, linha) => soma + ((linha.tokens_saida as number) ?? 0), 0);

  return {
    porPropriedade: Array.from(porPropriedade.values()),
    publicadosNaSemana: publicadosNaSemana ?? 0,
    taxaAprovacaoRevisor,
    tokensEntradaTotal,
    tokensSaidaTotal,
  };
}
