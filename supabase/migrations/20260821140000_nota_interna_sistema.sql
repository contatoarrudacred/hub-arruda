-- Nota interna automática em handoff pra humano (spec 2026-08-21-testes-conversa-malala-e-nota-handoff.md)
-- Achado: nenhum dos 4 pontos onde a Malala escala pra um consultor humano deixava rastro na
-- timeline da conversa (só o do agendamento gravava notificação, nenhum gravava nota interna).
-- Aditiva: só relaxa um NOT NULL, sem apagar nem alterar dado existente.

alter table notas_internas alter column autor_id drop not null;

comment on column notas_internas.autor_id is
  'Autor humano da nota (usuarios_sistema). NULL = nota gerada automaticamente pelo motor de fluxo (handoff da Malala pra um consultor humano), sem autor humano por trás.';
