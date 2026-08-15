-- ============================================================================
-- MIGRATION 017 — Controle de e-mail de marketing (boas-vindas + descadastro)
-- Sistema de Gestão ArrudaCred
--
-- Luiz pediu (15/08/2026) um e-mail de boas-vindas automático assim que a
-- Malala captura o e-mail do lead — primeiro e-mail de uma base de mail
-- marketing que vai crescer com a régua de nutrição pós-perda (Fase 6). Dois
-- controles necessários desde o primeiro envio, não depois: não mandar duas
-- vezes o mesmo e-mail de boas-vindas pro mesmo lead, e respeitar
-- descadastro (link obrigatório no rodapé — LGPD e boas práticas de entrega).
-- ============================================================================

alter table pessoas
  add column email_boas_vindas_enviado boolean not null default false,
  add column email_marketing_opt_out boolean not null default false;

comment on column pessoas.email_boas_vindas_enviado is
  'true depois que o e-mail de boas-vindas (src/lib/email/boas-vindas.ts) é enviado uma vez — evita reenvio se o checkpoint de e-mail for revisitado.';
comment on column pessoas.email_marketing_opt_out is
  'true quando a pessoa clica o link de descadastro (/descadastro). Todo envio de e-mail de marketing (boas-vindas, nutrição pós-perda) precisa checar esta coluna antes de mandar.';

-- ============================================================================
-- Fim da migration 017.
-- ============================================================================
