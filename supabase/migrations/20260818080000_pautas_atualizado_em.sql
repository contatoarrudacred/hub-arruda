-- Task 10 item 3 (18/08/2026) — reclaim de pautas presas em "em_producao". Se a função da rota de
-- cron morre por timeout no meio do processamento, nada re-seleciona pautas nesse status; com
-- atualizado_em, selecionarProximaPautaPendente passa a também considerar pautas "em_producao"
-- cujo atualizado_em seja antigo (mais de 10 minutos) como candidatas a reclaim. Ver
-- src/lib/marketing/repositorio.ts.
alter table pautas add column atualizado_em timestamptz not null default now();
comment on column pautas.atualizado_em is
  'Atualizado toda vez que o status da pauta muda (marcarPautaEmProducao/registrarReprovacaoPauta/marcarPautaBloqueada/marcarPautaPublicada). Usado pra reclaim: pauta em_producao com atualizado_em antigo (>10min) é considerada travada (função de cron morta por timeout) e volta a ser selecionável.';
