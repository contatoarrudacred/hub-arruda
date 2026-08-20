-- ============================================================================
-- MIGRATION 038 — Vendas: corrige contratos/contrato_templates desatualizados
-- Sistema de Gestão ArrudaCred
--
-- O que aconteceu: a migration 036 (20260818090001_vendas_contrato_nucleo.sql)
-- foi enviada ao Luiz em 18/08 18h00 numa versão inicial. Ainda no mesmo dia, o
-- arquivo mudou de novo (renomeação de coluna, novo status, motivo_cancelamento,
-- campos viraram nullable pra suportar venda comissionada) — mas o Luiz já tinha
-- rodado a versão inicial no SQL Editor antes dessa atualização chegar até ele.
-- Resultado: `contratos`/`contrato_templates` em produção ficaram na forma
-- antiga. Descoberto em 19/08/2026 via erro real em produção: "column
-- contratos.motivo_cancelamento does not exist".
--
-- Esta migration só ajusta a estrutura (ALTER), não recria nada — as duas
-- tabelas estão vazias (nenhuma venda passou pelo fluxo ainda), mas o script é
-- escrito pra não quebrar mesmo se já tiver alguma linha.
-- ============================================================================

-- -----------------------------------------------------------------------------
-- contrato_templates: conteudo_markdown -> conteudo_html (decisão do Luiz de
-- editor HTML rico via TipTap, em vez de markdown).
-- -----------------------------------------------------------------------------
alter table contrato_templates rename column conteudo_markdown to conteudo_html;
comment on column contrato_templates.conteudo_html is
  'Corpo do contrato em HTML (produzido pelo editor rico, não markdown) com placeholders — vira PDF direto, sem conversão intermediária (src/lib/vendas/geracao-pdf.ts).';

-- -----------------------------------------------------------------------------
-- contratos: novo vocabulário de status (Painel de Vendas), motivo_cancelamento,
-- e os campos que só fazem sentido pra proprio/subcontratado viram opcionais
-- (comissionado não tem contrato/template/forma de pagamento com a ArrudaCred).
-- -----------------------------------------------------------------------------
alter table contratos drop constraint if exists contratos_status_check;
alter table contratos alter column status drop default;
update contratos set status = case status
  when 'gerado' then 'contrato_gerado'
  when 'enviado' then 'aguardando_assinatura'
  when 'assinado' then 'assinado'
  when 'recusado' then 'cancelada'
  when 'cancelado' then 'cancelada'
  else status
end;
alter table contratos alter column status set default 'contrato_gerado';
alter table contratos add constraint contratos_status_check
  check (status in (
    'contrato_gerado', 'aguardando_assinatura', 'assinado',
    'parcelas_emitidas', 'aguardando_pagamento', 'concluida', 'cancelada'
  ));
comment on column contratos.status is
  'Estágio da venda: contrato_gerado (PDF pronto, instantâneo) → aguardando_assinatura (enviado à Assinafy) → assinado → parcelas_emitidas (cobrança criada na Asaas, instantâneo) → aguardando_pagamento → concluida (1ª parcela paga) | cancelada (cliente desistiu antes de assinar, ou assinou e não pagou — motivo em motivo_cancelamento). Comissionado nasce direto em aguardando_pagamento (pula os estágios de contrato/assinatura, que não existem pra esse tipo de produto) e avança pra concluida quando a 1ª parcela da comissão do fornecedor é recebida.';

alter table contratos add column if not exists motivo_cancelamento text;
comment on column contratos.motivo_cancelamento is
  'Preenchido só quando status = cancelada — texto livre (ex.: "cliente desistiu antes de assinar", "recusado pelo signatário", "não pagou a 1ª parcela").';

alter table contratos alter column contrato_template_id drop not null;
comment on column contratos.contrato_template_id is
  'Null pra comissionado — não existe contrato com a ArrudaCred nesse tipo de produto.';

alter table contratos alter column pessoa_arrudacred_signatario_id drop not null;
comment on column contratos.pessoa_arrudacred_signatario_id is
  'Pessoa da ArrudaCred que assina — configurável via configuracoes (chave contrato_arrudacred_signatario), não hardcoded no código. Null pra comissionado (não existe contrato com a ArrudaCred).';

alter table contratos alter column forma_pagamento drop not null;
comment on column contratos.forma_pagamento is
  'avista ou parcelado — mapeado de conversas.dados.detalhe_pagamento.tipo (CRM, spec 2026-08-18-captura-detalhe-pagamento-fechamento-design.md) quando existir, senão capturado na tela de Fechamento de Venda. Null pra comissionado — o cliente paga o fornecedor, não a ArrudaCred.';

alter table contratos drop constraint if exists contratos_metodo_pagamento_check;
alter table contratos alter column metodo_pagamento drop not null;
update contratos set metodo_pagamento = case metodo_pagamento
  when 'boleto' then 'boleto_pix'
  when 'voucher' then null
  when 'outro' then null
  else metodo_pagamento
end;
alter table contratos add constraint contratos_metodo_pagamento_check
  check (metodo_pagamento in ('boleto_pix', 'cartao'));
comment on column contratos.metodo_pagamento is
  'boleto_pix ou cartao — únicas duas opções da regra de negócio validada com o Luiz (spec 2026-08-18-captura-detalhe-pagamento-fechamento-design.md, seção 1). Mapeado de conversas.dados.detalhe_pagamento.forma quando existir, senão capturado na tela de Fechamento de Venda. Null pra comissionado.';

comment on table contratos is
  '1 Oportunidade = 1 registro de venda no Painel de Vendas, mesmo em pacote de vários documentos (regra fechada em KANBAN_COMERCIAL_LIMPANOME.md/seção 11 do plano mestre). Pra proprio/subcontratado é gerado pela tela de Fechamento de Venda (spec seção 3.2.1) com contrato/PDF/Assinafy de verdade. Pra comissionado é gerado pela ação "Confirmar venda" (spec seção 3.4) direto em aguardando_pagamento — sem contrato com a ArrudaCred, por isso contrato_template_id/pessoa_arrudacred_signatario_id/forma_pagamento/metodo_pagamento ficam null nesse caso (ver comentário de cada coluna). `status` é o estágio da venda no Painel de Vendas — quadro próprio do Vendas, SEM relação com `oportunidades.etapa_kanban` (kanban do CRM, dados diferentes, tabela diferente). Nos marcos-chave (assinado, 1ª parcela/comissão paga, cancelada) o Vendas empurra uma atualização pontual pro etapa_kanban da Oportunidade, mas nunca lê/depende dele de volta.';

-- -----------------------------------------------------------------------------
-- Bucket que faltou: contrato-template-assets (imagens do editor rico de template
-- — logo/timbrado). O bucket "contratos" (PDF assinado) já existia.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('contrato-template-assets', 'contrato-template-assets', true)
on conflict (id) do nothing;

create policy contrato_template_assets_storage_acesso_total on storage.objects
  for all to authenticated
  using (bucket_id = 'contrato-template-assets')
  with check (bucket_id = 'contrato-template-assets');

-- ============================================================================
-- Fim da migration 038.
-- ============================================================================
