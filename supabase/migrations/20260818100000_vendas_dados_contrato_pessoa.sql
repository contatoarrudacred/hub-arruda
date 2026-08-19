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
