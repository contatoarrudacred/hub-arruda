-- ============================================================================
-- MIGRATION 024 — Respostas prontas (Fase 6 do Bloco B)
-- Sistema de Gestão ArrudaCred
-- ============================================================================

create table respostas_prontas (
  id uuid primary key default gen_random_uuid(),
  atalho text not null,
  texto text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table respostas_prontas is
  'Mensagens pré-escritas reaproveitáveis pelo atendente no composer da Tela de Atendimento — atalho "/" busca por nome/atalho e insere o texto pronto, editável antes de enviar.';
comment on column respostas_prontas.atalho is
  'Nome curto usado na busca do atalho "/" no composer (ex.: "boasvindas", "aguardandodoc").';

create unique index idx_respostas_prontas_atalho on respostas_prontas(atalho);

alter table respostas_prontas enable row level security;
create policy admin_acesso_total on respostas_prontas for all to authenticated using (true) with check (true);

create trigger trg_auditoria_respostas_prontas
  after insert or update or delete on respostas_prontas
  for each row execute function fn_auditoria_log();

-- ============================================================================
-- Fim da migration 024.
-- ============================================================================
