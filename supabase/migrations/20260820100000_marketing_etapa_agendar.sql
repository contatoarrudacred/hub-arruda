-- Fase 4e — nova etapa "agendar" no log de execução (20/08/2026)
--
-- Companheira de 20260820090000_marketing_agendado_para.sql: quando a propriedade tem horários de
-- publicação configurados, o pipeline decide o próximo horário livre antes da etapa "publicar" —
-- essa decisão passa a ser instrumentada como qualquer outra etapa (ver registrarEtapa em
-- repositorio.ts).
--
-- Mesmo padrão da migration 20260819220000 (nova etapa "verificar_links"): migração 100% aditiva
-- no sentido de dado, só amplia os valores aceitos pela coluna já existente.
-- Escrita pelo agente Marketing, NÃO aplicada por ele (regra dura da seção 2 de
-- docs/COORDENACAO_AGENTES_ARRUDACRED.md) — aguarda o Luiz rodar no SQL Editor do Supabase.

alter table pautas_execucao_log drop constraint pautas_execucao_log_etapa_check;

alter table pautas_execucao_log add constraint pautas_execucao_log_etapa_check check (etapa in (
  'buscar_checklist', 'gerar_conteudo', 'verificar_links', 'revisar', 'inserir_links', 'sanitizar', 'gerar_imagens', 'agendar', 'publicar', 'registrar_resultado'
));
