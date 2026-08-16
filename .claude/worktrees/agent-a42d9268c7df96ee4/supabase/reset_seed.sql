-- Uso exclusivo da fase de desenvolvimento do motor de fluxo (ainda sem lead real no sistema).
-- Apaga os dados de conteúdo/seed pra poder rodar supabase/seed.sql do zero sempre que o script
-- (etapas_fluxo, FAQs, preços, agenda) for ajustado. NÃO usar depois que existirem conversas/
-- oportunidades reais — nesse ponto, ajustes viram UPDATE pontual, não reset.

truncate table
  mensagens,
  conversas,
  oportunidades,
  agenda_itens,
  agendas_followup,
  faqs,
  precos_por_faixa,
  configuracoes,
  etapas_fluxo,
  fluxos,
  produtos,
  unidades_negocio,
  entidades_legais
restart identity cascade;
