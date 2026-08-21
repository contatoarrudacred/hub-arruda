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
  /**
   * Persona de origem desta pauta (Fase 3, Task 5, 19/08/2026) — `null` em pautas antigas/manuais
   * que não nasceram de uma persona sorteada (caminho "pendente"/reclaim, `estrategista.ts`);
   * preenchido quando a pauta nasceu do terceiro caminho (`criarPautaDePersona`, Task 4). É por
   * este campo que `processar-pauta.ts` decide se carrega a persona completa
   * (`repositorio.carregarPersona`) pra passar ao Escritor (spec seção 7) — gap deixado pela Task 4
   * (que gravava `persona_id` no insert mas nunca o selecionava/mapeava de volta) e fechado aqui.
   */
  personaId: string | null;
  palavraChavePrincipal: string;
  palavrasSecundarias: string[];
  angulo: string;
  geografia: string | null;
  tipoConteudo: TipoConteudo;
  funil: FunilPauta;
  status: StatusPauta;
  tentativas: number;
  motivoUltimaReprovacao: string | null;
  /**
   * Último rascunho gerado pelo Escritor pra esta pauta (Fase 3, 19/08/2026) — gravado a cada
   * geração, independente de aprovação (salvarRascunho, repositorio.ts). `null` até a primeira
   * geração, ou em pautas antigas de antes desta coluna existir. Quando presente junto com
   * `motivoUltimaReprovacao`, o Escritor revisa este texto em vez de escrever do zero — ver
   * montarPrompt em escritor.ts.
   */
  ultimoRascunho: ConteudoGerado | null;
  /**
   * Horário exato escolhido manualmente pro post desta pauta (Novo Post Manual, Agenda de Posts,
   * 21/08/2026) — quando presente, `processar-pauta.ts` usa direto na etapa "agendar", pulando o
   * cálculo automático de `decidirProximoHorario` (agendador.ts). `null` = comportamento
   * automático de sempre.
   */
  agendamentoForcado: string | null;
};

/**
 * Entrada pra criação manual de uma pauta (Novo Post Manual, Agenda de Posts, 21/08/2026) — o
 * Luiz controla à mão todos os ingredientes que o Estrategista decide sozinho (`estrategista.ts`).
 * Diferente de `criarPautaDePersona` (usado só pelo próprio Estrategista): aqui `personaId` é
 * opcional de verdade, `geografia` não é forçado a `null`, e a pauta entra como "pendente" (segue
 * a fila normal), não "em_producao".
 */
export type DadosPautaManual = {
  matrizConteudoId: string;
  personaId?: string | null;
  angulo: string;
  palavraChavePrincipal: string;
  palavrasSecundarias?: string[];
  funil: FunilPauta;
  tipoConteudo: TipoConteudo;
  geografia?: string | null;
  /** ISO — precisa estar no futuro (validado na action, não aqui). `undefined`/`null` = automático. */
  agendamentoForcado?: string | null;
  /** `undefined` = usa o default do repositório (100 — fura a fila das pautas geradas automaticamente). */
  prioridadeScore?: number;
};

export type ItemChecklistCarregado = {
  id: string;
  item: string;
  peso: number;
  /**
   * Calibração dupla Escritor/Revisor (Fase 4b, 19/08/2026, pedido do Luiz) — texto alternativo
   * usado só pelo Revisor ao montar seu prompt. `null`/ausente = Revisor usa o mesmo `item` do
   * Escritor (comportamento padrão). Permite o Escritor mirar num alvo ideal (ex.: "40-60
   * palavras") enquanto o Revisor aceita uma faixa mais tolerante (ex.: "20-80 palavras") pro
   * mesmo item, reduzindo retrabalho em itens de faixa numérica estreita sem abrir mão do padrão
   * de qualidade que o Escritor tenta atingir.
   */
  itemParaRevisor?: string | null;
};

/**
 * Dados de autoria E-E-A-T de uma propriedade (Fase 4a, spec seção 3.3, 19/08/2026) —
 * `propriedades_digitais.autoria`, coluna jsonb própria (migration Task 1, NÃO em
 * `config_pipeline`: não é configuração do pipeline, é dado de identidade cadastrado uma vez por
 * propriedade e herdado por todo post dela). Usada só na montagem do schema estruturado
 * `Article`/`Organization` (seção 3.4, outra task) — não influencia o texto gerado pelo Escritor.
 */
export type AutoriaPropriedade = {
  nome: string;
  fotoUrl: string;
  bio: string;
  especialidade: string;
  empresa: string;
  credenciais: string[];
  perfisProfissionais: string[];
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
  /**
   * Horários fixos de publicação (Fase 4e, Agente Agendador, 20/08/2026) —
   * `config_pipeline.horarios_publicacao`, lista de `"HH:MM"` em fuso de Brasília. Ausente/vazia =
   * comportamento anterior a esta feature (publica na hora em que o Revisor aprova). Quando
   * presente, o pipeline agenda o post no WordPress (`status: "future"`) pro próximo horário livre
   * desta lista em vez de publicar imediatamente — ver decidirProximoHorario em agendador.ts.
   */
  horariosPublicacao?: string[];
  /**
   * Credencial cifrada do canal WordPress (propriedades_digitais.credenciais_canais), decifrada
   * só no momento de uso em processar-pauta.ts — ver credenciaisWordPressDaPropriedade. Ausente
   * quando a propriedade não tem credencial salva no banco (fallback pro par de env genérico
   * WORDPRESS_USUARIO/WORDPRESS_SENHA_APP, comportamento da Fase 1 preservado).
   */
  credenciaisCanais?: { wordpress?: { usuario: string; senhaCifrada: string } };
  /**
   * Calibração do Revisor por propriedade (Fase 4a, spec seção 3.1.1, 19/08/2026) —
   * `config_pipeline`, mesmo jsonb de `maxTentativas`/`postsPorDia`/`janelaPublicacao`. Todos
   * opcionais e com default aplicado em `revisor.ts` (não aqui) pra propriedade criada antes desta
   * feature continuar se comportando exatamente como hoje: `scoreMinimoAprovacao` default 80,
   * `rigorYmyl` default "medio", os três `checar*` default `true` (gate ativo por padrão —
   * propriedade desliga explicitamente o que não quer checar).
   */
  scoreMinimoAprovacao?: number;
  rigorYmyl?: "alto" | "medio" | "baixo" | "desativado";
  checarPrecisaoFactual?: boolean;
  checarFontesEspecificas?: boolean;
  checarOriginalidade?: boolean;
  /**
   * Instruções adicionais do Escritor por propriedade (Fase 4a, spec seção 3.1.2, Task 4,
   * 19/08/2026) — `config_pipeline.instrucoes_adicionais`, texto curto e opcional cadastrado uma
   * vez por propriedade (ex.: "evite jargão técnico neste site", "sempre mencione X"). Lido por
   * `montarPrompt` (escritor.ts) e concatenado como bloco aditivo no fim do prompt, mesmo padrão
   * do bloco de persona/motivo de reprovação — nunca substitui a estrutura do prompt.
   * `undefined` = propriedade sem instrução extra cadastrada, sem default (diferente dos campos de
   * calibração acima, aqui não existe "outro" valor pra cair).
   */
  instrucoesAdicionais?: string;
  /**
   * Autoria E-E-A-T da propriedade (Fase 4a, spec seção 3.3, Task 3, 19/08/2026) —
   * `propriedades_digitais.autoria`, mapeada por `carregarPropriedade` (repositorio.ts). Campo
   * obrigatório (não opcional, diferente dos de calibração acima) porque toda propriedade tem uma
   * resposta definitiva pra "tem autoria configurada?": `null` = não configurada ainda (posts
   * publicam normalmente, só sem o campo `author` no schema Article), objeto completo = configurada.
   * Mesma convenção de `PautaCarregada.ultimoRascunho`.
   */
  autoria: AutoriaPropriedade | null;
};

/** Saída do Escritor — o rascunho completo antes de qualquer revisão. */
export type ConteudoGerado = {
  titulo: string;
  conteudoHtml: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
  // Relatório do Escritor (19/08/2026, pedido do Luiz) — espelha o `motivo` do Revisor, pra dar
  // pra cruzar "o que o Revisor pediu" com "o que o Escritor diz ter feito" no Monitor de
  // execução. Opcional (não `string` puro) porque `ultimoRascunho` é lido de volta de
  // `posts.ultimo_rascunho` no banco (ver repositorio.ts) — rascunhos salvos antes desta mudança
  // não têm o campo, e não faz sentido forçar todo call-site de teste a inventar um valor.
  relatorio?: string;
};

/** Saída do Revisor. */
export type ResultadoRevisao = {
  aprovado: boolean;
  score: number;
  motivo: string | null;
  /**
   * Três dimensões novas (Fase 4a, spec seção 3.1, 19/08/2026) — gates multiplicativos, não
   * ponderados no score: `aprovado` exige `score >= scoreMinimoAprovacao` E cada um destes três
   * (quando o `checar*` correspondente da propriedade está ativo) ser `true`. Um score alto não
   * compensa `precisaoFactualAdequada: false` — ver calcularAprovacao em revisor.ts.
   */
  precisaoFactualAdequada: boolean;
  fontesEspecificas: boolean;
  originalidadeAdequada: boolean;
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

/**
 * Post já preparado (texto aprovado, links, sanitização e imagens já embutidos) esperando só a
 * publicação — reaproveitamento entre tentativas (19/08/2026, pedido do Luiz). Achado real de
 * teste em produção: sem isso, uma falha técnica na publicação (ex.: credencial de WordPress
 * inválida) descartava um post inteiro já aprovado e imagens já geradas, forçando a próxima
 * tentativa a regenerar tudo do zero — desperdício real de $ (Anthropic + OpenAI). Carregado por
 * `carregarPostProntoParaPublicar` (repositorio.ts) quando `posts.pronto_para_publicar = true`.
 */
export type PostProntoParaPublicar = {
  id: string;
  titulo: string;
  conteudoHtml: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
  imagemDestaqueMediaId: string | null;
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
  /** Horários fixos de publicação (Fase 4e, 20/08/2026) — `null`/vazio = publica na hora, sem agendar. */
  horariosPublicacao: string[] | null;
  credenciais: Record<string, CredencialCanalAdmin>;
  /** Autoria E-E-A-T cadastrada (Fase 4a, Task 3, 19/08/2026) — `null` = não configurada ainda. */
  autoria: AutoriaPropriedade | null;
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
  /** Horários fixos de publicação (Fase 4e, 20/08/2026) — mesma convenção de postsPorDia/janelaPublicacao acima: sempre enviado pela tela, ausência vira `null` explícito (limpar). */
  horariosPublicacao?: string[] | null;
  /** Um dos dois é obrigatório na criação — constraint chk_propriedade_tem_dono do banco. */
  pessoaId?: string | null;
  unidadeNegocioId?: string | null;
  /**
   * Calibração do Revisor (Fase 4a, Task 3, 19/08/2026) — mesclados no `config_pipeline` por
   * `salvarPropriedade`, ausência (`undefined`) preserva o valor já salvo (ou deixa ausente, caindo
   * no default do `revisor.ts`) em vez de apagar; diferente de `postsPorDia`/`janelaPublicacao`
   * acima, que a tela sempre envia e `undefined`/ausência vira `null` explícito (limpar).
   */
  scoreMinimoAprovacao?: number;
  rigorYmyl?: "alto" | "medio" | "baixo" | "desativado";
  checarPrecisaoFactual?: boolean;
  checarFontesEspecificas?: boolean;
  checarOriginalidade?: boolean;
  /** `undefined` = não mexe na autoria já salva; `null` explícito = limpa; objeto = substitui. */
  autoria?: AutoriaPropriedade | null;
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
  /** Ver ItemChecklistCarregado.itemParaRevisor — calibração dupla Escritor/Revisor. */
  itemParaRevisor: string | null;
};

export type DadosItemChecklist = {
  id?: string;
  propriedadeId: string;
  item: string;
  peso: number;
  ativo?: boolean;
  itemParaRevisor?: string | null;
};

/**
 * Post com os campos que a tela Agenda de Posts precisa mostrar (calendário +
 * lista de pendentes) — substitui `PostAdmin` (Fase 2), que só servia a
 * antiga tela "Posts Publicados", puramente tabular.
 */
export type PostAgendaAdmin = {
  id: string;
  propriedadeId: string;
  titulo: string;
  url: string | null;
  scoreQa: number | null;
  agendadoPara: string | null;
  publicadoEm: string | null;
  createdAt: string;
  tentativas: number;
};

export type EtapaLog =
  | "buscar_checklist"
  | "gerar_conteudo"
  // Verificação de links externos (19/08/2026, pedido do Luiz) — entre "gerar_conteudo" e
  // "revisar": confere com um HEAD/GET real se cada link externo que o Escritor citou responde
  // (200-399), e manda de volta pro Escritor corrigir ANTES de gastar um ciclo de Revisor com um
  // link que nem existe. Ver verificarLinksExternos em links-externos.ts.
  | "verificar_links"
  | "revisar"
  | "inserir_links"
  | "sanitizar"
  // Fase 4a+4b, Task 10 (19/08/2026) — capa + imagens secundárias + upload WordPress + schema
  // Article/Organization, entre "sanitizar" e "publicar" (spec seção 4.7). Nunca marca sucesso:
  // false por uma imagem que não gerou/não subiu (Global Constraint: imagem nunca bloqueia
  // publicação) — só por um erro de infraestrutura de verdade fora dos try/catch internos.
  | "gerar_imagens"
  // Fase 4e, Agente Agendador (20/08/2026) — só roda quando a propriedade tem
  // `horariosPublicacao` configurado; decide o próximo horário livre antes de criar o rascunho.
  // Ver decidirProximoHorario em agendador.ts.
  | "agendar"
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

// ---------------------------------------------------------------------------
// Tela Monitor de execução (Task 13, Realtime) — ver
// docs/superpowers/specs/2026-08-18-pipeline-conteudo-marketing-telas-design.md seção 7.
// ---------------------------------------------------------------------------

/**
 * Uma etapa dentro da timeline de uma pauta no Monitor (redesenho de 19/08/2026, pedido do Luiz)
 * — substitui o modelo anterior de "1 card por linha de log" por "1 card por PAUTA, com uma
 * timeline de etapas dentro". `concluidoEm`/`sucesso` nulos = etapa ainda rodando (ou
 * possivelmente travada, ver RECLAIM_MINUTOS em repositorio.ts — só o tempo decorrido desde
 * `iniciadoEm` distingue os dois, decisão que cabe à tela, não ao repositório).
 */
export type EtapaTimeline = {
  id: string;
  etapa: EtapaLog;
  iniciadoEm: string;
  concluidoEm: string | null;
  sucesso: boolean | null;
  detalhes: string | null;
};

/**
 * Pauta com pelo menos uma tentativa já iniciada e ainda sem desfecho final — alimenta o bloco
 * "Em andamento agora" do Monitor. `etapas` acumula TODAS as tentativas desta pauta (uma
 * reprovação que volta a pauta pra "pendente" não tira o card daqui — só um desfecho final
 * publicado/bloqueada/rejeitado move o card pra "Concluídos", ver `listarPautasEmAndamento`),
 * ordenadas cronologicamente (mais antiga primeiro), pra renderizar como timeline vertical.
 */
export type PautaEmAndamento = {
  pautaId: string;
  palavraChavePrincipal: string;
  tentativas: number;
  etapas: EtapaTimeline[];
};

/**
 * Pauta que já atingiu um desfecho final (publicada, bloqueada, ou reprovada sem mais tentativas)
 * — alimenta o bloco "Concluídos recentes" do Monitor, um card por pauta (não mais um por linha de
 * log). `etapas` é o histórico completo de todas as tentativas, pra expandir e inspecionar.
 */
export type PautaConcluida = {
  pautaId: string;
  palavraChavePrincipal: string;
  status: StatusPauta;
  motivoUltimaReprovacao: string | null;
  concluidoEm: string;
  etapas: EtapaTimeline[];
};

/**
 * Duração média (em segundos) de `concluido_em - iniciado_em` por etapa, calculada sobre uma
 * amostra recente do log — usada pelo Monitor pra estimar progresso/tempo restante de uma etapa
 * em andamento. `Partial`: uma etapa sem nenhuma execução concluída na amostra simplesmente não
 * aparece como chave (em vez de 0 ou NaN) — degrade gracioso quando a tabela está vazia (schema
 * ainda não aplicado em produção, ver Task 1) ou quando uma etapa específica nunca rodou ainda.
 */
export type DuracaoMediaPorEtapa = Partial<Record<EtapaLog, number>>;

/**
 * Dados pro botão "Visualizar Post" do Monitor (19/08/2026, pedido do Luiz) — quadro-resumo da
 * pauta (persona, ângulo, etc.) + o post como está agora (rascunho em andamento OU já publicado),
 * pra ver o resultado sem sair da tela. `post: null` = a pauta ainda não chegou a gerar nenhum
 * rascunho (Escritor ainda não rodou nesta tentativa, ou pauta na fila).
 */
export type DetalhesPostVisualizacao = {
  pauta: {
    id: string;
    palavraChavePrincipal: string;
    angulo: string;
    geografia: string | null;
    funil: FunilPauta;
    tipoConteudo: TipoConteudo;
    status: StatusPauta;
    tentativas: number;
  };
  personaNome: string | null;
  post: {
    titulo: string;
    slug: string;
    metaTitle: string;
    metaDescription: string;
    conteudoHtml: string;
    status: StatusPost;
    scoreQa: number | null;
    imagemDestaqueUrl: string | null;
    imagemDestaqueAlt: string | null;
    imagensSecundarias: Array<{ url: string; alt: string; legenda: string }>;
    urlPublicada: string | null;
  } | null;
};

// ---------------------------------------------------------------------------
// Fase 3 (personas ricas) — Task 2. Ver
// docs/superpowers/specs/2026-08-18-personas-ricas-geracao-por-persona-design.md seções 3 e 5.
// Substitui o modelo de persona de 8 campos por matriz (PersonaFormulario, acima) por N personas
// ricas por propriedade, sorteadas a cada pauta pelo Estrategista (Task 4).
// ---------------------------------------------------------------------------

/**
 * Persona ativa candidata ao sorteio ponderado do Estrategista (Task 4) —
 * `listarPersonasAtivasComAngulosDisponiveis` já entrega `angulosProntos` com os ângulos já
 * usados subtraídos (ver spec seção 5) e `usadaPelaUltimaVezEm` pronto pra decidir peso do
 * sorteio. `angulosProntos: []` não é erro — é o sinal de que essa persona esgotou os ângulos do
 * Bloco 11 e precisa do fallback de IA (Gerador de Ângulo, Task 3).
 */
export type PersonaAtiva = {
  id: string;
  nome: string;
  angulosProntos: string[];
  /** `created_at` mais recente entre as pautas dessa persona, ou `null` se ela nunca foi usada. */
  usadaPelaUltimaVezEm: string | null;
  /**
   * `personas.dor_entrada` (Task 4, Estrategista, 19/08/2026) — exposta aqui (não fazia parte do
   * contrato original da Task 2) porque o caminho "ângulo pronto" (sem IA) de `selecionarPauta`
   * precisa derivar `palavraChavePrincipal` sem chamar o Gerador de Ângulo; a dor de entrada,
   * escrita pelo Luiz, já é um texto curto orientado à dor/palavra-chave do público — ver spec
   * seção 9, "Pendências", e o comentário em estrategista.ts sobre a heurística escolhida.
   */
  dorEntrada: string;
};

/** Persona completa, com o texto dos 11 blocos — usada pelo Gerador de Ângulo (Task 3, prompt de
 * fallback) e pelo Escritor (Task 5, prompt principal, ver spec seção 7). */
export type PersonaCarregada = PersonaAtiva & {
  conteudoCompleto: string;
};

/** Saída do Gerador de Ângulo (Task 3) — o fallback de IA que roda só quando uma persona esgota
 * os ângulos prontos do Bloco 11 (spec seção 6). Mesma forma dos campos derivados que o caminho
 * sem IA também precisa produzir pra `criarPautaDePersona`. */
export type AnguloGerado = {
  anguloTexto: string;
  palavraChavePrincipal: string;
  palavrasSecundarias: string[];
  funil: FunilPauta;
  tipoConteudo: TipoConteudo;
};
