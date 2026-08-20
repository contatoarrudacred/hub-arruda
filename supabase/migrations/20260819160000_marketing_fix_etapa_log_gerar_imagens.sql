-- Fase 4b — correção do CHECK constraint de pautas_execucao_log.etapa (19/08/2026)
-- Achado real via teste de ponta a ponta em produção (não em mock): o constraint foi criado na
-- migration 20260818090000 (Fase 2, 18/08/2026), ANTES de "gerar_imagens" existir (Fase 4b Task
-- 10, 19/08/2026). O código TypeScript (EtapaLog em tipos.ts) foi estendido corretamente com
-- "gerar_imagens", mas ninguém atualizou o CHECK constraint correspondente no banco — passou
-- despercebido em todas as revisões porque os testes usam mock do Supabase, nunca o schema real.
--
-- Efeito prático do gap: toda execução da etapa "gerar_imagens" faz o INSERT inicial de
-- registrarEtapa() falhar (violação de constraint), registrado só via console.error (não lança) —
-- a geração de imagens em si roda normalmente, mas fica INVISÍVEL no Monitor de execução e no
-- Painel de Custo. Confirmado com um insert de teste real contra produção: erro
-- "violates check constraint pautas_execucao_log_etapa_check".
--
-- Migração 100% aditiva no sentido de dado (nenhuma linha existente é afetada, só amplia os
-- valores aceitos pela coluna já existente). Escrita pelo agente Marketing, NÃO aplicada por ele
-- (regra dura da seção 2 de docs/COORDENACAO_AGENTES_ARRUDACRED.md) — aguarda o Luiz rodar no SQL
-- Editor do Supabase.

alter table pautas_execucao_log drop constraint pautas_execucao_log_etapa_check;

alter table pautas_execucao_log add constraint pautas_execucao_log_etapa_check check (etapa in (
  'buscar_checklist', 'gerar_conteudo', 'revisar', 'inserir_links', 'sanitizar', 'gerar_imagens', 'publicar', 'registrar_resultado'
));
