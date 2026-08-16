-- ============================================================================
-- MIGRATION 009 — RLS para faqs e produtos + auditoria de faqs
-- Sistema de Gestão ArrudaCred
--
-- Faltava aqui: "faqs" (migration 002) e "produtos" (migration 002) nunca
-- ganharam a política de RLS que etapas_fluxo/fluxos/objecoes etc. já têm
-- (migrations 007/008). Como o painel admin agora escreve com o cliente
-- autenticado (não service_role, ver migration 007), essas duas tabelas
-- ficariam bloqueadas por padrão pro admin — o Supabase liga RLS automático
-- em toda tabela nova, mesma descoberta já registrada nas migrations
-- anteriores. Achado ao construir a tela de CRUD de FAQs.
-- ============================================================================

alter table faqs enable row level security;
create policy admin_acesso_total on faqs for all to authenticated using (true) with check (true);

create trigger trg_auditoria_faqs
  after insert or update or delete on faqs
  for each row execute function fn_auditoria_log();

-- produtos é só leitura pelo admin hoje (dropdown do formulário de FAQ/Objeção),
-- mas usa a mesma política simples das demais — nível único ADMIN/MASTER, sem
-- necessidade de diferenciar leitura de escrita ainda.
alter table produtos enable row level security;
create policy admin_acesso_total on produtos for all to authenticated using (true) with check (true);

-- ============================================================================
-- Fim da migration 009.
-- ============================================================================
