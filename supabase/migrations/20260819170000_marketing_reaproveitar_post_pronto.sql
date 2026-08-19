-- Fase 4b — reaproveitamento de trabalho já feito entre tentativas (19/08/2026)
-- Pedido do Luiz depois de ver, num teste real, o pipeline descartar um texto já aprovado e
-- imagens já geradas (custando $ real de Anthropic + OpenAI) só porque a publicação falhou por
-- credencial de WordPress inválida (erro técnico, não de conteúdo). Sem isso, toda falha na etapa
-- "publicar" reinicia o ciclo inteiro (Escritor + Revisor + geração de imagens) do zero na próxima
-- tentativa, mesmo quando o problema não tinha nada a ver com o conteúdo.
--
-- posts.pronto_para_publicar: marca que o post já passou por TODAS as etapas de preparação
-- (conteúdo aprovado, links inseridos, sanitizado, imagens geradas/embutidas) e só falta
-- publicar de fato. Quando true, a próxima tentativa desta pauta pula direto pra "publicar",
-- sem chamar IA nenhuma de novo.
-- posts.imagem_destaque_media_id: ID de mídia da capa já enviada ao WordPress (WordPress attachment
-- id) — sem isso, uma tentativa reaproveitada não sabe qual `featured_media` passar pro
-- criarRascunho sem repetir o upload.
--
-- Migração 100% aditiva. Escrita pelo agente Marketing, NÃO aplicada por ele (regra dura da seção
-- 2 de docs/COORDENACAO_AGENTES_ARRUDACRED.md) — aguarda o Luiz rodar no SQL Editor do Supabase.

alter table posts add column pronto_para_publicar boolean not null default false;
comment on column posts.pronto_para_publicar is
  'true quando o post já passou por todas as etapas de preparação (conteúdo aprovado, links, sanitização, imagens) e só falta publicar. Permite a próxima tentativa desta pauta pular direto pra "publicar" sem chamar IA de novo caso a tentativa anterior tenha falhado só na publicação (erro técnico, não de conteúdo) — ver processar-pauta.ts.';

alter table posts add column imagem_destaque_media_id text;
comment on column posts.imagem_destaque_media_id is
  'ID de mídia (attachment) da capa já enviada ao WordPress via /wp/v2/media — permite reaproveitar o featured_media numa tentativa de publicação seguinte sem repetir o upload.';
