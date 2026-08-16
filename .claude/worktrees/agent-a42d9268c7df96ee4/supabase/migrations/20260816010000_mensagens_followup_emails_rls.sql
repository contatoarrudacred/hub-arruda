-- ============================================================================
-- MIGRATION 019 — RLS para mensagens e followup_emails + auditoria
-- Sistema de Gestão ArrudaCred
--
-- Mesma descoberta de sempre (migrations 007/009/012): Supabase liga RLS
-- automaticamente em toda tabela nova. `mensagens` e `followup_emails` nunca
-- tiveram política — passou despercebido até agora porque toda escrita real
-- nelas vem do cliente service_role (persistencia.ts, cron, webhook), que
-- ignora RLS. Achado ao construir a tela de reset de conversa de teste
-- (16/08/2026, admin usa o cliente autenticado): o DELETE em `mensagens`
-- não dava erro nenhum, mas também não apagava nada (RLS bloqueando em
-- silêncio), o que quebrava o DELETE seguinte em `conversas` por violar a FK.
-- ============================================================================

alter table mensagens enable row level security;
create policy admin_acesso_total on mensagens for all to authenticated using (true) with check (true);
create trigger trg_auditoria_mensagens
  after insert or update or delete on mensagens
  for each row execute function fn_auditoria_log();

alter table followup_emails enable row level security;
create policy admin_acesso_total on followup_emails for all to authenticated using (true) with check (true);
create trigger trg_auditoria_followup_emails
  after insert or update or delete on followup_emails
  for each row execute function fn_auditoria_log();

-- ============================================================================
-- Fim da migration 019.
-- ============================================================================
