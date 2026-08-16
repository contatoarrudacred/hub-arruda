-- ============================================================================
-- MIGRATION 025 — Follow-up manual ativado por atendente humano (Fase 8 do Bloco B)
-- Sistema de Gestão ArrudaCred
-- ============================================================================

alter table conversas add column if not exists followup_manual_ativo boolean not null default false;
comment on column conversas.followup_manual_ativo is
  'Atendente humano ativou follow-up automático manualmente pra esta conversa (modal ao trocar de conversa sem resposta do lead, Tela de Atendimento) — sem isso, o cron (src/app/api/cron/followups/route.ts) só cuida de conversas com a Malala no controle (sob_supervisor=false). Some sozinho quando o lead responde (mesmo update que zera aguardando_resposta_desde em registrarMensagemLead) ou quando a cadência termina (dispararItemFollowup).';

-- ============================================================================
-- Fim da migration 025.
-- ============================================================================
