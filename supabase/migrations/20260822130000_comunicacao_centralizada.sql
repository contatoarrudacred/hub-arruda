-- ============================================================================
-- MIGRATION — Comunicação centralizada via CRM
-- Sistema de Gestão ArrudaCred
--
-- Spec: docs/superpowers/specs/2026-08-22-comunicacao-centralizada-crm-design.md
-- Luiz decidiu (21/08/2026, COORDENACAO_AGENTES_ARRUDACRED.md seção 4 item 7): só o CRM manda
-- comunicação pro cliente daqui pra frente. Este schema sustenta o módulo src/lib/comunicacao/.
-- ============================================================================

-- categorias_comunicacao: lista controlada e administrável (tela em Configurações), não um CHECK
-- fixo no código — Luiz quer adicionar/desativar categorias sem depender de migration a cada vez.
create table categorias_comunicacao (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table categorias_comunicacao is
  'Categoria/motivo de uma comunicação enviada via src/lib/comunicacao (ex.: cobrança, lembrete, institucional). Lista administrável em /admin/configuracoes/categorias-comunicacao, não fixa no código — vários módulos (Vendas, Financeiro, Marketing) usam a mesma lista.';

alter table categorias_comunicacao enable row level security;
create policy admin_acesso_total on categorias_comunicacao for all to authenticated using (true) with check (true);
create trigger trg_auditoria_categorias_comunicacao
  after insert or update or delete on categorias_comunicacao
  for each row execute function fn_auditoria_log();

insert into categorias_comunicacao (nome) values ('Cobrança'), ('Lembrete'), ('Institucional');

-- conversas.instancia: só relevante pra canal='whatsapp' — 'oficial' (conversa real, iniciada pelo
-- lead, nunca criada pelo mecanismo) ou 'secundaria' (número extra, só disparo automático, usado
-- quando NÃO existe conversa oficial ainda — nunca inicia contato pelo oficial, risco de banimento
-- em modo não-oficial). Texto livre (não CHECK fechado em 2 valores) — spec já prevê mais
-- instâncias secundárias por área no futuro, sem quebrar nada.
alter table conversas add column instancia text;
comment on column conversas.instancia is
  'Só relevante quando canal=whatsapp: "oficial" (conversa real, nunca criada por este mecanismo, só existe se o lead já contatou o número oficial) ou "secundaria" (número extra, só disparo automático — ver src/lib/comunicacao). Null pra conversas de outros canais.';

-- conversas.canal JÁ EXISTIA (conversas_canal_check, migration 20260815150000) com
-- ('whatsapp','instagram','messenger','widget','telegram','simulador') — só falta 'email'.
alter table conversas drop constraint if exists conversas_canal_check;
alter table conversas
  add constraint conversas_canal_check
  check (canal in ('whatsapp', 'instagram', 'messenger', 'widget', 'telegram', 'simulador', 'email'));

-- mensagens: 3 colunas novas + remetente ganha 'sistema' (mensagem automática originada por um
-- módulo via src/lib/comunicacao, distinta de 'malala'/'lead'/'supervisor').
alter table mensagens
  add column categoria_id uuid references categorias_comunicacao(id) on delete set null,
  add column chave_idempotencia text unique,
  add column provedor_message_id text;

comment on column mensagens.categoria_id is
  'Só preenchido quando remetente=sistema — categoria/motivo da comunicação (ver categorias_comunicacao), gerenciada em /admin/configuracoes/categorias-comunicacao.';
comment on column mensagens.chave_idempotencia is
  'Chave opcional que quem chama src/lib/comunicacao::enviarComunicacao pode passar (ex.: "cobranca_12345_lembrete") pra evitar reenvio duplicado em retry — UNIQUE na tabela inteira, cabe a quem chama prefixar o suficiente pro seu caso (módulo + entidade + motivo) pra nunca colidir com a de outro módulo.';
comment on column mensagens.provedor_message_id is
  'ID genérico devolvido pelo Zapster OU pela Resend, usado só por src/lib/comunicacao::enviarComunicacao — zapster_message_id (coluna já existente) continua sendo usada por todo o resto do sistema (motor de fluxo, atendente humano na Tela de Atendimento), sem migração de dados.';

alter table mensagens drop constraint if exists mensagens_remetente_check;
alter table mensagens
  add constraint mensagens_remetente_check
  check (remetente in ('malala', 'lead', 'supervisor', 'sistema'));

-- ============================================================================
-- Fim da migration.
-- ============================================================================
