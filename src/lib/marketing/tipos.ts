// src/lib/marketing/tipos.ts
// Tipos compartilhados do núcleo do pipeline de conteúdo — ver
// docs/MODULO_MARKETING_CONTEUDO_ARRUDACRED.md seção 2 para o desenho das entidades.

export type TipoConteudo = "post_padrao" | "post_storytelling" | "pagina_servico" | "pagina_geografica" | "homepage";
export type FunilPauta = "topo" | "meio" | "fundo";
export type StatusPauta = "pendente" | "em_producao" | "publicado" | "rejeitado" | "bloqueada";
export type StatusPost = "rascunho" | "publicado" | "falhou";

export type PautaCarregada = {
  id: string;
  matrizConteudoId: string;
  palavraChavePrincipal: string;
  palavrasSecundarias: string[];
  angulo: string;
  geografia: string | null;
  tipoConteudo: TipoConteudo;
  funil: FunilPauta;
  status: StatusPauta;
  tentativas: number;
  motivoUltimaReprovacao: string | null;
};

export type ItemChecklistCarregado = {
  id: string;
  item: string;
  peso: number;
};

export type PropriedadeCarregada = {
  id: string;
  nome: string;
  urlBase: string;
  tipoCms: "wordpress";
  maxTentativas: number;
  /** Cota diária de publicações (config_pipeline.posts_por_dia) — undefined = sem limite (Fase 1). */
  postsPorDia?: number;
  /**
   * Janela de publicação permitida (config_pipeline.janela_publicacao) — undefined = sem
   * restrição de horário. Os horários são sempre em fuso de Brasília (America/Sao_Paulo),
   * independente do fuso do servidor — ver dentroDaJanela em processar-pauta.ts.
   */
  janelaPublicacao?: JanelaPublicacao;
};

/** Saída do Escritor — o rascunho completo antes de qualquer revisão. */
export type ConteudoGerado = {
  titulo: string;
  conteudoHtml: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
};

/** Saída do Revisor. */
export type ResultadoRevisao = {
  aprovado: boolean;
  score: number;
  motivo: string | null;
};

/**
 * Consumo de tokens de uma chamada à Anthropic — Task 5 (instrumentação do log de execução, ver
 * spec seção 6). `gerarConteudo`/`revisarConteudo` passam a retornar isto junto do resultado de
 * negócio pra `registrarEtapa` conseguir persistir tokens_entrada/tokens_saida na mesma linha de
 * `pautas_execucao_log`.
 */
export type UsageTokens = {
  inputTokens: number;
  outputTokens: number;
};

export type PostCriado = {
  id: string;
  pautaId: string;
  propriedadeId: string;
  status: StatusPost;
};

/** Post publicado da mesma propriedade, candidato a "post relacionado" no Agente de Links. */
export type PostRelacionado = {
  titulo: string;
  url: string;
};

// ---------------------------------------------------------------------------
// Tipos das telas de admin (Fase 2) — ver
// docs/superpowers/specs/2026-08-18-pipeline-conteudo-marketing-telas-design.md
// ---------------------------------------------------------------------------

export type NivelConhecimento = "iniciante" | "intermediario" | "avancado";

export type JanelaPublicacao = { inicio: string; fim: string };

/** Estado de uma credencial de canal exposto pra tela — nunca carrega a senha (nem cifrada nem plana). */
export type CredencialCanalAdmin = {
  usuario: string | null;
  senhaConfigurada: boolean;
};

export type PropriedadeAdmin = {
  id: string;
  nome: string;
  urlBase: string;
  tipoCms: "wordpress";
  ativo: boolean;
  maxTentativas: number;
  postsPorDia: number | null;
  janelaPublicacao: JanelaPublicacao | null;
  credenciais: Record<string, CredencialCanalAdmin>;
};

export type DadosPropriedade = {
  id?: string;
  nome: string;
  urlBase: string;
  tipoCms: "wordpress";
  ativo?: boolean;
  maxTentativas: number;
  postsPorDia?: number | null;
  janelaPublicacao?: JanelaPublicacao | null;
  /** Um dos dois é obrigatório na criação — constraint chk_propriedade_tem_dono do banco. */
  pessoaId?: string | null;
  unidadeNegocioId?: string | null;
};

export type MatrizAdmin = {
  id: string;
  propriedadeId: string;
  nome: string;
  ativo: boolean;
  /** Só leitura nesta fase — populado pelo Construtor de Matriz (ainda não construído) ou direto no banco. */
  temas: string[];
  angulos: string[];
  geografias: string[] | null;
  sazonalidade: string[];
};

export type DadosMatriz = {
  id?: string;
  propriedadeId: string;
  nome: string;
  ativo?: boolean;
};

/** Formulário de persona — seção 6.2 do doc de negócio. Grava em matrizes_conteudo.eixos.persona. */
export type PersonaFormulario = {
  nome: string;
  perfilDemografico: string;
  tomDeVoz: string;
  nivelConhecimento: NivelConhecimento;
  doresNecessidades: string;
  objecoesTipicas: string[];
  vocabularioPreferido: string[];
  vocabularioEvitar: string[];
};

export type ItemChecklistAdmin = {
  id: string;
  propriedadeId: string;
  item: string;
  peso: number;
  ativo: boolean;
};

export type DadosItemChecklist = {
  id?: string;
  propriedadeId: string;
  item: string;
  peso: number;
  ativo?: boolean;
};

/** Post publicado, com os campos que a tela de Posts Publicados precisa mostrar. */
export type PostAdmin = {
  id: string;
  titulo: string;
  url: string;
  scoreQa: number | null;
  publicadoEm: string | null;
  tentativas: number;
};

export type EtapaLog =
  | "buscar_checklist"
  | "gerar_conteudo"
  | "revisar"
  | "inserir_links"
  | "sanitizar"
  | "publicar"
  | "registrar_resultado";

export type ResumoPropriedade = {
  propriedadeId: string;
  propriedadeNome: string;
  pendentes: number;
  emProducao: number;
  bloqueadas: number;
};

export type ResumoVisaoGeral = {
  porPropriedade: ResumoPropriedade[];
  publicadosNaSemana: number;
  /** aprovados / total de revisões concluídas (etapa "revisar" em pautas_execucao_log); null se não há histórico ainda. */
  taxaAprovacaoRevisor: number | null;
  /** Acumulado desde sempre (não filtrado por período) — ver nota na Task 12 sobre isto ser tokens brutos, não R$. */
  tokensEntradaTotal: number;
  tokensSaidaTotal: number;
};
