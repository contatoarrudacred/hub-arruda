-- ============================================================================
-- MIGRATION 004 — Estado de conversa para o motor de fluxo
-- Sistema de Gestão ArrudaCred
--
-- Lacuna identificada ao implementar o motor de fluxo (Fase 1 do MVP1):
-- 1. "fluxos" exigia produto_id (not null), mas a Abertura + Triagem (Parte 1 e
--    Parte 2 do SCRIPT_LIMPANOME_SERASA_SPC.md) rodam ANTES do produto ser
--    conhecido — não tem como ser um fluxo "de um produto". produto_id passa a
--    ser opcional: null = fluxo geral (abertura/triagem), preenchido = fluxo
--    específico de um produto.
-- 2. Não existia lugar para guardar "onde a conversa está" (qual fluxo, qual
--    etapa) nem os dados capturados checkpoint a checkpoint (campo_salvo) antes
--    de existir uma oportunidade — o que só acontece depois da triagem. Isso
--    fica em "conversas", que já existe desde o primeiro contato.
--
-- Pré-requisito: rodar 001, 002 e 003 antes desta.
-- ============================================================================

alter table fluxos
  alter column produto_id drop not null;

comment on column fluxos.produto_id is
  'Nulo = fluxo geral, roda antes do produto ser identificado (abertura + triagem). Preenchido = fluxo específico daquele produto (ex.: Limpeza de Nome).';

alter table conversas
  add column fluxo_id uuid references fluxos(id),
  add column etapa_fluxo_atual_id uuid references etapas_fluxo(id),
  add column dados jsonb not null default '{}'::jsonb;

comment on column conversas.fluxo_id is
  'Fluxo ativo nesta conversa agora. Começa no fluxo geral (abertura/triagem) e muda para o fluxo do produto assim que a triagem identifica o interesse do lead.';
comment on column conversas.etapa_fluxo_atual_id is
  'Ponteiro de posição no fluxo ativo — a etapa que está aguardando resposta do lead (ou a última enviada). Nulo = conversa ainda não iniciou nenhum fluxo.';
comment on column conversas.dados is
  'Respostas capturadas ao longo da conversa, uma chave por checkpoint com campo_salvo preenchido (ex.: {"nome": "...", "email": "...", "faixa_valor": "..."}). Campos que também são relevantes pro funil (valor_estimado, alto_valor, etc.) são copiados para a oportunidade correspondente pelo motor de fluxo — este campo é o registro bruto de tudo que já foi perguntado nesta conversa.';

-- ============================================================================
-- Fim da migration 004.
-- ============================================================================
