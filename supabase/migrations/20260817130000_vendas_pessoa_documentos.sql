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
