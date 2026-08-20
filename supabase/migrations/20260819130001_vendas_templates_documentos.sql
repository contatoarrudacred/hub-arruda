-- ============================================================================
-- MIGRATION 040 — Vendas: generaliza contrato_templates -> documento_templates
-- Sistema de Gestão ArrudaCred
-- Contexto (Luiz, 19/08/2026): além do template de CONTRATO (já existente, por
-- Produto), o sistema vai precisar de outros tipos de documento — TERMO DE
-- ACORDO e FICHA ASSOCIATIVA, sem vínculo a Produto — que outros módulos vão
-- usar no futuro. Em vez de criar uma tabela nova por tipo, generaliza a que já
-- existe: ganha `tipo` e `nome` (rótulo, já que só CONTRATO se identifica pelo
-- Produto) e `produto_id` vira opcional.
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. Renomeia a tabela — nome antigo (contrato_templates) só fazia sentido
--    quando só existia um tipo de documento. FKs/índices/RLS/trigger existentes
--    seguem a tabela automaticamente no rename, só os nomes internos ficam
--    desatualizados (ajustados abaixo por clareza, não por necessidade).
-- -----------------------------------------------------------------------------
alter table contrato_templates rename to documento_templates;
alter index idx_contrato_templates_produto rename to idx_documento_templates_produto;
alter trigger trg_auditoria_contrato_templates on documento_templates rename to trg_auditoria_documento_templates;

-- -----------------------------------------------------------------------------
-- 2. Novo campo `tipo` — todo registro existente até aqui é um contrato (único
--    tipo que existia), por isso o default cobre os dados já gravados.
-- -----------------------------------------------------------------------------
alter table documento_templates add column tipo text not null default 'contrato'
  check (tipo in ('contrato', 'termo_acordo', 'ficha_associativa'));
comment on column documento_templates.tipo is
  'contrato = vinculado a um Produto, alimenta a emissão automática via Assinafy (src/lib/vendas/emissao-contrato.ts). termo_acordo / ficha_associativa = documentos genéricos, sem vínculo a Produto, ainda sem automação — cadastro/edição de texto por enquanto, uso por outros módulos é futuro.';

-- -----------------------------------------------------------------------------
-- 3. Novo campo `nome` — rótulo do documento. Obrigatório pra tudo (inclusive
--    contrato, que até aqui só se identificava pelo nome do Produto). Backfill
--    dos registros existentes usa o nome do Produto vinculado.
-- -----------------------------------------------------------------------------
alter table documento_templates add column nome text;
update documento_templates dt
  set nome = 'Contrato — ' || p.nome
  from produtos p
  where p.id = dt.produto_id and dt.nome is null;
alter table documento_templates alter column nome set not null;
comment on column documento_templates.nome is
  'Rótulo do documento, mostrado na lista de Template de Documentos. Pra tipo=contrato, sugerido como "Contrato — <nome do Produto>" na criação, mas editável.';

-- -----------------------------------------------------------------------------
-- 4. `produto_id` vira opcional — só faz sentido pra tipo=contrato.
-- -----------------------------------------------------------------------------
alter table documento_templates alter column produto_id drop not null;
alter table documento_templates add constraint documento_templates_produto_tipo_check
  check ((tipo = 'contrato' and produto_id is not null) or (tipo <> 'contrato' and produto_id is null));
comment on column documento_templates.produto_id is
  'Obrigatório quando tipo=contrato (um contrato sempre pertence a um Produto). Null pra termo_acordo/ficha_associativa.';

comment on table documento_templates is
  'Templates de documento editáveis (editor HTML rico, TipTap) sem deploy. tipo=contrato: por Produto, alimenta a emissão automática de contrato (Assinafy) — só faz sentido pra Produto tipo proprio/subcontratado. tipo=termo_acordo/ficha_associativa: sem vínculo a Produto, uso por outros módulos ainda a definir. Placeholders resolvidos na geração de contrato: {{dados_cliente}}, {{valor_total}}, {{valor_total_extenso}}, {{tabela_vencimentos}}, {{forma_pagamento}}, {{lista_documentos}} — só valem pra tipo=contrato.';

-- ============================================================================
-- Fim da migration 040.
-- ============================================================================
