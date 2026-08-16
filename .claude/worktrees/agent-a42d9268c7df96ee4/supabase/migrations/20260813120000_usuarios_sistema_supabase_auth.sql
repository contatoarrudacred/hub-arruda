-- ============================================================================
-- MIGRATION 003 — usuarios_sistema passa a usar Supabase Auth
-- Sistema de Gestão ArrudaCred
-- Decisão (13/08/2026): em vez de senha_hash próprio, usuarios_sistema liga
-- direto ao auth.users do Supabase (login/senha, magic link, reset de senha
-- e sessão ficam por conta do Supabase Auth, já testado em produção).
-- Pré-requisito: rodar 001_nucleo.sql e 002_comercial.sql antes desta.
-- ============================================================================

alter table usuarios_sistema
  add column auth_user_id uuid unique references auth.users(id);

comment on column usuarios_sistema.auth_user_id is
  'Liga este usuário ao registro correspondente em auth.users (Supabase Auth) — login, senha, magic link e sessão são geridos pelo Supabase, não por este sistema. Substitui o antigo campo senha_hash (decisão de 13/08/2026).';

alter table usuarios_sistema
  drop column senha_hash;

-- email deixa de ser a fonte de verdade do login (isso agora é auth.users.email),
-- mas continua útil para exibição/busca sem precisar juntar com auth.users toda hora.
comment on column usuarios_sistema.email is
  'Cópia de conveniência do e-mail de login (fonte de verdade é auth.users, ligado via auth_user_id) — evita join constante só para exibir/buscar por e-mail.';

-- ============================================================================
-- Fim da migration 003.
-- ============================================================================
