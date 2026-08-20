-- Agendamento com consultor (leads de alto valor / pacote caro) — spec
-- docs/superpowers/specs/2026-08-20-agendamento-consultor-alto-valor.md
-- Aditiva: 2 tabelas novas + 2 colunas nullable/default. Nao apaga nem altera dado existente.

create table disponibilidade_atendente (
  id uuid primary key default gen_random_uuid(),
  usuario_sistema_id uuid not null references usuarios_sistema(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fim time not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table disponibilidade_atendente is 'Janela de disponibilidade de um consultor por dia da semana — usada pra calcular horários de agendamento oferecidos pela Malala. Spec 2026-08-20-agendamento-consultor-alto-valor.md.';
comment on column disponibilidade_atendente.dia_semana is '0 = domingo, 6 = sábado (mesma convenção de extract(dow from ...) do Postgres).';

create table agendamentos_consultor (
  id uuid primary key default gen_random_uuid(),
  usuario_sistema_id uuid not null references usuarios_sistema(id) on delete cascade,
  conversa_id uuid not null references conversas(id) on delete cascade,
  pessoa_id uuid not null references pessoas(id) on delete cascade,
  inicio timestamptz not null,
  fim timestamptz not null,
  status text not null default 'confirmado' check (status in ('confirmado', 'cancelado')),
  lembrete_15min_enviado boolean not null default false,
  lembrete_hora_enviado boolean not null default false,
  motivo text not null check (motivo in ('divida_alta', 'pacote_caro')),
  created_at timestamptz not null default now()
);

comment on table agendamentos_consultor is 'Agendamento de ligação/vídeo-chamada com um consultor, oferecido pela Malala quando a dívida do lead ou o preço do pacote ultrapassa o corte configurado. Spec 2026-08-20-agendamento-consultor-alto-valor.md.';
comment on column agendamentos_consultor.motivo is 'Por que a Malala escalou — dívida acima do corte configurável, ou preço do pacote acima de R$8.000 — pro consultor saber o contexto sem abrir a conversa.';

create index idx_agendamentos_consultor_usuario_periodo on agendamentos_consultor(usuario_sistema_id, inicio, fim) where status = 'confirmado';

alter table usuarios_sistema add column if not exists eh_consultor boolean not null default false;
comment on column usuarios_sistema.eh_consultor is 'Marca quem pode receber agendamento de leads de alto valor/pacote caro — hoje só o Luiz, campo pensado pra suportar mais de um consultor no futuro sem redesenho.';

alter table notificacoes add column if not exists agendamento_id uuid references agendamentos_consultor(id) on delete cascade;

alter table disponibilidade_atendente enable row level security;
create policy admin_acesso_total on disponibilidade_atendente for all to authenticated using (true) with check (true);
create trigger trg_auditoria_disponibilidade_atendente
  after insert or update or delete on disponibilidade_atendente
  for each row execute function fn_auditoria_log();

alter table agendamentos_consultor enable row level security;
create policy admin_acesso_total on agendamentos_consultor for all to authenticated using (true) with check (true);
create trigger trg_auditoria_agendamentos_consultor
  after insert or update or delete on agendamentos_consultor
  for each row execute function fn_auditoria_log();

-- Semeia o Luiz como consultor (único hoje) + disponibilidade padrão pedida por ele: seg-sex
-- 10h-21h, sáb 10h-15h, sem domingo. Se o e-mail mudar/não existir ainda neste ambiente, o UPDATE
-- e os INSERTs abaixo simplesmente não afetam nenhuma linha — não falha a migration.
update usuarios_sistema set eh_consultor = true where email = 'lhdoria2011@gmail.com';

insert into disponibilidade_atendente (usuario_sistema_id, dia_semana, hora_inicio, hora_fim)
select id, dia, '10:00', case when dia = 6 then '15:00' else '21:00' end
from usuarios_sistema, unnest(array[1, 2, 3, 4, 5, 6]) as dia
where email = 'lhdoria2011@gmail.com';
