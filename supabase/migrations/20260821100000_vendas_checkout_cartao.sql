-- ============================================================================
-- MIGRATION 042 — Vendas: guarda o link do Checkout de cartão da Asaas
-- Sistema de Gestão ArrudaCred
-- Contexto (Luiz, 21/08/2026, redesenho de Detalhes da Venda): quando a venda
-- é por cartão, o sistema gera um Checkout hospedado na Asaas e manda o link
-- por WhatsApp na hora — mas nunca guarda esse link em lugar nenhum. Se o
-- Luiz quiser ver ou copiar o link depois, voltando na tela, não tinha como.
--
-- O link do Checkout expira em 24h (minutesToExpire: 1440, já configurado em
-- src/lib/asaas/cliente.ts) — por isso guarda também quando foi gerado
-- (asaas_checkout_gerado_em), pra a tela saber se o link salvo ainda é válido
-- ou se precisa gerar um novo sob demanda.
-- ============================================================================

alter table contratos add column if not exists asaas_checkout_id text;
alter table contratos add column if not exists asaas_checkout_url text;
alter table contratos add column if not exists asaas_checkout_gerado_em timestamptz;

comment on column contratos.asaas_checkout_id is
  'Id do Checkout hospedado da Asaas (venda por cartão) — só preenchido quando metodo_pagamento = cartao.';
comment on column contratos.asaas_checkout_url is
  'Link do Checkout hospedado da Asaas — expira em 24h (minutesToExpire: 1440). Ver asaas_checkout_gerado_em pra saber se ainda é válido.';
comment on column contratos.asaas_checkout_gerado_em is
  'Quando o Checkout atual foi gerado — usado pra tela decidir se mostra o link salvo (ainda dentro de 24h) ou o botão "Gerar novo link".';

-- ============================================================================
-- Fim da migration 042.
-- ============================================================================
