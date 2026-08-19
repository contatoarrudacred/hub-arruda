-- ============================================================================
-- MIGRATION 039 — Vendas: Nova Oportunidade + Kanban de Vendas (novo vocabulário)
-- Sistema de Gestão ArrudaCred
-- Spec: docs/superpowers/specs/2026-08-19-vendas-nova-oportunidade-kanban-design.md
-- ============================================================================

-- -----------------------------------------------------------------------------
-- produtos: novo campo — controla se a tela de Nova Oportunidade mostra a seção
-- de pacote de documentos (N CPF/CNPJ cobertos pelo mesmo contrato).
-- -----------------------------------------------------------------------------
alter table produtos add column exige_lista_documentos boolean not null default false;
comment on column produtos.exige_lista_documentos is
  'Quando true, a tela de Nova Oportunidade mostra a seção de pacote (array de documento+nome cobertos pelo mesmo contrato). Só faz sentido pra proprio/subcontratado.';

-- -----------------------------------------------------------------------------
-- contratos: novo vocabulário de status (etapa inicial "nova_oportunidade" —
-- existe desde o primeiro instante, antes até do PDF ser gerado) + campos de
-- erro/retentativa das etapas automáticas.
-- -----------------------------------------------------------------------------
alter table contratos drop constraint if exists contratos_status_check;
alter table contratos alter column status drop default;
update contratos set status = case status
  when 'contrato_gerado' then 'emitindo_contrato'
  when 'aguardando_assinatura' then 'aguardando_assinaturas'
  when 'assinado' then 'gerando_financeiro'
  when 'parcelas_emitidas' then 'gerando_financeiro'
  else status
end;
alter table contratos alter column status set default 'nova_oportunidade';
alter table contratos add constraint contratos_status_check
  check (status in (
    'nova_oportunidade', 'emitindo_contrato', 'envelopando_assinaturas', 'aguardando_assinaturas',
    'gerando_financeiro', 'aguardando_pagamento', 'concluida', 'cancelada'
  ));
comment on column contratos.status is
  'Etapa da venda no Kanban de Vendas: nova_oportunidade (registro criado, contrato ainda não gerado ou falhou) → emitindo_contrato (gerando PDF) → envelopando_assinaturas (enviando à Assinafy) → aguardando_assinaturas (esperando assinatura humana) → gerando_financeiro (criando cobrança na Asaas) → aguardando_pagamento (esperando pagamento humano) → concluida (1ª parcela paga) | cancelada. Etapas automáticas (emitindo_contrato/envelopando_assinaturas/gerando_financeiro) tentam de novo sozinhas até 3x em caso de erro (ver ultimo_erro/tentativas_erro) — depois disso, só ação manual. Comissionado não passa por nada disso, nasce direto em aguardando_pagamento (ver comentário da tabela).';

alter table contratos add column ultimo_erro text;
comment on column contratos.ultimo_erro is
  'Mensagem do último erro numa etapa automática (emitindo_contrato/envelopando_assinaturas/gerando_financeiro) — null quando não há erro pendente. Some quando a etapa dá certo ou quando alguém pede retentativa manual.';

alter table contratos add column tentativas_erro integer not null default 0;
comment on column contratos.tentativas_erro is
  'Quantas vezes a etapa automática atual falhou seguidas. Chega a 3 → para de tentar sozinha, precisa de retentativa manual (por card ou em lote). Reseta pra 0 a cada retentativa manual ou quando a etapa dá certo.';

-- -----------------------------------------------------------------------------
-- Realtime: Kanban de Vendas reflete mudança de etapa sem recarregar a página.
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table contratos;

-- ============================================================================
-- Fim da migration 039.
-- ============================================================================
