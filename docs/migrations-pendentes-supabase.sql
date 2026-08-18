-- ============================================================================
-- MIGRATIONS PENDENTES — rodar no SQL Editor do Supabase (projeto hub-arruda,
-- mzvaqjhalynaceecnayt). Consolidado pelo Coordenador de Agentes em 18/08/2026.
--
-- Sao as 3 migrations da sub-frente Cadastro do modulo Vendas. Ja estao mescladas
-- em main (o codigo de /admin/vendas/nova e /admin/fornecedores depende delas), mas
-- nunca rodaram no banco. A ordem abaixo importa: a 2a e a 3a dependem da 1a.
--
-- Da pra rodar este arquivo inteiro de uma vez. Se preferir ir uma a uma, cada
-- bloco esta delimitado pelos comentarios ===== abaixo.
-- ============================================================================


-- ============================================================================
-- INICIO: 20260817110000_vendas_cadastro_nucleo.sql
-- ============================================================================
-- ============================================================================
-- MIGRATION 033 — Vendas: cadastro núcleo (produtos, fornecedores, fornecedor_produtos)
-- Sistema de Gestão ArrudaCred
-- Spec: docs/superpowers/specs/2026-08-17-modulo-vendas-design.md, seção 3.1
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. produtos.tipo — troca o enum de proprio/terceiro para os 3 modelos reais
-- -----------------------------------------------------------------------------
-- IMPORTANTE: a constraint precisa ser trocada ANTES do UPDATE — a constraint
-- antiga (check tipo in ('proprio','terceiro')) ainda está ativa até aqui, e
-- não permite gravar 'comissionado'. Gravar antes quebraria a migration.
do $$
declare
  nome_constraint text;
begin
  select con.conname into nome_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'produtos'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%tipo%proprio%';
  if nome_constraint is not null then
    execute format('alter table produtos drop constraint %I', nome_constraint);
  end if;
end $$;

alter table produtos add constraint produtos_tipo_check
  check (tipo in ('proprio', 'subcontratado', 'comissionado'));
comment on column produtos.tipo is
  'proprio = ArrudaCred executa e fatura, sem fornecedor. subcontratado = ArrudaCred fatura o cliente mas paga um fornecedor pra executar. comissionado = fornecedor/administradora fatura o cliente direto, ArrudaCred só recebe comissão. Ver docs/superpowers/specs/2026-08-17-modulo-vendas-design.md seção 2.';

-- Migração de dado existente: hoje só existem produtos 'terceiro' do tipo
-- comissionado (Consórcio, Crédito) — nenhum "subcontratado" foi cadastrado
-- ainda. Ver PENDÊNCIA 1 da spec — revisar antes de rodar se algum produto
-- 'terceiro' hoje for na real subcontratado (nesse caso, corrigir manualmente
-- essa linha antes de rodar a migration). Só pode rodar DEPOIS da constraint
-- nova acima, senão viola a constraint antiga.
update produtos set tipo = 'comissionado' where tipo = 'terceiro';

-- -----------------------------------------------------------------------------
-- 2. produtos.fornecedor_id — só para tipo = 'comissionado' (1 Produto = 1 fornecedor fixo)
-- -----------------------------------------------------------------------------
alter table produtos add column fornecedor_id uuid references pessoas(id);
comment on column produtos.fornecedor_id is
  'Fornecedor/administradora único deste Produto — só preenchido quando tipo = ''comissionado'' (resolve fornecedor_produtos pra calcular a comissão). Produtos subcontratados NÃO usam esta coluna — a escolha de fornecedor por venda fica em contratos.fornecedor_id (sub-frente de Contrato).';
alter table produtos add constraint produtos_fornecedor_id_tipo_check
  check (fornecedor_id is null or tipo = 'comissionado');

-- -----------------------------------------------------------------------------
-- 3. produtos.fornecedor_definido_em — só para tipo = 'subcontratado'
-- -----------------------------------------------------------------------------
alter table produtos add column fornecedor_definido_em text;
comment on column produtos.fornecedor_definido_em is
  'Só relevante quando tipo = ''subcontratado''. ''venda'' = a tela de Vendas exige escolher o fornecedor no fechamento (guardado em contratos.fornecedor_id). ''ordem_servico'' = fica em aberto pro módulo Operação decidir depois.';
alter table produtos add constraint produtos_fornecedor_definido_em_valor_check
  check (fornecedor_definido_em is null or fornecedor_definido_em in ('venda', 'ordem_servico'));
alter table produtos add constraint produtos_fornecedor_definido_em_tipo_check
  check (fornecedor_definido_em is null or tipo = 'subcontratado');

-- -----------------------------------------------------------------------------
-- 4. fornecedores — extensão de pessoa_papeis.tipo_papel = 'fornecedor'
-- -----------------------------------------------------------------------------
create table fornecedores (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null unique references pessoas(id),
  categoria text not null check (categoria in ('consorcio', 'credito', 'subcontratado_servico', 'administrativo')),
  dados_bancarios jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table fornecedores is
  'Extensão de pessoa_papeis.tipo_papel = ''fornecedor'' — qualquer fornecedor do negócio (administradora de consórcio, banco/operadora de crédito, subcontratado de execução, fornecedor administrativo). Escopo amplo confirmado por Luiz — só cadastro nesta frente, contas a pagar ficam pro módulo Financeiro futuro.';
comment on column fornecedores.categoria is
  'Categoria livre pra crescer: consorcio, credito, subcontratado_servico (produto tipo=subcontratado), administrativo (fornecedor que não vende nem executa serviço da ArrudaCred, só recebe pagamento por algo que a própria ArrudaCred contratou).';
comment on column fornecedores.dados_bancarios is
  'jsonb livre (banco, agência, conta, chave PIX) — usado só quando o módulo Financeiro/Operação existir pra pagar o fornecedor. Não tem consumidor ainda nesta frente.';

alter table fornecedores enable row level security;
create policy admin_acesso_total on fornecedores for all to authenticated using (true) with check (true);
create trigger trg_auditoria_fornecedores
  after insert or update or delete on fornecedores
  for each row execute function fn_auditoria_log();

-- -----------------------------------------------------------------------------
-- 5. fornecedor_produtos — comissão que a ArrudaCred RECEBE (espelha afiliado_produtos)
-- -----------------------------------------------------------------------------
create table fornecedor_produtos (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references fornecedores(id),
  produto_id uuid not null references produtos(id),
  percentual_comissao numeric(5,2) not null check (percentual_comissao > 0 and percentual_comissao <= 100),
  forma_comissao text not null check (forma_comissao in ('parcela_unica', 'parcelado')),
  comissao_parcelas_qtd int check (comissao_parcelas_qtd is null or comissao_parcelas_qtd > 0),
  comissao_dias_primeira_parcela int not null check (comissao_dias_primeira_parcela >= 0),
  comissao_intervalo_dias_parcelas int check (comissao_intervalo_dias_parcelas is null or comissao_intervalo_dias_parcelas > 0),
  condicoes jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fornecedor_produtos_parcelado_exige_qtd_check
    check (forma_comissao = 'parcela_unica' or comissao_parcelas_qtd is not null),
  unique (fornecedor_id, produto_id)
);
comment on table fornecedor_produtos is
  'Regra de comissão que a ArrudaCred RECEBE de um fornecedor por um Produto (direção inversa de afiliado_produtos, que é comissão que a ArrudaCred PAGA). Um par fornecedor+produto tem no máximo uma regra ativa. Ver docs/superpowers/specs/2026-08-17-modulo-vendas-design.md seção 3.1.';
comment on column fornecedor_produtos.comissao_dias_primeira_parcela is
  'Dias entre a data de referência (data em que o cliente assinou com o fornecedor, informada manualmente na confirmação da venda) e o vencimento da 1ª parcela de comissão — regra explícita de Luiz: "geralmente X dias após o cliente assinar contrato".';
comment on column fornecedor_produtos.comissao_intervalo_dias_parcelas is
  'Intervalo em dias entre parcelas subsequentes de comissão, quando forma_comissao = ''parcelado''. Nulo quando forma_comissao = ''parcela_unica''.';
comment on column fornecedor_produtos.condicoes is
  'Escape hatch em jsonb só pra exceção que genuinamente não couber nas colunas acima (ex.: regra escalonada por faixa de valor). Não usar pra agenda de pagamento — isso já tem coluna própria.';

alter table fornecedor_produtos enable row level security;
create policy admin_acesso_total on fornecedor_produtos for all to authenticated using (true) with check (true);
create trigger trg_auditoria_fornecedor_produtos
  after insert or update or delete on fornecedor_produtos
  for each row execute function fn_auditoria_log();

-- ============================================================================
-- Fim da migration 033.
-- ============================================================================

-- FIM: 20260817110000_vendas_cadastro_nucleo.sql

-- ============================================================================
-- INICIO: 20260817120001_vendas_seguranca_nucleo_pessoa.sql
-- ============================================================================
-- ============================================================================
-- MIGRATION 034 — Fecha lacuna de segurança: RLS + auditoria nas 6 tabelas
-- núcleo de Pessoa/Papel que nunca tiveram (SEGURANCA_E_AUDITORIA_ARRUDACRED.md
-- seção 2.6), mais reforço defensivo de RLS em outras 6 tabelas pré-existentes
-- (12 no total). Vendas é a primeira frente a escrever nelas via cliente
-- autenticado — sem isso, /admin/fornecedores e /admin/vendas ficam
-- bloqueados em silêncio pelo RLS automático do Supabase.
-- Sistema de Gestão ArrudaCred
-- ============================================================================

alter table entidades_legais enable row level security;
create policy admin_acesso_total on entidades_legais for all to authenticated using (true) with check (true);
create trigger trg_auditoria_entidades_legais
  after insert or update or delete on entidades_legais
  for each row execute function fn_auditoria_log();

alter table unidades_negocio enable row level security;
create policy admin_acesso_total on unidades_negocio for all to authenticated using (true) with check (true);
create trigger trg_auditoria_unidades_negocio
  after insert or update or delete on unidades_negocio
  for each row execute function fn_auditoria_log();

alter table pessoa_papeis enable row level security;
create policy admin_acesso_total on pessoa_papeis for all to authenticated using (true) with check (true);
create trigger trg_auditoria_pessoa_papeis
  after insert or update or delete on pessoa_papeis
  for each row execute function fn_auditoria_log();

alter table pessoa_representantes enable row level security;
create policy admin_acesso_total on pessoa_representantes for all to authenticated using (true) with check (true);
create trigger trg_auditoria_pessoa_representantes
  after insert or update or delete on pessoa_representantes
  for each row execute function fn_auditoria_log();

alter table enderecos enable row level security;
create policy admin_acesso_total on enderecos for all to authenticated using (true) with check (true);
create trigger trg_auditoria_enderecos
  after insert or update or delete on enderecos
  for each row execute function fn_auditoria_log();

alter table identidades_canal enable row level security;
create policy admin_acesso_total on identidades_canal for all to authenticated using (true) with check (true);
create trigger trg_auditoria_identidades_canal
  after insert or update or delete on identidades_canal
  for each row execute function fn_auditoria_log();

-- ============================================================================
-- Reforço defensivo (não é fix de lacuna confirmada): `pessoas`, `oportunidades`,
-- `conversas`, `usuarios_sistema`, `fluxos` e `etapas_fluxo` já têm
-- `create policy admin_acesso_total` desde a migration
-- 20260814160000_auditoria_quem_fez.sql, mas a revisão final não achou um
-- `alter table ... enable row level security` explícito para elas no
-- histórico de migrations. Isso muito provavelmente é um falso alarme: o
-- Supabase habilita RLS automaticamente em toda tabela nova do schema public,
-- então essas tabelas quase certamente já tinham RLS ligado desde a criação
-- (ver docs/SEGURANCA_E_AUDITORIA_ARRUDACRED.md seção 2.4) — e uma policy só
-- funciona se RLS já estiver habilitado, então elas não estariam
-- funcionando hoje se RLS estivesse desligado. Ainda assim,
-- `alter table ... enable row level security` é idempotente (no-op se já
-- habilitado, nunca dá erro), então não custa nada reforçar explicitamente.
-- Nenhuma policy ou trigger nova aqui — essas já existem para as 6 tabelas.
-- ============================================================================

alter table pessoas enable row level security;
alter table oportunidades enable row level security;
alter table conversas enable row level security;
alter table usuarios_sistema enable row level security;
alter table fluxos enable row level security;
alter table etapas_fluxo enable row level security;

-- ============================================================================
-- Fim da migration 034 (12 tabelas: 6 com RLS+auditoria novos, 6 com reforço
-- defensivo de RLS apenas).
-- ============================================================================

-- FIM: 20260817120001_vendas_seguranca_nucleo_pessoa.sql

-- ============================================================================
-- INICIO: 20260817130000_vendas_pessoa_documentos.sql
-- ============================================================================
-- ============================================================================
-- MIGRATION 035 — Vendas: pessoa_documentos + buckets de Storage
-- Sistema de Gestão ArrudaCred
-- Spec: docs/superpowers/specs/2026-08-17-modulo-vendas-design.md, seção 3.1.2
-- ============================================================================

create table pessoa_documentos (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references pessoas(id) on delete cascade,
  tipo_documento text not null,
  descricao text,
  url text not null,
  nome_arquivo text not null,
  enviado_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table pessoa_documentos is
  'Documentos anexados ao cadastro de uma Pessoa (RG, CNH, comprovante de residência, contrato social, etc.) — sem consumidor além do próprio cadastro nesta frente; futuras sub-frentes (Contrato/Operação) podem usar. Armazenado no bucket privado pessoa-documentos.';
comment on column pessoa_documentos.tipo_documento is
  'Lista sugerida na UI (rg, cnh, comprovante_residencia, contrato_social, cartao_cnpj, outro), mas campo livre no banco pra não travar em lista fechada.';
comment on column pessoa_documentos.descricao is
  'Preenchido quando tipo_documento = ''outro'' — descrição livre de que documento é.';
comment on column pessoa_documentos.url is
  'Caminho do objeto no bucket privado pessoa-documentos (Supabase Storage) — NÃO é uma URL pública. O acesso real é via signed URL gerada sob demanda (o bucket é privado de propósito, documento de identificação é dado sensível).';

create index idx_pessoa_documentos_pessoa on pessoa_documentos(pessoa_id);

alter table pessoa_documentos enable row level security;
create policy admin_acesso_total on pessoa_documentos for all to authenticated using (true) with check (true);
create trigger trg_auditoria_pessoa_documentos
  after insert or update or delete on pessoa_documentos
  for each row execute function fn_auditoria_log();

-- -----------------------------------------------------------------------------
-- Buckets de Storage
-- -----------------------------------------------------------------------------
-- pessoa-documentos: PRIVADO (RG/CNH/comprovante são dado sensível — acesso só via
-- signed URL, nunca URL pública direta).
insert into storage.buckets (id, name, public)
values ('pessoa-documentos', 'pessoa-documentos', false)
on conflict (id) do nothing;

create policy pessoa_documentos_storage_acesso_total on storage.objects
  for all to authenticated
  using (bucket_id = 'pessoa-documentos')
  with check (bucket_id = 'pessoa-documentos');

-- pessoa-fotos: PÚBLICO (mesma natureza da foto de perfil do WhatsApp já salva em
-- pessoa_fotos.url como URL pública direta — precisa continuar sendo URL de verdade,
-- não path interno, pra não quebrar conversas_resumo.pessoa_foto_url já em produção).
insert into storage.buckets (id, name, public)
values ('pessoa-fotos', 'pessoa-fotos', true)
on conflict (id) do nothing;

create policy pessoa_fotos_storage_acesso_total on storage.objects
  for all to authenticated
  using (bucket_id = 'pessoa-fotos')
  with check (bucket_id = 'pessoa-fotos');

-- ============================================================================
-- Fim da migration 035.
-- ============================================================================

-- FIM: 20260817130000_vendas_pessoa_documentos.sql
