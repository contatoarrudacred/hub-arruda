-- ============================================================================
-- MIGRATION 032 — Roteamento de lead novo (Bloco D/Fase 4)
-- Sistema de Gestão ArrudaCred
--
-- TELA_ATENDIMENTO_ARRUDACRED.md seção 5-B: hoje o comportamento é fixo no código (toda mensagem
-- nova de um número desconhecido aciona sempre "saudacao_inicial"). Esta migration dá a base pra
-- isso virar configurável, com 3 modos mutuamente exclusivos (roteamento_lead_novo_modo):
--   1. "fluxo_fixo"    — sempre inicia a mesma etapa (roteamento_lead_novo_etapa_fixa).
--   2. "palavra_chave" — cruza a primeira mensagem com regras_roteamento; sem nenhum termo batendo,
--                        não responde sozinho (mesma leitura do modo "manual").
--   3. "manual"        — nunca responde sozinho, só registra a conversa.
-- Valores padrão inseridos abaixo preservam exatamente o comportamento anterior (fluxo_fixo →
-- saudacao_inicial) — rollout não quebra nada até Luiz decidir mudar em /admin/configuracoes.
-- ============================================================================

create table regras_roteamento (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  termos text[] not null,
  etapa_codigo text not null,
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table regras_roteamento is
  'Regras de palavra-chave -> etapa de fluxo, usadas no modo "palavra_chave" de roteamento de lead novo (configuracoes.roteamento_lead_novo_modo) e reaproveitáveis depois pra detecção de troca de assunto (TELA_ATENDIMENTO_ARRUDACRED.md seção 5-B). Se a primeira mensagem do lead contém algum termo de uma regra ativa, o fluxo é iniciado na etapa_codigo indicada — a primeira regra (por ordem) que bater vence.';
comment on column regras_roteamento.etapa_codigo is
  'Código estável de uma etapa em etapas_fluxo.conteudo->>''codigo'' (mesmo identificador que o motor usa pra navegar, engine.ts) — não é uma FK real porque o código vive dentro do jsonb, não numa coluna própria.';

create index idx_regras_roteamento_ordem on regras_roteamento(ordem) where ativo;

alter table regras_roteamento enable row level security;
create policy admin_acesso_total on regras_roteamento for all to authenticated using (true) with check (true);

insert into configuracoes (chave, valor, descricao)
values
  (
    'roteamento_lead_novo_modo',
    '"fluxo_fixo"',
    'Como o sistema decide o que fazer quando um número novo manda a primeira mensagem: "fluxo_fixo" (sempre inicia a mesma etapa, ver roteamento_lead_novo_etapa_fixa), "palavra_chave" (cruza com a tabela regras_roteamento; sem nenhum termo batendo, não responde sozinho) ou "manual" (nunca responde sozinho, só registra a conversa pro atendente ver). Os 3 modos são mutuamente exclusivos — decisão de Luiz, 17/08/2026.'
  ),
  (
    'roteamento_lead_novo_etapa_fixa',
    '"saudacao_inicial"',
    'Código da etapa iniciada quando roteamento_lead_novo_modo = "fluxo_fixo" — valor padrão reproduz o comportamento fixo no código antes desta configuração existir.'
  )
on conflict do nothing;

-- ============================================================================
-- Fim da migration 032.
-- ============================================================================
