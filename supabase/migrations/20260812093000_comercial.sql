-- ============================================================================
-- MIGRATION 002 — COMERCIAL / ATENDIMENTO (MVP1)
-- Sistema de Gestão ArrudaCred
-- Baseado em: MODELAGEM_DADOS_ARRUDACRED.md, SCRIPT_LIMPANOME_SERASA_SPC.md,
--             FAQ_LIMPANOME_SERASA_SPC.md, KANBAN_COMERCIAL_LIMPANOME.md
-- Pré-requisito: rodar 001_nucleo.sql antes desta.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Produtos
-- ---------------------------------------------------------------------------

create table produtos (
  id uuid primary key default gen_random_uuid(),
  unidade_negocio_id uuid not null references unidades_negocio(id),
  nome text not null,
  tipo text not null check (tipo in ('proprio', 'terceiro')),
  parceiro_executor text, -- preenchido quando tipo = 'terceiro' (ex.: nome do banco/operadora)
  fonte_receita text not null check (fonte_receita in ('venda_direta', 'comissao')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table produtos is
  'Catálogo de produtos vendidos/ofertados. Entidade configurável desde o início — o sistema não trava em "limpa nome" (ver PLANO_MESTRE seção 8.8). Produtos conhecidos hoje: Limpeza de Nome, Score/Rating, BACEN/SCR/CCF, Jusbrasil/Escavador, Conta Protegida, Consórcio, Crédito, Assinatura de Veículos.';

-- Referencia produtos de volta em configuracoes (criada na migration 001 sem essa FK)
alter table configuracoes
  add constraint fk_configuracoes_produto foreign key (produto_id) references produtos(id);

-- ---------------------------------------------------------------------------
-- Editor de Fluxo — script de atendimento configurável pelo admin
-- ---------------------------------------------------------------------------

create table fluxos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos(id),
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table fluxos is
  'Um fluxo de atendimento por produto — o script inteiro de vendas de um produto vira um registro aqui.';

create table agendas_followup (
  id uuid primary key default gen_random_uuid(),
  nome text not null, -- ex.: "Padrão", "Proposta"
  created_at timestamptz not null default now()
);
comment on table agendas_followup is
  'Agenda de retomada configurável. Nem toda mensagem usa a mesma cadência — a agenda "Padrão" (10min/45min/4h/24h/3d/7d/10d + nutrição 30/60/90d) é a primeira registrada; a de "Proposta" ainda está pendente de definição.';

create table agenda_itens (
  id uuid primary key default gen_random_uuid(),
  agenda_id uuid not null references agendas_followup(id),
  ordem int not null,
  intervalo_valor int not null,
  intervalo_unidade text not null check (intervalo_unidade in ('minutos', 'horas', 'dias')),
  canal text not null check (canal in ('whatsapp', 'email')),
  respeita_janela_comercial boolean not null default true,
  conteudo text not null,
  created_at timestamptz not null default now()
);
comment on table agenda_itens is
  'Cada tentativa de retomada de uma agenda de follow-up. respeita_janela_comercial=false é a exceção conhecida (1ª tentativa da agenda padrão, 10min, roda a qualquer horário).';

create table etapas_fluxo (
  id uuid primary key default gen_random_uuid(),
  fluxo_id uuid not null references fluxos(id),
  ordem int not null,
  tipo_etapa text not null check (tipo_etapa in ('mensagem_sequencial', 'pergunta_checkpoint', 'condicional', 'webhook_espera')),
  conteudo jsonb not null,
  campo_salvo text, -- nome do campo da oportunidade onde a resposta deste checkpoint é persistida (se aplicável)
  agenda_followup_id uuid references agendas_followup(id), -- null = usa a agenda padrão do sistema
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table etapas_fluxo is
  'A tabela que realiza o "editor de fluxo" (PLANO_MESTRE seção 8.9). Cada "Passo" do script documentado vira uma linha aqui — o admin edita uma linha em vez de mexer em código. conteudo guarda texto/mídia/variações em jsonb. agenda_followup_id nulo usa a agenda padrão; preenchido usa uma agenda específica (ex.: mensagem de proposta).';
comment on column etapas_fluxo.campo_salvo is
  'Se preenchido, a resposta do lead neste checkpoint é persistida como campo da oportunidade sob este nome — configurável pelo admin, checkpoint a checkpoint.';

create table faqs (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos(id),
  pergunta text not null,
  resposta text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table faqs is
  'Base de conhecimento por produto, CRUD completo (editar/desativar/excluir/criar) pelo admin — evita a IA alucinar em assunto sensível (garantia, contrato, pagamento).';

create table precos_por_faixa (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos(id),
  faixa_min numeric(12,2) not null,
  faixa_max numeric(12,2), -- null = faixa aberta ("acima de")
  preco_cheio numeric(12,2),
  preco_avista numeric(12,2),
  parcelas_boleto_qtd int,
  parcelas_boleto_valor numeric(12,2),
  parcelas_cartao_max int,
  voucher_avista numeric(12,2),
  voucher_parcelas_qtd int,
  voucher_parcelas_valor numeric(12,2),
  ativo boolean not null default true,
  updated_at timestamptz not null default now()
);
comment on table precos_por_faixa is
  'Tabela de preço por faixa de valor de restrição — tanto os preços quanto as próprias faixas (faixa_min/faixa_max) são editáveis pelo admin, exigência explícita de Luiz.';

-- ---------------------------------------------------------------------------
-- CRM / Funil
-- ---------------------------------------------------------------------------

create table oportunidades (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references pessoas(id),
  produto_id uuid not null references produtos(id),
  etapa_kanban text not null default 'novo_lead_triagem',
  valor_estimado numeric(12,2),
  alto_valor boolean not null default false,
  sob_supervisor boolean not null default false,
  motivo_perda text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table oportunidades is
  'Registro do CRM/Kanban — liga Pessoa + Produto + etapa do funil + valor estimado. etapa_kanban usa os valores de KANBAN_COMERCIAL_LIMPANOME.md (ex.: novo_lead_triagem, qualificacao, faixa_divida, envio_proposta, negociacao_duvidas, dados_contrato, assinatura_digital, pagamento, ganha, perdida).';
comment on column oportunidades.alto_valor is
  'Badge visual no card (não é etapa própria) — true quando a restrição declarada é acima de R$ 500 mil (regra do produto Limpeza de Nome).';

create index idx_oportunidades_pessoa on oportunidades(pessoa_id);
create index idx_oportunidades_etapa on oportunidades(etapa_kanban);

create table conversas (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references pessoas(id),
  oportunidade_id uuid references oportunidades(id),
  canal text not null check (canal in ('whatsapp', 'instagram', 'messenger', 'widget', 'telegram')),
  sob_supervisor boolean not null default false,
  status text not null default 'ativa' check (status in ('ativa', 'encerrada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table conversas is
  'Uma conversa (WhatsApp ou outro canal) ligada a uma Pessoa e opcionalmente a uma Oportunidade. sob_supervisor é a flag que realiza o destaque visual do Kanban (bloco separado no topo da coluna), não uma etapa.';

create table mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references conversas(id),
  etapa_fluxo_id uuid references etapas_fluxo(id),
  remetente text not null check (remetente in ('malala', 'lead', 'supervisor')),
  conteudo text,
  midia_url text,
  enviado_em timestamptz not null default now()
);
comment on table mensagens is
  'Histórico de toda mensagem trocada, ligada à etapa do fluxo que a originou — dá rastreabilidade completa (auditoria) e permite ao supervisor retomar uma conversa sabendo exatamente o que já foi dito.';

create index idx_mensagens_conversa on mensagens(conversa_id, enviado_em);

-- ============================================================================
-- Fim da migration 002.
-- Próximas (quando o planejamento de Marketing avançar): 003_parceiros_afiliados.sql
-- ============================================================================
