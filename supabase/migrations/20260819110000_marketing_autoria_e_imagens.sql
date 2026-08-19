-- Fase 4a+4b (precisão editorial + imagens) — Task 1
-- Autoria de propriedade (E-E-A-T) + colunas de imagem em posts.
-- Ver docs/superpowers/specs/2026-08-19-fase4-precisao-imagens-distribuicao-design.md
-- seções 3.3 e 4.1.
-- Migração 100% aditiva: só `alter table add column`. Nenhum drop/truncate/delete.
-- Escrita pelo agente Marketing, NÃO aplicada por ele (regra dura da seção 2 de
-- docs/COORDENACAO_AGENTES_ARRUDACRED.md) — aguarda o Luiz rodar no SQL Editor do Supabase.

alter table propriedades_digitais add column autoria jsonb;
comment on column propriedades_digitais.autoria is
  'Dados de autoria E-E-A-T (Fase 4a, 19/08/2026), jsonb: {nome, foto_url, bio, especialidade, empresa, credenciais: string[], perfis_profissionais: string[]}. Nulo = propriedade sem autoria configurada ainda; posts publicam normalmente, só sem o campo "author" no schema Article (ver montarSchemaArticle). Cadastrado uma vez por propriedade, herdado automaticamente por todo post dela — não é campo por post.';

alter table posts add column imagem_destaque_alt text;
comment on column posts.imagem_destaque_alt is
  'ALT text da imagem de destaque (Fase 4b, 19/08/2026) — derivado do mesmo material usado pra gerar a imagem (resumo do post/persona), nunca inventado à parte. posts.imagem_destaque_url já existia desde o núcleo (17/08/2026), reservado pra esta fase, nunca preenchido até aqui.';

alter table posts add column imagem_destaque_slug text;
comment on column posts.imagem_destaque_slug is
  'Nome de arquivo da imagem de destaque, kebab-case com palavra-chave (ex.: ordem-pagamento-dividas-negativado) — não hash aleatório, Google Imagens lê o nome do arquivo.';

alter table posts add column imagens_secundarias jsonb not null default '[]'::jsonb;
comment on column posts.imagens_secundarias is
  'Imagens informativas geradas no corpo do post (Fase 4b, 19/08/2026), jsonb: array de {url, alt, slug, titulo, legenda, posicao_apos_secao, storage_url}. Array vazio é resultado esperado e válido na maioria dos posts — o filtro de aprovação (nota >= 30/40, ganho de compreensão >= 8/10) é rígido de propósito, ver especificacao_automacao_imagens_secundarias_post.md. storage_url (adicionado depois, mesmo dia) é a cópia arquivada no bucket marketing-imagens — null quando esse upload falhou, degradação independente de `url` (a hospedada no WordPress).';

alter table posts add column imagem_destaque_storage_url text;
comment on column posts.imagem_destaque_storage_url is
  'Cópia da imagem de destaque arquivada no bucket marketing-imagens do Supabase Storage (Fase 4b, 19/08/2026) — pedido do Luiz pra ter as imagens salvas fora do WordPress, uso futuro ainda não definido. Independente de imagem_destaque_url (a hospedada no WordPress, que é a que o post exibe de verdade): uma pode existir sem a outra se um dos dois uploads falhar.';

-- -----------------------------------------------------------------------------
-- Bucket de Storage — arquivo das imagens geradas (capa + secundárias), cópia
-- independente do upload pro WordPress. Mesmo padrão de
-- 20260817130000_vendas_pessoa_documentos.sql.
-- -----------------------------------------------------------------------------
-- marketing-imagens: PÚBLICO — mesma exposição que a imagem já tem publicada no
-- WordPress, não é dado sensível.
insert into storage.buckets (id, name, public)
values ('marketing-imagens', 'marketing-imagens', true)
on conflict (id) do nothing;

create policy marketing_imagens_storage_acesso_total on storage.objects
  for all to authenticated
  using (bucket_id = 'marketing-imagens')
  with check (bucket_id = 'marketing-imagens');
