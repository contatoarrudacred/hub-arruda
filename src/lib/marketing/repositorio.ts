// src/lib/marketing/repositorio.ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { cifrar } from "./criptografia";
import type {
  AutoriaPropriedade,
  ConteudoGerado,
  DadosItemChecklist,
  DadosMatriz,
  DadosPautaManual,
  DadosPropriedade,
  DetalhesPostVisualizacao,
  DuracaoMediaPorEtapa,
  EtapaLog,
  EtapaTimeline,
  FunilPauta,
  ItemChecklistAdmin,
  ItemChecklistCarregado,
  JanelaPublicacao,
  MatrizAdmin,
  PautaCarregada,
  PautaConcluida,
  PautaEmAndamento,
  PersonaAtiva,
  PersonaCarregada,
  PersonaFormulario,
  PostAgendaAdmin,
  PostCriado,
  PostProntoParaPublicar,
  PostRelacionado,
  PropriedadeAdmin,
  PropriedadeCarregada,
  ResumoPropriedade,
  ResumoVisaoGeral,
  StatusPauta,
  StatusPost,
  TipoAngulo,
  TipoConteudo,
} from "./tipos";
import { CATALOGO_TIPOS_ANGULO } from "./tipos";
// Tipo da imagem secundária (Fase 4b, Task 8) importado do próprio orquestrador em vez de
// duplicado aqui — reaproveita a mesma forma que processar-pauta.ts (Task 10) já recebe de
// gerarImagensSecundarias, sem uma segunda definição que possa divergir. Sem ciclo de import:
// imagens/secundarias.ts só importa de "../tipos", nunca deste arquivo.
import type { ImagemSecundaria } from "./imagens/secundarias";

// persona_id incluído (Fase 3, Task 5) — gap deixado pela Task 4: criarPautaDePersona já gravava
// a coluna no insert, mas nenhum consumidor de PautaCarregada a selecionava/mapeava de volta, então
// `pauta.personaId` nunca chegava até processar-pauta.ts (que precisa dele pra decidir se carrega
// a persona completa pro Escritor, spec seção 7). Nulo em pautas antigas/manuais — a coluna aceita
// null (migration da Task 1).
const CAMPOS_PAUTA =
  "id, matriz_conteudo_id, persona_id, palavra_chave_principal, palavras_secundarias, angulo, geografia, tipo_conteudo, funil, status, tentativas, motivo_ultima_reprovacao, ultimo_rascunho, agendamento_forcado, tipo_angulo";

// Pauta em_producao com atualizado_em mais antigo que isto é considerada travada (reclaim). Exportada
// porque a tela Monitor de execução (Task 13, src/app/admin/(shell)/marketing/monitor/) reusa o
// MESMO limiar pra distinguir "em andamento de verdade" de "possivelmente travada" numa etapa de
// pautas_execucao_log sem concluido_em — ver spec seção 6. monitor-client.tsx é "use client" e este
// arquivo é `server-only`, então o valor chega até lá via prop passada pelo page.tsx (Server
// Component), não por import direto.
export const RECLAIM_MINUTOS = 10;

// Formato do jsonb ultimo_rascunho (migration 20260819100000) — snake_case porque é gravado/lido
// direto, sem passar pelo PostgREST (que só converte nomes de coluna, não chaves de dentro de um
// jsonb).
type RascunhoBruto = { titulo: string; conteudo_html: string; meta_title: string; meta_description: string; slug: string };

function mapearRascunho(bruto: unknown): ConteudoGerado | null {
  if (!bruto) return null;
  const r = bruto as RascunhoBruto;
  return { titulo: r.titulo, conteudoHtml: r.conteudo_html, metaTitle: r.meta_title, metaDescription: r.meta_description, slug: r.slug };
}

// Formato do jsonb propriedades_digitais.autoria (migration 20260819110000, Fase 4a Task 1) —
// snake_case, mesma convenção de RascunhoBruto acima (gravado/lido direto, sem passar pelo
// PostgREST). Ver comment on column na migration pra shape completo.
type AutoriaBruta = {
  nome: string;
  foto_url: string;
  bio: string;
  especialidade: string;
  empresa: string;
  credenciais: string[];
  perfis_profissionais: string[];
};

/** `null` quando a propriedade não tem autoria configurada ainda (coluna nula) — ver
 * AutoriaPropriedade em tipos.ts e a spec Fase 4a seção 3.3. */
function mapearAutoria(bruto: unknown): AutoriaPropriedade | null {
  if (!bruto) return null;
  const a = bruto as AutoriaBruta;
  return {
    nome: a.nome,
    fotoUrl: a.foto_url,
    bio: a.bio,
    especialidade: a.especialidade,
    empresa: a.empresa,
    credenciais: a.credenciais,
    perfisProfissionais: a.perfis_profissionais,
  };
}

function mapearPauta(data: {
  id: string;
  matriz_conteudo_id: string;
  persona_id?: string | null;
  palavra_chave_principal: string;
  palavras_secundarias: unknown;
  angulo: string;
  geografia: string | null;
  tipo_conteudo: PautaCarregada["tipoConteudo"];
  funil: PautaCarregada["funil"];
  status: PautaCarregada["status"];
  tentativas: number;
  motivo_ultima_reprovacao: string | null;
  ultimo_rascunho?: unknown;
  agendamento_forcado?: string | null;
  tipo_angulo?: TipoAngulo | null;
}): PautaCarregada {
  return {
    id: data.id,
    matrizConteudoId: data.matriz_conteudo_id,
    // `?? null` cobre tanto ausência do campo (fixtures antigas de teste sem persona_id) quanto
    // undefined vindo do PostgREST — mesma convenção de null-safety já usada nos demais campos
    // opcionais deste mapeamento.
    personaId: data.persona_id ?? null,
    palavraChavePrincipal: data.palavra_chave_principal,
    palavrasSecundarias: (data.palavras_secundarias as string[]) ?? [],
    angulo: data.angulo,
    geografia: data.geografia,
    tipoConteudo: data.tipo_conteudo,
    funil: data.funil,
    status: data.status,
    tentativas: data.tentativas,
    motivoUltimaReprovacao: data.motivo_ultima_reprovacao,
    ultimoRascunho: mapearRascunho(data.ultimo_rascunho),
    agendamentoForcado: data.agendamento_forcado ?? null,
    tipoAngulo: data.tipo_angulo ?? null,
  };
}

/**
 * Pauta por id — usada pela Agenda de Posts (Trocar Foto, "gerar de novo" na capa, 20/08/2026)
 * pra montar os argumentos de `gerarCapa`, que espera a `PautaCarregada` completa (mesmo que hoje
 * `gerarCapa` não use nenhum campo dela — ver imagens/capa.ts — carregar a pauta de verdade em vez
 * de um objeto falso mantém o chamador correto se isso mudar).
 */
export async function carregarPauta(pautaId: string): Promise<PautaCarregada | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("pautas").select(CAMPOS_PAUTA).eq("id", pautaId).maybeSingle();
  if (error) throw new Error(`Falha ao carregar pauta ${pautaId}: ${error.message}`);
  if (!data) return null;
  return mapearPauta(data);
}

/**
 * Grava o rascunho recém-gerado pelo Escritor na pauta (Fase 3, 19/08/2026) — chamado a cada
 * geração, independente de aprovação, pra que uma reprovação subsequente tenha o texto anterior
 * disponível pra revisão (ver montarPrompt, escritor.ts) em vez de regenerar do zero.
 */
export async function salvarRascunho(pautaId: string, rascunho: ConteudoGerado): Promise<void> {
  const supabase = createAdminClient();
  const bruto: RascunhoBruto = {
    titulo: rascunho.titulo,
    conteudo_html: rascunho.conteudoHtml,
    meta_title: rascunho.metaTitle,
    meta_description: rascunho.metaDescription,
    slug: rascunho.slug,
  };
  const { error } = await supabase.from("pautas").update({ ultimo_rascunho: bruto }).eq("id", pautaId);
  if (error) throw new Error(`Falha ao salvar rascunho da pauta ${pautaId}: ${error.message}`);
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
    .select("id, nome, url_base, tipo_cms, config_pipeline, credenciais_canais, autoria")
    .eq("id", propriedadeId)
    .single();

  if (error || !data) throw new Error(`Falha ao carregar propriedade ${propriedadeId}: ${error?.message ?? "não encontrada"}`);

  // Reaproveita o mesmo parser de config_pipeline usado pelas telas de admin (mapearConfigPipeline,
  // definido mais abaixo neste arquivo) — evita duas leituras divergentes do mesmo jsonb.
  const config = mapearConfigPipeline(data.config_pipeline);

  // Só repassa o canal wordpress, cifrado — decifrar é responsabilidade de quem usa (processar-
  // pauta.ts), no momento exato da chamada à API, não aqui (mesmo princípio de mapearCredenciais,
  // que nunca expõe a senha decifrada pra tela de admin).
  const credenciaisBrutas = (data.credenciais_canais as Record<string, { usuario?: string; senha_cifrada?: string }> | null) ?? {};
  const wordpress = credenciaisBrutas.wordpress;
  const credenciaisCanais = wordpress?.senha_cifrada
    ? { wordpress: { usuario: wordpress.usuario ?? "", senhaCifrada: wordpress.senha_cifrada } }
    : undefined;

  return {
    id: data.id,
    nome: data.nome,
    urlBase: data.url_base,
    tipoCms: data.tipo_cms,
    maxTentativas: config.maxTentativas,
    postsPorDia: config.postsPorDia ?? undefined,
    janelaPublicacao: config.janelaPublicacao ?? undefined,
    horariosPublicacao: config.horariosPublicacao ?? undefined,
    credenciaisCanais,
    autoria: mapearAutoria(data.autoria),
    // Passthrough puro — SEM `?? default` aqui. O default de cada campo (80/"medio"/true) é
    // responsabilidade exclusiva de revisor.ts (SCORE_MINIMO_APROVACAO_PADRAO, calcularAprovacao,
    // montarPrompt) — ver Fase 4a Task 2. Inventar um segundo default nesta camada seria uma
    // segunda fonte de verdade podendo divergir silenciosamente da primeira.
    scoreMinimoAprovacao: config.scoreMinimoAprovacao,
    rigorYmyl: config.rigorYmyl,
    checarPrecisaoFactual: config.checarPrecisaoFactual,
    checarFontesEspecificas: config.checarFontesEspecificas,
    checarOriginalidade: config.checarOriginalidade,
    // Fase 4a, Task 4, spec seção 3.1.2 — mesmo passthrough puro dos campos acima, sem default
    // nesta camada (lido direto por montarPrompt em escritor.ts).
    instrucoesAdicionais: config.instrucoesAdicionais,
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

/**
 * Horários já ocupados na agenda de publicação futura desta propriedade (Fase 4e, Agente
 * Agendador, 20/08/2026) — `agendado_para` de posts ainda não liberados (`> now()`), pra
 * `decidirProximoHorario` (agendador.ts) não escolher um slot que outro post já está ocupando.
 * Posts cujo horário agendado já passou não entram aqui de propósito: nesse ponto o WordPress já
 * liberou o post sozinho, então o slot não está mais "em disputa".
 */
export async function carregarProximosAgendamentos(propriedadeId: string): Promise<Date[]> {
  const supabase = createAdminClient();
  const agora = new Date().toISOString();
  const { data, error } = await supabase
    .from("posts")
    .select("agendado_para")
    .eq("propriedade_id", propriedadeId)
    .gt("agendado_para", agora);
  if (error) throw new Error(`Falha ao carregar agendamentos futuros da propriedade ${propriedadeId}: ${error.message}`);
  return (data ?? []).map((linha) => new Date(linha.agendado_para as string));
}

export async function carregarChecklistAtivo(propriedadeId: string): Promise<ItemChecklistCarregado[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("checklist_qa_itens")
    .select("id, item, peso, item_para_revisor")
    .eq("propriedade_id", propriedadeId)
    .eq("ativo", true);

  if (error) throw new Error(`Falha ao carregar checklist da propriedade ${propriedadeId}: ${error.message}`);
  return (data ?? []).map((linha) => ({ id: linha.id, item: linha.item, peso: linha.peso, itemParaRevisor: linha.item_para_revisor }));
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
 * Post já preparado (pronto_para_publicar = true) pra esta pauta, se existir — reaproveitamento
 * entre tentativas (19/08/2026). `status = "rascunho"`: só reaproveita post que nunca chegou a
 * publicar de verdade (um post "publicado" não devia estar associado a uma pauta que voltou pra
 * "pendente" — cenário que não deveria acontecer, mas o filtro protege mesmo assim). Mais recente
 * primeiro + `limit(1)`: uma pauta pode, em teoria, ter mais de um post ao longo de tentativas
 * diferentes (cada `criarPost` insere uma linha nova) — sempre o mais recente é o que reflete a
 * tentativa mais avançada.
 *
 * `rascunhoIdWordpress` (21/08/2026, achado real de produção — duplicidade de post no WordPress):
 * se uma tentativa anterior já chegou a criar o post no WordPress (etapa "publicar" com sucesso,
 * `rascunho_id` persistido ali mesmo — ver processar-pauta.ts) mas morreu antes de
 * "registrar_resultado" completar, este campo carrega esse id pra próxima tentativa ATUALIZAR o
 * post existente em vez de criar outro.
 */
export async function carregarPostProntoParaPublicar(pautaId: string): Promise<PostProntoParaPublicar | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("posts")
    .select("id, titulo, conteudo_html, meta_title, meta_description, slug, imagem_destaque_media_id, canais")
    .eq("pauta_id", pautaId)
    .eq("status", "rascunho")
    .eq("pronto_para_publicar", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar post pronto para pauta ${pautaId}: ${error.message}`);
  if (!data) return null;

  const canais = data.canais as { wordpress?: { rascunho_id?: string } } | null;

  return {
    id: data.id,
    titulo: data.titulo,
    conteudoHtml: data.conteudo_html,
    metaTitle: data.meta_title,
    metaDescription: data.meta_description,
    rascunhoIdWordpress: canais?.wordpress?.rascunho_id ?? null,
    slug: data.slug,
    imagemDestaqueMediaId: data.imagem_destaque_media_id,
  };
}

/**
 * Imagens já geradas/enviadas numa tentativa anterior desta pauta (19/08/2026, pedido do Luiz) —
 * reaproveitadas quando o texto precisa de uma correção cirúrgica (motivo de reprovação sobre o
 * CONTEÚDO, não relacionado a imagem) mas as imagens em si continuam válidas: elas dependem do
 * tema/ângulo geral do post, não de detalhes pontuais como um link ou o tamanho do meta title —
 * uma edição cirúrgica de texto não deveria forçar gerar (e pagar de novo pela) capa+secundárias
 * do zero. Diferente de `PostProntoParaPublicar`: não exige que o post inteiro esteja pronto pra
 * publicar, só que já existam imagens salvas de uma tentativa anterior.
 */
export type ImagensExistentesPost = {
  imagemDestaqueUrl: string | null;
  imagemDestaqueAlt: string | null;
  imagemDestaqueSlug: string | null;
  imagemDestaqueStorageUrl: string | null;
  imagemDestaqueMediaId: string | null;
  imagensSecundarias: ImagemSecundaria[];
};

/**
 * Post mais recente desta pauta que já tem pelo menos uma imagem salva (capa ou secundária),
 * independente do status (`rascunho` ou `falhou` — nunca `publicado`, que não devia estar
 * associado a uma pauta que voltou pra "pendente"). `null` quando nenhuma tentativa anterior
 * chegou a gerar nenhuma imagem ainda (primeira tentativa, ou toda geração de imagem falhou —
 * degradação aceitável, `gerarEEmbutirImagens` segue seu fluxo normal de gerar do zero nesse caso).
 */
export async function carregarImagensPostAnterior(pautaId: string): Promise<ImagensExistentesPost | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("posts")
    .select("imagem_destaque_url, imagem_destaque_alt, imagem_destaque_slug, imagem_destaque_storage_url, imagem_destaque_media_id, imagens_secundarias")
    .eq("pauta_id", pautaId)
    .neq("status", "publicado")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar imagens de tentativa anterior para pauta ${pautaId}: ${error.message}`);
  if (!data) return null;

  const secundariasBrutas = (data.imagens_secundarias ?? []) as Array<{
    url: string;
    alt: string;
    slug: string;
    titulo: string;
    legenda: string;
    posicao_apos_secao: string;
    storage_url: string | null;
  }>;
  const temImagem = Boolean(data.imagem_destaque_url) || secundariasBrutas.length > 0;
  if (!temImagem) return null;

  return {
    imagemDestaqueUrl: data.imagem_destaque_url,
    imagemDestaqueAlt: data.imagem_destaque_alt,
    imagemDestaqueSlug: data.imagem_destaque_slug,
    imagemDestaqueStorageUrl: data.imagem_destaque_storage_url,
    imagemDestaqueMediaId: data.imagem_destaque_media_id,
    imagensSecundarias: secundariasBrutas.map((i) => ({
      url: i.url,
      alt: i.alt,
      slug: i.slug,
      titulo: i.titulo,
      legenda: i.legenda,
      posicaoAposSecao: i.posicao_apos_secao,
      storageUrl: i.storage_url,
    })),
  };
}

/**
 * Post completo por id — usado pelas ações da Agenda de Posts (Trocar Foto, Agendamento manual,
 * Editar Post Completo, 20/08/2026), que precisam do post inteiro (conteúdo, metadados, imagens,
 * canal WordPress) pra decidir o que atualizar e onde. `rascunhoIdWordpress: null` quando o post
 * ainda não foi criado no WordPress (pauta pendente, nunca chegou em "publicar") — é o sinal que
 * essas ações usam pra saber se precisam criar ou só atualizar o post remoto.
 */
export type PostDetalhado = {
  id: string;
  pautaId: string;
  propriedadeId: string;
  titulo: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  conteudoHtml: string;
  status: StatusPost;
  imagemDestaqueUrl: string | null;
  imagemDestaqueMediaId: string | null;
  imagensSecundarias: ImagemSecundaria[];
  rascunhoIdWordpress: string | null;
  agendadoPara: string | null;
};

export async function carregarPostDetalhado(postId: string): Promise<PostDetalhado | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, pauta_id, propriedade_id, titulo, slug, meta_title, meta_description, conteudo_html, status, imagem_destaque_url, imagem_destaque_media_id, imagens_secundarias, canais, agendado_para",
    )
    .eq("id", postId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar post ${postId}: ${error.message}`);
  if (!data) return null;

  const secundariasBrutas = (data.imagens_secundarias ?? []) as Array<{
    url: string;
    alt: string;
    slug: string;
    titulo: string;
    legenda: string;
    posicao_apos_secao: string;
    storage_url: string | null;
  }>;
  const canais = data.canais as { wordpress?: { rascunho_id?: string } } | null;

  return {
    id: data.id,
    pautaId: data.pauta_id,
    propriedadeId: data.propriedade_id,
    titulo: data.titulo,
    slug: data.slug,
    metaTitle: data.meta_title,
    metaDescription: data.meta_description,
    conteudoHtml: data.conteudo_html,
    status: data.status,
    imagemDestaqueUrl: data.imagem_destaque_url,
    imagemDestaqueMediaId: data.imagem_destaque_media_id,
    imagensSecundarias: secundariasBrutas.map((i) => ({
      url: i.url,
      alt: i.alt,
      slug: i.slug,
      titulo: i.titulo,
      legenda: i.legenda,
      posicaoAposSecao: i.posicao_apos_secao,
      storageUrl: i.storage_url,
    })),
    rascunhoIdWordpress: canais?.wordpress?.rascunho_id ?? null,
    agendadoPara: data.agendado_para,
  };
}

/**
 * Edição manual completa de um post (Agenda de Posts, Editar Post Completo, 21/08/2026) — diferente
 * de `atualizarStatusPost` (transição de status, com escrita condicional truthy-check em cada
 * campo): aqui é sempre "grava exatamente o que a tela mandou", sem condicional nenhuma — é uma
 * substituição deliberada e completa, não um patch parcial.
 */
export async function atualizarConteudoPost(
  postId: string,
  dados: { titulo: string; slug: string; metaTitle: string; metaDescription: string; conteudoHtml: string },
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("posts")
    .update({
      titulo: dados.titulo,
      slug: dados.slug,
      meta_title: dados.metaTitle,
      meta_description: dados.metaDescription,
      conteudo_html: dados.conteudoHtml,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", postId);
  if (error) throw new Error(`Falha ao atualizar conteúdo do post ${postId}: ${error.message}`);
}

/**
 * Dados pro botão "Visualizar Post" do Monitor de execução (19/08/2026, pedido do Luiz) — busca a
 * pauta + persona (se houver) + o post mais recente dela (qualquer status: rascunho em andamento
 * ou já publicado), pra montar o quadro-resumo + preview do post na modal. `post: null` quando o
 * Escritor ainda não rodou nesta pauta (nenhuma linha em `posts` ainda).
 */
export async function carregarDetalhesPostVisualizacao(pautaId: string): Promise<DetalhesPostVisualizacao | null> {
  const supabase = createAdminClient();
  const { data: pauta, error: erroPauta } = await supabase
    .from("pautas")
    .select("id, palavra_chave_principal, angulo, geografia, funil, tipo_conteudo, status, tentativas, persona_id")
    .eq("id", pautaId)
    .maybeSingle();
  if (erroPauta) throw new Error(`Falha ao carregar pauta ${pautaId} para visualização: ${erroPauta.message}`);
  if (!pauta) return null;

  let personaNome: string | null = null;
  if (pauta.persona_id) {
    const { data: persona } = await supabase.from("personas").select("nome").eq("id", pauta.persona_id).maybeSingle();
    personaNome = persona?.nome ?? null;
  }

  const { data: post, error: erroPost } = await supabase
    .from("posts")
    .select(
      "titulo, slug, meta_title, meta_description, conteudo_html, status, score_qa, imagem_destaque_url, imagem_destaque_alt, imagens_secundarias, canais",
    )
    .eq("pauta_id", pautaId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroPost) throw new Error(`Falha ao carregar post da pauta ${pautaId} para visualização: ${erroPost.message}`);

  const secundariasBrutas = (post?.imagens_secundarias ?? []) as Array<{ url: string; alt: string; legenda: string }>;
  const canais = (post?.canais ?? null) as { wordpress?: { url?: string } } | null;

  return {
    pauta: {
      id: pauta.id,
      palavraChavePrincipal: pauta.palavra_chave_principal,
      angulo: pauta.angulo,
      geografia: pauta.geografia,
      funil: pauta.funil as FunilPauta,
      tipoConteudo: pauta.tipo_conteudo as TipoConteudo,
      status: pauta.status as StatusPauta,
      tentativas: pauta.tentativas,
    },
    personaNome,
    post: post
      ? {
          titulo: post.titulo,
          slug: post.slug,
          metaTitle: post.meta_title,
          metaDescription: post.meta_description,
          conteudoHtml: post.conteudo_html,
          status: post.status as StatusPost,
          scoreQa: post.score_qa,
          imagemDestaqueUrl: post.imagem_destaque_url,
          imagemDestaqueAlt: post.imagem_destaque_alt,
          imagensSecundarias: secundariasBrutas.map((i) => ({ url: i.url, alt: i.alt, legenda: i.legenda })),
          urlPublicada: canais?.wordpress?.url ?? null,
        }
      : null,
  };
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

/**
 * Formato do jsonb `posts.imagens_secundarias` (migration 20260819110000, Fase 4b) — snake_case,
 * mesma convenção de RascunhoBruto/AutoriaBruta acima (gravado direto, sem passar pelo PostgREST).
 */
function mapearImagemSecundariaBruta(imagem: ImagemSecundaria): Record<string, string | null> {
  return {
    url: imagem.url,
    alt: imagem.alt,
    slug: imagem.slug,
    titulo: imagem.titulo,
    legenda: imagem.legenda,
    posicao_apos_secao: imagem.posicaoAposSecao,
    // storage_url (follow-up 19/08/2026, arquivamento no Supabase Storage): null quando o upload
    // ao Storage falhou ou nem chegou a rodar — grava explicitamente o null (não omite a chave),
    // diferente do padrão condicional dos campos de imagem de destaque em atualizarStatusPost
    // logo abaixo, porque aqui o valor entra dentro de um item de array jsonb sempre montado por
    // inteiro (não há "omitir uma chave" parcial dentro de um elemento de array).
    storage_url: imagem.storageUrl,
  };
}

/**
 * Estendida na Task 10 (Fase 4a+4b, 19/08/2026) com os 4 campos de imagem — extensão do `extra`
 * já existente (padrão condicional-write) em vez de uma função nova dedicada: é chamada exatamente
 * no ponto certo do fluxo (depois de publicar de verdade), com o mesmo formato "grava só o que
 * veio preenchido" que já serve pra canais/publicadoEm/conteudoHtml. `imagensSecundarias: []` é um
 * resultado válido e comum (ver ImagemSecundaria/gerarImagensSecundarias) — a checagem usa
 * `!== undefined`, não truthy, pra não pular a escrita de um array vazio explícito.
 */
export async function atualizarStatusPost(
  postId: string,
  status: StatusPost,
  extra?: {
    canais?: Record<string, unknown>;
    publicadoEm?: string;
    conteudoHtml?: string;
    imagemDestaqueUrl?: string;
    imagemDestaqueAlt?: string;
    imagemDestaqueSlug?: string;
    // Follow-up 19/08/2026 (arquivamento no Storage) — `string | null` na assinatura (diferente
    // dos 3 campos acima, tipados só `string`) porque este é o único dos 4 campos de imagem cujo
    // valor "ausente" tem um significado que vale a pena expressar no tipo; na prática, porém, o
    // chamador (processar-pauta.ts) já converte null->undefined na mesma borda que os outros 3
    // campos usam (?? undefined), então este campo se comporta de forma idêntica a eles aqui
    // dentro: ver decisão abaixo, na condição de escrita.
    imagemDestaqueStorageUrl?: string | null;
    imagensSecundarias?: ImagemSecundaria[];
    // Reaproveitamento entre tentativas (19/08/2026, pedido do Luiz) — ver carregarPostProntoParaPublicar.
    prontoParaPublicar?: boolean;
    imagemDestaqueMediaId?: string;
    // Fase 4e, Agente Agendador (20/08/2026) — preenchido quando o post foi criado no WordPress
    // com `status: "future"` em vez de publicado na hora. Ver decidirProximoHorario (agendador.ts).
    agendadoPara?: string;
  },
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("posts")
    .update({
      status,
      ...(extra?.canais ? { canais: extra.canais } : {}),
      ...(extra?.publicadoEm ? { publicado_em: extra.publicadoEm } : {}),
      // Grava o HTML final de verdade publicado (com links internos + sanitização + imagens
      // secundárias + schema Article/Organization já embutidos, Task 10) — sem isto, posts.
      // conteudo_html ficava desatualizado em relação ao que realmente está no ar no WordPress
      // (auditoria/republicação futura leriam um documento errado).
      ...(extra?.conteudoHtml ? { conteudo_html: extra.conteudoHtml } : {}),
      ...(extra?.imagemDestaqueUrl ? { imagem_destaque_url: extra.imagemDestaqueUrl } : {}),
      ...(extra?.imagemDestaqueAlt ? { imagem_destaque_alt: extra.imagemDestaqueAlt } : {}),
      ...(extra?.imagemDestaqueSlug ? { imagem_destaque_slug: extra.imagemDestaqueSlug } : {}),
      // Mesmo padrão truthy-check dos 3 campos acima (não um !== undefined explícito) — decisão
      // deliberada, não um esquecimento: replica a mesma filosofia já aplicada a
      // imagemDestaqueUrl/Alt/Slug (ver comentário "alt/slug só acompanham a URL quando o upload
      // de fato teve sucesso" em processar-pauta.ts) — quando esta tentativa não produziu uma cópia
      // no Storage (capa não gerada, upload falhou, ou o upload ao WordPress em si falhou), a
      // coluna simplesmente não é tocada, preservando uma cópia arquivada de uma tentativa anterior
      // bem-sucedida em vez de apagá-la com null. É só um arquivo de "possível uso futuro" — não
      // há benefício em néla nulificar um arquivo antigo ainda válido só porque esta tentativa não
      // gerou um novo. Se algum dia for preciso nulificar de verdade (ex.: expurgo manual de um
      // arquivo), esse caso passa a exigir uma escrita explícita fora deste helper — este helper
      // continua tratando ausência (undefined/null/string vazia) como "não escrever".
      ...(extra?.imagemDestaqueStorageUrl ? { imagem_destaque_storage_url: extra.imagemDestaqueStorageUrl } : {}),
      ...(extra?.imagensSecundarias !== undefined
        ? { imagens_secundarias: extra.imagensSecundarias.map(mapearImagemSecundariaBruta) }
        : {}),
      ...(extra?.prontoParaPublicar !== undefined ? { pronto_para_publicar: extra.prontoParaPublicar } : {}),
      ...(extra?.imagemDestaqueMediaId ? { imagem_destaque_media_id: extra.imagemDestaqueMediaId } : {}),
      ...(extra?.agendadoPara ? { agendado_para: extra.agendadoPara } : {}),
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
  // Horários fixos de publicação (Fase 4e, Agente Agendador, 20/08/2026) — mesmo tratamento
  // sempre-escrito de postsPorDia/janelaPublicacao acima, não dos 5 campos condicionais abaixo.
  horariosPublicacao: string[] | null;
  // Os 5 campos de calibração do Revisor (Fase 4a, Task 3, spec seção 3.1.1) — deliberadamente
  // `| undefined`, NUNCA com fallback pra um valor concreto aqui: quem decide o default (80,
  // "medio", true) é revisor.ts, não este mapeador. Ver comentário em carregarPropriedade.
  scoreMinimoAprovacao: number | undefined;
  rigorYmyl: PropriedadeCarregada["rigorYmyl"];
  checarPrecisaoFactual: boolean | undefined;
  checarFontesEspecificas: boolean | undefined;
  checarOriginalidade: boolean | undefined;
  // Instruções adicionais do Escritor por propriedade (Fase 4a, Task 4, spec seção 3.1.2) — mesmo
  // tratamento passthrough dos 5 campos de calibração acima: `| undefined`, sem fallback pra um
  // valor concreto aqui (não há "outro" default pra este campo, ausência = nenhuma instrução extra).
  instrucoesAdicionais: string | undefined;
} {
  const config =
    (bruto as {
      max_tentativas?: number;
      posts_por_dia?: number | null;
      janela_publicacao?: JanelaPublicacao | null;
      horarios_publicacao?: string[] | null;
      score_minimo_aprovacao?: number;
      rigor_ymyl?: PropriedadeCarregada["rigorYmyl"];
      checar_precisao_factual?: boolean;
      checar_fontes_especificas?: boolean;
      checar_originalidade?: boolean;
      instrucoes_adicionais?: string;
    }) ?? {};
  return {
    maxTentativas: config.max_tentativas ?? 3,
    postsPorDia: config.posts_por_dia ?? null,
    janelaPublicacao: config.janela_publicacao ?? null,
    horariosPublicacao: config.horarios_publicacao ?? null,
    scoreMinimoAprovacao: config.score_minimo_aprovacao,
    rigorYmyl: config.rigor_ymyl,
    checarPrecisaoFactual: config.checar_precisao_factual,
    checarFontesEspecificas: config.checar_fontes_especificas,
    checarOriginalidade: config.checar_originalidade,
    instrucoesAdicionais: config.instrucoes_adicionais,
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
  autoria: unknown;
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
    horariosPublicacao: config.horariosPublicacao,
    credenciais: mapearCredenciais(data.credenciais_canais),
    autoria: mapearAutoria(data.autoria),
  };
}

const CAMPOS_PROPRIEDADE_ADMIN = "id, nome, url_base, tipo_cms, ativo, config_pipeline, credenciais_canais, autoria";

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

  // Fase 4a, Task 3 (19/08/2026) — os 5 campos de calibração do Revisor, ao contrário de
  // max_tentativas/posts_por_dia/janela_publicacao acima, são inclusão CONDICIONAL: um chamador
  // que não informa um desses campos (`dados.scoreMinimoAprovacao === undefined`, caso de toda a
  // base de código hoje — a tela ainda não os expõe) PRECISA preservar o valor já salvo no
  // config_pipeline, não apagá-lo. Se fossem escritos incondicionalmente (mesmo padrão de
  // max_tentativas), toda chamada a salvarPropriedade que não conhece calibração sobrescreveria
  // silenciosamente `score_minimo_aprovacao`/etc. com `undefined`, que o JSON.stringify do
  // supabase-js dropa — apagando uma calibração configurada numa sessão anterior. Mesmo raciocínio
  // já usado abaixo pra pessoaId/unidadeNegocioId.
  const configPipeline = {
    ...configPipelineExistente,
    max_tentativas: dados.maxTentativas,
    posts_por_dia: dados.postsPorDia ?? null,
    janela_publicacao: dados.janelaPublicacao ?? null,
    horarios_publicacao: dados.horariosPublicacao ?? null,
    ...(dados.scoreMinimoAprovacao !== undefined ? { score_minimo_aprovacao: dados.scoreMinimoAprovacao } : {}),
    ...(dados.rigorYmyl !== undefined ? { rigor_ymyl: dados.rigorYmyl } : {}),
    ...(dados.checarPrecisaoFactual !== undefined ? { checar_precisao_factual: dados.checarPrecisaoFactual } : {}),
    ...(dados.checarFontesEspecificas !== undefined ? { checar_fontes_especificas: dados.checarFontesEspecificas } : {}),
    ...(dados.checarOriginalidade !== undefined ? { checar_originalidade: dados.checarOriginalidade } : {}),
  };

  const linha = {
    nome: dados.nome,
    url_base: dados.urlBase,
    tipo_cms: dados.tipoCms,
    ativo: dados.ativo ?? true,
    config_pipeline: configPipeline,
    ...(dados.pessoaId !== undefined ? { pessoa_id: dados.pessoaId } : {}),
    ...(dados.unidadeNegocioId !== undefined ? { unidade_negocio_id: dados.unidadeNegocioId } : {}),
    // autoria: coluna própria, não faz parte do config_pipeline (spec seção 3.3 — não é
    // "configuração do pipeline", é dado de identidade cadastrado por propriedade). `undefined` =
    // não mexe no valor já salvo; `null` explícito = limpa; objeto = substitui por inteiro (não é
    // merge parcial de subcampos — autoria é sempre editada/salva como uma unidade só na tela).
    ...(dados.autoria !== undefined ? { autoria: dados.autoria } : {}),
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
    .select("id, nome, dor_entrada, angulos_prontos")
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
    // 22/08/2026: angulos_prontos passou de string[] pra {texto,tipo}[] (sorteio de tipo de
    // ângulo, ver estrategista.ts) — a subtração dos já usados agora compara por `.texto`.
    const angulosProntos = (persona.angulos_prontos as { texto: string; tipo: TipoAngulo }[]) ?? [];
    const angulosUsados = angulosUsadosPorPersona.get(personaId) ?? new Set<string>();
    return {
      id: personaId,
      nome: persona.nome as string,
      dorEntrada: persona.dor_entrada as string,
      angulosProntos: angulosProntos.filter((angulo) => !angulosUsados.has(angulo.texto)),
      usadaPelaUltimaVezEm: ultimoUsoPorPersona.get(personaId) ?? null,
    };
  });
}

/**
 * `created_at` mais recente entre pautas desta MATRIZ pra cada um dos 15 tipos de ângulo — usado
 * pelo Estrategista (`escolherTipoMenosUsadoRecentemente`, estrategista.ts) pra sortear qual tipo
 * usar na próxima pauta (achado real de produção, 22/08/2026: sem isto, os ângulos prontos de cada
 * persona quase sempre saem do mesmo tipo retórico, deixando os posts parecidos). Escopo por
 * MATRIZ, não propriedade — mesmo escopo que `selecionarPauta` já recebe; é uma query separada de
 * `listarPersonasAtivasComAngulosDisponiveis` (que é por `propriedadeId`). Tipos sem nenhuma pauta
 * ainda vêm com valor `null` no mapa — tratados como "nunca usado" (prioridade máxima) por quem
 * ordena o resultado.
 */
export async function carregarUltimoUsoPorTipoAngulo(matrizConteudoId: string): Promise<Record<TipoAngulo, string | null>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("pautas").select("tipo_angulo, created_at").eq("matriz_conteudo_id", matrizConteudoId);
  if (error) throw new Error(`Falha ao carregar histórico de tipo de ângulo da matriz ${matrizConteudoId}: ${error.message}`);

  const ultimoUsoPorTipo = {} as Record<TipoAngulo, string | null>;
  for (const tipo of CATALOGO_TIPOS_ANGULO) ultimoUsoPorTipo[tipo] = null;

  for (const pauta of data ?? []) {
    const tipo = pauta.tipo_angulo as TipoAngulo | null;
    if (!tipo) continue; // pauta antiga/manual sem tipo registrado — não conta pra recência de nenhum tipo
    const createdAt = pauta.created_at as string;
    const atual = ultimoUsoPorTipo[tipo];
    if (!atual || createdAt > atual) ultimoUsoPorTipo[tipo] = createdAt;
  }
  return ultimoUsoPorTipo;
}

function mapearPersonaCarregada(data: {
  id: string;
  nome: string;
  dor_entrada: string;
  angulos_prontos: unknown;
  conteudo_completo: string;
}): PersonaCarregada {
  return {
    id: data.id,
    nome: data.nome,
    dorEntrada: data.dor_entrada,
    angulosProntos: (data.angulos_prontos as { texto: string; tipo: TipoAngulo }[]) ?? [],
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
  const { data, error } = await supabase
    .from("personas")
    .select("id, nome, dor_entrada, angulos_prontos, conteudo_completo")
    .eq("id", personaId)
    .single();
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
  // Obrigatório (22/08/2026): todo caminho que chama esta função já sorteou um tipo de ângulo
  // antes de chegar aqui (ver selecionarPauta, estrategista.ts) — nunca é opcional na prática.
  tipoAngulo: TipoAngulo;
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
      tipo_angulo: params.tipoAngulo,
      geografia: null,
      status: "em_producao",
    })
    .select(CAMPOS_PAUTA)
    .single();
  if (error || !data) throw new Error(`Falha ao criar pauta a partir da persona ${params.personaId}: ${error?.message ?? "sem retorno"}`);
  return mapearPauta(data as Parameters<typeof mapearPauta>[0]);
}

// Default de prioridade pra pauta manual (Agenda de Posts, Novo Post Manual, 21/08/2026) — bem
// acima do default de coluna (0, usado por pautas geradas automaticamente): uma pauta que o Luiz
// criou à mão deveria furar a fila das geradas pelo Estrategista, é essa a expectativa intuitiva.
const PRIORIDADE_PAUTA_MANUAL_PADRAO = 100;

/**
 * Cria uma pauta manualmente (Agenda de Posts, 21/08/2026) — diferente de `criarPautaDePersona`
 * (só usada pelo próprio Estrategista): aqui `personaId`/`geografia`/`agendamentoForcado` são
 * opcionais DE VERDADE (não hard-coded), e a pauta entra como `"pendente"` — segue o fluxo normal
 * do pipeline (mesma fila que `selecionarProximaPautaPendente` já usa, indistinguível de uma pauta
 * gerada pelo Estrategista a partir daqui). Validação de FK (matriz ativa, persona existe) é
 * responsabilidade de quem chama (pauta-manual-actions.ts), não deste repositório.
 */
export async function criarPautaManual(dados: DadosPautaManual): Promise<PautaCarregada> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pautas")
    .insert({
      matriz_conteudo_id: dados.matrizConteudoId,
      persona_id: dados.personaId ?? null,
      angulo: dados.angulo,
      palavra_chave_principal: dados.palavraChavePrincipal,
      palavras_secundarias: dados.palavrasSecundarias ?? [],
      funil: dados.funil,
      tipo_conteudo: dados.tipoConteudo,
      geografia: dados.geografia ?? null,
      agendamento_forcado: dados.agendamentoForcado ?? null,
      prioridade_score: dados.prioridadeScore ?? PRIORIDADE_PAUTA_MANUAL_PADRAO,
      status: "pendente",
    })
    .select(CAMPOS_PAUTA)
    .single();
  if (error || !data) throw new Error(`Falha ao criar pauta manual: ${error?.message ?? "sem retorno"}`);
  return mapearPauta(data as Parameters<typeof mapearPauta>[0]);
}

export async function listarChecklistPorPropriedade(propriedadeId: string): Promise<ItemChecklistAdmin[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("checklist_qa_itens")
    .select("id, propriedade_id, item, peso, ativo, item_para_revisor")
    .eq("propriedade_id", propriedadeId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Falha ao listar checklist da propriedade ${propriedadeId}: ${error.message}`);
  return (data ?? []).map((linha) => ({
    id: linha.id as string,
    propriedadeId: linha.propriedade_id as string,
    item: linha.item as string,
    peso: linha.peso as number,
    ativo: linha.ativo as boolean,
    itemParaRevisor: linha.item_para_revisor as string | null,
  }));
}

export async function salvarItemChecklist(dados: DadosItemChecklist): Promise<ItemChecklistAdmin> {
  const supabase = createAdminClient();
  const linha = {
    propriedade_id: dados.propriedadeId,
    item: dados.item,
    peso: dados.peso,
    ativo: dados.ativo ?? true,
    // Calibração dupla Escritor/Revisor (Fase 4b, 19/08/2026) — "" tratado como null (campo
    // deixado em branco no formulário = "sem override", não uma string vazia salva no banco).
    item_para_revisor: dados.itemParaRevisor?.trim() ? dados.itemParaRevisor : null,
  };

  const query = dados.id
    ? supabase.from("checklist_qa_itens").update(linha).eq("id", dados.id)
    : supabase.from("checklist_qa_itens").insert(linha);

  const { data, error } = await query.select("id, propriedade_id, item, peso, ativo, item_para_revisor").single();
  if (error || !data) throw new Error(`Falha ao salvar item de checklist "${dados.item}": ${error?.message ?? "sem retorno"}`);
  return {
    id: data.id,
    propriedadeId: data.propriedade_id,
    item: data.item,
    peso: data.peso,
    ativo: data.ativo,
    itemParaRevisor: data.item_para_revisor,
  };
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

/**
 * Reabre pra `pendente` e limpa o motivo de reprovação. Achado real de produção (21/08/2026): a
 * versão anterior desta função deliberadamente não zerava `tentativas` — mas isso deixava
 * "Reabrir" inútil no caso mais comum de bloqueio (esgotamento de tentativas): a pauta voltava pra
 * "pendente" só pra bloquear de novo no próprio próximo tick (processarProximaPauta checa
 * `tentativas >= maxTentativas` logo na entrada). Zera `tentativas` agora, EXCETO quando o motivo
 * do bloqueio começa com "Publicado em " — esse é o caso perigoso onde a pauta JÁ FOI publicada de
 * verdade no WordPress e só falhou o registro local (ver marcarPautaBloqueada em
 * processar-pauta.ts, bloco "registrar_resultado"); reabrir e zerar tentativas nesse caso
 * reprocessaria a pauta do zero e publicaria um SEGUNDO post duplicado — a mesma classe de bug já
 * corrigida no fluxo automático (ver rascunhoIdWordpress). Motivo já vem do chamador (a tela já o
 * exibe) — evita uma leitura extra só pra decidir isso.
 */
export async function reabrirPauta(pautaId: string, motivoAtual?: string | null): Promise<void> {
  const supabase = createAdminClient();
  const jaPublicadaDeVerdade = motivoAtual?.startsWith("Publicado em ") ?? false;
  const { error } = await supabase
    .from("pautas")
    .update({
      status: "pendente",
      motivo_ultima_reprovacao: null,
      atualizado_em: new Date().toISOString(),
      ...(jaPublicadaDeVerdade ? {} : { tentativas: 0 }),
    })
    .eq("id", pautaId);
  if (error) throw new Error(`Falha ao reabrir pauta ${pautaId}: ${error.message}`);
}

/**
 * Posts `publicado` (já no ar OU agendado — ver comentário de `PostAgendaAdmin`
 * e a decisão de desenho em `20260820090000_marketing_agendado_para.sql`),
 * pra tela Agenda de Posts montar o calendário. Renomeada de
 * `listarPostsPublicados` (Fase 2, Task 11) — único call site era
 * `posts/page.tsx`, agora `agenda/page.tsx`, seguro renomear direto.
 */
export async function listarPostsAgenda(propriedadeId?: string): Promise<PostAgendaAdmin[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("posts")
    .select("id, propriedade_id, titulo, canais, score_qa, agendado_para, publicado_em, created_at, tentativas")
    .eq("status", "publicado")
    .order("publicado_em", { ascending: false });

  if (propriedadeId) query = query.eq("propriedade_id", propriedadeId);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao listar posts da agenda: ${error.message}`);
  return (data ?? []).map(mapearPostAgendaBruto);
}

/**
 * Posts já com texto+imagens prontos (`gerar_imagens` concluído) mas que
 * nunca chegaram a "publicar"/"agendar" — tipicamente uma tentativa
 * interrompida (ex.: o bug de `verificar_links` visto em produção). Mesmo
 * filtro que `carregarPostProntoParaPublicar` usa pra reaproveitamento entre
 * tentativas, mas devolvendo a lista inteira (não só a mais recente de uma
 * pauta) pra Agenda mostrar todos os pendentes de qualquer pauta.
 */
export async function listarPostsPendentesAgendamento(propriedadeId?: string): Promise<PostAgendaAdmin[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("posts")
    .select("id, propriedade_id, titulo, canais, score_qa, agendado_para, publicado_em, created_at, tentativas")
    .eq("status", "rascunho")
    .eq("pronto_para_publicar", true)
    .order("created_at", { ascending: false });

  if (propriedadeId) query = query.eq("propriedade_id", propriedadeId);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao listar posts pendentes de agendamento: ${error.message}`);
  return (data ?? []).map(mapearPostAgendaBruto);
}

function mapearPostAgendaBruto(linha: {
  id: string;
  propriedade_id: string;
  titulo: string;
  canais: unknown;
  score_qa: number | null;
  agendado_para: string | null;
  publicado_em: string | null;
  created_at: string;
  tentativas: number;
}): PostAgendaAdmin {
  const canais = linha.canais as { wordpress?: { url?: string } } | null;
  return {
    id: linha.id,
    propriedadeId: linha.propriedade_id,
    titulo: linha.titulo,
    url: canais?.wordpress?.url ?? null,
    scoreQa: linha.score_qa,
    agendadoPara: linha.agendado_para,
    publicadoEm: linha.publicado_em,
    createdAt: linha.created_at,
    tentativas: linha.tentativas,
  };
}

/**
 * Título + ângulo dos últimos `limite` posts publicados da propriedade, mais recentes primeiro —
 * resolve o TODO(Task 3) deixado por processar-pauta.ts (Fase 4a, spec seção 3.1, "Contexto novo
 * no prompt do Revisor": o Revisor usa isto pra julgar `originalidade_adequada`).
 *
 * Função dedicada, não extensão de `listarPostsAgenda` acima: aquela serve a tela Agenda de Posts
 * e devolve `PostAgendaAdmin` — campos
 * que o Revisor não precisa, e que não carrega `angulo` porque esse campo vive em `pautas`, não em
 * `posts` (decisão registrada no relatório da Task 2). Estender aquele tipo/consulta só pra este
 * uso pouparia uma função nova à custa de acoplar dois consumidores com necessidades diferentes ao
 * mesmo contrato — mais barato manter os dois separados.
 *
 * Embed `pautas(angulo)` SEM `!inner` — seguro porque `posts.pauta_id` é
 * `not null references pautas(id)` (mesma decisão já documentada em listarEtapasConcluidasRecentes
 * pra `pautas_execucao_log.pauta_id`, também not-null). `[]` (não erro) quando a propriedade não
 * tem posts publicados ainda — o Revisor trata lista vazia com o texto fixo do prompt (ver
 * montarPrompt, revisor.ts), continua funcionando normalmente sem contexto de comparação.
 */
export async function carregarPostsRecentes(propriedadeId: string, limite: number): Promise<{ titulo: string; angulo: string }[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("posts")
    .select("titulo, pautas(angulo)")
    .eq("propriedade_id", propriedadeId)
    .eq("status", "publicado")
    .order("publicado_em", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Falha ao carregar posts recentes da propriedade ${propriedadeId}: ${error.message}`);

  return (data ?? []).map((linha) => {
    // Mesma forma defensiva de mapearNomePauta (acima): o supabase-js tipa embeds belongs-to como
    // array em alguns casos e como objeto em outros, dependendo da versão/inferência — cobre os
    // dois. `pautas` nulo/ausente não deveria acontecer (FK not null), mas degrada pra "" em vez de
    // lançar, na dúvida.
    const pauta = linha.pautas as { angulo?: string } | { angulo?: string }[] | null;
    const angulo = Array.isArray(pauta) ? (pauta[0]?.angulo ?? "") : (pauta?.angulo ?? "");
    return { titulo: linha.titulo as string, angulo };
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
 *
 * `extrairCustoAdicionalUsd` (opcional, 19/08/2026, pedido do Luiz) — custo em USD que NÃO vem de
 * tokens Anthropic (hoje só a etapa gerar_imagens usa: soma do `custoUsd` real de cada geração via
 * OpenAI, que antes desta mudança era calculado e descartado, nunca persistido em lugar nenhum).
 * `custo_usd` gravado na conclusão é sempre `calcularCustoUsdTokens(tokens) + custoAdicional`
 * (custo de tokens é 0 quando `extrairTokens` não é passado) — alimenta o futuro módulo de
 * governança de custo transversal (Plano Mestre seção 9); a tela/relatório fica pra depois, mas o
 * dado precisa existir desde já, no momento em que a chamada de IA acontece.
 */
const PRECO_USD_POR_MILHAO_TOKENS: Record<string, { entrada: number; saida: number }> = {
  // claude-sonnet-5 é o único modelo usado em todo o pipeline hoje (Escritor, Revisor, Capa) —
  // preço sourced na pesquisa de vendor da Fase 4 (19/08/2026): $2/$10 por milhão de tokens.
  "claude-sonnet-5": { entrada: 2, saida: 10 },
};
const MODELO_PADRAO_CUSTO = "claude-sonnet-5";

function calcularCustoUsdTokens(tokens: { tokensEntrada: number; tokensSaida: number } | undefined): number {
  if (!tokens) return 0;
  const preco = PRECO_USD_POR_MILHAO_TOKENS[MODELO_PADRAO_CUSTO];
  return (tokens.tokensEntrada / 1_000_000) * preco.entrada + (tokens.tokensSaida / 1_000_000) * preco.saida;
}

export async function registrarEtapa<T>(
  pautaId: string,
  etapa: EtapaLog,
  fn: () => Promise<T>,
  extrairTokens?: (resultado: T) => { tokensEntrada: number; tokensSaida: number } | undefined,
  extrairDetalhes?: (resultado: T) => string | undefined,
  extrairCustoAdicionalUsd?: (resultado: T) => number | undefined,
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
      const custoAdicional = extrairCustoAdicionalUsd?.(resultado) ?? 0;
      const custoUsd = tokens || custoAdicional ? calcularCustoUsdTokens(tokens) + custoAdicional : undefined;
      const { error } = await supabase
        .from("pautas_execucao_log")
        .update({
          concluido_em: new Date().toISOString(),
          sucesso: true,
          ...(tokens ? { tokens_entrada: tokens.tokensEntrada, tokens_saida: tokens.tokensSaida } : {}),
          ...(detalhes !== undefined ? { detalhes } : {}),
          ...(custoUsd !== undefined ? { custo_usd: custoUsd } : {}),
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

const STATUS_PAUTA_FINAL: StatusPauta[] = ["publicado", "bloqueada", "rejeitado"];

function mapearEtapaTimeline(linha: {
  id: string;
  etapa: EtapaLog;
  iniciado_em: string;
  concluido_em: string | null;
  sucesso: boolean | null;
  detalhes: string | null;
}): EtapaTimeline {
  return {
    id: linha.id,
    etapa: linha.etapa,
    iniciadoEm: linha.iniciado_em,
    concluidoEm: linha.concluido_em,
    sucesso: linha.sucesso,
    detalhes: linha.detalhes,
  };
}

/**
 * Pautas com pelo menos uma tentativa já iniciada e sem desfecho final — implementa o bloco "Em
 * andamento agora" do Monitor (redesenho de 19/08/2026, pedido do Luiz: 1 card por PAUTA, com uma
 * timeline de etapas dentro, em vez de 1 card por linha de log). `status IN
 * ('em_producao', 'pendente')`: uma reprovação de conteúdo volta a pauta pra "pendente" entre
 * tentativas (ver registrarReprovacaoPauta) — sem incluir esse status aqui, o card sumiria de
 * "em andamento" e voltaria pra "na fila" a cada retry, exatamente a confusão que este redesenho
 * existe pra evitar. `tentativas > 0` distingue "pendente aguardando retry" de "pendente nunca
 * tentada" (que pertence à fila, ver listarPautasPorStatus) sem precisar consultar o log — o
 * contador já vive na própria pauta.
 */
export async function listarPautasEmAndamento(): Promise<PautaEmAndamento[]> {
  const supabase = createAdminClient();
  const { data: pautas, error: erroPautas } = await supabase
    .from("pautas")
    .select("id, palavra_chave_principal, tentativas")
    .or("status.eq.em_producao,and(status.eq.pendente,tentativas.gt.0)");
  if (erroPautas) throw new Error(`Falha ao listar pautas em andamento: ${erroPautas.message}`);
  if (!pautas || pautas.length === 0) return [];

  const ids = pautas.map((p) => p.id);
  const { data: logs, error: erroLogs } = await supabase
    .from("pautas_execucao_log")
    .select("id, pauta_id, etapa, iniciado_em, concluido_em, sucesso, detalhes")
    .in("pauta_id", ids)
    .order("iniciado_em", { ascending: true });
  if (erroLogs) throw new Error(`Falha ao listar etapas das pautas em andamento: ${erroLogs.message}`);

  const etapasPorPauta = new Map<string, EtapaTimeline[]>();
  for (const linha of logs ?? []) {
    const lista = etapasPorPauta.get(linha.pauta_id as string) ?? [];
    lista.push(mapearEtapaTimeline(linha as Parameters<typeof mapearEtapaTimeline>[0]));
    etapasPorPauta.set(linha.pauta_id as string, lista);
  }

  return pautas.map((p) => ({
    pautaId: p.id as string,
    palavraChavePrincipal: p.palavra_chave_principal as string,
    tentativas: p.tentativas as number,
    etapas: etapasPorPauta.get(p.id as string) ?? [],
  }));
}

/**
 * Últimas `limite` pautas que atingiram um desfecho final (publicada, bloqueada, ou reprovada
 * sem mais tentativas), mais recentes primeiro — implementa o bloco "Concluídos recentes" (mesmo
 * redesenho de listarPautasEmAndamento: 1 card por pauta, com o histórico completo de etapas de
 * todas as tentativas pra expandir). Ordenado por `atualizado_em` da pauta (não pelo log) — é o
 * timestamp que reflete o instante real do desfecho final, já usado pelo resto do módulo.
 */
export async function listarPautasConcluidasRecentes(limite = 20): Promise<PautaConcluida[]> {
  const supabase = createAdminClient();
  const { data: pautas, error: erroPautas } = await supabase
    .from("pautas")
    .select("id, palavra_chave_principal, status, motivo_ultima_reprovacao, atualizado_em")
    .in("status", STATUS_PAUTA_FINAL)
    .order("atualizado_em", { ascending: false })
    .limit(limite);
  if (erroPautas) throw new Error(`Falha ao listar pautas concluídas recentes: ${erroPautas.message}`);
  if (!pautas || pautas.length === 0) return [];

  const ids = pautas.map((p) => p.id);
  const { data: logs, error: erroLogs } = await supabase
    .from("pautas_execucao_log")
    .select("id, pauta_id, etapa, iniciado_em, concluido_em, sucesso, detalhes")
    .in("pauta_id", ids)
    .order("iniciado_em", { ascending: true });
  if (erroLogs) throw new Error(`Falha ao listar etapas das pautas concluídas: ${erroLogs.message}`);

  const etapasPorPauta = new Map<string, EtapaTimeline[]>();
  for (const linha of logs ?? []) {
    const lista = etapasPorPauta.get(linha.pauta_id as string) ?? [];
    lista.push(mapearEtapaTimeline(linha as Parameters<typeof mapearEtapaTimeline>[0]));
    etapasPorPauta.set(linha.pauta_id as string, lista);
  }

  return pautas.map((p) => ({
    pautaId: p.id as string,
    palavraChavePrincipal: p.palavra_chave_principal as string,
    status: p.status as StatusPauta,
    motivoUltimaReprovacao: p.motivo_ultima_reprovacao as string | null,
    concluidoEm: p.atualizado_em as string,
    etapas: etapasPorPauta.get(p.id as string) ?? [],
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
