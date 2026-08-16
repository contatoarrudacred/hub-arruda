-- ============================================================================
-- MIGRATION 012 — RLS para precos_por_faixa, configuracoes, agendas_followup,
-- agenda_itens + auditoria
-- Sistema de Gestão ArrudaCred
--
-- Mesma descoberta de sempre (migrations 007/009): Supabase liga RLS
-- automaticamente em toda tabela nova, e o painel admin agora escreve com o
-- cliente autenticado (não service_role) — sem uma política aqui, essas 4
-- tabelas ficariam bloqueadas assim que as telas novas (Preços,
-- Configurações, Agendas de Follow-up) tentassem ler/escrever.
-- ============================================================================

alter table precos_por_faixa enable row level security;
create policy admin_acesso_total on precos_por_faixa for all to authenticated using (true) with check (true);
create trigger trg_auditoria_precos_por_faixa
  after insert or update or delete on precos_por_faixa
  for each row execute function fn_auditoria_log();

alter table configuracoes enable row level security;
create policy admin_acesso_total on configuracoes for all to authenticated using (true) with check (true);
create trigger trg_auditoria_configuracoes
  after insert or update or delete on configuracoes
  for each row execute function fn_auditoria_log();

alter table agendas_followup enable row level security;
create policy admin_acesso_total on agendas_followup for all to authenticated using (true) with check (true);
create trigger trg_auditoria_agendas_followup
  after insert or update or delete on agendas_followup
  for each row execute function fn_auditoria_log();

alter table agenda_itens enable row level security;
create policy admin_acesso_total on agenda_itens for all to authenticated using (true) with check (true);
create trigger trg_auditoria_agenda_itens
  after insert or update or delete on agenda_itens
  for each row execute function fn_auditoria_log();

-- ============================================================================
-- Fim da migration 012.
-- ============================================================================
