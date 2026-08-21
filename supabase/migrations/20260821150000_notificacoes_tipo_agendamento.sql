-- Corrige achado real da bateria de testes da Malala (docs/superpowers/specs/2026-08-21-achados-bateria-testes-malala.md,
-- Achado 0a): a migration do Agendamento com Consultor (20260820130000) passou a inserir
-- notificacoes.tipo = 'agendamento', mas nunca atualizou o CHECK constraint original (criado em
-- 20260817010000 só com 'mencao'/'atribuicao') — todo lead real que aceita agendar horário quebra
-- o turno com "violates check constraint notificacoes_tipo_check" (erro reproduzido e confirmado).
-- Aditiva/corretiva: só amplia um CHECK constraint, não apaga nem altera dado existente.

alter table notificacoes drop constraint notificacoes_tipo_check;
alter table notificacoes add constraint notificacoes_tipo_check check (tipo in ('mencao', 'atribuicao', 'agendamento'));
