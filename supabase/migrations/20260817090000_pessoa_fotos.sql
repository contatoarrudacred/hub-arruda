-- ============================================================================
-- MIGRATION 031 — Histórico de fotos do contato (Bloco D)
-- Sistema de Gestão ArrudaCred
--
-- TELA_ATENDIMENTO_ARRUDACRED.md seção 4: assim que um número novo manda a primeira mensagem, o
-- sistema salva a foto de perfil do WhatsApp; toda vez que a conversa é aberta, confere se mudou —
-- se mudou, NÃO apaga a anterior, salva a nova como principal e mantém a anterior no histórico.
-- Na prática (17/08/2026): a Zapster manda `sender.profile_picture` em TODO evento
-- `message.received` (confirmado no schema real, developer.zapsterapi.com), então a checagem
-- acontece a cada mensagem recebida, não só ao abrir a conversa — mais simples e sempre atualizado.
-- ============================================================================

create table pessoa_fotos (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references pessoas(id) on delete cascade,
  url text not null,
  capturada_em timestamptz not null default now()
);
comment on table pessoa_fotos is
  'Histórico de fotos de perfil do WhatsApp de uma pessoa — nunca sobrescreve, só acrescenta quando a foto muda (comparado por URL). A mais recente (max capturada_em) é a exibida por padrão; o histórico completo fica disponível na modal da Tela de Atendimento.';

create index idx_pessoa_fotos_pessoa on pessoa_fotos(pessoa_id, capturada_em desc);

alter table pessoa_fotos enable row level security;
create policy admin_acesso_total on pessoa_fotos for all to authenticated using (true) with check (true);

-- `conversas_resumo` (migration 026) ganha a foto mais recente da pessoa — mesmo padrão de LATERAL
-- join já usado pra "última mensagem"/"contagem de não lidas" na view.
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
  coalesce(nl.qtd, 0) as nao_lidas_contagem,
  pf.url as pessoa_foto_url
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
left join lateral (
  select url from pessoa_fotos pf2 where pf2.pessoa_id = c.pessoa_id order by pf2.capturada_em desc limit 1
) pf on true
left join usuarios_sistema u on u.id = c.atendente_id
left join pessoas pa on pa.id = u.pessoa_id;
comment on view conversas_resumo is
  'Lista de contatos da Tela de Atendimento — uma linha por conversa, já com pessoa/oportunidade/produto, a última mensagem trocada (com status de entrega/leitura), contagem real de não lidas, atendente atribuído (nome + cor), foto de perfil mais recente e se está favoritada. Só leitura.';

-- ============================================================================
-- Fim da migration 031.
-- ============================================================================
