-- ============================================================================
-- MIGRATION 030 — Detecção de bloqueio de WhatsApp no follow-up
-- Sistema de Gestão ArrudaCred
--
-- Luiz pediu (17/08/2026): se as últimas 3 mensagens de follow-up por WhatsApp não forem
-- entregues (sinal forte de que o lead bloqueou nosso número — diferente de só "não respondeu",
-- que já é coberto pelo item 7 da agenda, 10 dias, motivo "LEAD PAROU DE RESPONDER"), encerrar a
-- régua de WhatsApp antecipadamente marcando a oportunidade como Perdida com motivo
-- "LEAD PROVÁVEL BLOQUEOU ENVIO DE MENSAGENS" — mantendo a régua de e-mail (itens 8-10, nutrição
-- 30/60/90 dias) rodando normalmente.
--
-- Pré-requisito descoberto ao construir: o disparo de follow-up por WhatsApP (dispararItemFollowup,
-- persistencia.ts) só GRAVAVA a mensagem em `mensagens`, nunca mandava de verdade pela Zapster —
-- por isso nunca existia confirmação de entrega pra checar. Corrigido junto com esta migration
-- (persistencia.ts agora chama enviarMensagemTexto de verdade nesse ponto).
-- ============================================================================

alter table mensagens add column origem_followup boolean not null default false;
comment on column mensagens.origem_followup is
  'true quando esta mensagem foi disparada pela régua de follow-up (dispararItemFollowup), não pelo script normal nem por um humano — usado pra checar confirmação de entrega das últimas N tentativas de follow-up sem misturar com outras mensagens da conversa.';

alter table conversas add column followup_whatsapp_bloqueado boolean not null default false;
comment on column conversas.followup_whatsapp_bloqueado is
  'true quando o motor detectou que as últimas 3 mensagens de follow-up por WhatsApp não foram entregues (provável bloqueio do número pelo lead) — a partir daí a régua pula os itens de canal whatsapp e só continua disparando os de e-mail.';

-- ============================================================================
-- Fim da migration 030.
-- ============================================================================
