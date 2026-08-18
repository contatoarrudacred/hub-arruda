-- ============================================================================
-- MIGRATION 034 — Fecha lacuna de segurança: RLS + auditoria nas 6 tabelas
-- núcleo de Pessoa/Papel que nunca tiveram (SEGURANCA_E_AUDITORIA_ARRUDACRED.md
-- seção 2.6), mais reforço defensivo de RLS em outras 6 tabelas pré-existentes
-- (12 no total). Vendas é a primeira frente a escrever nelas via cliente
-- autenticado — sem isso, /admin/fornecedores e /admin/vendas ficam
-- bloqueados em silêncio pelo RLS automático do Supabase.
-- Sistema de Gestão ArrudaCred
-- ============================================================================

alter table entidades_legais enable row level security;
create policy admin_acesso_total on entidades_legais for all to authenticated using (true) with check (true);
create trigger trg_auditoria_entidades_legais
  after insert or update or delete on entidades_legais
  for each row execute function fn_auditoria_log();

alter table unidades_negocio enable row level security;
create policy admin_acesso_total on unidades_negocio for all to authenticated using (true) with check (true);
create trigger trg_auditoria_unidades_negocio
  after insert or update or delete on unidades_negocio
  for each row execute function fn_auditoria_log();

alter table pessoa_papeis enable row level security;
create policy admin_acesso_total on pessoa_papeis for all to authenticated using (true) with check (true);
create trigger trg_auditoria_pessoa_papeis
  after insert or update or delete on pessoa_papeis
  for each row execute function fn_auditoria_log();

alter table pessoa_representantes enable row level security;
create policy admin_acesso_total on pessoa_representantes for all to authenticated using (true) with check (true);
create trigger trg_auditoria_pessoa_representantes
  after insert or update or delete on pessoa_representantes
  for each row execute function fn_auditoria_log();

alter table enderecos enable row level security;
create policy admin_acesso_total on enderecos for all to authenticated using (true) with check (true);
create trigger trg_auditoria_enderecos
  after insert or update or delete on enderecos
  for each row execute function fn_auditoria_log();

alter table identidades_canal enable row level security;
create policy admin_acesso_total on identidades_canal for all to authenticated using (true) with check (true);
create trigger trg_auditoria_identidades_canal
  after insert or update or delete on identidades_canal
  for each row execute function fn_auditoria_log();

-- ============================================================================
-- Reforço defensivo (não é fix de lacuna confirmada): `pessoas`, `oportunidades`,
-- `conversas`, `usuarios_sistema`, `fluxos` e `etapas_fluxo` já têm
-- `create policy admin_acesso_total` desde a migration
-- 20260814160000_auditoria_quem_fez.sql, mas a revisão final não achou um
-- `alter table ... enable row level security` explícito para elas no
-- histórico de migrations. Isso muito provavelmente é um falso alarme: o
-- Supabase habilita RLS automaticamente em toda tabela nova do schema public,
-- então essas tabelas quase certamente já tinham RLS ligado desde a criação
-- (ver docs/SEGURANCA_E_AUDITORIA_ARRUDACRED.md seção 2.4) — e uma policy só
-- funciona se RLS já estiver habilitado, então elas não estariam
-- funcionando hoje se RLS estivesse desligado. Ainda assim,
-- `alter table ... enable row level security` é idempotente (no-op se já
-- habilitado, nunca dá erro), então não custa nada reforçar explicitamente.
-- Nenhuma policy ou trigger nova aqui — essas já existem para as 6 tabelas.
-- ============================================================================

alter table pessoas enable row level security;
alter table oportunidades enable row level security;
alter table conversas enable row level security;
alter table usuarios_sistema enable row level security;
alter table fluxos enable row level security;
alter table etapas_fluxo enable row level security;

-- ============================================================================
-- Fim da migration 034 (12 tabelas: 6 com RLS+auditoria novos, 6 com reforço
-- defensivo de RLS apenas).
-- ============================================================================
