-- Guarda o último rascunho gerado pelo Escritor pra cada pauta, mesmo quando o Revisor reprova.
-- Achado no teste real de ponta a ponta da Fase 3 (19/08/2026): hoje o rascunho rejeitado é
-- descartado (só sobrevive na memória do processo), então cada retry regenera do zero em vez de
-- revisar o texto anterior a partir do motivo de reprovação. Migração 100% aditiva: só
-- `alter table add column`, nenhum drop/truncate/delete. Escrita pelo agente Marketing, NÃO
-- aplicada por ele (regra dura da seção 2 de docs/COORDENACAO_AGENTES_ARRUDACRED.md) — aguarda o
-- Luiz rodar no SQL Editor do Supabase.

alter table pautas add column ultimo_rascunho jsonb;
comment on column pautas.ultimo_rascunho is
  'Último rascunho gerado pelo Escritor pra esta pauta (jsonb: {titulo, conteudo_html, meta_title, meta_description, slug}) — gravado a cada geração, independente de aprovação. Nulo até a primeira geração. Alimenta o próprio Escritor na tentativa seguinte quando há reprovação: revisar o texto existente em vez de reescrever do zero (Fase 3, 19/08/2026).';
