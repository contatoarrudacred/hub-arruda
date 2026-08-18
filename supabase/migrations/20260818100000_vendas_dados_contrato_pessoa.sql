-- ============================================================================
-- MIGRATION 037 — Vendas: dados de Pessoa exigidos pelo contrato (RG, estado civil,
-- profissão) + vínculo de oportunidade_documentos com Pessoa real
-- Sistema de Gestão ArrudaCred
-- Plano: docs/superpowers/plans/2026-08-18-vendas-contrato.md, Task 1b
-- ============================================================================

-- -----------------------------------------------------------------------------
-- pessoas: RG, estado civil e profissão — exigidos pra montar o bloco "dados do
-- cliente"/"dados do representante" no contrato (spec de 18/08/2026, levantada com o
-- Luiz). Nullable: a maioria das Pessoas hoje (Lead/Cliente vindo do CRM) nunca
-- preencheu isso — só passa a ser exigido de verdade na tela de Fechamento de Venda,
-- não no cadastro. Tabela núcleo compartilhada — mudança 100% aditiva, não quebra
-- nenhum consumidor existente (CRM, motor de fluxo).
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
-- oportunidade_documentos: liga cada documento do "pacote" a uma Pessoa real, pra dar
-- pra montar o bloco de dados completos (nome, RG, endereço...) de cada CPF/CNPJ do
-- pacote no contrato — hoje a tabela só guarda o texto do documento, sem saber a quem
-- ele pertence de fato.
-- -----------------------------------------------------------------------------
alter table oportunidade_documentos add column pessoa_id uuid references pessoas(id);

comment on column oportunidade_documentos.pessoa_id is
  'Preenchido na tela de Fechamento de Venda (busca/cria a Pessoa por CPF/CNPJ, reaproveitando resolverOuCriarPessoa) — antes disso fica null, igual documento. Usado pra montar {{lista_documentos}} no contrato com os dados completos de cada signatário do pacote, não só o número do documento.';

create index idx_oportunidade_documentos_pessoa on oportunidade_documentos(pessoa_id);

-- ============================================================================
-- Fim da migration 037.
-- ============================================================================
