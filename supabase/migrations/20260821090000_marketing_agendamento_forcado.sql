-- Agenda de Posts — Novo Post Manual (21/08/2026, pedido do Luiz)
--
-- Permite que o Luiz crie uma pauta à mão (tema livre, persona/ângulo/funil/tipo escolhidos por
-- ele, não pelo Estrategista) e, opcionalmente, fixe um horário exato de publicação pra ESSA pauta
-- específica — diferente de `propriedades_digitais.config_pipeline.horarios_publicacao` (Fase 4e),
-- que é a agenda geral da propriedade. Quando preenchido, `processar-pauta.ts` usa este valor
-- direto na etapa "agendar", pulando o cálculo automático de `decidirProximoHorario`.
--
-- Escrita pelo agente Marketing, NÃO aplicada por ele (regra dura da seção 2 de
-- docs/COORDENACAO_AGENTES_ARRUDACRED.md) — aguarda o Luiz rodar no SQL Editor do Supabase.

alter table pautas add column agendamento_forcado timestamptz;

comment on column pautas.agendamento_forcado is
  'Horário exato escolhido manualmente pro post desta pauta (Novo Post Manual, Agenda de Posts) — quando preenchido, processar-pauta.ts usa direto, sem calcular via decidirProximoHorario. NULL = comportamento automático de sempre (agenda da propriedade, se configurada, senão publica assim que aprovado).';
