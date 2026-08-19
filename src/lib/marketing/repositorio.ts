// src/lib/marketing/repositorio.ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { cifrar } from "./criptografia";
import type {
  ConteudoGerado,
  DadosItemChecklist,
  DadosMatriz,
  DadosPropriedade,
  DuracaoMediaPorEtapa,
  EtapaConcluida,
  EtapaEmAndamento,
  EtapaLog,
  FunilPauta,
  ItemChecklistAdmin,
  ItemChecklistCarregado,
  JanelaPublicacao,
  MatrizAdmin,
  PautaCarregada,
  PersonaAtiva,
  PersonaCarregada,
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
  TipoConteudo,
} from "./tipos";

const CAMPOS_PAUTA =
  "id, matriz_conteudo_id, palavra_chave_principal, palavras_secundarias, angulo, geografia, tipo_conteudo, funil, status, tentativas, motivo_ultima_reprovacao";

// Pauta em_producao com atualizado_em mais antigo que isto é considerada travada (reclaim). Exportada
// porque a tela Monitor de execução (Task 13, src/app/admin/(shell)/marketing/monitor/) reusa o
// MESMO limiar pra distinguir "em andamento de verdade" de "possivelmente travada" numa etapa de
// pautas_execucao_log sem concluido_em — ver spec seção 6. monitor-client.tsx é "use client" e este
// arquivo é `server-only`, então o valor chega até lá via prop passada pelo page.tsx (Server
// Component), não por import direto.
export const RECLAIM_MINUTOS = 10;

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

/**
 * Lista as unidades de negócio pro seletor de "dono" da propriedade na tela de Propriedades
 * Digitais (Task 7) — a constraint `chk_propriedade_tem_dono` do banco exige `pessoa_id` OU
 * `unidade_negocio_id` preenchido em `propriedades_digitais`; esta tela só oferece o segundo
 * (decisão YAGNI registrada no brief da Task 7 — todas as propriedades de hoje são internas).
 * Mesma tabela já usada por src/lib/vendas/fornecedores.ts.
 */
export async function listarUnidadesNegocio(): Promise<{ id: string; nome: string }[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("unidades_negocio").select("id, nome").order("nome", { ascending: true });
  if (error) throw new Error(`Falha ao listar unidades de negócio: ${error.message}`);
  return (data ?? []).map((linha) => ({ id: linha.id as string, nome: linha.nome as string }));
}

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
  const eixos = (data.eixos as { temas?: string[]; angulos?: string[]; geografias?: string[] | null; sazonalidade?: string[] }) ?? {};
  return {
    id: data.id,
    propriedadeId: data.propriedade_id,
    nome: data.nome,
    ativo: data.ativo,
    temas: eixos.temas ?? [],
    angulos: eixos.angulos ?? [],
    geografias: eixos.geografias ?? null,
    sazonalidade: eixos.sazonalidade ?? [],
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

/**
 * Renomeada de `carregarPersona` pra `carregarPersonaFormulario` (Fase 3, Task 2, 18/08/2026) —
 * a Fase 3 introduz um `carregarPersona(personaId): Promise<PersonaCarregada>` novo (modelo de
 * persona rica, tabela `personas`), e o nome `carregarPersona` já estava ocupado por esta função
 * antiga (persona de 8 campos em `matrizes_conteudo.eixos.persona`, Fase 2). Duas funções com o
 * mesmo nome e assinaturas incompatíveis não compilam — o nome novo ficou com o contrato que as
 * Tasks 3/5/6 (ainda não construídas) já assumem literalmente no plano mestre; esta, marcada
 * obsoleta pela spec de personas ricas (seção 9, "Pendências" — decidir separadamente o destino
 * da tela `configuracoes/marketing/personas/`), cedeu o nome.
 */
export async function carregarPersonaFormulario(matrizId: string): Promise<PersonaFormulario | null> {
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

// ---------------------------------------------------------------------------
// Fase 3 (personas ricas) — Task 2. Ver
// docs/superpowers/specs/2026-08-18-personas-ricas-geracao-por-persona-design.md seções 3 e 5.
// Substitui o modelo "1 persona por matriz" (funções acima, PersonaFormulario) por N personas
// ricas por propriedade (tabela `personas`), sorteadas a cada pauta pelo Estrategista (Task 4).
// ---------------------------------------------------------------------------

/**
 * Personas ativas da propriedade, prontas pro sorteio ponderado do Estrategista (Task 4) — spec
 * seção 5. Duas queries: (1) personas ativas da propriedade, (2) TODAS as pautas dessas personas
 * (persona_id, angulo, created_at) numa única chamada com `.in()`, em vez de 1 query por persona —
 * evita N+1 quando a propriedade tem muitas personas ativas.
 *
 * `angulosProntos` é `angulos_prontos` (jsonb da persona) MENOS o conjunto de ângulos já usados
 * por ela em `pautas` — subtração de conjunto, não um filtro de linha. `[]` não é erro: é o sinal
 * que a Task 4 usa pra decidir ir pro fallback de IA (Gerador de Ângulo, Task 3) pra essa persona.
 *
 * `usadaPelaUltimaVezEm` é o `created_at` mais recente entre as pautas da persona (comparação de
 * string funciona porque ISO 8601 com mesma largura ordena lexicograficamente igual a
 * cronologicamente), ou `null` se a persona nunca gerou pauta — usado pelo sorteio ponderado
 * "menos usada recentemente tem mais peso" (spec seção 5), decisão que fica na Task 4, não aqui.
 */
export async function listarPersonasAtivasComAngulosDisponiveis(propriedadeId: string): Promise<PersonaAtiva[]> {
  const supabase = createAdminClient();
  const { data: personas, error: erroPersonas } = await supabase
    .from("personas")
    .select("id, nome, angulos_prontos")
    .eq("propriedade_id", propriedadeId)
    .eq("ativo", true);
  if (erroPersonas) throw new Error(`Falha ao listar personas ativas da propriedade ${propriedadeId}: ${erroPersonas.message}`);
  if (!personas || personas.length === 0) return [];

  const personaIds = personas.map((persona) => persona.id as string);
  const { data: pautas, error: erroPautas } = await supabase.from("pautas").select("persona_id, angulo, created_at").in("persona_id", personaIds);
  if (erroPautas) {
    throw new Error(`Falha ao carregar pautas das personas da propriedade ${propriedadeId}: ${erroPautas.message}`);
  }

  const angulosUsadosPorPersona = new Map<string, Set<string>>();
  const ultimoUsoPorPersona = new Map<string, string>();
  for (const pauta of pautas ?? []) {
    const personaId = pauta.persona_id as string;
    const angulo = pauta.angulo as string;
    const createdAt = pauta.created_at as string;

    const angulosUsados = angulosUsadosPorPersona.get(personaId) ?? new Set<string>();
    angulosUsados.add(angulo);
    angulosUsadosPorPersona.set(personaId, angulosUsados);

    const ultimoAtual = ultimoUsoPorPersona.get(personaId);
    if (!ultimoAtual || createdAt > ultimoAtual) ultimoUsoPorPersona.set(personaId, createdAt);
  }

  return personas.map((persona) => {
    const personaId = persona.id as string;
    const angulosProntos = (persona.angulos_prontos as string[]) ?? [];
    const angulosUsados = angulosUsadosPorPersona.get(personaId) ?? new Set<string>();
    return {
      id: personaId,
      nome: persona.nome as string,
      angulosProntos: angulosProntos.filter((angulo) => !angulosUsados.has(angulo)),
      usadaPelaUltimaVezEm: ultimoUsoPorPersona.get(personaId) ?? null,
    };
  });
}

function mapearPersonaCarregada(data: { id: string; nome: string; angulos_prontos: unknown; conteudo_completo: string }): PersonaCarregada {
  return {
    id: data.id,
    nome: data.nome,
    angulosProntos: (data.angulos_prontos as string[]) ?? [],
    // Não computado aqui (exigiria uma 2ª query agregando pautas, igual a
    // listarPersonasAtivasComAngulosDisponiveis) — nenhum consumidor de carregarPersona (Gerador
    // de Ângulo, Task 3; Escritor, Task 5) usa usadaPelaUltimaVezEm, só conteudoCompleto. Quem
    // precisa do sorteio ponderado usa listarPersonasAtivasComAngulosDisponiveis, que já calcula.
    usadaPelaUltimaVezEm: null,
    conteudoCompleto: data.conteudo_completo,
  };
}

/** Persona completa (com `conteudoCompleto`) pra uma persona já escolhida — usada pelo Gerador de
 * Ângulo (Task 3, fallback de IA) e pelo Escritor (Task 5, prompt principal, spec seção 7). */
export async function carregarPersona(personaId: string): Promise<PersonaCarregada> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("personas").select("id, nome, angulos_prontos, conteudo_completo").eq("id", personaId).single();
  if (error || !data) throw new Error(`Falha ao carregar persona ${personaId}: ${error?.message ?? "não encontrada"}`);
  return mapearPersonaCarregada(data as Parameters<typeof mapearPersonaCarregada>[0]);
}

/**
 * Todos os ângulos já registrados em `pautas` pra essa persona — prontos do Bloco 11 E gerados
 * por IA em ciclos anteriores, sem distinção (spec seção 5: "cobre tanto os ângulos prontos
 * quanto os gerados por IA em ciclos anteriores"). Usado pelo fallback de IA (Gerador de Ângulo,
 * Task 3) pra nunca repetir um ângulo. Dedup em JS (`Set`), não `distinct` do PostgREST — mesma
 * decisão de agregação em JS já usada em carregarDuracaoMediaPorEtapa, mantém o fake do query
 * builder simples (sem precisar de um método `.distinct()` que hoje não existe nele).
 */
export async function carregarAngulosUsadosPorPersona(personaId: string): Promise<string[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("pautas").select("angulo").eq("persona_id", personaId);
  if (error) throw new Error(`Falha ao carregar ângulos usados pela persona ${personaId}: ${error.message}`);
  return Array.from(new Set((data ?? []).map((linha) => linha.angulo as string)));
}

/**
 * Cria uma pauta diretamente a partir de uma persona sorteada (Estrategista, Task 4) — spec
 * seção 5. Desvio deliberado do caminho antigo (pauta nasce "pendente" e só vira "em_producao"
 * quando o cron a seleciona via marcarPautaEmProducao, em selecionarProximaPautaPendente): aqui a
 * pauta nasce DIRETO em "em_producao". Não existe "esperar na fila" neste caminho — o
 * Estrategista já decidiu produzir agora, no mesmo ciclo em que a criou; gravar "pendente" e
 * imediatamente sobrescrever pra "em_producao" seria uma segunda escrita sem propósito.
 *
 * `geografia`: sempre `null` — decisão explícita da spec (seção 9, Pendências): personas não têm
 * campo estruturado de geografia (só aparece em texto livre na Ficha Rápida), extrair dali não é
 * confiável o suficiente pra automatizar.
 *
 * `prioridade_score`: omitido do payload de insert — usa o default da coluna (0), igual a toda
 * pauta criada hoje (nenhum caminho do sistema seta esse campo explicitamente ainda).
 */
export async function criarPautaDePersona(params: {
  matrizConteudoId: string;
  personaId: string;
  angulo: string;
  palavraChavePrincipal: string;
  palavrasSecundarias: string[];
  funil: FunilPauta;
  tipoConteudo: TipoConteudo;
}): Promise<PautaCarregada> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pautas")
    .insert({
      matriz_conteudo_id: params.matrizConteudoId,
      persona_id: params.personaId,
      angulo: params.angulo,
      palavra_chave_principal: params.palavraChavePrincipal,
      palavras_secundarias: params.palavrasSecundarias,
      funil: params.funil,
      tipo_conteudo: params.tipoConteudo,
      geografia: null,
      status: "em_producao",
    })
    .select(CAMPOS_PAUTA)
    .single();
  if (error || !data) throw new Error(`Falha ao criar pauta a partir da persona ${params.personaId}: ${error?.message ?? "sem retorno"}`);
  return mapearPauta(data as Parameters<typeof mapearPauta>[0]);
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
 *
 * Nota (18/08/2026): o parâmetro `propriedadeId`/o embed acima só foram testados com mock do
 * Supabase (regra dura de migration — nenhum agente aplica schema em produção) e hoje não têm
 * nenhum caller real (a tela de Fila de Pautas, Task 10 da Fase 2, contorna isso cruzando pautas
 * com `listarMatrizes` no client em vez de usar este filtro). Não presumir que este caminho está
 * verificado contra o Postgrest real antes de reaproveitá-lo — validar manualmente primeiro.
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
 *
 * `extrairTokens` (opcional, Task 5): permite ao chamador extrair tokens_entrada/tokens_saida do
 * resultado de `fn()` pra persistir na mesma linha de conclusão — usado pelas etapas
 * gerar_conteudo/revisar, cujo retorno agora carrega `usage` (ver escritor.ts/revisor.ts). Parâmetro
 * opcional pra não quebrar chamadores que não precisam de tokens (ex.: buscar_checklist, sanitizar).
 *
 * `extrairDetalhes` (opcional, Task 5): sem isto, uma rejeição de NEGÓCIO que não lança exceção
 * (ex.: revisar reprovando por score baixo, publicar reprovando por verificacao.ok === false — ver
 * processar-pauta.ts) grava `sucesso: true, detalhes: null` na conclusão, indistinguível no log de
 * uma etapa que realmente teve sucesso. Este extrator roda também no branch de SUCESSO técnico de
 * `fn()` (diferente de `extrairTokens`, mas com a mesma forma), permitindo ao chamador colocar o
 * motivo da rejeição de negócio (ex. resultado.motivo) na mesma coluna `detalhes` que já é usada
 * pro erro técnico do branch de exceção logo abaixo. Retorno `undefined` = não escreve nada
 * (comportamento idêntico ao de antes deste parâmetro existir).
 */
export async function registrarEtapa<T>(
  pautaId: string,
  etapa: EtapaLog,
  fn: () => Promise<T>,
  extrairTokens?: (resultado: T) => { tokensEntrada: number; tokensSaida: number } | undefined,
  extrairDetalhes?: (resultado: T) => string | undefined,
): Promise<T> {
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
      const tokens = extrairTokens?.(resultado);
      const detalhes = extrairDetalhes?.(resultado);
      const { error } = await supabase
        .from("pautas_execucao_log")
        .update({
          concluido_em: new Date().toISOString(),
          sucesso: true,
          ...(tokens ? { tokens_entrada: tokens.tokensEntrada, tokens_saida: tokens.tokensSaida } : {}),
          ...(detalhes !== undefined ? { detalhes } : {}),
        })
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

// ---------------------------------------------------------------------------
// Tela Monitor de execução (Task 13, Realtime) — carga inicial dos 3 blocos + estimativa de
// progresso. A carga inicial de "Na fila" reusa listarPautasPorStatus("pendente") (já existente,
// mesma função usada pela Fila de Pautas, Task 10) — decisão deliberada: PautaCarregada não expõe
// prioridade_score hoje (só a query interna de selecionarProximaPautaPendente usa essa coluna pra
// ordenar), então "ordenadas por prioridade" (texto do brief) não é possível de verdade aqui.
// Estender PautaCarregada com prioridade_score pra ordenar de verdade tocaria um tipo usado por
// toda tela do módulo — fora do escopo desta task, registrado no relatório da Task 13. A ORDEM em
// que o array chega (created_at desc, igual à Fila de Pautas) é invertida em page.tsx antes de
// virar prop do client (`.reverse()`, mais antigas primeiro) — bate com o desempate real que o
// cron usa hoje (prioridade_score desc, created_at asc; prioridade_score é 0 pra toda pauta, então
// created_at asc decide na prática). Ver comentário em monitor/page.tsx pro detalhe. As duas
// leituras de pautas_execucao_log abaixo, porém, são novas (a tabela não tinha nenhum consumidor
// de leitura fora de registrarEtapa/carregarResumoVisaoGeral).
// ---------------------------------------------------------------------------

function mapearNomePauta(embed: unknown): string {
  const pauta = embed as { palavra_chave_principal?: string } | { palavra_chave_principal?: string }[] | null;
  if (Array.isArray(pauta)) return pauta[0]?.palavra_chave_principal ?? "(pauta desconhecida)";
  return pauta?.palavra_chave_principal ?? "(pauta desconhecida)";
}

/**
 * Etapas de `pautas_execucao_log` ainda sem `concluido_em`, restritas a pautas com
 * `status = em_producao` (join inner com `pautas`, ver spec seção 7) — implementa o bloco "Em
 * andamento agora". Não deduplica por pauta_id: no cenário de reclaim (spec seção 6), uma pauta
 * pode ter DUAS linhas abertas simultaneamente — a órfã (função anterior morreu, nunca fechou a
 * linha) e a da tentativa atual — e mostrar as duas é o comportamento desejado (a órfã aparece
 * naturalmente como "possivelmente travada" na tela, sem precisar de lógica extra aqui).
 *
 * Nota (mesma cautela já registrada em listarPautasPorStatus): o embed `pautas!inner(...)` só foi
 * testado com mock do Supabase (regra dura de migration — tabela pautas_execucao_log ainda não
 * existe em produção) — validar manualmente contra o Postgrest real depois da migration da Task 1
 * ser aplicada, antes de confiar cegamente neste caminho.
 */
export async function listarEtapasEmAndamento(): Promise<EtapaEmAndamento[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pautas_execucao_log")
    .select("id, pauta_id, etapa, iniciado_em, pautas!inner(palavra_chave_principal, status)")
    .is("concluido_em", null)
    .eq("pautas.status", "em_producao")
    .order("iniciado_em", { ascending: false });
  if (error) throw new Error(`Falha ao listar etapas em andamento: ${error.message}`);

  return (data ?? []).map((linha) => ({
    id: linha.id as string,
    pautaId: linha.pauta_id as string,
    palavraChavePrincipal: mapearNomePauta((linha as { pautas?: unknown }).pautas),
    etapa: linha.etapa as EtapaLog,
    iniciadoEm: linha.iniciado_em as string,
  }));
}

/**
 * Últimas `limite` etapas concluídas (sucesso ou falha) de `pautas_execucao_log`, mais recentes
 * primeiro — implementa o bloco "Concluídos recentes". `pautas` (embed simples, sem `!inner`) é
 * seguro aqui porque `pauta_id` é `not null references pautas(id)` — toda linha concluída tem uma
 * pauta associada, não precisa de inner join pra filtrar nada.
 */
export async function listarEtapasConcluidasRecentes(limite = 20): Promise<EtapaConcluida[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pautas_execucao_log")
    .select("id, pauta_id, etapa, iniciado_em, concluido_em, sucesso, detalhes, pautas(palavra_chave_principal)")
    .not("concluido_em", "is", null)
    .order("concluido_em", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Falha ao listar etapas concluídas recentes: ${error.message}`);

  return (data ?? []).map((linha) => ({
    id: linha.id as string,
    pautaId: linha.pauta_id as string,
    palavraChavePrincipal: mapearNomePauta((linha as { pautas?: unknown }).pautas),
    etapa: linha.etapa as EtapaLog,
    iniciadoEm: linha.iniciado_em as string,
    concluidoEm: linha.concluido_em as string,
    sucesso: linha.sucesso as boolean | null,
    detalhes: linha.detalhes as string | null,
  }));
}

/**
 * Duração média (segundos) de `concluido_em - iniciado_em` por etapa, sobre uma amostra recente
 * (`amostra` linhas concluídas mais recentes, de todas as etapas somadas — não por etapa
 * individualmente, então uma etapa rara pode ficar sub-representada; aceitável para uma estimativa
 * aproximada de progresso, não uma métrica de precisão). Agregação em JS (reduce/Map), não SQL
 * `avg()` — PostgREST não expressa `concluido_em - iniciado_em` num `.select()` sem uma view ou
 * função nova no banco, e a spec pede explicitamente "sem view/materialização nova" (seção 7).
 * Zero linhas (tabela vazia, migration da Task 1 ainda não aplicada) devolve `{}` — nenhuma divisão
 * por zero, nenhuma chave "garbage"; o chamador (Monitor) trata etapa ausente como "sem dados
 * históricos ainda", nunca como 0s.
 */
export async function carregarDuracaoMediaPorEtapa(amostra = 300): Promise<DuracaoMediaPorEtapa> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pautas_execucao_log")
    .select("etapa, iniciado_em, concluido_em")
    .not("concluido_em", "is", null)
    .order("concluido_em", { ascending: false })
    .limit(amostra);
  if (error) throw new Error(`Falha ao carregar duração média por etapa: ${error.message}`);

  const acumulado = new Map<EtapaLog, { soma: number; contagem: number }>();
  for (const linha of data ?? []) {
    const etapa = linha.etapa as EtapaLog;
    const duracaoSegundos = (new Date(linha.concluido_em as string).getTime() - new Date(linha.iniciado_em as string).getTime()) / 1000;
    // Defensivo contra dado inconsistente (relógio do servidor, linha corrompida) — uma duração
    // negativa ou não-finita não pode contaminar a média de uma etapa inteira.
    if (!Number.isFinite(duracaoSegundos) || duracaoSegundos < 0) continue;
    const atual = acumulado.get(etapa) ?? { soma: 0, contagem: 0 };
    atual.soma += duracaoSegundos;
    atual.contagem += 1;
    acumulado.set(etapa, atual);
  }

  const resultado: DuracaoMediaPorEtapa = {};
  for (const [etapa, { soma, contagem }] of acumulado) {
    resultado[etapa] = soma / contagem;
  }
  return resultado;
}
