-- ============================================================================
-- ⚠️ SUPERSEDIDO EM 19/08/2026 — NÃO RODAR MAIS.
-- Luiz já tinha rodado uma versão anterior da migration 036 em 18/08 (antes
-- dela mudar de novo no mesmo dia). Rodar este arquivo agora falharia
-- ("relation already exists"). A correção certa é
-- supabase/migrations/20260819110000_vendas_corrige_contratos_desatualizado.sql
-- (só ALTER, não recria nada). A migration 037 (pessoas.rg etc.) já foi
-- rodada separadamente e está OK. Mantido só como histórico.
-- ============================================================================
--
-- MIGRATIONS PENDENTES — Vendas (Contrato/Assinatura/Financeiro) — rodar no
-- SQL Editor do Supabase. Projeto hub-arruda (mzvaqjhalynaceecnayt).
-- Consolidado em 19/08/2026.
--
-- São 2 migrations, só do módulo Vendas. Passaram por tsc/eslint/vitest
-- (384 testes verdes) mas NUNCA rodaram no banco. Nenhum agente rodou nada —
-- só escreveram o .sql e pararam, como manda a regra.
--
-- Dá pra rodar o arquivo inteiro de uma vez, nesta ordem (036 antes de 037).
-- ============================================================================

-- ============================================================================
-- INICIO: 20260818090001_vendas_contrato_nucleo.sql
-- ============================================================================
-- ============================================================================
-- MIGRATION 036 — Vendas: núcleo de Contrato, Assinatura e Financeiro da venda
-- Sistema de Gestão ArrudaCred
-- Spec: docs/superpowers/specs/2026-08-17-modulo-vendas-design.md, seções 3.2/3.3/3.4
-- Plano: docs/superpowers/plans/2026-08-18-vendas-contrato.md
-- ============================================================================

create table contrato_templates (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos(id),
  conteudo_html text not null,
  versao integer not null default 1,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table contrato_templates is
  'Template de contrato por Produto (só faz sentido pra tipo proprio/subcontratado). Placeholders resolvidos na geração: {{dados_cliente}}, {{valor_total}}, {{valor_total_extenso}}, {{tabela_vencimentos}}, {{forma_pagamento}}, {{lista_documentos}}. Editado num editor HTML rico (TipTap) pelo admin, sem deploy.';
comment on column contrato_templates.conteudo_html is
  'Corpo do contrato em HTML (produzido pelo editor rico, não markdown) com placeholders — vira PDF direto, sem conversão intermediária (src/lib/vendas/geracao-pdf.ts).';
comment on column contrato_templates.versao is
  'Incrementada manualmente pelo admin ao editar um template já usado em contrato existente — contratos já gerados guardam o texto resolvido no PDF, não recalculam ao template mudar.';

create table contratos (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null unique references oportunidades(id),
  contrato_template_id uuid references contrato_templates(id),
  pessoa_signatario_id uuid not null references pessoas(id),
  pessoa_arrudacred_signatario_id uuid references pessoas(id),
  fornecedor_id uuid references pessoas(id),
  pdf_url text,
  status text not null default 'contrato_gerado'
    check (status in (
      'contrato_gerado', 'aguardando_assinatura', 'assinado',
      'parcelas_emitidas', 'aguardando_pagamento', 'concluida', 'cancelada'
    )),
  motivo_cancelamento text,
  assinafy_document_id text,
  assinafy_document_status text,
  forma_pagamento text check (forma_pagamento in ('avista', 'parcelado')),
  metodo_pagamento text check (metodo_pagamento in ('boleto_pix', 'cartao')),
  parcelas_qtd integer not null default 1,
  valor_total numeric(12,2) not null,
  enviado_em timestamptz,
  assinado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table contratos is
  '1 Oportunidade = 1 registro de venda no Painel de Vendas, mesmo em pacote de vários documentos (regra fechada em KANBAN_COMERCIAL_LIMPANOME.md/seção 11 do plano mestre). Pra proprio/subcontratado é gerado pela tela de Fechamento de Venda (spec seção 3.2.1) com contrato/PDF/Assinafy de verdade. Pra comissionado é gerado pela ação "Confirmar venda" (spec seção 3.4) direto em aguardando_pagamento — sem contrato com a ArrudaCred, por isso contrato_template_id/pessoa_arrudacred_signatario_id/forma_pagamento/metodo_pagamento ficam null nesse caso (ver comentário de cada coluna). `status` é o estágio da venda no Painel de Vendas — quadro próprio do Vendas, SEM relação com `oportunidades.etapa_kanban` (kanban do CRM, dados diferentes, tabela diferente). Nos marcos-chave (assinado, 1ª parcela/comissão paga, cancelada) o Vendas empurra uma atualização pontual pro etapa_kanban da Oportunidade, mas nunca lê/depende dele de volta.';
comment on column contratos.status is
  'Estágio da venda: contrato_gerado (PDF pronto, instantâneo) → aguardando_assinatura (enviado à Assinafy) → assinado → parcelas_emitidas (cobrança criada na Asaas, instantâneo) → aguardando_pagamento → concluida (1ª parcela paga) | cancelada (cliente desistiu antes de assinar, ou assinou e não pagou — motivo em motivo_cancelamento). Comissionado nasce direto em aguardando_pagamento (pula os estágios de contrato/assinatura, que não existem pra esse tipo de produto) e avança pra concluida quando a 1ª parcela da comissão do fornecedor é recebida.';
comment on column contratos.motivo_cancelamento is
  'Preenchido só quando status = cancelada — texto livre (ex.: "cliente desistiu antes de assinar", "recusado pelo signatário", "não pagou a 1ª parcela").';
comment on column contratos.oportunidade_id is
  'Único — reforça a regra de 1 Oportunidade = 1 registro de venda.';
comment on column contratos.pessoa_signatario_id is
  'O cliente, ou o representante legal (via pessoa_representantes) quando o cliente é PJ. Pra comissionado é o cliente da venda mesmo sem assinatura de contrato com a ArrudaCred (quem contratou o serviço com o fornecedor).';
comment on column contratos.pessoa_arrudacred_signatario_id is
  'Pessoa da ArrudaCred que assina — configurável via configuracoes (chave contrato_arrudacred_signatario), não hardcoded no código. Null pra comissionado (não existe contrato com a ArrudaCred).';
comment on column contratos.fornecedor_id is
  'Só preenchido quando o Produto é subcontratado e fornecedor_definido_em = ''venda'' — é aqui que a escolha do fornecedor por venda fica registrada, não em produtos.';
comment on column contratos.assinafy_document_id is
  'id do documento na Assinafy (campo object.id no payload do webhook) — preenchido ao enviar pra assinatura.';
comment on column contratos.assinafy_document_status is
  'Espelho do status retornado pela Assinafy (uploaded/metadata_ready/pending_signature/certificating/certificated/rejected_by_signer/...) — só pra debug, quem manda no fluxo é a coluna status acima.';
comment on column contratos.forma_pagamento is
  'avista ou parcelado — mapeado de conversas.dados.detalhe_pagamento.tipo (CRM, spec 2026-08-18-captura-detalhe-pagamento-fechamento-design.md) quando existir, senão capturado na tela de Fechamento de Venda. Null pra comissionado — o cliente paga o fornecedor, não a ArrudaCred.';
comment on column contratos.metodo_pagamento is
  'boleto_pix ou cartao — únicas duas opções da regra de negócio validada com o Luiz (spec 2026-08-18-captura-detalhe-pagamento-fechamento-design.md, seção 1). Mapeado de conversas.dados.detalhe_pagamento.forma quando existir, senão capturado na tela de Fechamento de Venda. Null pra comissionado.';
comment on column contratos.parcelas_qtd is
  '1 = à vista.';
comment on column contratos.valor_total is
  'Snapshot de oportunidades.valor_estimado no momento da geração — inclui a soma de oportunidade_documentos quando é pacote.';

create table contrato_parcelas (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  numero integer not null,
  valor numeric(12,2) not null,
  vencimento_previsto date not null,
  asaas_payment_id text,
  asaas_installment_id text,
  status text not null default 'previsto'
    check (status in ('previsto', 'gerado', 'pago', 'atrasado', 'cancelado')),
  pago_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table contrato_parcelas is
  'Plano de parcelas de um contrato — confirmado na tela de Fechamento de Venda, alimenta a tabela de vencimentos do PDF e depois é reaproveitado (sem recalcular) quando a cobrança real é criada na Asaas após a assinatura. Preparado pro consumo futuro da régua de cobrança (REGUA_COBRANCA_ARRUDACRED.md, fora de escopo aqui).';
comment on column contrato_parcelas.asaas_payment_id is
  'id da cobrança individual na Asaas (formato pay_...) — preenchido só depois da assinatura, quando a cobrança real é criada.';
comment on column contrato_parcelas.asaas_installment_id is
  'id do parcelamento completo na Asaas — compartilhado entre todas as parcelas do mesmo contrato quando parcelas_qtd > 1.';

create table comissoes_fornecedor_receber (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references oportunidades(id),
  fornecedor_id uuid not null references pessoas(id),
  produto_id uuid not null references produtos(id),
  numero integer not null,
  valor numeric(12,2) not null,
  data_prevista date not null,
  status text not null default 'previsto' check (status in ('previsto', 'recebido')),
  recebido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table comissoes_fornecedor_receber is
  'Comissão que a ArrudaCred recebe do fornecedor em produtos comissionados (sem contrato/Assinafy — o contrato de verdade é entre cliente e fornecedor, fora do sistema). Gerada de uma vez na ação "Confirmar venda", a partir da regra em fornecedor_produtos.';
comment on column comissoes_fornecedor_receber.data_prevista is
  'data de referência informada na confirmação (data em que o cliente assinou com o fornecedor) + fornecedor_produtos.comissao_dias_primeira_parcela + comissao_intervalo_dias_parcelas × (número da parcela − 1).';

create index idx_contrato_templates_produto on contrato_templates(produto_id);
create index idx_contratos_oportunidade on contratos(oportunidade_id);
create index idx_contrato_parcelas_contrato on contrato_parcelas(contrato_id);
create index idx_comissoes_fornecedor_receber_oportunidade on comissoes_fornecedor_receber(oportunidade_id);
create index idx_comissoes_fornecedor_receber_fornecedor on comissoes_fornecedor_receber(fornecedor_id);

alter table contrato_templates enable row level security;
create policy admin_acesso_total on contrato_templates for all to authenticated using (true) with check (true);
create trigger trg_auditoria_contrato_templates
  after insert or update or delete on contrato_templates
  for each row execute function fn_auditoria_log();

alter table contratos enable row level security;
create policy admin_acesso_total on contratos for all to authenticated using (true) with check (true);
create trigger trg_auditoria_contratos
  after insert or update or delete on contratos
  for each row execute function fn_auditoria_log();

alter table contrato_parcelas enable row level security;
create policy admin_acesso_total on contrato_parcelas for all to authenticated using (true) with check (true);
create trigger trg_auditoria_contrato_parcelas
  after insert or update or delete on contrato_parcelas
  for each row execute function fn_auditoria_log();

alter table comissoes_fornecedor_receber enable row level security;
create policy admin_acesso_total on comissoes_fornecedor_receber for all to authenticated using (true) with check (true);
create trigger trg_auditoria_comissoes_fornecedor_receber
  after insert or update or delete on comissoes_fornecedor_receber
  for each row execute function fn_auditoria_log();

-- -----------------------------------------------------------------------------
-- Bucket de Storage
-- -----------------------------------------------------------------------------
-- contratos: PRIVADO (contrato assinado tem dado pessoal do cliente — mesmo motivo de
-- pessoa-documentos ser privado). Acesso só via signed URL gerada sob demanda.
insert into storage.buckets (id, name, public)
values ('contratos', 'contratos', false)
on conflict (id) do nothing;

create policy contratos_storage_acesso_total on storage.objects
  for all to authenticated
  using (bucket_id = 'contratos')
  with check (bucket_id = 'contratos');

-- contrato-template-assets: PÚBLICO — imagens que o admin insere no editor do template
-- (logo/timbrado), não dado de cliente. Público evita lidar com expiração de signed URL dentro
-- do editor rico e na hora de gerar o PDF (mesmo raciocínio de pessoa-fotos).
insert into storage.buckets (id, name, public)
values ('contrato-template-assets', 'contrato-template-assets', true)
on conflict (id) do nothing;

create policy contrato_template_assets_storage_acesso_total on storage.objects
  for all to authenticated
  using (bucket_id = 'contrato-template-assets')
  with check (bucket_id = 'contrato-template-assets');

-- ============================================================================
-- Fim da migration 036.
-- ============================================================================

-- FIM: 20260818090001_vendas_contrato_nucleo.sql

-- ============================================================================
-- INICIO: 20260818100000_vendas_dados_contrato_pessoa.sql
-- ============================================================================
-- ============================================================================
-- MIGRATION 037 — Vendas: dados de Pessoa exigidos pelo contrato (RG, estado civil,
-- profissão) + nome de cada documento do "pacote"
-- Sistema de Gestão ArrudaCred
-- Plano: docs/superpowers/plans/2026-08-18-vendas-contrato.md, Task 1b
-- ============================================================================

-- -----------------------------------------------------------------------------
-- pessoas: RG, estado civil e profissão — exigidos pra montar o bloco "dados do
-- cliente"/"dados do representante" no contrato (spec de 18/08/2026, levantada com o
-- Luiz). Só do SIGNATÁRIO (responsável financeiro que assina — PF, ou PJ +
-- representante legal), não de todo documento do pacote (ver decisão abaixo). Nullable:
-- a maioria das Pessoas hoje (Lead/Cliente vindo do CRM) nunca preencheu isso — só passa
-- a ser exigido de verdade na tela de Fechamento de Venda, não no cadastro. Tabela
-- núcleo compartilhada — mudança 100% aditiva, não quebra nenhum consumidor existente
-- (CRM, motor de fluxo).
-- -----------------------------------------------------------------------------
alter table pessoas add column rg text;
alter table pessoas add column estado_civil text;
alter table pessoas add column profissao text;

comment on column pessoas.rg is
  'RG (ou documento de identificação equivalente) — só relevante pra Pessoa Física. Exigido pra gerar contrato (Vendas), opcional em qualquer outro contexto.';
comment on column pessoas.estado_civil is
  'Texto livre (solteiro/casado/divorciado/viúvo/união estável, etc.) — sem lista fechada pra não travar em enum incompleta. Só relevante pra Pessoa Física.';
comment on column pessoas.profissao is
  'Só relevante pra Pessoa Física — inclui o representante legal de uma Pessoa Jurídica (que é, ele mesmo, uma Pessoa Física em pessoa_representantes).';

-- -----------------------------------------------------------------------------
-- oportunidade_documentos: nome de cada documento do pacote — decisão de escopo do
-- Luiz (18/08/2026): só temos dado completo (RG/estado civil/profissão/endereço) de
-- quem assina o contrato e é o responsável financeiro. Os demais CPF/CNPJ cobertos pelo
-- mesmo contrato (o "pacote" — na prática quase sempre 1 ou 2, mas pode ser N) só têm
-- documento + nome completo/razão social, e é só isso que {{lista_documentos}} usa —
-- nada de resolver/criar uma Pessoa completa pra cada um.
-- -----------------------------------------------------------------------------
alter table oportunidade_documentos add column nome_razao_social text;

comment on column oportunidade_documentos.nome_razao_social is
  'Nome completo (CPF) ou razão social (CNPJ) do documento — preenchido na tela de Fechamento de Venda junto com documento, quando ainda não vier do funil do CRM. É todo o dado que se tem desses documentos além do próprio número; usado em {{lista_documentos}} no contrato.';

-- ============================================================================
-- Fim da migration 037.
-- ============================================================================

-- FIM: 20260818100000_vendas_dados_contrato_pessoa.sql
