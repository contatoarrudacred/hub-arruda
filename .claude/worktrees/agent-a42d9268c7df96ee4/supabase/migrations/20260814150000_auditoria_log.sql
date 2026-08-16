-- ============================================================================
-- MIGRATION 006 — Log de auditoria (INSERT/UPDATE/DELETE)
-- Sistema de Gestão ArrudaCred
-- Baseado em: SEGURANCA_E_AUDITORIA_ARRUDACRED.md (seção 2)
--
-- Trilha de "o que mudou, quando" em tabelas sensíveis — trigger genérico no
-- Postgres, não log manual espalhado pelo código. Cobre TODA escrita na tabela
-- automaticamente, inclusive edição feita direto no Supabase Studio, migrations
-- de dado futuras, ou qualquer código novo que ainda não existe — nada depende
-- de alguém lembrar de instrumentar uma tela nova.
--
-- Sobre a coluna usuario_id (nota de honestidade técnica, 14/08/2026):
-- o backend do admin fala com o Postgres via service_role (bypassa RLS de
-- propósito, ver src/lib/supabase/admin.ts) — nesse modelo o banco não sabe
-- "qual pessoa" está por trás da escrita, só sabe que foi o backend. Capturar
-- o usuário de forma confiável exigiria ou (a) reescrever as escritas como
-- funções RPC que recebem o usuário como parâmetro explícito, ou (b) passar a
-- escrita a usar o cliente autenticado do próprio admin em vez de service_role
-- (o que pede RLS, hoje inexistente no projeto inteiro). Ambas são mudanças de
-- arquitetura maiores do que uma migration de auditoria deveria carregar
-- escondida — com um usuário admin só (Luiz) hoje, o ganho de saber "qual dos
-- vários usuários fez" ainda é baixo. Por isso: a coluna existe e o trigger já
-- tenta ler `app.usuario_atual` (fica pronta pra quando um desses dois ajustes
-- for feito), mas por enquanto fica NULL na prática — o valor imediato desta
-- migration é o histórico de O QUE mudou e QUANDO, que já funciona 100% sem
-- nenhum ajuste em código de aplicação.
-- ============================================================================

create table auditoria_log (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  operacao text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  registro_id uuid,
  dados_antes jsonb,
  dados_depois jsonb,
  usuario_id uuid references auth.users(id),
  criado_em timestamptz not null default now()
);
comment on table auditoria_log is
  'Trilha de auditoria imutável — uma linha por INSERT/UPDATE/DELETE em tabela sensível, gravada automaticamente por trigger (fn_auditoria_log). Ver SEGURANCA_E_AUDITORIA_ARRUDACRED.md seção 2.';
comment on column auditoria_log.dados_antes is
  'Estado da linha antes da mudança (jsonb) — nulo em INSERT.';
comment on column auditoria_log.dados_depois is
  'Estado da linha depois da mudança (jsonb) — nulo em DELETE.';
comment on column auditoria_log.usuario_id is
  'Quem fez, quando conhecido — ver nota no cabeçalho desta migration sobre a limitação atual (service_role não carrega identidade de usuário por padrão).';

create index idx_auditoria_log_tabela_registro on auditoria_log(tabela, registro_id);
create index idx_auditoria_log_criado_em on auditoria_log(criado_em desc);

-- security definer: a função grava na auditoria_log com o privilégio de quem a
-- criou (dono da função), não do papel que disparou a escrita na tabela alvo —
-- assim o INSERT no log sempre funciona independente das permissões futuras
-- que a auditoria_log venha a ter (ver revoke no fim deste arquivo).
create or replace function fn_auditoria_log() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  begin
    v_usuario_id := nullif(current_setting('app.usuario_atual', true), '')::uuid;
  exception when others then
    v_usuario_id := null;
  end;

  if (tg_op = 'DELETE') then
    insert into auditoria_log (tabela, operacao, registro_id, dados_antes, usuario_id)
    values (tg_table_name, tg_op, old.id, to_jsonb(old), v_usuario_id);
    return old;
  elsif (tg_op = 'UPDATE') then
    insert into auditoria_log (tabela, operacao, registro_id, dados_antes, dados_depois, usuario_id)
    values (tg_table_name, tg_op, new.id, to_jsonb(old), to_jsonb(new), v_usuario_id);
    return new;
  else
    insert into auditoria_log (tabela, operacao, registro_id, dados_depois, usuario_id)
    values (tg_table_name, tg_op, new.id, to_jsonb(new), v_usuario_id);
    return new;
  end if;
end;
$$;
comment on function fn_auditoria_log() is
  'Função de trigger genérica — anexar via AFTER INSERT OR UPDATE OR DELETE em qualquer tabela que precise de trilha de auditoria. Tabela nova entrando no escopo: basta um "create trigger" a mais (ver exemplos abaixo), não precisa mexer nesta função.';

-- Escopo inicial: tabelas já existentes e sensíveis (dado de crédito/pessoa, ou
-- editável pelo admin sem passar por deploy). Estender é uma linha por tabela.
create trigger trg_auditoria_etapas_fluxo
  after insert or update or delete on etapas_fluxo
  for each row execute function fn_auditoria_log();

create trigger trg_auditoria_fluxos
  after insert or update or delete on fluxos
  for each row execute function fn_auditoria_log();

create trigger trg_auditoria_usuarios_sistema
  after insert or update or delete on usuarios_sistema
  for each row execute function fn_auditoria_log();

create trigger trg_auditoria_pessoas
  after insert or update or delete on pessoas
  for each row execute function fn_auditoria_log();

create trigger trg_auditoria_conversas
  after insert or update or delete on conversas
  for each row execute function fn_auditoria_log();

-- oportunidades = o registro do CRM/Kanban (valor estimado, etapa do funil,
-- motivo de perda) — adicionada ao escopo original de 5 tabelas por ser
-- claramente sensível/auditável, mesmo padrão das outras.
create trigger trg_auditoria_oportunidades
  after insert or update or delete on oportunidades
  for each row execute function fn_auditoria_log();

-- Imutabilidade: ninguém (nem o backend do admin, via service_role) pode
-- alterar ou apagar uma linha de auditoria depois de criada — só a função
-- SECURITY DEFINER acima consegue inserir. Leitura fica liberada para
-- service_role (uma futura tela de "histórico" no admin vai precisar).
revoke insert, update, delete on auditoria_log from anon, authenticated, service_role;
grant select on auditoria_log to service_role;

-- ============================================================================
-- Fim da migration 006.
-- ============================================================================
