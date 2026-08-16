-- ============================================================================
-- MIGRATION 020 — Rastreio de cliques no link zap.arrudacred.com.br
-- Sistema de Gestão ArrudaCred
--
-- Página de redirecionamento (zap.arrudacred.com.br, hospedada fora do
-- projeto — PHP na Hostinger, ver docs/RASTREIO_CLIQUES_WHATSAPP.md) captura
-- referer/UTM/dispositivo no momento do clique, salva aqui com um código
-- curto embutido no `?text=` do link `wa.me`, e o webhook (Fase 7) liga o
-- clique à pessoa quando a primeira mensagem chega com esse código.
--
-- RLS pensada pra ser chamada com a chave `anon` a partir de fora do projeto
-- (PHP na Hostinger, sem autenticação nenhuma) — só INSERT liberado pra
-- `anon`, sem leitura/edição/exclusão. A leitura/edição de verdade (ligar
-- pessoa_id) acontece via service_role, do lado do nosso webhook.
-- ============================================================================

create table cliques_rastreio (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  criado_em timestamptz not null default now(),
  referer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  user_agent text,
  ip text,
  idioma text,
  pessoa_id uuid references pessoas(id)
);
comment on table cliques_rastreio is
  'Um clique no link zap.arrudacred.com.br, com o que a página conseguiu capturar antes de redirecionar pro WhatsApp. pessoa_id fica nulo até a primeira mensagem correspondente chegar (correlação pelo código embutido no texto pré-preenchido).';
comment on column cliques_rastreio.codigo is
  'Código curto embutido no ?text= do link wa.me, ex.: "(ref: a1b2c3d4)" — é assim que o webhook liga esse clique à pessoa recém-criada.';

alter table cliques_rastreio enable row level security;
create policy inserir_anonimo on cliques_rastreio for insert to anon with check (true);
create policy admin_acesso_total on cliques_rastreio for all to authenticated using (true) with check (true);
create trigger trg_auditoria_cliques_rastreio
  after insert or update or delete on cliques_rastreio
  for each row execute function fn_auditoria_log();

-- A página em PHP também precisa ler o número de WhatsApp atual (pra montar
-- o link wa.me/<numero>) sem estar autenticada — só esse valor específico,
-- não a tabela configuracoes inteira (RLS filtra por linha, não expõe o
-- resto das configurações pra visitante anônimo).
create policy leitura_publica_whatsapp_atendimento on configuracoes
  for select to anon
  using (chave = 'whatsapp_numero_atendimento');

-- ============================================================================
-- Fim da migration 020.
-- ============================================================================
