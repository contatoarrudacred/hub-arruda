-- Núcleo do pipeline de conteúdo Marketing (17/08/2026) — ver
-- docs/MODULO_MARKETING_CONTEUDO_ARRUDACRED.md seção 2 para o desenho completo.
-- Esta migração cobre só as tabelas necessárias pro núcleo geração→revisão→publicação
-- (sem distribuição multi-canal e sem PROSPECTS_BACKLINK, que ficam pra depois).

create table propriedades_digitais (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid references pessoas(id),
  unidade_negocio_id uuid references unidades_negocio(id),
  nome text not null,
  url_base text not null,
  tipo_cms text not null default 'wordpress' check (tipo_cms in ('wordpress')),
  ativo boolean not null default true,
  config_pipeline jsonb not null default '{"max_tentativas": 3, "canais_distribuicao": []}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_propriedade_tem_dono check (pessoa_id is not null or unidade_negocio_id is not null)
);
comment on table propriedades_digitais is
  'Cada site atendido pelo pipeline de conteúdo — do próprio grupo (ArrudaCred, Aetria) ou de clientes externos. Ver MODULO_MARKETING_CONTEUDO_ARRUDACRED.md seção 2.';
comment on column propriedades_digitais.config_pipeline is
  'jsonb: {"max_tentativas": number, "canais_distribuicao": string[]}. max_tentativas é o circuit breaker do workflow (padrão 3).';

create table matrizes_conteudo (
  id uuid primary key default gen_random_uuid(),
  propriedade_id uuid not null references propriedades_digitais(id) on delete cascade,
  nome text not null,
  eixos jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table matrizes_conteudo is
  'Os eixos de conteúdo (temas/ângulos/geografias/sazonalidade) por propriedade, configuráveis — uma propriedade pode ter mais de uma matriz ativa. Ver MODULO_MARKETING_CONTEUDO_ARRUDACRED.md seção 2.';
comment on column matrizes_conteudo.eixos is
  'jsonb livre: {"temas": [...], "angulos": [...], "geografias": [...] | null, "sazonalidade": [...]}. Populado pelo Construtor de Matriz de Conteúdo (ainda não construído).';

create table pautas (
  id uuid primary key default gen_random_uuid(),
  matriz_conteudo_id uuid not null references matrizes_conteudo(id) on delete cascade,
  palavra_chave_principal text not null,
  palavras_secundarias jsonb not null default '[]'::jsonb,
  angulo text not null,
  geografia text,
  tipo_conteudo text not null default 'post_padrao'
    check (tipo_conteudo in ('post_padrao', 'post_storytelling', 'pagina_servico', 'pagina_geografica', 'homepage')),
  funil text not null check (funil in ('topo', 'meio', 'fundo')),
  status text not null default 'pendente'
    check (status in ('pendente', 'em_producao', 'publicado', 'rejeitado', 'bloqueada')),
  tentativas int not null default 0,
  motivo_ultima_reprovacao text,
  prioridade_score int not null default 0,
  created_at timestamptz not null default now()
);
comment on table pautas is
  'Fila gerada pelo Agente Estrategista — cada linha é um post ainda não escrito, aguardando produção. tentativas/motivo_ultima_reprovacao alimentam o circuit breaker do workflow.';
comment on column pautas.tipo_conteudo is
  'Catálogo de formatos, MODULO_MARKETING_CONTEUDO_ARRUDACRED.md seção 5.3.';

create table posts (
  id uuid primary key default gen_random_uuid(),
  pauta_id uuid not null references pautas(id),
  propriedade_id uuid not null references propriedades_digitais(id),
  titulo text not null,
  conteudo_html text not null,
  meta_title text not null,
  meta_description text not null,
  slug text not null,
  imagem_destaque_url text,
  score_qa int,
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado', 'falhou')),
  canais jsonb not null default '{}'::jsonb,
  tentativas int not null default 0,
  publicado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table posts is
  'Rascunhos e publicados gerados pelo pipeline — um post por pauta produzida. status/canais rastreiam o estado de publicação em cada plataforma.';
comment on column posts.canais is
  'jsonb por plataforma: {"wordpress": {"rascunho_id", "status", "url"}, "gmb": {...}, ...}. Só "wordpress" é escrito nesta fase (núcleo); as demais chaves são da plan de distribuição multi-canal.';

create table checklist_qa_itens (
  id uuid primary key default gen_random_uuid(),
  propriedade_id uuid not null references propriedades_digitais(id) on delete cascade,
  item text not null,
  peso int not null default 1,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table checklist_qa_itens is
  'Padrão de qualidade obrigatório por propriedade — o Agente Revisor valida cada rascunho contra estes itens antes de aprovar publicação. Catálogo padrão de 11 itens em MODULO_MARKETING_CONTEUDO_ARRUDACRED.md seção 5.2, mas customizável por propriedade (ex.: qual "fonte oficial do nicho" citar).';
comment on column checklist_qa_itens.peso is
  'Peso do item na soma ponderada do score de aprovação (score mínimo 80/100 pra aprovar, ver Agente Revisor).';

-- RLS + auditoria, mesmo padrão do restante do sistema (ver 20260815120000_precos_config_agendas_rls.sql)
alter table propriedades_digitais enable row level security;
create policy admin_acesso_total on propriedades_digitais for all to authenticated using (true) with check (true);
create trigger trg_auditoria_propriedades_digitais
  after insert or update or delete on propriedades_digitais
  for each row execute function fn_auditoria_log();

alter table matrizes_conteudo enable row level security;
create policy admin_acesso_total on matrizes_conteudo for all to authenticated using (true) with check (true);
create trigger trg_auditoria_matrizes_conteudo
  after insert or update or delete on matrizes_conteudo
  for each row execute function fn_auditoria_log();

alter table pautas enable row level security;
create policy admin_acesso_total on pautas for all to authenticated using (true) with check (true);
create trigger trg_auditoria_pautas
  after insert or update or delete on pautas
  for each row execute function fn_auditoria_log();

alter table posts enable row level security;
create policy admin_acesso_total on posts for all to authenticated using (true) with check (true);
create trigger trg_auditoria_posts
  after insert or update or delete on posts
  for each row execute function fn_auditoria_log();

alter table checklist_qa_itens enable row level security;
create policy admin_acesso_total on checklist_qa_itens for all to authenticated using (true) with check (true);
create trigger trg_auditoria_checklist_qa_itens
  after insert or update or delete on checklist_qa_itens
  for each row execute function fn_auditoria_log();

create index idx_pautas_matriz_status on pautas (matriz_conteudo_id, status, prioridade_score desc, created_at);
create index idx_posts_propriedade on posts (propriedade_id, status);
create index idx_checklist_propriedade on checklist_qa_itens (propriedade_id) where ativo;
