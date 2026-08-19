-- Base do mecanismo de debounce/concatenação de mensagens seguidas do lead (19/08/2026, Luiz:
-- "vamos corrigir tudo mas de forma global"). Cada mensagem do WhatsApp vira uma invocação
-- serverless independente, sem estado compartilhado entre uma e outra — buffer_token é como uma
-- invocação sabe se ainda é "a mais recente" depois de esperar alguns segundos (ver
-- src/app/api/webhooks/zapster/route.ts): grava um token ao receber a mensagem, espera, relê — se
-- o valor mudou, outra mensagem chegou depois e essa invocação desiste (a mais nova processa tudo).
--
-- Aditiva, sem risco pra dado existente: coluna nova, nullable, sem default que precise backfill.

alter table conversas
  add column if not exists buffer_token text;

comment on column conversas.buffer_token is 'Token do debounce de mensagens seguidas do lead (webhook Zapster) — só a invocação que gravou o valor mais recente processa o turno. Null quando não há debounce em andamento.';
