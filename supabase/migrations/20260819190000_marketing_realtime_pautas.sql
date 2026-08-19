-- Fase 4b — habilita Realtime na tabela pautas (19/08/2026, redesenho do Monitor de execução)
-- Hoje só pautas_execucao_log está na publication do Supabase Realtime (migration
-- 20260818090000). O Monitor redesenhado agrupa cards por PAUTA (não mais por linha de log) e
-- precisa saber AO VIVO quando uma pauta muda de status (publicado/bloqueada) pra mover o card de
-- "Em andamento agora" pra "Concluídos recentes" — sem isso, só teríamos o sinal indireto das
-- etapas de log, que não captura o desfecho final da pauta.
--
-- Migração 100% aditiva (só adiciona a tabela à publication existente, não cria nem altera
-- colunas). Escrita pelo agente Marketing, NÃO aplicada por ele (regra dura da seção 2 de
-- docs/COORDENACAO_AGENTES_ARRUDACRED.md) — aguarda o Luiz rodar no SQL Editor do Supabase.

alter publication supabase_realtime add table pautas;
