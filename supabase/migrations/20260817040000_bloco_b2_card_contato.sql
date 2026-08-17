-- ============================================================================
-- MIGRATION 026 — Bloco B2: card de contato redesenhado + rastreio de entrega/leitura
-- Sistema de Gestão ArrudaCred
-- Ver docs/superpowers/specs/2026-08-17-bloco-b2-composer-card-contato-design.md
-- ============================================================================

alter table produtos add column if not exists nome_reduzido text;
comment on column produtos.nome_reduzido is
  'Nome curto do produto pra espaço apertado (card de contato da Tela de Atendimento, ex. "Limpa Nome" em vez de "Limpeza de Nome (CPF/CNPJ) — Serasa/SPC"). Nulo cai no nome completo truncado no frontend.';

alter table conversas add column if not exists favorita boolean not null default false;
comment on column conversas.favorita is
  'Atendente marcou a conversa como favorita — sobe pro topo da lista de contatos. Global à conversa, não por atendente.';

alter table mensagens add column if not exists zapster_message_id text;
alter table mensagens add column if not exists entregue_em timestamptz;
alter table mensagens add column if not exists lido_em timestamptz;
comment on column mensagens.zapster_message_id is
  'ID retornado pela Zapster ao enviar (enviarMensagemTexto/enviarMensagemMidia) — correlaciona os webhooks message.delivered/message.read de volta a esta linha. Nulo em mensagens do lead (não enviamos essas) e em mensagens antigas anteriores a esta migration.';
comment on column mensagens.entregue_em is 'Preenchido pelo webhook message.delivered da Zapster.';
comment on column mensagens.lido_em is 'Preenchido pelo webhook message.read da Zapster.';

create index if not exists idx_mensagens_zapster_message_id on mensagens(zapster_message_id) where zapster_message_id is not null;

-- View 006/021/022 recriada — acrescenta favorita, valor_estimado, nome reduzido do produto,
-- contagem real de não lidas (mensagens do lead desde a última mensagem nossa, não mais um
-- booleano) e o status de entrega/leitura da última mensagem (pro check ✓/✓✓/✓✓azul no card).
-- IMPORTANTE: `create or replace view` não deixa reordenar/inserir coluna no meio da lista
-- existente (Postgres trata como rename, erro 42P16) — por isso todas as colunas antigas mantêm
-- a ordem exata de antes, e tudo novo vai só no final.
create or replace view conversas_resumo
  with (security_invoker = true) as
select
  c.id as conversa_id,
  c.pessoa_id,
  c.oportunidade_id,
  c.canal,
  c.status,
  c.sob_supervisor,
  c.atendente_id,
  c.created_at,
  p.nome_razao_social as pessoa_nome,
  p.whatsapp as pessoa_telefone,
  o.etapa_kanban,
  pr.nome as produto_nome,
  um.conteudo as ultima_mensagem_conteudo,
  um.remetente as ultima_mensagem_remetente,
  um.enviado_em as ultima_mensagem_em,
  pa.nome_razao_social as atendente_nome,
  u.cor_badge as atendente_cor,
  c.favorita,
  o.valor_estimado,
  coalesce(pr.nome_reduzido, pr.nome) as produto_nome_reduzido,
  um.entregue_em as ultima_mensagem_entregue_em,
  um.lido_em as ultima_mensagem_lido_em,
  coalesce(nl.qtd, 0) as nao_lidas_contagem
from conversas c
join pessoas p on p.id = c.pessoa_id
left join oportunidades o on o.id = c.oportunidade_id
left join produtos pr on pr.id = o.produto_id
left join lateral (
  select conteudo, remetente, enviado_em, entregue_em, lido_em
  from mensagens m
  where m.conversa_id = c.id
  order by m.enviado_em desc
  limit 1
) um on true
left join lateral (
  select count(*) as qtd
  from mensagens m2
  where m2.conversa_id = c.id
    and m2.remetente = 'lead'
    and m2.enviado_em > coalesce(
      (select max(m3.enviado_em) from mensagens m3 where m3.conversa_id = c.id and m3.remetente <> 'lead'),
      '-infinity'::timestamptz
    )
) nl on true
left join usuarios_sistema u on u.id = c.atendente_id
left join pessoas pa on pa.id = u.pessoa_id;
comment on view conversas_resumo is
  'Lista de contatos da Tela de Atendimento — uma linha por conversa, já com pessoa/oportunidade/produto, a última mensagem trocada (com status de entrega/leitura), contagem real de não lidas, atendente atribuído (nome + cor) e se está favoritada. Só leitura.';

-- ============================================================================
-- Fim da migration 026.
-- ============================================================================
