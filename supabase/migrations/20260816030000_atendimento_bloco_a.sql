-- ============================================================================
-- MIGRATION 021 — Tela de Atendimento, Bloco A (fundação)
-- Sistema de Gestão ArrudaCred
--
-- Ver docs/TELA_ATENDIMENTO_ARRUDACRED.md pro desenho completo. Este bloco
-- cobre só o necessário pra lista de contatos + conversa + Assumir Chat /
-- Atribuir pra Malala + composer básico funcionarem — os demais recursos
-- (notas internas, respostas prontas, foto histórico etc.) vêm nos próximos
-- blocos.
-- ============================================================================

-- Quem está com a conversa no momento. Null = ninguém assumiu (Malala, se
-- sob_supervisor=false; ou escalada sem dono ainda, se sob_supervisor=true).
-- "Assumir Chat" seta sob_supervisor=true + atendente_id=<usuário>.
-- "Atribuir pra Malala" zera os dois. sob_supervisor continua sendo o gate
-- que decide se o motor automatizado roda (webhook já usa isso desde a Fase
-- 7) — atendente_id só refina "sob supervisão de quem", sem mudar esse gate.
alter table conversas
  add column atendente_id uuid references usuarios_sistema(id);
comment on column conversas.atendente_id is
  'Atendente humano que assumiu esta conversa agora (null = ninguém assumiu — com a Malala, ou escalada sem dono ainda). Ver docs/TELA_ATENDIMENTO_ARRUDACRED.md.';

create index idx_conversas_atendente on conversas(atendente_id);

-- View de resumo pra lista de contatos — traz a última mensagem de cada
-- conversa (pra prévia + "lido/não lido") sem precisar de N+1 query no
-- código. security_invoker garante que ela respeita a RLS de quem consulta
-- (mesma regra de conversas/mensagens), não a de quem criou a view.
create view conversas_resumo
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
  um.enviado_em as ultima_mensagem_em
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
) um on true;
comment on view conversas_resumo is
  'Lista de contatos da Tela de Atendimento — uma linha por conversa, já com pessoa/oportunidade/produto e a última mensagem trocada, evitando N+1 query. Só leitura.';

-- ============================================================================
-- Fim da migration 021.
-- ============================================================================
