-- ============================================================================
-- MIGRATION 008 — Banco de objeções
-- Sistema de Gestão ArrudaCred
-- Baseado em: PERSONA_MALALA_PROMPT_SISTEMA.md (seção 8)
--
-- Mesmo padrão de "faqs" (migration 002) — CRUD completo pelo admin, editável
-- sem depender de código. Diferença de conteúdo: FAQ responde pergunta
-- factual; objeção precisa de orientação/técnica de reversão (o "como_lidar"),
-- não só informação. Luiz pediu explicitamente que isso viva no banco, não em
-- arquivo de texto — "fica ruim para gestão e administração" (14/08/2026).
--
-- RLS: mesmo modelo já adotado nas tabelas do painel admin (migration 007) —
-- Supabase liga RLS automaticamente em toda tabela nova, então sem uma
-- política aqui o admin autenticado ficaria bloqueado. Motor de fluxo em
-- produção (quando consultar isto via IA, Fase 5) usa service_role, que
-- sempre ignora RLS.
-- ============================================================================

create table objecoes (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos(id),
  objecao text not null,
  como_lidar text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table objecoes is
  'Banco de objeções por produto, CRUD completo (editar/desativar/excluir/criar) pelo admin — orienta a IA (Fase 5) sobre como reverter/reassegurar quando o lead expressa resistência (ex.: "acho caro", "não confio, parece golpe"), diferente da FAQ que responde pergunta factual. Ver PERSONA_MALALA_PROMPT_SISTEMA.md seção 8.';
comment on column objecoes.objecao is
  'A objeção em si, como o lead normalmente expressa (ex.: "vou pensar e te chamo depois").';
comment on column objecoes.como_lidar is
  'Orientação/técnica de resposta para a IA usar — não é uma resposta pronta única, é a diretriz de como reverter essa objeção específica.';

alter table objecoes enable row level security;
create policy admin_acesso_total on objecoes for all to authenticated using (true) with check (true);

-- Auditoria (mesmo padrão da migration 006) — objeções também são conteúdo
-- editável pelo admin, mesma sensibilidade de etapas_fluxo/faqs.
create trigger trg_auditoria_objecoes
  after insert or update or delete on objecoes
  for each row execute function fn_auditoria_log();

-- ============================================================================
-- Fim da migration 008.
-- ============================================================================
