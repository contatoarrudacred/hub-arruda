-- Fase 4e — Agente Agendador (20/08/2026)
--
-- Hoje o pipeline publica no WordPress na hora em que o Revisor aprova. Pedido do Luiz: cada
-- propriedade deve ter horários fixos de publicação (config nova, jsonb "horarios_publicacao" em
-- propriedades_digitais.config_pipeline — sem migration própria, é aditivo dentro do jsonb já
-- existente) e o pipeline passa a criar o post no WordPress com status "future" pra esse horário,
-- em vez de publicar na hora. posts.agendado_para é o único dado novo em coluna: quando presente,
-- o post já está no ar em breve (o próprio WordPress libera sozinho) mas ainda não está visível.
--
-- Decisão de desenho (ver plano da task): NENHUM status novo em posts/pautas — status continua indo
-- pra 'publicado' assim que o pipeline termina o trabalho dele (criar o agendamento), igual hoje.
-- agendado_para é só um carimbo informativo; futuras telas de distribuição podem filtrar
-- `where agendado_para <= now()` sem precisar de cron de verificação nem de status novo.
--
-- Escrita pelo agente Marketing, NÃO aplicada por ele (regra dura da seção 2 de
-- docs/COORDENACAO_AGENTES_ARRUDACRED.md) — aguarda o Luiz rodar no SQL Editor do Supabase.

alter table posts add column agendado_para timestamptz;

comment on column posts.agendado_para is
  'Preenchido quando a propriedade tem horarios_publicacao configurado (config_pipeline) — o post foi criado no WordPress com status "future" pra este horário, em vez de publicado na hora. NULL preserva o comportamento antigo (publicação imediata).';
