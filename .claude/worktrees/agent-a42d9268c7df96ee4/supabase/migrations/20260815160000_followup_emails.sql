-- ============================================================================
-- MIGRATION 016 — Registro de e-mails de follow-up (nutrição pós-perda)
-- Sistema de Gestão ArrudaCred
--
-- Luiz confirmou (15/08/2026): a régua de follow-up continua depois da
-- oportunidade virar Perdida (item de 10 dias) — os 3 itens seguintes da
-- agenda Padrão são e-mails de nutrição (30/60/90 dias). O relógio da
-- conversa (conversas.aguardando_resposta_desde) continua contando até a
-- régua inteira terminar, não só até a Perdida.
--
-- O conteúdo desses e-mails NÃO entra na tabela `mensagens` — é outro
-- canal, misturar viraria histórico de conversa com coisa que não é
-- conversa. Esta tabela é só o registro de que aquele envio aconteceu (ou,
-- por ora, deveria ter acontecido — status "simulado" até existir um
-- provedor de e-mail conectado de verdade). Provedor definido por Luiz:
-- Resend. Falta a chave de API e o domínio verificado — quando isso
-- existir, o status passa a virar "enviado"/"falhou" de verdade em vez de
-- ficar sempre em "simulado".
-- ============================================================================

create table followup_emails (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references conversas(id),
  agenda_item_id uuid not null references agenda_itens(id),
  destinatario_email text,
  descricao text not null,
  status text not null default 'simulado' check (status in ('simulado', 'enviado', 'falhou')),
  criado_em timestamptz not null default now()
);
comment on table followup_emails is
  'Registro de disparo dos itens de e-mail da agenda de follow-up (nutrição pós-perda) — separado de `mensagens` porque não é WhatsApp. status "simulado" enquanto não existir integração real com provedor de e-mail (Resend, decidido por Luiz em 15/08/2026, ainda não conectado).';
comment on column followup_emails.destinatario_email is
  'Pode ser nulo — nem toda conversa chega a capturar o e-mail do lead (checkpoint condicional, ver abertura_email em fluxo-limpeza-nome.ts).';

-- ============================================================================
-- Fim da migration 016.
-- ============================================================================
