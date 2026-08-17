-- ============================================================================
-- MIGRATION 028 — oportunidade_documentos (Bloco C, suporte a "pacote" de docs)
-- Sistema de Gestão ArrudaCred
-- ============================================================================
--
-- Fase 1 de uma iniciativa maior (registrada em PLANO_MESTRE seção 11, Bloco C):
-- hoje uma Oportunidade assume 1 único CPF ou CNPJ. O script original já previa
-- (SCRIPT_LIMPANOME_SERASA_SPC.md, Passo 4) que o lead pode pedir um "pacote"
-- (N CPFs + M CNPJs) — decisão de Luiz (17/08/2026): continua sendo 1 Oportunidade
-- só (1 card no Kanban, 1 contrato, 1 responsável financeiro assina/paga), mas
-- com uma lista de documentos dentro dela, cada um com sua própria faixa de valor
-- (preço somado, não combinado). Só a tabela nesta migration — o motor de fluxo
-- ainda não sabe usá-la (Fase 2 em diante).

create table oportunidade_documentos (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references oportunidades(id) on delete cascade,
  tipo_documento text not null check (tipo_documento in ('cpf', 'cnpj')),
  documento text,
  faixa_valor text,
  faixa_valor_detalhe text,
  valor_aproximado numeric(12,2),
  valor_restricao_estimado numeric(12,2),
  alto_valor boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table oportunidade_documentos is
  'Um item (CPF ou CNPJ) dentro de uma Oportunidade — suporta o lead pedir um "pacote" com mais de um documento. A Oportunidade continua sendo 1 negócio só (1 card no Kanban, 1 contrato) — oportunidades.valor_estimado passa a ser a soma de valor_restricao_estimado desta tabela quando houver mais de uma linha.';
comment on column oportunidade_documentos.documento is
  'Número do CPF/CNPJ em si — só preenchido depois, no Passo 17 (coleta de dados pro contrato). Nulo durante a qualificação/proposta.';
comment on column oportunidade_documentos.faixa_valor is
  'Mesmo vocabulário de conversas.dados.faixa_valor (menos_10mil/10_30mil/30_50mil/50_100mil/mais_100mil) — cada documento tem a sua, capturada de forma independente (Passo 6 do script, "só avança com a faixa aproximada de CADA CPF/CNPJ capturada").';
comment on column oportunidade_documentos.alto_valor is
  'Mesma regra de oportunidades.alto_valor (>R$500 mil), calculada por documento — um pacote pode ter um documento de alto valor e outro não.';

create index idx_oportunidade_documentos_oportunidade on oportunidade_documentos(oportunidade_id);

alter table oportunidade_documentos enable row level security;
create policy admin_acesso_total on oportunidade_documentos for all to authenticated using (true) with check (true);

create trigger trg_auditoria_oportunidade_documentos
  after insert or update or delete on oportunidade_documentos
  for each row execute function fn_auditoria_log();

-- ============================================================================
-- Fim da migration 028.
-- ============================================================================
