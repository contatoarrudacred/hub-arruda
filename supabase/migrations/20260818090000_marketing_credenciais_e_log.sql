-- Fase 2 do módulo Marketing (18/08/2026) — credenciais de canal (texto plano, decisão do Luiz —
-- ver comment on column abaixo) + log de execução do pipeline. Ver
-- docs/superpowers/specs/2026-08-18-pipeline-conteudo-marketing-telas-design.md seções 3.1 e 3.3.
-- REGRA DURA: este arquivo não é aplicado por nenhum agente — reservado em
-- COORDENACAO_AGENTES_ARRUDACRED.md, entregue ao Luiz pelo Coordenador, aplicado por ele no SQL
-- Editor.

alter table propriedades_digitais add column credenciais_canais jsonb not null default '{}'::jsonb;
comment on column propriedades_digitais.credenciais_canais is
  'Credenciais de canal por propriedade, em texto plano (decisão do Luiz, 18/08/2026 — não é precedente pra outros segredos). Formato: {"wordpress": {"usuario": "...", "senha": "..."}}. Fallback: propriedade sem entrada aqui continua usando WORDPRESS_USUARIO/WORDPRESS_SENHA_APP (env genérico).';

create table pautas_execucao_log (
  id uuid primary key default gen_random_uuid(),
  pauta_id uuid not null references pautas(id) on delete cascade,
  etapa text not null check (etapa in (
    'buscar_checklist', 'gerar_conteudo', 'revisar', 'inserir_links', 'sanitizar', 'publicar', 'registrar_resultado'
  )),
  iniciado_em timestamptz not null default now(),
  concluido_em timestamptz,
  sucesso boolean,
  detalhes text,
  tokens_entrada int,
  tokens_saida int,
  created_at timestamptz not null default now()
);
comment on table pautas_execucao_log is
  'Log append-only de cada etapa do pipeline por pauta — alimenta o Monitor de execução (tela ao vivo, MODULO_MARKETING_CONTEUDO_ARRUDACRED.md seção 7.2) via Supabase Realtime, e o Painel de Custo (soma de tokens). Uma linha por etapa por tentativa — reprovações geram novas linhas pra mesma pauta, dando histórico de retrabalho visível.';
comment on column pautas_execucao_log.tokens_entrada is
  'Preenchido só nas etapas gerar_conteudo/revisar (chamadas à Anthropic) — vem de resposta.usage.input_tokens.';
comment on column pautas_execucao_log.tokens_saida is
  'Preenchido só nas etapas gerar_conteudo/revisar — vem de resposta.usage.output_tokens.';

alter table pautas_execucao_log enable row level security;
create policy admin_acesso_total on pautas_execucao_log for all to authenticated using (true) with check (true);
create trigger trg_auditoria_pautas_execucao_log
  after insert or update or delete on pautas_execucao_log
  for each row execute function fn_auditoria_log();

create index idx_execucao_log_pauta on pautas_execucao_log (pauta_id, iniciado_em desc);

-- Habilita Realtime nesta tabela (primeira do projeto a usar — ver spec seção 3.3 pra justificativa).
alter publication supabase_realtime add table pautas_execucao_log;
