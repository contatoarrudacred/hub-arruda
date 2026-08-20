-- Pastas de Fluxo (categorização + ordem manual) — spec docs/superpowers/specs/2026-08-19-fluxos-pastas-design.md
-- Aditiva: tabela nova + 2 colunas nullable/default em fluxos. Nao apaga nem altera dado existente.

create table if not exists fluxo_pastas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cor text not null default 'cinza',
  posicao integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table fluxo_pastas is 'Pastas/categorias de fluxo de atendimento — organização visual em /admin/fluxos, spec 2026-08-19-fluxos-pastas-design.md.';
comment on column fluxo_pastas.cor is 'Chave da paleta fechada de 16 cores (src/lib/motor-fluxo/cores-pasta.ts), nao hex livre.';
comment on column fluxo_pastas.posicao is 'Ordem manual de exibição entre as pastas (drag-and-drop).';

alter table fluxo_pastas enable row level security;

create policy admin_acesso_total on fluxo_pastas for all to authenticated using (true) with check (true);

-- Auditoria (mesmo padrão de objecoes/etapas_fluxo/faqs — migration 008) — pasta também é
-- conteúdo de configuração editável pelo admin.
create trigger trg_auditoria_fluxo_pastas
  after insert or update or delete on fluxo_pastas
  for each row execute function fn_auditoria_log();

alter table fluxos
  add column if not exists pasta_id uuid references fluxo_pastas(id) on delete set null,
  add column if not exists posicao integer not null default 0;

comment on column fluxos.pasta_id is 'Pasta/categoria do fluxo — null significa raiz (sem pasta). ON DELETE SET NULL: apagar a pasta move o fluxo de volta pra raiz, nunca apaga o fluxo.';
comment on column fluxos.posicao is 'Ordem manual de exibição dentro da pasta (ou da raiz), drag-and-drop.';

create index if not exists idx_fluxos_pasta_id on fluxos(pasta_id);
