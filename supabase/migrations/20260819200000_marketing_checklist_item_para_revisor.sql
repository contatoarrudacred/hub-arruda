-- Fase 4b — calibração dupla Escritor/Revisor por item de checklist (19/08/2026, pedido do Luiz)
-- Achado real do teste de ponta a ponta: itens de faixa numérica estreita (ex.: "resposta direta
-- de 40-60 palavras logo abaixo de cada H2") são um alvo difícil do Escritor acertar com precisão
-- em TODAS as seções de um artigo simultaneamente — uma pauta chegou a esgotar 6 tentativas
-- reprovando quase sempre por esse mesmo item. Ideia do Luiz: o Escritor mira no alvo ideal
-- (ex.: 40-60), mas o Revisor aceita uma faixa mais tolerante (ex.: 20-80) — reduz retrabalho sem
-- abrir mão do padrão de qualidade que o Escritor tenta atingir.
--
-- item_para_revisor: texto alternativo opcional usado SÓ pelo Revisor ao montar seu prompt — o
-- Escritor sempre usa `item` (o alvo ideal). NULL (a maioria dos itens, que não tem essa
-- ambiguidade de "alvo vs. aceitável") faz o Revisor usar o mesmo texto do Escritor, idêntico ao
-- comportamento de antes desta coluna existir.
--
-- Migração 100% aditiva. Escrita pelo agente Marketing, NÃO aplicada por ele (regra dura da seção
-- 2 de docs/COORDENACAO_AGENTES_ARRUDACRED.md) — aguarda o Luiz rodar no SQL Editor do Supabase.

alter table checklist_qa_itens add column item_para_revisor text;
comment on column checklist_qa_itens.item_para_revisor is
  'Texto alternativo deste item do checklist usado só pelo Revisor (Fase 4b, 19/08/2026) — o Escritor sempre usa a coluna `item` (o alvo ideal a mirar). Permite calibrar faixas numéricas com tolerância maior na aprovação do que no alvo pedido na geração (ex.: Escritor mira "40-60 palavras", Revisor aceita "20-80 palavras"). NULL = Revisor usa o mesmo texto do Escritor (comportamento padrão, igual a antes desta coluna existir).';
