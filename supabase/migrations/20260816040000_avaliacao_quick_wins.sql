-- ============================================================================
-- MIGRATION 021 — Ganhos rápidos da avaliação geral do projeto (16/08/2026)
-- Sistema de Gestão ArrudaCred
--
-- Junta várias correções pequenas achadas na revisão estruturada do projeto
-- (skills supabase-postgres-best-practices + code review), pra Luiz rodar
-- tudo de uma vez só no SQL Editor em vez de várias idas separadas:
--
--   1. Deduplicar precos_por_faixa (migration 013 foi executada duas vezes
--      por engano — 10 linhas em vez de 5) + trava (unique) pra não repetir.
--   2. Índice em pessoas.whatsapp — ponto de entrada de toda mensagem de
--      WhatsApp (carregarOuCriarConversaWhatsapp), hoje sem índice.
--   3. Índice parcial em conversas cobrindo o filtro que o cron de
--      follow-up já roda hoje (status/sob_supervisor/aguardando_resposta).
--   4. Trigger de auditoria faltando em produtos (RLS já tinha, migration
--      009 esqueceu o trigger — mesmo padrão das demais tabelas).
--   5. COMMENT ON faltando em duas colunas de conversas (migration 016).
--   6. cron_locks — trava simples pra o cron de follow-up nunca disparar o
--      mesmo item duas vezes se duas execuções se sobrepuserem.
--   7. ON DELETE CASCADE nas tabelas que o utilitário /admin/reset-conversa
--      já apaga manualmente hoje (e em 3 tabelas que ele deveria cobrir e
--      não cobre: identidades_canal, enderecos, cliques_rastreio) — sem
--      mexer nas FKs mais sensíveis (pessoa_representantes, usuarios_sistema
--      continuam bloqueando a exclusão de propósito, é o comportamento
--      protetor certo pra essas).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Deduplicar precos_por_faixa + trava contra repetição futura
-- ----------------------------------------------------------------------------

delete from precos_por_faixa a
using precos_por_faixa b
where a.produto_id = b.produto_id
  and a.faixa_min = b.faixa_min
  and a.faixa_max is not distinct from b.faixa_max
  and a.ctid > b.ctid;

-- unique comum trataria duas linhas com faixa_max null como "diferentes" (regra padrão do
-- Postgres pra NULL em unique) — usa índice com coalesce pra fechar esse buraco também,
-- já pensando na faixa aberta ("acima de X") que ainda não existe como linha hoje.
create unique index if not exists precos_por_faixa_produto_faixa_key
  on precos_por_faixa (produto_id, faixa_min, coalesce(faixa_max, -1));
comment on index precos_por_faixa_produto_faixa_key is
  'Evita duplicar a mesma faixa de preço pro mesmo produto — achado real em 16/08/2026 (migration 013 tinha sido rodada duas vezes, /admin/precos mostrava cada faixa repetida).';

-- ----------------------------------------------------------------------------
-- 2 e 3. Índices
-- ----------------------------------------------------------------------------

create index if not exists idx_pessoas_whatsapp on pessoas(whatsapp);

create index if not exists idx_conversas_followup_pendente on conversas(pessoa_id)
  where status = 'ativa' and sob_supervisor = false and aguardando_resposta_desde is not null and agenda_followup_id is not null;
comment on index idx_conversas_followup_pendente is
  'Cobre exatamente o filtro que o cron de follow-up (src/app/api/cron/followups/route.ts) já roda a cada execução — sem isso é table scan a cada 5 minutos.';

-- ----------------------------------------------------------------------------
-- 4. Trigger de auditoria faltando em produtos
-- ----------------------------------------------------------------------------

create or replace trigger trg_auditoria_produtos
  after insert or update or delete on produtos
  for each row execute function fn_auditoria_log();

-- ----------------------------------------------------------------------------
-- 5. COMMENT ON faltando (migration 016_motor_followup esqueceu essas duas)
-- ----------------------------------------------------------------------------

comment on column conversas.agenda_followup_id is
  'Agenda de follow-up (agendas_followup) ativa nesta conversa enquanto ela aguarda resposta — null quando não há régua em andamento.';
comment on column conversas.proximo_item_agenda is
  'Índice (ordem) do próximo item da agenda que ainda não foi disparado para esta conversa.';

-- ----------------------------------------------------------------------------
-- 6. Lock simples pro cron de follow-up (evita disparo duplicado em
--    execuções sobrepostas — self-expira, não precisa de release garantido)
-- ----------------------------------------------------------------------------

create table if not exists cron_locks (
  id text primary key,
  locked_until timestamptz not null
);
comment on table cron_locks is
  'Trava de exclusão mútua para jobs periódicos que não podem rodar sobrepostos (hoje só o cron de follow-up). Não tem trigger de auditoria de propósito — é estado operacional efêmero, não dado de negócio.';

alter table cron_locks enable row level security;
drop policy if exists service_role_only on cron_locks;
create policy service_role_only on cron_locks for all to authenticated using (false) with check (false);
comment on policy service_role_only on cron_locks is
  'Ninguém autenticado via painel precisa mexer aqui — só o cron (service_role, que ignora RLS) usa esta tabela.';

create or replace function fn_tentar_lock_cron(p_id text, p_duracao_segundos int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linhas int;
begin
  insert into cron_locks (id, locked_until)
  values (p_id, now() + make_interval(secs => p_duracao_segundos))
  on conflict (id) do update
    set locked_until = excluded.locked_until
    where cron_locks.locked_until < now();

  get diagnostics v_linhas = row_count;
  return v_linhas > 0;
end;
$$;
comment on function fn_tentar_lock_cron is
  'Tenta obter a trava p_id por p_duracao_segundos. Retorna true se obteve (ninguém segurava, ou a trava anterior já tinha expirado), false se outra execução ainda está com a trava válida. Padrão "upsert como lock" — não depende de release garantido, self-expira.';

create or replace function fn_liberar_lock_cron(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from cron_locks where id = p_id;
$$;
comment on function fn_liberar_lock_cron is
  'Libera a trava antes do tempo de expiração — chamado no fim de uma execução bem-sucedida do cron, pra próxima execução (5 min depois) não precisar esperar o self-expire.';

-- ----------------------------------------------------------------------------
-- 7. ON DELETE CASCADE — formaliza no schema o que /admin/reset-conversa já
--    faz manualmente, e cobre 3 tabelas que ele deveria apagar e não apaga
--    hoje (identidades_canal, enderecos, cliques_rastreio).
--
--    Deliberadamente NÃO mexe em pessoa_representantes nem em
--    usuarios_sistema.pessoa_id — continuam bloqueando a exclusão da pessoa
--    se ela for representante legal de uma PJ ou usuária do sistema, o que
--    é o comportamento protetor certo (não é omissão).
-- ----------------------------------------------------------------------------

do $$
declare
  v_constraint text;
begin
  -- mensagens.conversa_id -> conversas(id)
  select conname into v_constraint from pg_constraint
    where conrelid = 'mensagens'::regclass and confrelid = 'conversas'::regclass and contype = 'f';
  execute format('alter table mensagens drop constraint %I', v_constraint);
  alter table mensagens add constraint mensagens_conversa_id_fkey
    foreign key (conversa_id) references conversas(id) on delete cascade;

  -- followup_emails.conversa_id -> conversas(id)
  select conname into v_constraint from pg_constraint
    where conrelid = 'followup_emails'::regclass and confrelid = 'conversas'::regclass and contype = 'f';
  execute format('alter table followup_emails drop constraint %I', v_constraint);
  alter table followup_emails add constraint followup_emails_conversa_id_fkey
    foreign key (conversa_id) references conversas(id) on delete cascade;

  -- conversas.pessoa_id -> pessoas(id)
  select conname into v_constraint from pg_constraint
    where conrelid = 'conversas'::regclass and confrelid = 'pessoas'::regclass and contype = 'f';
  execute format('alter table conversas drop constraint %I', v_constraint);
  alter table conversas add constraint conversas_pessoa_id_fkey
    foreign key (pessoa_id) references pessoas(id) on delete cascade;

  -- oportunidades.pessoa_id -> pessoas(id)
  select conname into v_constraint from pg_constraint
    where conrelid = 'oportunidades'::regclass and confrelid = 'pessoas'::regclass and contype = 'f';
  execute format('alter table oportunidades drop constraint %I', v_constraint);
  alter table oportunidades add constraint oportunidades_pessoa_id_fkey
    foreign key (pessoa_id) references pessoas(id) on delete cascade;

  -- pessoa_papeis.pessoa_id -> pessoas(id)
  select conname into v_constraint from pg_constraint
    where conrelid = 'pessoa_papeis'::regclass and confrelid = 'pessoas'::regclass and contype = 'f';
  execute format('alter table pessoa_papeis drop constraint %I', v_constraint);
  alter table pessoa_papeis add constraint pessoa_papeis_pessoa_id_fkey
    foreign key (pessoa_id) references pessoas(id) on delete cascade;

  -- identidades_canal.pessoa_id -> pessoas(id)
  select conname into v_constraint from pg_constraint
    where conrelid = 'identidades_canal'::regclass and confrelid = 'pessoas'::regclass and contype = 'f';
  execute format('alter table identidades_canal drop constraint %I', v_constraint);
  alter table identidades_canal add constraint identidades_canal_pessoa_id_fkey
    foreign key (pessoa_id) references pessoas(id) on delete cascade;

  -- enderecos.pessoa_id -> pessoas(id)
  select conname into v_constraint from pg_constraint
    where conrelid = 'enderecos'::regclass and confrelid = 'pessoas'::regclass and contype = 'f';
  execute format('alter table enderecos drop constraint %I', v_constraint);
  alter table enderecos add constraint enderecos_pessoa_id_fkey
    foreign key (pessoa_id) references pessoas(id) on delete cascade;

  -- cliques_rastreio.pessoa_id -> pessoas(id)
  select conname into v_constraint from pg_constraint
    where conrelid = 'cliques_rastreio'::regclass and confrelid = 'pessoas'::regclass and contype = 'f';
  execute format('alter table cliques_rastreio drop constraint %I', v_constraint);
  alter table cliques_rastreio add constraint cliques_rastreio_pessoa_id_fkey
    foreign key (pessoa_id) references pessoas(id) on delete cascade;
end $$;

-- ============================================================================
-- Fim da migration 021.
-- ============================================================================
