-- Fase 3 (personas ricas) — Task 1
-- Cria a tabela `personas` (perfis ricos, 11 blocos fixos) e a coluna `pautas.persona_id`.
-- Ver docs/superpowers/specs/2026-08-18-personas-ricas-geracao-por-persona-design.md secao 3.
-- Migracao 100% aditiva: so `create table` e `alter table add column` (mais indices, policy e
-- trigger). Nenhum drop/truncate/delete. Escrita pelo agente Marketing, NAO aplicada por ele
-- (regra dura da secao 2 de docs/COORDENACAO_AGENTES_ARRUDACRED.md) — aguarda o Luiz rodar no
-- SQL Editor do Supabase.

create table personas (
  id uuid primary key default gen_random_uuid(),
  propriedade_id uuid not null references propriedades_digitais(id) on delete cascade,
  numero int not null,
  nome text not null,
  produto text not null,
  publico text not null check (publico in ('PF', 'PJ')),
  dor_entrada text not null,
  conteudo_completo text not null,
  angulos_prontos jsonb not null default '[]'::jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint uq_personas_propriedade_numero unique (propriedade_id, numero)
);
comment on table personas is
  'Perfis de persona ricos (formato de 11 blocos fixos: ficha rápida, motivação, retrato psicográfico, medos, impacto nos relacionamentos, tentativas anteriores, causa surpreendente, restrições, resultado esperado, vocabulário, ângulos de ataque) — origem: material escrito pelo Luiz, importado de arquivo .md. Cada pauta nasce de uma persona sorteada (ver Estrategista) — substitui o modelo de "1 persona por matriz" da Fase 2.';
comment on column personas.numero is
  'Número de referência da persona no arquivo-fonte (1-75 no lote atual) — não é chave técnica, só rastreabilidade até a origem.';
comment on column personas.conteudo_completo is
  'Os 11 blocos em markdown, texto corrido — alimenta o prompt do Escritor (seção 6) pra manter voz/vocabulário/tom consistentes com o que o Luiz escreveu.';
comment on column personas.angulos_prontos is
  'jsonb: string[] — os ângulos de ataque para anúncio (Bloco 11) já escritos pelo Luiz, prontos pra virar pauta sem custo de IA. Ver seção 5 (lógica de seleção) — esvaziam com o uso, e o Estrategista passa a gerar ângulo novo via IA quando acabam.';

alter table personas enable row level security;
create policy admin_acesso_total on personas for all to authenticated using (true) with check (true);
create trigger trg_auditoria_personas
  after insert or update or delete on personas
  for each row execute function fn_auditoria_log();

create index idx_personas_propriedade on personas (propriedade_id) where ativo;

alter table pautas add column persona_id uuid references personas(id);
comment on column pautas.persona_id is
  'Persona que originou esta pauta (Fase 3, 18/08/2026) — nulo em pautas antigas/manuais. O campo pautas.angulo continua sendo o texto do ângulo em si (pronto da persona ou gerado por IA quando os prontos esgotam); persona_id é só a referência de origem, usada pra saber quais ângulos de uma persona já foram usados (seção 5).';

create index idx_pautas_persona on pautas (persona_id);
