# Vendas — Cadastro (Fornecedor, Cliente, Venda sem funil prévio) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a primeira sub-frente do módulo Vendas — cadastro de Fornecedor (com regra de comissão configurável), promoção de Pessoa a Cliente, e criação de Oportunidade "sem funil prévio" (venda que nasce direto na etapa de fechamento) — deixando a base pronta para as sub-frentes seguintes (Contrato, Assinatura, Financeiro).

**Architecture:** Módulo novo `src/lib/vendas/` (não `src/lib/motor-fluxo/`, que é território do Comercial/atendimento) — arquivos pequenos por responsabilidade (`documento.ts`, `fornecedores.ts`, `clientes.ts`, `oportunidade-fechamento.ts`), seguindo o mesmo padrão de Server Actions finas + repositório já usado em `/admin/faqs`. Telas novas em `src/app/admin/(shell)/fornecedores/` e `src/app/admin/(shell)/vendas/`, mesma estrutura `page.tsx` + `actions.ts` + `*-client.tsx`.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Auth), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-modulo-vendas-design.md`

## Global Constraints

- Nomenclatura de `MODELAGEM_DADOS_ARRUDACRED.md`: snake_case, tabela plural, PK sempre `id uuid default gen_random_uuid()`, FK `<tabela_singular>_id`.
- `COMMENT ON TABLE`/`COMMENT ON COLUMN` obrigatório em toda tabela/coluna nova.
- RLS obrigatório em toda tabela nova, texto exato: `alter table X enable row level security; create policy admin_acesso_total on X for all to authenticated using (true) with check (true);`
- Trigger de auditoria obrigatório em toda tabela nova, texto exato: `create trigger trg_auditoria_<tabela> after insert or update or delete on <tabela> for each row execute function fn_auditoria_log();` (nome da função é `fn_auditoria_log`, não `fn_auditoria`).
- Migrations **não são aplicadas por quem executa este plano** — Luiz roda cada uma manualmente no SQL Editor do Supabase, na ordem, depois de revisar. Cada task de migration termina com o arquivo `.sql` completo e correto, não com a migration "rodando".
- Toda tela admin usa `createClient()` de `src/lib/supabase/server.ts` (autenticado via cookie) — **nunca** `createAdminClient()` (service_role), que é reservado a webhooks/cron.
- Convenção de teste deste projeto: **CRUD simples (passthrough pro banco) não tem teste unitário** (confirmado: nem `salvarFaq`/`excluirFaq` têm) — é verificado manualmente no navegador com o dev server rodando. **Lógica pura (cálculo, validação, normalização) ganha teste Vitest de verdade**, seguindo o padrão de `motor-followup.test.ts` (funções puras, sem mock de Supabase). As tasks abaixo seguem essa distinção explicitamente.
- `npm run lint` e `npm run build` verdes antes de cada commit.
- Próxima migration é a **033** (`supabase/migrations/`, timestamp `> 20260817100000`).

---

### Task 1: Migration — núcleo de cadastro Vendas (produtos, fornecedores, fornecedor_produtos)

**Files:**
- Create: `supabase/migrations/20260817110000_vendas_cadastro_nucleo.sql`

**Interfaces:**
- Produz: colunas `produtos.fornecedor_id`, `produtos.fornecedor_definido_em`; tabelas `fornecedores` (`id`, `pessoa_id`, `categoria`, `dados_bancarios`, `ativo`), `fornecedor_produtos` (`id`, `fornecedor_id`, `produto_id`, `percentual_comissao`, `forma_comissao`, `comissao_parcelas_qtd`, `comissao_dias_primeira_parcela`, `comissao_intervalo_dias_parcelas`, `condicoes`, `ativo`).

- [ ] **Step 1: Escrever a migration completa**

```sql
-- ============================================================================
-- MIGRATION 033 — Vendas: cadastro núcleo (produtos, fornecedores, fornecedor_produtos)
-- Sistema de Gestão ArrudaCred
-- Spec: docs/superpowers/specs/2026-08-17-modulo-vendas-design.md, seção 3.1
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. produtos.tipo — troca o enum de proprio/terceiro para os 3 modelos reais
-- -----------------------------------------------------------------------------
-- IMPORTANTE: a constraint precisa ser trocada ANTES do UPDATE — a constraint
-- antiga (check tipo in ('proprio','terceiro')) ainda está ativa até aqui, e
-- não permite gravar 'comissionado'. Gravar antes quebraria a migration.
do $$
declare
  nome_constraint text;
begin
  select con.conname into nome_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'produtos'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%tipo%proprio%';
  if nome_constraint is not null then
    execute format('alter table produtos drop constraint %I', nome_constraint);
  end if;
end $$;

alter table produtos add constraint produtos_tipo_check
  check (tipo in ('proprio', 'subcontratado', 'comissionado'));
comment on column produtos.tipo is
  'proprio = ArrudaCred executa e fatura, sem fornecedor. subcontratado = ArrudaCred fatura o cliente mas paga um fornecedor pra executar. comissionado = fornecedor/administradora fatura o cliente direto, ArrudaCred só recebe comissão. Ver docs/superpowers/specs/2026-08-17-modulo-vendas-design.md seção 2.';

-- Migração de dado existente: hoje só existem produtos 'terceiro' do tipo
-- comissionado (Consórcio, Crédito) — nenhum "subcontratado" foi cadastrado
-- ainda. Ver PENDÊNCIA 1 da spec — revisar antes de rodar se algum produto
-- 'terceiro' hoje for na real subcontratado (nesse caso, corrigir manualmente
-- essa linha antes de rodar a migration). Só pode rodar DEPOIS da constraint
-- nova acima, senão viola a constraint antiga.
update produtos set tipo = 'comissionado' where tipo = 'terceiro';

-- -----------------------------------------------------------------------------
-- 2. produtos.fornecedor_id — só para tipo = 'comissionado' (1 Produto = 1 fornecedor fixo)
-- -----------------------------------------------------------------------------
alter table produtos add column fornecedor_id uuid references pessoas(id);
comment on column produtos.fornecedor_id is
  'Fornecedor/administradora único deste Produto — só preenchido quando tipo = ''comissionado'' (resolve fornecedor_produtos pra calcular a comissão). Produtos subcontratados NÃO usam esta coluna — a escolha de fornecedor por venda fica em contratos.fornecedor_id (sub-frente de Contrato).';
alter table produtos add constraint produtos_fornecedor_id_tipo_check
  check (fornecedor_id is null or tipo = 'comissionado');

-- -----------------------------------------------------------------------------
-- 3. produtos.fornecedor_definido_em — só para tipo = 'subcontratado'
-- -----------------------------------------------------------------------------
alter table produtos add column fornecedor_definido_em text;
comment on column produtos.fornecedor_definido_em is
  'Só relevante quando tipo = ''subcontratado''. ''venda'' = a tela de Vendas exige escolher o fornecedor no fechamento (guardado em contratos.fornecedor_id). ''ordem_servico'' = fica em aberto pro módulo Operação decidir depois.';
alter table produtos add constraint produtos_fornecedor_definido_em_valor_check
  check (fornecedor_definido_em is null or fornecedor_definido_em in ('venda', 'ordem_servico'));
alter table produtos add constraint produtos_fornecedor_definido_em_tipo_check
  check (fornecedor_definido_em is null or tipo = 'subcontratado');

-- -----------------------------------------------------------------------------
-- 4. fornecedores — extensão de pessoa_papeis.tipo_papel = 'fornecedor'
-- -----------------------------------------------------------------------------
create table fornecedores (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null unique references pessoas(id),
  categoria text not null check (categoria in ('consorcio', 'credito', 'subcontratado_servico', 'administrativo')),
  dados_bancarios jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table fornecedores is
  'Extensão de pessoa_papeis.tipo_papel = ''fornecedor'' — qualquer fornecedor do negócio (administradora de consórcio, banco/operadora de crédito, subcontratado de execução, fornecedor administrativo). Escopo amplo confirmado por Luiz — só cadastro nesta frente, contas a pagar ficam pro módulo Financeiro futuro.';
comment on column fornecedores.categoria is
  'Categoria livre pra crescer: consorcio, credito, subcontratado_servico (produto tipo=subcontratado), administrativo (fornecedor que não vende nem executa serviço da ArrudaCred, só recebe pagamento por algo que a própria ArrudaCred contratou).';
comment on column fornecedores.dados_bancarios is
  'jsonb livre (banco, agência, conta, chave PIX) — usado só quando o módulo Financeiro/Operação existir pra pagar o fornecedor. Não tem consumidor ainda nesta frente.';

alter table fornecedores enable row level security;
create policy admin_acesso_total on fornecedores for all to authenticated using (true) with check (true);
create trigger trg_auditoria_fornecedores
  after insert or update or delete on fornecedores
  for each row execute function fn_auditoria_log();

-- -----------------------------------------------------------------------------
-- 5. fornecedor_produtos — comissão que a ArrudaCred RECEBE (espelha afiliado_produtos)
-- -----------------------------------------------------------------------------
create table fornecedor_produtos (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references fornecedores(id),
  produto_id uuid not null references produtos(id),
  percentual_comissao numeric(5,2) not null check (percentual_comissao > 0 and percentual_comissao <= 100),
  forma_comissao text not null check (forma_comissao in ('parcela_unica', 'parcelado')),
  comissao_parcelas_qtd int check (comissao_parcelas_qtd is null or comissao_parcelas_qtd > 0),
  comissao_dias_primeira_parcela int not null check (comissao_dias_primeira_parcela >= 0),
  comissao_intervalo_dias_parcelas int check (comissao_intervalo_dias_parcelas is null or comissao_intervalo_dias_parcelas > 0),
  condicoes jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fornecedor_produtos_parcelado_exige_qtd_check
    check (forma_comissao = 'parcela_unica' or comissao_parcelas_qtd is not null),
  unique (fornecedor_id, produto_id)
);
comment on table fornecedor_produtos is
  'Regra de comissão que a ArrudaCred RECEBE de um fornecedor por um Produto (direção inversa de afiliado_produtos, que é comissão que a ArrudaCred PAGA). Um par fornecedor+produto tem no máximo uma regra ativa. Ver docs/superpowers/specs/2026-08-17-modulo-vendas-design.md seção 3.1.';
comment on column fornecedor_produtos.comissao_dias_primeira_parcela is
  'Dias entre a data de referência (data em que o cliente assinou com o fornecedor, informada manualmente na confirmação da venda) e o vencimento da 1ª parcela de comissão — regra explícita de Luiz: "geralmente X dias após o cliente assinar contrato".';
comment on column fornecedor_produtos.comissao_intervalo_dias_parcelas is
  'Intervalo em dias entre parcelas subsequentes de comissão, quando forma_comissao = ''parcelado''. Nulo quando forma_comissao = ''parcela_unica''.';
comment on column fornecedor_produtos.condicoes is
  'Escape hatch em jsonb só pra exceção que genuinamente não couber nas colunas acima (ex.: regra escalonada por faixa de valor). Não usar pra agenda de pagamento — isso já tem coluna própria.';

alter table fornecedor_produtos enable row level security;
create policy admin_acesso_total on fornecedor_produtos for all to authenticated using (true) with check (true);
create trigger trg_auditoria_fornecedor_produtos
  after insert or update or delete on fornecedor_produtos
  for each row execute function fn_auditoria_log();

-- ============================================================================
-- Fim da migration 033.
-- ============================================================================
```

- [ ] **Step 2: Conferir a migration contra o padrão existente**

Abrir `supabase/migrations/20260817040000_bloco_b2_card_contato.sql` e `supabase/migrations/20260816040000_avaliacao_quick_wins.sql` lado a lado com o arquivo novo — confirmar cabeçalho, indentação, `comment on`, RLS e trigger idênticos ao padrão (não precisa rodar nada, é conferência visual).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260817110000_vendas_cadastro_nucleo.sql
git commit -m "feat(vendas): migration do cadastro núcleo (produtos, fornecedores, fornecedor_produtos)"
```

---

### Task 2: Migration — RLS + auditoria nas 6 tabelas núcleo ainda descobertas

**Files:**
- Create: `supabase/migrations/20260817120000_vendas_seguranca_nucleo_pessoa.sql`

**Interfaces:**
- Produz: RLS + trigger de auditoria em `entidades_legais`, `unidades_negocio`, `pessoa_papeis`, `pessoa_representantes`, `enderecos`, `identidades_canal`.

- [ ] **Step 1: Escrever a migration**

```sql
-- ============================================================================
-- MIGRATION 034 — Fecha lacuna de segurança: RLS + auditoria nas 6 tabelas
-- núcleo de Pessoa/Papel que nunca tiveram (SEGURANCA_E_AUDITORIA_ARRUDACRED.md
-- seção 2.6). Vendas é a primeira frente a escrever nelas via cliente
-- autenticado — sem isso, /admin/fornecedores e /admin/vendas ficam
-- bloqueados em silêncio pelo RLS automático do Supabase.
-- Sistema de Gestão ArrudaCred
-- ============================================================================

alter table entidades_legais enable row level security;
create policy admin_acesso_total on entidades_legais for all to authenticated using (true) with check (true);
create trigger trg_auditoria_entidades_legais
  after insert or update or delete on entidades_legais
  for each row execute function fn_auditoria_log();

alter table unidades_negocio enable row level security;
create policy admin_acesso_total on unidades_negocio for all to authenticated using (true) with check (true);
create trigger trg_auditoria_unidades_negocio
  after insert or update or delete on unidades_negocio
  for each row execute function fn_auditoria_log();

alter table pessoa_papeis enable row level security;
create policy admin_acesso_total on pessoa_papeis for all to authenticated using (true) with check (true);
create trigger trg_auditoria_pessoa_papeis
  after insert or update or delete on pessoa_papeis
  for each row execute function fn_auditoria_log();

alter table pessoa_representantes enable row level security;
create policy admin_acesso_total on pessoa_representantes for all to authenticated using (true) with check (true);
create trigger trg_auditoria_pessoa_representantes
  after insert or update or delete on pessoa_representantes
  for each row execute function fn_auditoria_log();

alter table enderecos enable row level security;
create policy admin_acesso_total on enderecos for all to authenticated using (true) with check (true);
create trigger trg_auditoria_enderecos
  after insert or update or delete on enderecos
  for each row execute function fn_auditoria_log();

alter table identidades_canal enable row level security;
create policy admin_acesso_total on identidades_canal for all to authenticated using (true) with check (true);
create trigger trg_auditoria_identidades_canal
  after insert or update or delete on identidades_canal
  for each row execute function fn_auditoria_log();

-- ============================================================================
-- Fim da migration 034.
-- ============================================================================
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260817120000_vendas_seguranca_nucleo_pessoa.sql
git commit -m "fix(seguranca): RLS + trigger de auditoria nas 6 tabelas núcleo de Pessoa/Papel"
```

---

### Task 3: Normalização e validação de CPF/CNPJ (lógica pura, TDD)

**Files:**
- Create: `src/lib/vendas/documento.ts`
- Test: `src/lib/vendas/documento.test.ts`

**Interfaces:**
- Produz: `normalizarDocumento(valor: string): string`, `validarDocumento(valor: string): boolean`, `tipoPessoaPorDocumento(valor: string): "pf" | "pj" | null`.
- Consumido pelas Tasks 6 e 7 (busca/cadastro de cliente e fornecedor).

- [ ] **Step 1: Escrever os testes (falhando)**

```ts
import { describe, expect, it } from "vitest";
import { normalizarDocumento, tipoPessoaPorDocumento, validarDocumento } from "./documento";

describe("normalizarDocumento", () => {
  it("remove pontuação e espaços, mantendo só dígitos", () => {
    expect(normalizarDocumento("123.456.789-09")).toBe("12345678909");
    expect(normalizarDocumento("12.345.678/0001-95")).toBe("12345678000195");
    expect(normalizarDocumento("  111 222 333-44 ")).toBe("11122233344");
  });
});

describe("validarDocumento", () => {
  it("aceita CPF com dígito verificador correto", () => {
    expect(validarDocumento("11144477735")).toBe(true);
  });

  it("rejeita CPF com dígito verificador incorreto", () => {
    expect(validarDocumento("11144477736")).toBe(false);
  });

  it("rejeita CPF com todos os dígitos iguais", () => {
    expect(validarDocumento("11111111111")).toBe(false);
  });

  it("aceita CNPJ com dígito verificador correto", () => {
    expect(validarDocumento("11222333000181")).toBe(true);
  });

  it("rejeita CNPJ com dígito verificador incorreto", () => {
    expect(validarDocumento("11222333000182")).toBe(false);
  });

  it("rejeita valor com tamanho diferente de 11 ou 14 dígitos", () => {
    expect(validarDocumento("123")).toBe(false);
    expect(validarDocumento("")).toBe(false);
  });

  it("aceita documento já formatado, normalizando antes de validar", () => {
    expect(validarDocumento("111.444.777-35")).toBe(true);
  });
});

describe("tipoPessoaPorDocumento", () => {
  it("retorna pf para documento de 11 dígitos válido", () => {
    expect(tipoPessoaPorDocumento("11144477735")).toBe("pf");
  });

  it("retorna pj para documento de 14 dígitos válido", () => {
    expect(tipoPessoaPorDocumento("11222333000181")).toBe("pj");
  });

  it("retorna null para documento inválido", () => {
    expect(tipoPessoaPorDocumento("123")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm run test -- src/lib/vendas/documento.test.ts`
Expected: FAIL com "Cannot find module './documento'"

- [ ] **Step 3: Implementar**

```ts
export function normalizarDocumento(valor: string): string {
  return valor.replace(/\D/g, "");
}

function calcularDigitoCpf(digitos: number[], pesoInicial: number): number {
  const soma = digitos.reduce((acc, digito, indice) => acc + digito * (pesoInicial - indice), 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function validarCpf(documento: string): boolean {
  if (documento.length !== 11 || /^(\d)\1{10}$/.test(documento)) return false;
  const digitos = documento.split("").map(Number);
  const digito1 = calcularDigitoCpf(digitos.slice(0, 9), 10);
  const digito2 = calcularDigitoCpf(digitos.slice(0, 10), 11);
  return digito1 === digitos[9] && digito2 === digitos[10];
}

function calcularDigitoCnpj(digitos: number[], pesos: number[]): number {
  const soma = digitos.reduce((acc, digito, indice) => acc + digito * pesos[indice], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function validarCnpj(documento: string): boolean {
  if (documento.length !== 14 || /^(\d)\1{13}$/.test(documento)) return false;
  const digitos = documento.split("").map(Number);
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const digito1 = calcularDigitoCnpj(digitos.slice(0, 12), pesos1);
  const digito2 = calcularDigitoCnpj(digitos.slice(0, 13), pesos2);
  return digito1 === digitos[12] && digito2 === digitos[13];
}

export function validarDocumento(valor: string): boolean {
  const documento = normalizarDocumento(valor);
  if (documento.length === 11) return validarCpf(documento);
  if (documento.length === 14) return validarCnpj(documento);
  return false;
}

export function tipoPessoaPorDocumento(valor: string): "pf" | "pj" | null {
  if (!validarDocumento(valor)) return null;
  const documento = normalizarDocumento(valor);
  return documento.length === 11 ? "pf" : "pj";
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm run test -- src/lib/vendas/documento.test.ts`
Expected: PASS (11 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/vendas/documento.ts src/lib/vendas/documento.test.ts
git commit -m "feat(vendas): normalização e validação de CPF/CNPJ"
```

---

### Task 4: Repositório de Fornecedores (CRUD)

**Files:**
- Create: `src/lib/vendas/fornecedores.ts`

**Interfaces:**
- Consome: `createClient` de `src/lib/supabase/server.ts`.
- Produz: `listarFornecedores(): Promise<FornecedorAdmin[]>`, `buscarFornecedorPorId(id: string): Promise<FornecedorAdmin | null>`, `salvarFornecedor(entrada: EntradaSalvarFornecedor): Promise<{ id: string }>`, `excluirFornecedor(id: string): Promise<void>` — consumidos pela Task 5.

- [ ] **Step 1: Implementar (sem teste unitário — CRUD passthrough, ver Global Constraints)**

```ts
import { createClient } from "@/lib/supabase/server";

export type FornecedorAdmin = {
  id: string;
  pessoaId: string;
  nome: string;
  documento: string;
  categoria: "consorcio" | "credito" | "subcontratado_servico" | "administrativo";
  ativo: boolean;
};

export async function listarFornecedores(): Promise<FornecedorAdmin[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornecedores")
    .select("id, pessoa_id, categoria, ativo, pessoas(nome_razao_social, documento)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao listar fornecedores: ${error.message}`);
  return (data ?? []).map((linha) => ({
    id: linha.id,
    pessoaId: linha.pessoa_id,
    nome: (linha.pessoas as { nome_razao_social: string; documento: string } | null)?.nome_razao_social ?? "",
    documento: (linha.pessoas as { nome_razao_social: string; documento: string } | null)?.documento ?? "",
    categoria: linha.categoria as FornecedorAdmin["categoria"],
    ativo: linha.ativo,
  }));
}

export async function buscarFornecedorPorId(id: string): Promise<FornecedorAdmin | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornecedores")
    .select("id, pessoa_id, categoria, ativo, pessoas(nome_razao_social, documento)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar fornecedor: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    pessoaId: data.pessoa_id,
    nome: (data.pessoas as { nome_razao_social: string; documento: string } | null)?.nome_razao_social ?? "",
    documento: (data.pessoas as { nome_razao_social: string; documento: string } | null)?.documento ?? "",
    categoria: data.categoria as FornecedorAdmin["categoria"],
    ativo: data.ativo,
  };
}

export type EntradaSalvarFornecedor = {
  id: string | null;
  pessoaId: string;
  categoria: FornecedorAdmin["categoria"];
  ativo: boolean;
};

export async function salvarFornecedor(entrada: EntradaSalvarFornecedor): Promise<{ id: string }> {
  const supabase = await createClient();
  const linha = { pessoa_id: entrada.pessoaId, categoria: entrada.categoria, ativo: entrada.ativo };
  if (entrada.id) {
    const { error } = await supabase.from("fornecedores").update(linha).eq("id", entrada.id);
    if (error) throw new Error(`Falha ao atualizar fornecedor: ${error.message}`);
    return { id: entrada.id };
  }
  const { data, error } = await supabase.from("fornecedores").insert(linha).select("id").single();
  if (error) throw new Error(`Falha ao criar fornecedor: ${error.message}`);
  return { id: data.id };
}

export async function excluirFornecedor(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("fornecedores").delete().eq("id", id);
  if (error) throw new Error(`Falha ao excluir fornecedor: ${error.message}`);
}
```

- [ ] **Step 2: `npm run lint` e `npm run build` verdes**

- [ ] **Step 3: Commit**

```bash
git add src/lib/vendas/fornecedores.ts
git commit -m "feat(vendas): repositório de fornecedores"
```

---

### Task 5: Repositório de Pessoa (busca/criação, reaproveitável por Fornecedor e Cliente)

**Files:**
- Create: `src/lib/vendas/pessoas.ts`

**Interfaces:**
- Consome: `normalizarDocumento`, `tipoPessoaPorDocumento`, `validarDocumento` (Task 3).
- Produz: `buscarPessoaPorDocumento(documento: string): Promise<PessoaEncontrada | null>`, `criarPessoa(entrada: EntradaCriarPessoa): Promise<{ id: string }>`, `resolverOuCriarPessoa(entrada: EntradaResolverOuCriarPessoa): Promise<ResultadoResolverPessoa>` — este último é o helper compartilhado que as Tasks 7 e 8 usam nas suas Server Actions (evita duplicar a lógica de "achou pessoa existente? usa; não achou? valida e cria" nos dois lugares).

- [ ] **Step 1: Implementar (sem teste unitário — CRUD passthrough)**

```ts
import { createClient } from "@/lib/supabase/server";
import { normalizarDocumento, tipoPessoaPorDocumento, validarDocumento } from "./documento";

export type PessoaEncontrada = {
  id: string;
  nome: string;
  documento: string;
  tipoPessoa: "pf" | "pj";
  email: string | null;
  whatsapp: string | null;
  papeis: string[];
};

export async function buscarPessoaPorDocumento(documento: string): Promise<PessoaEncontrada | null> {
  const documentoNormalizado = normalizarDocumento(documento);
  const supabase = await createClient();
  const { data: pessoa, error } = await supabase
    .from("pessoas")
    .select("id, nome_razao_social, documento, tipo_pessoa, email, whatsapp")
    .eq("documento", documentoNormalizado)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar pessoa: ${error.message}`);
  if (!pessoa) return null;

  const { data: papeis, error: erroPapeis } = await supabase
    .from("pessoa_papeis")
    .select("tipo_papel")
    .eq("pessoa_id", pessoa.id)
    .eq("status", "ativo");
  if (erroPapeis) throw new Error(`Falha ao buscar papéis da pessoa: ${erroPapeis.message}`);

  return {
    id: pessoa.id,
    nome: pessoa.nome_razao_social,
    documento: pessoa.documento,
    tipoPessoa: pessoa.tipo_pessoa as "pf" | "pj",
    email: pessoa.email,
    whatsapp: pessoa.whatsapp,
    papeis: (papeis ?? []).map((linha) => linha.tipo_papel),
  };
}

export type EntradaCriarPessoa = {
  nome: string;
  documento: string;
  email: string | null;
  whatsapp: string | null;
};

export async function criarPessoa(entrada: EntradaCriarPessoa): Promise<{ id: string }> {
  const documentoNormalizado = normalizarDocumento(entrada.documento);
  const tipoPessoa = tipoPessoaPorDocumento(documentoNormalizado);
  if (!tipoPessoa) throw new Error("Documento inválido — não é um CPF nem CNPJ válido.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pessoas")
    .insert({
      tipo_pessoa: tipoPessoa,
      nome_razao_social: entrada.nome,
      documento: documentoNormalizado,
      email: entrada.email,
      whatsapp: entrada.whatsapp,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar pessoa: ${error.message}`);
  return { id: data.id };
}

export type EntradaResolverOuCriarPessoa = {
  pessoaId: string | null;
  pessoaNova: { nome: string; documento: string } | null;
};

export type ResultadoResolverPessoa = { sucesso: true; pessoaId: string } | { sucesso: false; erro: string };

export async function resolverOuCriarPessoa(entrada: EntradaResolverOuCriarPessoa): Promise<ResultadoResolverPessoa> {
  if (entrada.pessoaId) {
    return { sucesso: true, pessoaId: entrada.pessoaId };
  }

  if (!entrada.pessoaNova) {
    return { sucesso: false, erro: "Selecione ou cadastre uma Pessoa." };
  }

  if (!validarDocumento(entrada.pessoaNova.documento)) {
    return { sucesso: false, erro: "CPF/CNPJ inválido." };
  }
  if (!entrada.pessoaNova.nome.trim()) {
    return { sucesso: false, erro: "Nome é obrigatório." };
  }

  const pessoaExistente = await buscarPessoaPorDocumento(entrada.pessoaNova.documento);
  if (pessoaExistente) {
    return { sucesso: true, pessoaId: pessoaExistente.id };
  }

  const nova = await criarPessoa({
    nome: entrada.pessoaNova.nome,
    documento: entrada.pessoaNova.documento,
    email: null,
    whatsapp: null,
  });
  return { sucesso: true, pessoaId: nova.id };
}
```

- [ ] **Step 2: `npm run lint` e `npm run build` verdes**

- [ ] **Step 3: Commit**

```bash
git add src/lib/vendas/pessoas.ts
git commit -m "feat(vendas): repositório de busca/criação de Pessoa por documento"
```

---

### Task 6: Repositório de Cliente (promoção de papel) e de Venda sem funil prévio

**Files:**
- Create: `src/lib/vendas/clientes.ts`

**Interfaces:**
- Consome: `EntradaCriarPessoa`/`criarPessoa` (Task 5).
- Produz: `promoverPessoaACliente(pessoaId: string, unidadeNegocioId: string): Promise<void>`, `criarOportunidadeSemFunilPrevio(entrada: EntradaOportunidadeSemFunil): Promise<{ oportunidadeId: string }>` — consumidos pela Task 8 (tela de Vendas).

- [ ] **Step 1: Implementar (sem teste unitário — CRUD passthrough)**

```ts
import { createClient } from "@/lib/supabase/server";

export async function promoverPessoaACliente(pessoaId: string, unidadeNegocioId: string): Promise<void> {
  const supabase = await createClient();
  const { data: papelExistente, error: erroBusca } = await supabase
    .from("pessoa_papeis")
    .select("id")
    .eq("pessoa_id", pessoaId)
    .eq("unidade_negocio_id", unidadeNegocioId)
    .eq("tipo_papel", "cliente")
    .eq("status", "ativo")
    .maybeSingle();
  if (erroBusca) throw new Error(`Falha ao checar papel de cliente: ${erroBusca.message}`);
  if (papelExistente) return;

  const { error } = await supabase
    .from("pessoa_papeis")
    .insert({ pessoa_id: pessoaId, unidade_negocio_id: unidadeNegocioId, tipo_papel: "cliente" });
  if (error) throw new Error(`Falha ao promover pessoa a cliente: ${error.message}`);
}

export type EntradaOportunidadeSemFunil = {
  pessoaId: string;
  produtoId: string;
  valorEstimado: number | null;
};

export async function criarOportunidadeSemFunilPrevio(
  entrada: EntradaOportunidadeSemFunil,
): Promise<{ oportunidadeId: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("oportunidades")
    .insert({
      pessoa_id: entrada.pessoaId,
      produto_id: entrada.produtoId,
      etapa_kanban: "dados_contrato",
      valor_estimado: entrada.valorEstimado,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar oportunidade: ${error.message}`);
  return { oportunidadeId: data.id };
}
```

- [ ] **Step 2: `npm run lint` e `npm run build` verdes**

- [ ] **Step 3: Commit**

```bash
git add src/lib/vendas/clientes.ts
git commit -m "feat(vendas): promoção de Pessoa a Cliente e criação de Oportunidade sem funil prévio"
```

---

### Task 7: Tela `/admin/fornecedores` (CRUD)

**Files:**
- Create: `src/app/admin/(shell)/fornecedores/page.tsx`
- Create: `src/app/admin/(shell)/fornecedores/actions.ts`
- Create: `src/app/admin/(shell)/fornecedores/fornecedores-client.tsx`

**Interfaces:**
- Consome: `listarFornecedores`, `salvarFornecedor`, `excluirFornecedor` (Task 4), `buscarPessoaPorDocumento`, `resolverOuCriarPessoa` (Task 5).

- [ ] **Step 1: `page.tsx` — Server Component**

```tsx
import { listarFornecedores } from "@/lib/vendas/fornecedores";
import { FornecedoresClient } from "./fornecedores-client";

export default async function FornecedoresPage() {
  const fornecedores = await listarFornecedores();
  return <FornecedoresClient fornecedoresIniciais={fornecedores} />;
}
```

- [ ] **Step 2: `actions.ts` — Server Actions finas**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { buscarPessoaPorDocumento, resolverOuCriarPessoa } from "@/lib/vendas/pessoas";
import {
  excluirFornecedor as excluirFornecedorRepo,
  salvarFornecedor as salvarFornecedorRepo,
  type EntradaSalvarFornecedor,
} from "@/lib/vendas/fornecedores";

export type ResultadoBuscarPessoa =
  | { encontrada: true; id: string; nome: string; documento: string }
  | { encontrada: false };

export async function buscarPessoaPorDocumentoAction(documento: string): Promise<ResultadoBuscarPessoa> {
  const pessoa = await buscarPessoaPorDocumento(documento);
  if (!pessoa) return { encontrada: false };
  return { encontrada: true, id: pessoa.id, nome: pessoa.nome, documento: pessoa.documento };
}

export type ResultadoSalvarFornecedor = { sucesso: true; id: string } | { sucesso: false; erro: string };

export async function salvarFornecedorAction(
  entrada: EntradaSalvarFornecedor & { pessoaNova: { nome: string; documento: string } | null },
): Promise<ResultadoSalvarFornecedor> {
  const pessoa = await resolverOuCriarPessoa({ pessoaId: entrada.pessoaId || null, pessoaNova: entrada.pessoaNova });
  if (!pessoa.sucesso) {
    return { sucesso: false, erro: pessoa.erro };
  }

  const resultado = await salvarFornecedorRepo({ ...entrada, pessoaId: pessoa.pessoaId });
  revalidatePath("/admin/fornecedores");
  return { sucesso: true, id: resultado.id };
}

export type ResultadoExcluirFornecedor = { sucesso: true } | { sucesso: false; erro: string };

export async function excluirFornecedorAction(id: string): Promise<ResultadoExcluirFornecedor> {
  await excluirFornecedorRepo(id);
  revalidatePath("/admin/fornecedores");
  return { sucesso: true };
}
```

- [ ] **Step 3: `fornecedores-client.tsx` — Client Component**

```tsx
"use client";

import { useState } from "react";
import type { FornecedorAdmin } from "@/lib/vendas/fornecedores";
import {
  buscarPessoaPorDocumentoAction,
  excluirFornecedorAction,
  salvarFornecedorAction,
} from "./actions";

const CATEGORIAS = [
  { valor: "consorcio", rotulo: "Consórcio" },
  { valor: "credito", rotulo: "Crédito" },
  { valor: "subcontratado_servico", rotulo: "Subcontratado de serviço" },
  { valor: "administrativo", rotulo: "Administrativo" },
] as const;

export function FornecedoresClient({ fornecedoresIniciais }: { fornecedoresIniciais: FornecedorAdmin[] }) {
  const [fornecedores, setFornecedores] = useState(fornecedoresIniciais);
  const [formAberto, setFormAberto] = useState(false);
  const [documentoBusca, setDocumentoBusca] = useState("");
  const [pessoaSelecionada, setPessoaSelecionada] = useState<{ id: string; nome: string; documento: string } | null>(null);
  const [nomeNovaPessoa, setNomeNovaPessoa] = useState("");
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS)[number]["valor"]>("consorcio");
  const [erro, setErro] = useState<string | null>(null);

  async function buscarPessoa() {
    const resultado = await buscarPessoaPorDocumentoAction(documentoBusca);
    if (resultado.encontrada) {
      setPessoaSelecionada({ id: resultado.id, nome: resultado.nome, documento: resultado.documento });
    } else {
      setPessoaSelecionada(null);
    }
  }

  async function salvar() {
    setErro(null);
    const resultado = await salvarFornecedorAction({
      id: null,
      pessoaId: pessoaSelecionada?.id ?? "",
      categoria,
      ativo: true,
      pessoaNova: pessoaSelecionada ? null : { nome: nomeNovaPessoa, documento: documentoBusca },
    });
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    setFormAberto(false);
    setDocumentoBusca("");
    setPessoaSelecionada(null);
    setNomeNovaPessoa("");
    window.location.reload();
  }

  async function excluir(id: string) {
    await excluirFornecedorAction(id);
    setFornecedores((atual) => atual.filter((f) => f.id !== id));
  }

  return (
    <div>
      <h1>Fornecedores</h1>
      <button onClick={() => setFormAberto(true)}>Novo fornecedor</button>

      {formAberto && (
        <div>
          <input
            placeholder="CPF ou CNPJ"
            value={documentoBusca}
            onChange={(e) => setDocumentoBusca(e.target.value)}
            onBlur={buscarPessoa}
          />
          {pessoaSelecionada ? (
            <p>Pessoa encontrada: {pessoaSelecionada.nome}</p>
          ) : (
            <input
              placeholder="Nome (pessoa nova)"
              value={nomeNovaPessoa}
              onChange={(e) => setNomeNovaPessoa(e.target.value)}
            />
          )}
          <select value={categoria} onChange={(e) => setCategoria(e.target.value as typeof categoria)}>
            {CATEGORIAS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.rotulo}
              </option>
            ))}
          </select>
          {erro && <p style={{ color: "red" }}>{erro}</p>}
          <button onClick={salvar}>Salvar</button>
          <button onClick={() => setFormAberto(false)}>Cancelar</button>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Documento</th>
            <th>Categoria</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {fornecedores.map((f) => (
            <tr key={f.id}>
              <td>{f.nome}</td>
              <td>{f.documento}</td>
              <td>{CATEGORIAS.find((c) => c.valor === f.categoria)?.rotulo}</td>
              <td>
                <button onClick={() => excluir(f.id)}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: `npm run lint` e `npm run build` verdes**

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/\(shell\)/fornecedores/
git commit -m "feat(vendas): tela /admin/fornecedores (cadastro + busca de pessoa)"
```

---

### Task 8: Tela `/admin/vendas/nova` — criar venda sem funil prévio

**Files:**
- Create: `src/app/admin/(shell)/vendas/nova/page.tsx`
- Create: `src/app/admin/(shell)/vendas/nova/actions.ts`
- Create: `src/app/admin/(shell)/vendas/nova/nova-venda-client.tsx`

**Interfaces:**
- Consome: `buscarPessoaPorDocumento`, `resolverOuCriarPessoa` (Task 5), `criarOportunidadeSemFunilPrevio` (Task 6), `listarProdutos` (já existe em `src/lib/motor-fluxo/repositorio-admin.ts`, mesma função usada por `/admin/faqs`).
- **Antes de escrever `page.tsx`:** abrir `src/lib/motor-fluxo/repositorio-admin.ts` e conferir a assinatura real de `listarProdutos()` (tipo de retorno exato — o campo pode não se chamar `nome`, e pode ter mais campos que `id`/`nome`). O `type Produto = { id: string; nome: string }` abaixo é um palpite baseado no padrão de outras funções do arquivo, não uma cópia confirmada — ajustar pra bater com a assinatura real antes de usar.

- [ ] **Step 1: `page.tsx` — Server Component**

```tsx
import { listarProdutos } from "@/lib/motor-fluxo/repositorio-admin";
import { NovaVendaClient } from "./nova-venda-client";

export default async function NovaVendaPage() {
  const produtos = await listarProdutos();
  return <NovaVendaClient produtos={produtos} />;
}
```

- [ ] **Step 2: `actions.ts` — Server Actions finas**

```ts
"use server";

import { buscarPessoaPorDocumento, resolverOuCriarPessoa } from "@/lib/vendas/pessoas";
import { criarOportunidadeSemFunilPrevio } from "@/lib/vendas/clientes";

export type ResultadoBuscarPessoa =
  | { encontrada: true; id: string; nome: string; documento: string }
  | { encontrada: false };

export async function buscarPessoaPorDocumentoAction(documento: string): Promise<ResultadoBuscarPessoa> {
  const pessoa = await buscarPessoaPorDocumento(documento);
  if (!pessoa) return { encontrada: false };
  return { encontrada: true, id: pessoa.id, nome: pessoa.nome, documento: pessoa.documento };
}

export type EntradaCriarVenda = {
  pessoaId: string | null;
  pessoaNova: { nome: string; documento: string } | null;
  produtoId: string;
  valorEstimado: number | null;
};

export type ResultadoCriarVenda = { sucesso: true; oportunidadeId: string } | { sucesso: false; erro: string };

export async function criarVendaSemFunilPrevioAction(entrada: EntradaCriarVenda): Promise<ResultadoCriarVenda> {
  const pessoa = await resolverOuCriarPessoa({ pessoaId: entrada.pessoaId, pessoaNova: entrada.pessoaNova });
  if (!pessoa.sucesso) {
    return { sucesso: false, erro: pessoa.erro };
  }
  if (!entrada.produtoId) {
    return { sucesso: false, erro: "Selecione um Serviço." };
  }

  const resultado = await criarOportunidadeSemFunilPrevio({
    pessoaId: pessoa.pessoaId,
    produtoId: entrada.produtoId,
    valorEstimado: entrada.valorEstimado,
  });
  return { sucesso: true, oportunidadeId: resultado.oportunidadeId };
}
```

- [ ] **Step 3: `nova-venda-client.tsx` — Client Component**

```tsx
"use client";

import { useState } from "react";
import { buscarPessoaPorDocumentoAction, criarVendaSemFunilPrevioAction } from "./actions";

type Produto = { id: string; nome: string };

export function NovaVendaClient({ produtos }: { produtos: Produto[] }) {
  const [documento, setDocumento] = useState("");
  const [pessoaEncontrada, setPessoaEncontrada] = useState<{ id: string; nome: string } | null>(null);
  const [buscou, setBuscou] = useState(false);
  const [nomeNovaPessoa, setNomeNovaPessoa] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [valorEstimado, setValorEstimado] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [oportunidadeCriadaId, setOportunidadeCriadaId] = useState<string | null>(null);

  async function buscarPessoa() {
    const resultado = await buscarPessoaPorDocumentoAction(documento);
    setBuscou(true);
    setPessoaEncontrada(resultado.encontrada ? { id: resultado.id, nome: resultado.nome } : null);
  }

  async function criarVenda() {
    setErro(null);
    const resultado = await criarVendaSemFunilPrevioAction({
      pessoaId: pessoaEncontrada?.id ?? null,
      pessoaNova: pessoaEncontrada ? null : { nome: nomeNovaPessoa, documento },
      produtoId,
      valorEstimado: valorEstimado ? Number(valorEstimado) : null,
    });
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    setOportunidadeCriadaId(resultado.oportunidadeId);
  }

  if (oportunidadeCriadaId) {
    return <p>Venda criada — Oportunidade {oportunidadeCriadaId} já está na etapa &quot;Dados para Contrato&quot;.</p>;
  }

  return (
    <div>
      <h1>Nova venda (sem funil prévio)</h1>

      <input
        placeholder="CPF ou CNPJ do cliente"
        value={documento}
        onChange={(e) => {
          setDocumento(e.target.value);
          setBuscou(false);
        }}
        onBlur={buscarPessoa}
      />
      {buscou && pessoaEncontrada && <p>Cliente encontrado: {pessoaEncontrada.nome}</p>}
      {buscou && !pessoaEncontrada && (
        <input
          placeholder="Nome (cliente novo)"
          value={nomeNovaPessoa}
          onChange={(e) => setNomeNovaPessoa(e.target.value)}
        />
      )}

      <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
        <option value="">Selecione o Serviço</option>
        {produtos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </select>

      <input
        placeholder="Valor estimado (R$)"
        type="number"
        value={valorEstimado}
        onChange={(e) => setValorEstimado(e.target.value)}
      />

      {erro && <p style={{ color: "red" }}>{erro}</p>}
      <button onClick={criarVenda}>Criar venda</button>
    </div>
  );
}
```

- [ ] **Step 4: `npm run lint` e `npm run build` verdes**

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/\(shell\)/vendas/
git commit -m "feat(vendas): tela /admin/vendas/nova (venda sem funil prévio)"
```

---

### Task 9: Item de navegação "Vendas" no sidebar do admin

**Files:**
- Modify: `src/app/admin/(shell)/sidebar.tsx`

**Interfaces:**
- Nenhuma nova — só adiciona rotas ao menu existente.

- [ ] **Step 1: Adicionar grupo/itens de Vendas**

Abrir `src/app/admin/(shell)/sidebar.tsx`, localizar `GRUPO_CRM`/`GRUPO_GERAL` e adicionar, seguindo o mesmo padrão (`type ItemMenu = { rotulo: string; href: string } | { rotulo: string; emBreve: true }`):

```tsx
const GRUPO_VENDAS: ItemMenu[] = [
  { rotulo: "Nova venda", href: "/admin/vendas/nova" },
  { rotulo: "Fornecedores", href: "/admin/fornecedores" },
];
```

Renderizar `GRUPO_VENDAS` numa seção própria "Vendas" no menu, ao lado de "CRM"/"Geral" — seguir exatamente o mesmo padrão JSX já usado para renderizar `GRUPO_CRM`/`GRUPO_GERAL` (copiar a estrutura, trocar só o título da seção e o array).

- [ ] **Step 2: Verificar visualmente no navegador**

Rodar `npm run dev`, abrir `/admin`, confirmar que "Vendas" aparece no menu com "Nova venda" e "Fornecedores" clicáveis.

- [ ] **Step 3: `npm run lint` e `npm run build` verdes**

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/\(shell\)/sidebar.tsx
git commit -m "feat(vendas): item de navegação Vendas no sidebar do admin"
```

---

### Task 10: Verificação manual de ponta a ponta (Fornecedor + Cliente + Venda sem funil prévio)

**Files:** nenhum arquivo novo — só verificação.

- [ ] **Step 1: Rodar as duas migrations no Supabase**

Luiz roda `20260817110000_vendas_cadastro_nucleo.sql` e depois `20260817120000_vendas_seguranca_nucleo_pessoa.sql` (nessa ordem) no SQL Editor do Supabase.

- [ ] **Step 2: Testar `/admin/fornecedores` no navegador**

Com `npm run dev` rodando: criar um fornecedor com CPF/CNPJ novo (confirma criação de Pessoa), criar outro reaproveitando um documento já existente (confirma dedup — não deve duplicar `pessoas`), excluir um.

- [ ] **Step 3: Testar `/admin/vendas/nova` no navegador**

Criar uma venda com cliente novo (confirma criação de Pessoa) e outra reaproveitando um documento já existente (confirma dedup). Em ambos os casos, confirmar no Supabase que a `oportunidade` criada tem `etapa_kanban = 'dados_contrato'` direto, sem ter passado por `novo_lead_triagem`/`qualificacao`/etc.

- [ ] **Step 4: Testar `promoverPessoaACliente` (sem tela própria ainda — função pronta pra sub-frente Financeiro usar)**

Não tem UI nesta sub-frente (a promoção real só é acionada pelo evento "1ª parcela confirmada", que é da sub-frente Financeiro). Verificar mesmo assim que a função funciona: criar um arquivo temporário `scripts/testar-promover-cliente.ts` que importa `promoverPessoaACliente` de `src/lib/vendas/clientes.ts` e chama com o `pessoaId`/`unidadeNegocioId` de uma das pessoas criadas no Step 3, rodar com `npx tsx scripts/testar-promover-cliente.ts`, confirmar no Supabase que `pessoa_papeis` ganhou uma linha `tipo_papel = 'cliente'`, chamar de novo e confirmar que não duplica (idempotente). Apagar o arquivo temporário depois (`rm scripts/testar-promover-cliente.ts`) — não faz parte do código do projeto.

- [ ] **Step 5: Atualizar a seção 11 do plano mestre**

Registrar em `docs/PLANO_MESTRE_SISTEMA_ARRUDACRED.md` seção 11 que a sub-frente Cadastro do módulo Vendas está construída e testada, com a data e um resumo curto — mesmo padrão já usado pras demais entregas.

- [ ] **Step 6: Commit**

```bash
git add docs/PLANO_MESTRE_SISTEMA_ARRUDACRED.md
git commit -m "docs: registra sub-frente Cadastro do módulo Vendas como construída"
```
