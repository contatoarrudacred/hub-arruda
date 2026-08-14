-- ============================================================================
-- MIGRATION 001 — NÚCLEO DE DADOS
-- Sistema de Gestão ArrudaCred
-- Baseado em: MODELAGEM_DADOS_ARRUDACRED.md
-- Convenção: snake_case, tabelas no plural, PK sempre "id", FK "<tabela_singular>_id"
-- Executar no SQL Editor do Supabase (projeto na região sa-east-1 / São Paulo)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Entidade Legal e Unidade de Negócio (multi-empresa desde o início)
-- ---------------------------------------------------------------------------

create table entidades_legais (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  cnpj text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table entidades_legais is
  'A razão social/CNPJ que existe hoje (ex.: L.H. DE ARRUDA D. DO VALLE SERVIÇOS LTDA). Uma entidade legal pode ter várias unidades de negócio.';

create table unidades_negocio (
  id uuid primary key default gen_random_uuid(),
  entidade_legal_id uuid not null references entidades_legais(id),
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table unidades_negocio is
  'ArrudaCred, Aetria, e futuras unidades. Hoje todas sob a mesma Entidade Legal, mas o modelo suporta CNPJ próprio no futuro se alguma virar empresa separada.';

-- ---------------------------------------------------------------------------
-- Núcleo Pessoa/Papel ("Party Model")
-- ---------------------------------------------------------------------------

create table pessoas (
  id uuid primary key default gen_random_uuid(),
  tipo_pessoa text not null check (tipo_pessoa in ('pf', 'pj')),
  nome_razao_social text not null,
  documento text not null unique,
  email text,
  whatsapp text,
  data_nascimento_fundacao date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table pessoas is
  'Identidade única de qualquer pessoa física ou jurídica que o sistema conhece — antes de assumir qualquer papel (lead, cliente, fornecedor, parceiro). Ver pessoa_papeis para os papéis assumidos.';
comment on column pessoas.tipo_pessoa is
  'pf = pessoa física, pj = pessoa jurídica. Define se documento é CPF ou CNPJ.';
comment on column pessoas.documento is
  'CPF (pf) ou CNPJ (pj), somente números, sem máscara. Chave de identificação única da pessoa no sistema.';

create table pessoa_papeis (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references pessoas(id),
  unidade_negocio_id uuid not null references unidades_negocio(id),
  tipo_papel text not null check (tipo_papel in ('lead', 'cliente', 'fornecedor', 'parceiro', 'afiliado')),
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  data_inicio date not null default current_date,
  data_fim date,
  created_at timestamptz not null default now()
);
comment on table pessoa_papeis is
  'Liga uma pessoa a um papel (lead/cliente/fornecedor/parceiro/afiliado) dentro de uma unidade de negócio específica. Uma mesma pessoa pode ter múltiplos papéis simultâneos, inclusive em unidades de negócio diferentes.';
comment on column pessoa_papeis.data_inicio is
  'Data em que a pessoa passou a ocupar este papel — permite reconstruir o histórico (ex.: quando um lead virou cliente).';

create index idx_pessoa_papeis_pessoa on pessoa_papeis(pessoa_id);
create index idx_pessoa_papeis_tipo on pessoa_papeis(tipo_papel, unidade_negocio_id);

create table pessoa_representantes (
  id uuid primary key default gen_random_uuid(),
  pessoa_juridica_id uuid not null references pessoas(id),
  pessoa_fisica_id uuid not null references pessoas(id),
  papel_representacao text not null default 'Representante Legal',
  data_inicio date not null default current_date,
  data_fim date,
  created_at timestamptz not null default now()
);
comment on table pessoa_representantes is
  'Liga uma Pessoa PJ à Pessoa PF que assina/representa por ela (ex.: quem assina o contrato). O representante é uma Pessoa própria — se ele mesmo virar lead/cliente individualmente, não há duplicação de cadastro.';

create table enderecos (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references pessoas(id),
  tipo text not null default 'residencial' check (tipo in ('residencial', 'comercial', 'cobranca')),
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  cep text,
  created_at timestamptz not null default now()
);
comment on table enderecos is
  'Endereços de uma pessoa — separado porque ela pode ter mais de um (residencial, comercial, cobrança).';

-- ---------------------------------------------------------------------------
-- Camada Multi-Canal — resolução de identidade
-- ---------------------------------------------------------------------------

create table identidades_canal (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references pessoas(id),
  canal text not null check (canal in ('whatsapp', 'instagram', 'messenger', 'widget', 'telegram')),
  identificador_externo text not null,
  verificado boolean not null default false,
  created_at timestamptz not null default now(),
  unique (canal, identificador_externo)
);
comment on table identidades_canal is
  'Liga um identificador específico de canal (número WhatsApp, ID Instagram, PSID Messenger, sessão do widget) a uma única Pessoa. Uma Pessoa pode ter várias identidades_canal — uma por canal já usado. Evita cadastro duplicado quando a mesma pessoa usa canais diferentes.';
comment on column identidades_canal.verificado is
  'Confiabilidade da identidade varia por canal: WhatsApp/telefone é confiável de cara; widget do site é o menos confiável até a pessoa se identificar (nome/e-mail).';

-- ---------------------------------------------------------------------------
-- RBAC — nível único (ADMIN/MASTER) por enquanto
-- ---------------------------------------------------------------------------

create table usuarios_sistema (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null unique references pessoas(id),
  email text not null unique,
  senha_hash text not null,
  nivel_acesso text not null default 'admin' check (nivel_acesso in ('admin')),
  -- nota: check acima só permite 'admin' hoje de propósito (decisão registrada em
  -- MODELAGEM_DADOS_ARRUDACRED.md — nível único por enquanto). Ampliar o check
  -- quando os níveis financeiro/operacional/relatorios forem desenhados.
  ativo boolean not null default true,
  ultimo_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table usuarios_sistema is
  'Login da equipe interna (não confundir com usuarios_portal, que é de Parceiros/Afiliados). Reaproveita o núcleo Pessoa — um usuário do sistema é uma Pessoa que ganhou credencial de acesso. Nível único ADMIN/MASTER por decisão de Luiz (12/08/2026) — ampliar quando Financeiro/Operacional/Relatórios existirem.';

-- ---------------------------------------------------------------------------
-- Valores Configuráveis
-- ---------------------------------------------------------------------------

create table configuracoes (
  id uuid primary key default gen_random_uuid(),
  unidade_negocio_id uuid references unidades_negocio(id),
  produto_id uuid, -- FK adicionada em migration 002, depois que "produtos" existir
  chave text not null,
  valor jsonb not null,
  descricao text not null,
  atualizado_por uuid references usuarios_sistema(id),
  updated_at timestamptz not null default now(),
  unique (unidade_negocio_id, produto_id, chave)
);
comment on table configuracoes is
  'Chave-valor genérico para valores/parâmetros configuráveis pelo admin (preço mínimo, taxa de seguro, fórmula de alto valor, janela comercial, etc.). O campo "descricao" é obrigatório — é o "para que serve" que Luiz pediu para constar no próprio banco.';
comment on column configuracoes.descricao is
  'Obrigatório preencher: explica para que serve este valor. Junto com os comentários de tabela/coluna, garante que o schema é autoexplicativo.';

-- ============================================================================
-- Fim da migration 001. Próxima: 002_comercial.sql
-- ============================================================================
