-- ============================================================================
-- MIGRATION 022 — Cor de badge por atendente (Fase 1 do Bloco B / Tela de Atendimento)
-- Sistema de Gestão ArrudaCred
--
-- Cada atendente humano escolhe uma cor (paleta fechada de 7) que aparece no
-- badge dele na lista de conversas e no fundo do painel quando ele está no
-- controle. Verde (não atribuída) e roxo (Malala) são reservados, não entram
-- nessa paleta — ver docs/superpowers/specs/2026-08-16-bloco-b-tela-atendimento-design.md.
-- ============================================================================

alter table usuarios_sistema
  add column cor_badge text not null default 'azul'
  check (cor_badge in ('vermelho', 'laranja', 'marrom', 'rosa', 'ciano', 'azul', 'cinza'));
comment on column usuarios_sistema.cor_badge is
  'Cor escolhida pelo próprio atendente (paleta fechada de 7) — aparece no badge dele na lista de conversas e no fundo do painel quando ele está no controle. Verde/roxo são reservados pra não-atribuída/Malala, fora desta paleta.';

-- View 006/021 recriada com o atendente (nome + cor) — precisa do CREATE OR REPLACE porque
-- é view, não tabela; colunas novas vão no fim, não quebra quem já consome as colunas antigas.
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
  u.cor_badge as atendente_cor
from conversas c
join pessoas p on p.id = c.pessoa_id
left join oportunidades o on o.id = c.oportunidade_id
left join produtos pr on pr.id = o.produto_id
left join lateral (
  select conteudo, remetente, enviado_em
  from mensagens m
  where m.conversa_id = c.id
  order by m.enviado_em desc
  limit 1
) um on true
left join usuarios_sistema u on u.id = c.atendente_id
left join pessoas pa on pa.id = u.pessoa_id;
comment on view conversas_resumo is
  'Lista de contatos da Tela de Atendimento — uma linha por conversa, já com pessoa/oportunidade/produto, a última mensagem trocada, e o atendente atribuído (nome + cor), evitando N+1 query. Só leitura.';

-- ============================================================================
-- Fim da migration 022.
-- ============================================================================
