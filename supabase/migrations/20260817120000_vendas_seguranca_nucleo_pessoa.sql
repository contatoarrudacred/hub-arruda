-- ============================================================================
-- MIGRATION 034 — Fecha lacuna de segurança: RLS + auditoria nas 6 tabelas
-- núcleo de Pessoa/Papel que nunca tiveram (SEGURANCA_E_AUDITORIA_ARRUDACRED.md
-- seção 2.6). Vendas é a primeira frente a escrever nelas via cliente
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
-- Fim da migration 034.
-- ============================================================================
