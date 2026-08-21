-- ============================================================================
-- MIGRATION 042 — Vendas: remove a etapa "gerando_financeiro" do Kanban
-- Sistema de Gestão ArrudaCred
-- Contexto (Luiz, 20/08/2026): assim que o webhook document_ready da Assinafy
-- confirma que todo mundo assinou, o sistema já tenta criar a cobrança na
-- Asaas na hora (ver src/lib/vendas/progressao.ts, tentarGerarFinanceiro,
-- disparado direto do handler do webhook) — se der certo, o contrato pula
-- direto pra "aguardando_pagamento"; se falhar, o erro fica visível em
-- "aguardando_assinaturas" mesmo (a etapa anterior, já confirmada), nunca em
-- "gerando_financeiro". A coluna nunca representou um estado real
-- intermediário, só ficava sempre vazia — mesmo achado e mesmo motivo da
-- remoção de "envelopando_assinaturas" (migration 041).
--
-- Só aperta o CHECK constraint — nenhum UPDATE necessário. Confirmado no
-- código (antes desta migration): nada em nenhum lugar do sistema jamais
-- escreveu 'gerando_financeiro' como valor real de contratos.status, só
-- existia listado no enum/tipo. Nenhuma linha pode ter esse valor.
-- ============================================================================

alter table contratos drop constraint if exists contratos_status_check;
alter table contratos add constraint contratos_status_check
  check (status in (
    'nova_oportunidade', 'emitindo_contrato', 'aguardando_assinaturas',
    'aguardando_pagamento', 'concluida', 'cancelada'
  ));
comment on column contratos.status is
  'Etapa da venda no Kanban de Vendas: nova_oportunidade (registro criado, contrato ainda não gerado ou falhou) → emitindo_contrato (gerando PDF e enviando à Assinafy, as duas automáticas em sequência) → aguardando_assinaturas (esperando assinatura humana; ao confirmar, tenta criar a cobrança na Asaas na hora, sem coluna própria) → aguardando_pagamento (esperando pagamento humano) → concluida (1ª parcela paga) | cancelada. Etapas automáticas (emitindo_contrato e a criação de cobrança disparada ao confirmar assinatura) tentam de novo sozinhas até 3x em caso de erro (ver ultimo_erro/tentativas_erro) — depois disso, só ação manual. Comissionado não passa por nada disso, nasce direto em aguardando_pagamento (ver comentário da tabela).';

-- ============================================================================
-- Fim da migration 042.
-- ============================================================================
