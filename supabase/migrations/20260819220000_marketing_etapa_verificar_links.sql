-- Fase 4c — nova etapa "verificar_links" no log de execução (19/08/2026)
--
-- Pedido do Luiz: links externos que o Escritor cita às vezes são genéricos ou de fato quebrados
-- (achado real de teste em produção — uma URL do BACEN chegou a sair com o caminho duplicado,
-- "supervisaosupervisao"), consumindo tentativas inteiras do Revisor pra pegar isso. Nova etapa
-- entre "gerar_conteudo" e "revisar": confere com um request HTTP real se cada link externo
-- responde, e manda de volta pro Escritor corrigir (agora com acesso a busca na internet, ver
-- escritor.ts) antes de gastar um ciclo de revisão inteiro com um link que nem existe.
--
-- Mesmo padrão da migration 20260819160000 (correção do CHECK constraint pra "gerar_imagens"):
-- migração 100% aditiva no sentido de dado, só amplia os valores aceitos pela coluna já existente.
-- Escrita pelo agente Marketing, NÃO aplicada por ele (regra dura da seção 2 de
-- docs/COORDENACAO_AGENTES_ARRUDACRED.md) — aguarda o Luiz rodar no SQL Editor do Supabase.

alter table pautas_execucao_log drop constraint pautas_execucao_log_etapa_check;

alter table pautas_execucao_log add constraint pautas_execucao_log_etapa_check check (etapa in (
  'buscar_checklist', 'gerar_conteudo', 'verificar_links', 'revisar', 'inserir_links', 'sanitizar', 'gerar_imagens', 'publicar', 'registrar_resultado'
));
