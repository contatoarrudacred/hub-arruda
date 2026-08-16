-- ============================================================================
-- MIGRATION 015 — Motor de disparo de follow-up (Fase 6)
-- Sistema de Gestão ArrudaCred
--
-- Luiz confirmou (15/08/2026): construir agora o motor de decisão do
-- disparo de follow-up (quando cada tentativa de retomada deve sair),
-- mesmo sem o WhatsApp real (Zapster) conectado ainda — fica pronto pra
-- plugar o envio de verdade quando a Fase 7 existir. Pra isso funcionar,
-- também foi preciso religar o simulador ao banco de verdade (antes só
-- vivia em memória do navegador) — sem isso não existe conversa real pro
-- cron de disparo varrer.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- pessoas.documento vira opcional: o lead chama primeiro e informa CPF/CNPJ
-- só num checkpoint mais adiante do script — exigir documento antes disso
-- impedia criar a linha de pessoa no início da conversa (unique permite
-- múltiplos NULL, então a constraint de unicidade continua valendo quando
-- o documento é preenchido depois).
-- ---------------------------------------------------------------------------
alter table pessoas alter column documento drop not null;

-- ---------------------------------------------------------------------------
-- conversas: rastreio de espera por resposta, pra saber quando e o quê
-- disparar. aguardando_resposta_desde nulo = não está em cadência de
-- follow-up (lead respondeu, conversa encerrada, ou nunca chegou a
-- aguardar). agenda_followup_id fica fixado no início da espera (resolvido
-- a partir da etapa ou da agenda "Padrão", ver comentário em
-- etapas_fluxo.agenda_followup_id) pra não precisar re-resolver a cada
-- checagem do cron. proximo_item_agenda é a ordem do último item já
-- disparado nesse ciclo de espera (0 = nenhum ainda).
-- ---------------------------------------------------------------------------
alter table conversas
  add column agenda_followup_id uuid references agendas_followup(id),
  add column aguardando_resposta_desde timestamptz,
  add column proximo_item_agenda int not null default 0;

comment on column conversas.aguardando_resposta_desde is
  'Timestamp de quando a Malala mandou a última mensagem que aguardava resposta e o lead ainda não respondeu. Nulo = fora de cadência de follow-up. É a partir daqui que os intervalos da agenda são contados (D+10min, D+45min etc. — sempre a partir deste ponto, não do item anterior disparado).';

-- Também aceita 'simulador' como canal — a mesma conversa/mensagem que uma
-- conversa real de WhatsApp vai gerar, só que originada pelo /simulador em
-- vez do Zapster (não polui métricas reais quando o Kanban existir).
alter table conversas drop constraint if exists conversas_canal_check;
alter table conversas
  add constraint conversas_canal_check
  check (canal in ('whatsapp', 'instagram', 'messenger', 'widget', 'telegram', 'simulador'));

-- ---------------------------------------------------------------------------
-- agenda_itens: marca qual item, ao disparar, encerra o atendimento
-- automatizado e marca a oportunidade como Perdida (hoje só o item de
-- "10 dias" da agenda Padrão, ver SCRIPT_LIMPANOME_SERASA_SPC.md).
-- ---------------------------------------------------------------------------
alter table agenda_itens add column encerra_atendimento boolean not null default false;

comment on column agenda_itens.encerra_atendimento is
  'Quando true, disparar este item também marca a oportunidade como Perdida (motivo "LEAD PAROU DE RESPONDER") e encerra a conversa — é o item de "atendimento encerrado automaticamente" da agenda. Itens depois deste na mesma agenda (ex.: nutrição por e-mail) não fazem parte do funil automatizado de vendas.';

update agenda_itens ai
set encerra_atendimento = true
from agendas_followup af
where ai.agenda_id = af.id
  and af.nome = 'Padrão'
  and ai.ordem = 7;

-- ============================================================================
-- Fim da migration 015.
-- ============================================================================
