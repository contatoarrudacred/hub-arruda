-- ============================================================================
-- MIGRATION 033 — Selo de risco de esfriar (Bloco D/Fase 5)
-- Sistema de Gestão ArrudaCred
--
-- TELA_ATENDIMENTO_ARRUDACRED.md: badge 🔴/🟡/🟢 que combina 3 sinais (decisão de Luiz,
-- 17/08/2026 — construir os 3 completos, não uma versão simplificada):
--   1. Tempo sem resposta do lead vs limiar configurável (conversas.aguardando_resposta_desde,
--      já existente desde a migration 023 — limiares novos abaixo).
--   2. Quantas vezes seguidas a Malala não reconheceu a resposta do lead (contador novo).
--   3. Negociação estagnada — objeção detectada automaticamente OU o fluxo automatizado terminou
--      sem chegar em "ganha" (coluna nova, ver comentário abaixo).
-- ============================================================================

alter table conversas
  add column contador_nao_reconhecimento int not null default 0,
  add column estagnado_desde timestamptz;

comment on column conversas.contador_nao_reconhecimento is
  'Quantas vezes SEGUIDAS a Malala não reconheceu a resposta do lead no checkpoint atual (avancarConversa retornando naoReconhecido=true, engine.ts) — zera assim que ela reconhece uma resposta de novo (registrarTurnoMalala, persistencia.ts). Sinal 2 do selo de risco de esfriar (Bloco D/Fase 5).';

comment on column conversas.estagnado_desde is
  'Quando a negociação travou sem sinal claro de avanço: objeção detectada automaticamente (detector-objecao.ts rodando a cada mensagem de texto do lead, persistencia.ts) OU o fluxo automatizado terminou (efeito encerrar_fluxo_automatizado) sem chegar na subetapa "ganha". Null = não travada. Fica pendente até um atendente resolver manualmente na Tela de Atendimento — não some sozinha, nem é sobrescrita por uma nova detecção enquanto já está pendente (mantém a data da primeira). Sinal 3 do selo de risco de esfriar.';

insert into configuracoes (chave, valor, descricao)
values
  (
    'selo_risco_esfriar_horas_amarelo',
    '4',
    'A partir de quantas horas sem resposta do lead (conversas.aguardando_resposta_desde) o selo de risco de esfriar fica 🟡 amarelo — sinal 1 dos 3 (TELA_ATENDIMENTO_ARRUDACRED.md, Bloco D/Fase 5). Valor inicial, ajustável sem deploy.'
  ),
  (
    'selo_risco_esfriar_horas_vermelho',
    '24',
    'A partir de quantas horas sem resposta do lead o selo de risco de esfriar fica 🔴 vermelho — mesmo sinal 1 acima, limiar mais alto. Valor inicial, ajustável sem deploy.'
  )
on conflict do nothing;

-- `conversas_resumo` (migration 031) ganha os campos brutos usados pra calcular o selo no card da
-- lista — o cálculo em si (3 sinais combinados) é puro no client (selo-risco.ts), não SQL, pra
-- reaproveitar exatamente a mesma lógica testada que já vale pro cabeçalho da conversa.
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
  pf.url as pessoa_foto_url,
  c.aguardando_resposta_desde,
  c.contador_nao_reconhecimento,
  c.estagnado_desde
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
  'Lista de contatos da Tela de Atendimento — uma linha por conversa, já com pessoa/oportunidade/produto, a última mensagem trocada (com status de entrega/leitura), contagem real de não lidas, atendente atribuído (nome + cor), foto de perfil mais recente, se está favoritada e os 3 sinais brutos do selo de risco de esfriar. Só leitura.';

-- ============================================================================
-- Fim da migration 033.
-- ============================================================================
