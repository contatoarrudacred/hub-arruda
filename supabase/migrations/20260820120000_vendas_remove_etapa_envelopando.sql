-- ============================================================================
-- MIGRATION 041 — Vendas: remove a etapa "envelopando_assinaturas" do Kanban
-- Sistema de Gestão ArrudaCred
-- Contexto (Luiz, 20/08/2026): "Emitindo Contrato" e "Envelopando Assinaturas"
-- sempre rodavam automáticas uma atrás da outra, sem nenhuma pausa humana no
-- meio (ver src/lib/vendas/progressao.ts, tentarEmitirContrato já encadeia
-- direto pra tentarEnvelopar) — a coluna "Envelopando Assinaturas" no Kanban
-- nunca representou um estado real intermediário, só ficava sempre vazia.
-- Juntando as duas num só card/coluna: "Emitindo Contrato" agora cobre
-- PDF + envio pra Assinafy, indo direto pra "Aguardando Assinaturas" (a
-- próxima pausa real, que espera ação humana de verdade).
--
-- Só aperta o CHECK constraint — nenhum UPDATE necessário. Confirmado no
-- código (antes desta migration): nada em nenhum lugar do sistema jamais
-- escreveu 'envelopando_assinaturas' como valor real de contratos.status,
-- só existia listado no enum/tipo. Nenhuma linha pode ter esse valor.
-- ============================================================================

alter table contratos drop constraint if exists contratos_status_check;
alter table contratos add constraint contratos_status_check
  check (status in (
    'nova_oportunidade', 'emitindo_contrato', 'aguardando_assinaturas',
    'gerando_financeiro', 'aguardando_pagamento', 'concluida', 'cancelada'
  ));
comment on column contratos.status is
  'Etapa da venda no Kanban de Vendas: nova_oportunidade (registro criado, contrato ainda não gerado ou falhou) → emitindo_contrato (gerando PDF e enviando à Assinafy, as duas automáticas em sequência) → aguardando_assinaturas (esperando assinatura humana) → gerando_financeiro (criando cobrança na Asaas) → aguardando_pagamento (esperando pagamento humano) → concluida (1ª parcela paga) | cancelada. Etapas automáticas (emitindo_contrato/gerando_financeiro) tentam de novo sozinhas até 3x em caso de erro (ver ultimo_erro/tentativas_erro) — depois disso, só ação manual. Comissionado não passa por nada disso, nasce direto em aguardando_pagamento (ver comentário da tabela).';

-- ============================================================================
-- Fim da migration 041.
-- ============================================================================
