-- ============================================================================
-- MIGRATION 023 — Notas internas + @menção + notificações (Fase 5 do Bloco B)
-- Sistema de Gestão ArrudaCred
-- ============================================================================

create table notas_internas (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references conversas(id) on delete cascade,
  autor_id uuid not null references usuarios_sistema(id),
  texto text not null,
  created_at timestamptz not null default now()
);
comment on table notas_internas is
  'Nota visível só pra equipe, ligada a uma conversa — nunca é enviada pro lead no WhatsApp. Pode conter @PrimeiroNome pra mencionar um colega (gera linha em notificacoes).';
comment on column notas_internas.texto is
  'Texto livre da nota. @PrimeiroNome dentro do texto que bate com um usuarios_sistema ativo vira menção (ver criarNotaInterna).';

create index idx_notas_internas_conversa on notas_internas(conversa_id);

alter table notas_internas enable row level security;
create policy admin_acesso_total on notas_internas for all to authenticated using (true) with check (true);

create trigger trg_auditoria_notas_internas
  after insert or update or delete on notas_internas
  for each row execute function fn_auditoria_log();

create table notificacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios_sistema(id) on delete cascade,
  tipo text not null check (tipo in ('mencao', 'atribuicao')),
  conversa_id uuid not null references conversas(id) on delete cascade,
  nota_id uuid references notas_internas(id) on delete cascade,
  lida boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table notificacoes is
  'Notificação in-app pro sino da Tela de Atendimento — @menção numa nota interna, ou atribuição de conversa recebida de outro atendente. Estado de notificação (lida/não lida), não trigger de auditoria de propósito (a nota/atribuição em si já é auditada nas próprias tabelas).';
comment on column notificacoes.tipo is
  'mencao = foi @mencionado numa nota interna (nota_id preenchido); atribuicao = uma conversa foi atribuída a ele por outro atendente (nota_id nulo).';

create index idx_notificacoes_usuario_nao_lida on notificacoes(usuario_id) where lida = false;

alter table notificacoes enable row level security;
create policy admin_acesso_total on notificacoes for all to authenticated using (true) with check (true);

-- ============================================================================
-- Fim da migration 023.
-- ============================================================================
