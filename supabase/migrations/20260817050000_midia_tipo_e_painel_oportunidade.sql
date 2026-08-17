-- ============================================================================
-- MIGRATION 027 — midia_tipo em mensagens (renderização correta na timeline)
-- Sistema de Gestão ArrudaCred
-- ============================================================================

alter table mensagens add column if not exists midia_tipo text;
comment on column mensagens.midia_tipo is
  'Categoria da mídia em midia_url — imagem/audio/video/documento (mesmo vocabulário de MensagemEtapa, tipos.ts). Preenchida nas 3 origens de mensagem (lead via webhook, humano via composer, Malala via motor de fluxo). Nulo em mensagens antigas anteriores a esta migration — o frontend cai pra "imagem" nesse caso (era o único tipo que já existia antes).';

-- ============================================================================
-- Fim da migration 027.
-- ============================================================================
