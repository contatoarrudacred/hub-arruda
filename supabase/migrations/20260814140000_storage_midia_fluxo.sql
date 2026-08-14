-- ============================================================================
-- MIGRATION 005 — Bucket de Storage para mídia do editor de fluxo
-- Sistema de Gestão ArrudaCred
--
-- O admin sobe arquivo (foto da Malala, selo de prêmio, áudio/vídeo/documento de
-- qualquer etapa) pela tela do editor — não dá pra salvar isso na pasta `public/` do
-- Next.js porque ela é empacotada no build e o Vercel roda em modo só-leitura em
-- produção (cada deploy é um pacote novo). O upload de verdade vai pro Supabase
-- Storage, bucket público — o sistema salva a URL pública gerada.
-- ============================================================================

-- Bucket público: leitura de arquivo não exige autenticação (é assim que a URL salva em
-- `midia_url` funciona direto no navegador do lead). Upload só acontece via Server Action do
-- painel admin, usando o cliente service_role — nunca escrita direta do navegador.
insert into storage.buckets (id, name, public)
values ('midia-fluxo', 'midia-fluxo', true)
on conflict (id) do nothing;

-- ============================================================================
-- Fim da migration 005.
-- ============================================================================
