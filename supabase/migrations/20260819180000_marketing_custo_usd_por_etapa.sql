-- Fase 4b — custo em USD por etapa do pipeline (19/08/2026, pedido do Luiz)
-- Hoje pautas_execucao_log grava tokens_entrada/tokens_saida (só Anthropic) mas nenhum custo em $
-- — e o custo real da OpenAI (geração de imagem, calculado em gerador-imagem-openai.ts) nunca era
-- persistido em lugar nenhum, se perdia depois de calculado. Essa coluna fecha os dois gaps: soma
-- custo de tokens Anthropic (convertido pelo preço do modelo) + custo direto em $ de chamadas que
-- não usam token (OpenAI). Alimenta o futuro módulo de "governança de custo" (Plano Mestre seção
-- 9, transversal a todo o sistema) — o Luiz já confirmou que a tela/relatório fica para depois,
-- mas o dado precisa ser capturado agora, no momento em que a chamada acontece.
--
-- Migração 100% aditiva. Escrita pelo agente Marketing, NÃO aplicada por ele (regra dura da seção
-- 2 de docs/COORDENACAO_AGENTES_ARRUDACRED.md) — aguarda o Luiz rodar no SQL Editor do Supabase.

alter table pautas_execucao_log add column custo_usd numeric;
comment on column pautas_execucao_log.custo_usd is
  'Custo estimado em USD desta etapa (Fase 4b, 19/08/2026) — tokens_entrada/tokens_saida convertidos pelo preço do modelo Anthropic usado, somado a custo direto de APIs sem token (ex.: geração de imagem via OpenAI, etapa gerar_imagens). Null em etapas sem custo de IA (buscar_checklist, inserir_links, sanitizar, publicar, registrar_resultado) ou quando a etapa falhou antes de calcular custo.';
