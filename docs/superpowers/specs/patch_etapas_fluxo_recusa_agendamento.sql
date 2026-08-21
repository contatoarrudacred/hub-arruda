-- Patch de CONTEÚDO em etapas_fluxo (não é migration de schema) — alinha o grafo real da Malala
-- com a correção de recusa de agendamento já em main desde o commit 565150b (spec 2026-08-21,
-- achado ao revisar o editor /admin/fluxos): recusar a oferta de agendamento sempre ia direto pro
-- handoff humano, mesmo quando o motivo era pacote caro (nesse caso o lead pode seguir no
-- self-service). Só dívida alta (`alto_valor`) exige ligação obrigatória, com 1 insistência antes
-- de aceitar a recusa (decisão de Luiz, 21/08/2026).
--
-- Verificado contra produção em 21/08/2026 (fluxo_id 7e410b97-3cc1-4118-bdfe-5ac9e3dedf62):
--   ln_passo15_normal=20, ln_agendamento_oferta=21, ln_agendamento_horario=22,
--   ln_agendamento_confirmado=23, ln_call_agendada=24, ln_passo15_selfservice=25.
--   ln_agendamento_router_recusa / ln_agendamento_insistencia ainda não existem.

begin;

-- 1) Abre espaço na coluna `ordem` pros 2 novos checkpoints entre ln_agendamento_oferta (21) e
--    ln_agendamento_horario (22). `ordem` só afeta a ordenação visual no editor — o roteamento real
--    da conversa é por proximo_codigo/proximo_por_dado dentro de `conteudo`, nunca por `ordem`.
update etapas_fluxo set ordem = 24 where id = '8f71d26f-9b25-43b0-a83d-fe2f931a552d'; -- ln_agendamento_horario
update etapas_fluxo set ordem = 25 where id = 'ce3de876-845c-40e5-a9be-e0912a60c513'; -- ln_agendamento_confirmado
update etapas_fluxo set ordem = 26 where id = 'fc9b8df8-a24d-4e17-b484-d15f4c385d58'; -- ln_call_agendada
update etapas_fluxo set ordem = 27 where id = '4cbec6ff-2168-4a56-b9eb-f6533cc85e2c'; -- ln_passo15_selfservice

-- 2) ln_agendamento_oferta: a recusa ("nao") passa a ir pro roteador de recusa, não mais direto pro
--    handoff humano.
update etapas_fluxo
set conteudo = jsonb_set(conteudo, '{opcoes,1,proximo_codigo}', '"ln_agendamento_router_recusa"'::jsonb)
where id = '1b6b8539-e588-4161-af2e-83a1ab7b5580';

-- 3) Novo checkpoint condicional: decide o destino da recusa por `alto_valor` (dívida alta insiste,
--    pacote caro vai pro self-service).
insert into etapas_fluxo (fluxo_id, ordem, tipo_etapa, campo_salvo, conteudo)
values (
  '7e410b97-3cc1-4118-bdfe-5ac9e3dedf62',
  22,
  'condicional',
  null,
  $json$
  {
    "codigo": "ln_agendamento_router_recusa",
    "mensagens": [],
    "aguarda_resposta": false,
    "proximo_por_dado": {
      "campo": "alto_valor",
      "se_igual": "sim",
      "entao": "ln_agendamento_insistencia",
      "senao": "ln_passo15_selfservice"
    },
    "kanban_subetapa": "envio_proposta"
  }
  $json$::jsonb
);

-- 4) Novo checkpoint: insiste 1x na dívida alta antes de aceitar a recusa. Aceitando na insistência,
--    segue pro mesmo horário; recusando de novo, transfere mesmo assim (nunca libera self-service
--    pra esse motivo — diferente de pacote caro).
insert into etapas_fluxo (fluxo_id, ordem, tipo_etapa, campo_salvo, conteudo)
values (
  '7e410b97-3cc1-4118-bdfe-5ac9e3dedf62',
  23,
  'pergunta_checkpoint',
  'aceitou_agendamento_apos_insistencia',
  $json$
  {
    "codigo": "ln_agendamento_insistencia",
    "mensagens": [{"tipo": "texto", "texto": "(reforço de agendamento gerado dinamicamente)"}],
    "aguarda_resposta": true,
    "tipo_resposta": "menu",
    "opcoes": [
      {"valor": "sim", "rotulos": ["1", "1️⃣"], "proximo_codigo": "ln_agendamento_horario"},
      {"valor": "nao", "rotulos": ["2", "2️⃣"], "proximo_codigo": "ln_call_agendada"}
    ],
    "kanban_subetapa": "envio_proposta",
    "digitando": true,
    "delay": {"tipo": "automatico"},
    "interpretacao_ia": {
      "habilitado": true,
      "instrucao": "O lead já recusou o agendamento uma vez. Se ele aceitar agora (ex.: 'tá bom, pode ligar' → sim) ou recusar/reforçar que não quer (ex.: 'não, prefiro assim mesmo' → nao). Escolha a opção correspondente."
    }
  }
  $json$::jsonb
);

commit;
