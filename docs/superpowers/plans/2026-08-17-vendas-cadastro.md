# Vendas — Cadastro (Fornecedor, Cliente, Venda sem funil prévio) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a primeira sub-frente do módulo Vendas — cadastro de Fornecedor (com regra de comissão configurável) e Cliente (busca/criação, endereço, documentos, foto, leitura por IA), e criação de Oportunidade "sem funil prévio" — deixando a base pronta para as sub-frentes seguintes (Contrato, Assinatura, Financeiro).

**Architecture:** Módulo novo `src/lib/vendas/` (não `src/lib/motor-fluxo/`, que é território do Comercial/atendimento) — arquivos pequenos por responsabilidade. Componentes de UI compartilhados entre as telas de Fornecedor e Cliente em `src/components/vendas/` (leitor de documento por IA, campo de endereço com CEP, upload de documentos, upload de foto) — evita duplicar a mesma UI nas duas telas. Telas em `src/app/admin/(shell)/fornecedores/` e `src/app/admin/(shell)/vendas/`, mesma estrutura `page.tsx` + `actions.ts` + `*-client.tsx` já usada em `/admin/faqs`.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Auth + Storage), TypeScript, Vitest, `@anthropic-ai/sdk` (já em uso no projeto), ViaCEP (API pública, sem SDK).

**Spec:** `docs/superpowers/specs/2026-08-17-modulo-vendas-design.md`

## Global Constraints

- Nomenclatura de `MODELAGEM_DADOS_ARRUDACRED.md`: snake_case, tabela plural, PK sempre `id uuid default gen_random_uuid()`, FK `<tabela_singular>_id`.
- `COMMENT ON TABLE`/`COMMENT ON COLUMN` obrigatório em toda tabela/coluna nova.
- RLS obrigatório em toda tabela nova, texto exato: `alter table X enable row level security; create policy admin_acesso_total on X for all to authenticated using (true) with check (true);`
- Trigger de auditoria obrigatório em toda tabela nova, texto exato: `create trigger trg_auditoria_<tabela> after insert or update or delete on <tabela> for each row execute function fn_auditoria_log();` (nome da função é `fn_auditoria_log`, não `fn_auditoria`).
- Migrations **não são aplicadas por quem executa este plano** — Luiz roda cada uma manualmente no SQL Editor do Supabase, na ordem, depois de revisar.
- Toda tela admin usa `createClient()` de `src/lib/supabase/server.ts` (autenticado via cookie) — **nunca** `createAdminClient()`.
- Convenção de teste deste projeto: **CRUD/I-O passthrough (banco, Storage, API externa) não tem teste unitário** — verificado manualmente no navegador. **Lógica pura (cálculo, validação, normalização, máscara) ganha teste Vitest de verdade**, seguindo o padrão de `motor-followup.test.ts`.
- `npm run lint` e `npm run build` verdes antes de cada commit.
- **Convenções de cadastro de Pessoa (decidido com Luiz, 17/08/2026 — spec seção 3.1.1), valem em toda tela desta frente:**
  - Texto sempre em caixa alta ao salvar, exceto `email`. Não aplica a `documento`, `whatsapp` (só dígitos) nem a colunas que são código fixo de `check` constraint (ex.: `categoria`).
  - Máscaras de input: CPF/CNPJ, CEP, telefone — visuais, o dado salvo continua normalizado.
  - Endereço sempre CEP-primeiro, autopreenchido via ViaCEP, campos continuam editáveis. UF é select fechado.
  - Upload de documento sempre exige escolher o tipo.
  - Leitura de documento por IA só pré-preenche formulário — nunca salva sozinha.
  - Foto da pessoa é opcional.
- Próxima migration é a **033** (`supabase/migrations/`, timestamp `> 20260817100000`); migrations desta frente vão até a 035.

---

### Task 1: Migration — núcleo de cadastro Vendas (produtos, fornecedores, fornecedor_produtos)

**Status: ✅ já implementada e revisada (commit 1af0e00) — mantida aqui só por referência, não redespachar.**

**Files:**
- Create: `supabase/migrations/20260817110000_vendas_cadastro_nucleo.sql`

Conteúdo já commitado — ver o arquivo real no repositório para o texto completo.

---

### Task 2: Migration — RLS + auditoria nas 6 tabelas núcleo ainda descobertas

**Status: ✅ já implementada e revisada (commit bffdd07) — mantida aqui só por referência, não redespachar.**

**Files:**
- Create: `supabase/migrations/20260817120000_vendas_seguranca_nucleo_pessoa.sql`

Conteúdo já commitado — ver o arquivo real no repositório para o texto completo.

---

### Task 3: Normalização e validação de CPF/CNPJ (lógica pura, TDD)

**Status: ✅ já implementada e revisada (commit 984e2b2) — mantida aqui só por referência, não redespachar.**

**Files:**
- Create: `src/lib/vendas/documento.ts`
- Test: `src/lib/vendas/documento.test.ts`

Produz: `normalizarDocumento`, `validarDocumento`, `tipoPessoaPorDocumento`. Conteúdo já commitado.

---

### Task 4: Repositório de Fornecedores (CRUD)

**Status: ✅ já implementada e revisada (commit c81c070) — mantida aqui só por referência, não redespachar.**

**Files:**
- Create: `src/lib/vendas/fornecedores.ts`

Produz: `FornecedorAdmin`, `listarFornecedores`, `buscarFornecedorPorId`, `EntradaSalvarFornecedor`, `salvarFornecedor`, `excluirFornecedor`. Conteúdo já commitado.

---

### Task 5: Repositório de Pessoa (busca/criação, reaproveitável por Fornecedor e Cliente)

**Status: ✅ já implementada e revisada (commit aecc872) — mantida aqui só por referência, não redespachar. Recebe uma correção pontual na Task 7 abaixo (caixa alta).**

**Files:**
- Create: `src/lib/vendas/pessoas.ts`

Produz: `PessoaEncontrada`, `buscarPessoaPorDocumento`, `EntradaCriarPessoa`, `criarPessoa`, `EntradaResolverOuCriarPessoa`, `ResultadoResolverPessoa`, `resolverOuCriarPessoa`. Conteúdo já commitado.

---

### Task 6: Máscaras e normalização de texto (lógica pura, TDD)

**Files:**
- Create: `src/lib/vendas/mascaras.ts`
- Test: `src/lib/vendas/mascaras.test.ts`

**Interfaces:**
- Produz: `paraCaixaAlta(texto: string): string`, `normalizarCep(valor: string): string`, `validarCep(valor: string): boolean`, `formatarCep(valor: string): string`, `formatarCpfCnpj(valor: string): string`, `formatarTelefone(valor: string): string`.
- Consumido pela Task 7 (fix), Task 8 (endereço), e pelas telas (Tasks 16/17).

- [ ] **Step 1: Escrever os testes (falhando)**

```ts
import { describe, expect, it } from "vitest";
import {
  formatarCep,
  formatarCpfCnpj,
  formatarTelefone,
  normalizarCep,
  paraCaixaAlta,
  validarCep,
} from "./mascaras";

describe("paraCaixaAlta", () => {
  it("converte texto para caixa alta", () => {
    expect(paraCaixaAlta("joão da silva")).toBe("JOÃO DA SILVA");
  });
});

describe("normalizarCep", () => {
  it("remove tudo que não é dígito", () => {
    expect(normalizarCep("01310-100")).toBe("01310100");
    expect(normalizarCep("01310100")).toBe("01310100");
  });
});

describe("validarCep", () => {
  it("aceita CEP com 8 dígitos", () => {
    expect(validarCep("01310-100")).toBe(true);
  });

  it("rejeita CEP com menos de 8 dígitos", () => {
    expect(validarCep("0131")).toBe(false);
  });
});

describe("formatarCep", () => {
  it("formata como 00000-000 quando completo", () => {
    expect(formatarCep("01310100")).toBe("01310-100");
  });

  it("não quebra com menos de 6 dígitos (sem hífen ainda)", () => {
    expect(formatarCep("0131")).toBe("0131");
  });
});

describe("formatarCpfCnpj", () => {
  it("formata 11 dígitos como CPF (000.000.000-00)", () => {
    expect(formatarCpfCnpj("12345678909")).toBe("123.456.789-09");
  });

  it("formata 14 dígitos como CNPJ (00.000.000/0000-00)", () => {
    expect(formatarCpfCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("ignora caracteres não numéricos na entrada", () => {
    expect(formatarCpfCnpj("123.456.789-09")).toBe("123.456.789-09");
  });
});

describe("formatarTelefone", () => {
  it("formata 10 dígitos como telefone fixo ((00) 0000-0000)", () => {
    expect(formatarTelefone("1131001000")).toBe("(11) 3100-1000");
  });

  it("formata 11 dígitos como celular ((00) 00000-0000)", () => {
    expect(formatarTelefone("11987654321")).toBe("(11) 98765-4321");
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm run test -- src/lib/vendas/mascaras.test.ts`
Expected: FAIL com "Cannot find module './mascaras'"

- [ ] **Step 3: Implementar**

```ts
export function paraCaixaAlta(texto: string): string {
  return texto.toUpperCase();
}

export function normalizarCep(valor: string): string {
  return valor.replace(/\D/g, "");
}

export function validarCep(valor: string): boolean {
  return normalizarCep(valor).length === 8;
}

export function formatarCep(valor: string): string {
  const digitos = normalizarCep(valor).slice(0, 8);
  if (digitos.length <= 5) return digitos;
  return `${digitos.slice(0, 5)}-${digitos.slice(5)}`;
}

export function formatarCpfCnpj(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length <= 11) {
    return digitos
      .slice(0, 11)
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return digitos
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export function formatarTelefone(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 11);
  if (digitos.length <= 10) {
    return digitos.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return digitos.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm run test -- src/lib/vendas/mascaras.test.ts`
Expected: PASS (10 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/vendas/mascaras.ts src/lib/vendas/mascaras.test.ts
git commit -m "feat(vendas): máscaras de CPF/CNPJ/CEP/telefone e normalização de caixa alta"
```

---

### Task 7: Corrigir Task 5 — nome sempre salvo em caixa alta

**Files:**
- Modify: `src/lib/vendas/pessoas.ts`

**Interfaces:**
- Consome: `paraCaixaAlta` (Task 6).

- [ ] **Step 1: Aplicar `paraCaixaAlta` ao nome em `criarPessoa`**

Abrir `src/lib/vendas/pessoas.ts`. Trocar a linha de import:

```ts
import { normalizarDocumento, tipoPessoaPorDocumento, validarDocumento } from "./documento";
```

por:

```ts
import { normalizarDocumento, tipoPessoaPorDocumento, validarDocumento } from "./documento";
import { paraCaixaAlta } from "./mascaras";
```

E dentro de `criarPessoa`, trocar:

```ts
      nome_razao_social: entrada.nome,
```

por:

```ts
      nome_razao_social: paraCaixaAlta(entrada.nome),
```

Não mexer em mais nada da função — `email` fica como está (exceção explícita à regra de caixa alta), `documento`/`whatsapp` também (não são texto livre).

- [ ] **Step 2: `npm run lint` e `npm run build` verdes**

- [ ] **Step 3: Commit**

```bash
git add src/lib/vendas/pessoas.ts
git commit -m "fix(vendas): nome da pessoa sempre salvo em caixa alta"
```

---

### Task 8: Repositório de Endereço (ViaCEP + CRUD)

**Files:**
- Create: `src/lib/vendas/endereco.ts`

**Interfaces:**
- Consome: `normalizarCep`, `paraCaixaAlta` (Task 6).
- Produz: `EnderecoViaCep`, `buscarEnderecoPorCep(cep: string): Promise<EnderecoViaCep | null>`, `EntradaSalvarEndereco`, `salvarEndereco(entrada): Promise<{ id: string }>`, `EnderecoPessoa`, `buscarEnderecoPorPessoa(pessoaId, tipo?): Promise<EnderecoPessoa | null>` — consumidos pelo componente `CampoEndereco` (Task 13) e pelas telas (Tasks 16/17).

- [ ] **Step 1: Implementar (sem teste unitário — I/O externo/banco, ver Global Constraints)**

```ts
import { createClient } from "@/lib/supabase/server";
import { normalizarCep, paraCaixaAlta } from "./mascaras";

export type EnderecoViaCep = {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export async function buscarEnderecoPorCep(cep: string): Promise<EnderecoViaCep | null> {
  const cepNormalizado = normalizarCep(cep);
  if (cepNormalizado.length !== 8) return null;

  const resposta = await fetch(`https://viacep.com.br/ws/${cepNormalizado}/json/`);
  if (!resposta.ok) return null;

  const dados = (await resposta.json()) as {
    erro?: boolean;
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
  };
  if (dados.erro) return null;

  return {
    logradouro: paraCaixaAlta(dados.logradouro ?? ""),
    bairro: paraCaixaAlta(dados.bairro ?? ""),
    cidade: paraCaixaAlta(dados.localidade ?? ""),
    uf: dados.uf ?? "",
  };
}

export type TipoEndereco = "residencial" | "comercial" | "cobranca";

export type EntradaSalvarEndereco = {
  pessoaId: string;
  tipo: TipoEndereco;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
};

export async function salvarEndereco(entrada: EntradaSalvarEndereco): Promise<{ id: string }> {
  const supabase = await createClient();
  const linha = {
    pessoa_id: entrada.pessoaId,
    tipo: entrada.tipo,
    cep: normalizarCep(entrada.cep),
    logradouro: paraCaixaAlta(entrada.logradouro),
    numero: entrada.numero,
    complemento: entrada.complemento ? paraCaixaAlta(entrada.complemento) : null,
    bairro: paraCaixaAlta(entrada.bairro),
    cidade: paraCaixaAlta(entrada.cidade),
    uf: entrada.uf,
  };

  const { data: existente, error: erroBusca } = await supabase
    .from("enderecos")
    .select("id")
    .eq("pessoa_id", entrada.pessoaId)
    .eq("tipo", entrada.tipo)
    .maybeSingle();
  if (erroBusca) throw new Error(`Falha ao checar endereço existente: ${erroBusca.message}`);

  if (existente) {
    const { error } = await supabase.from("enderecos").update(linha).eq("id", existente.id);
    if (error) throw new Error(`Falha ao atualizar endereço: ${error.message}`);
    return { id: existente.id };
  }

  const { data, error } = await supabase.from("enderecos").insert(linha).select("id").single();
  if (error) throw new Error(`Falha ao criar endereço: ${error.message}`);
  return { id: data.id };
}

export type EnderecoPessoa = {
  id: string;
  tipo: TipoEndereco;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
};

export async function buscarEnderecoPorPessoa(
  pessoaId: string,
  tipo: TipoEndereco = "residencial",
): Promise<EnderecoPessoa | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enderecos")
    .select("id, tipo, cep, logradouro, numero, complemento, bairro, cidade, uf")
    .eq("pessoa_id", pessoaId)
    .eq("tipo", tipo)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar endereço: ${error.message}`);
  return data as EnderecoPessoa | null;
}
```

- [ ] **Step 2: `npm run lint` e `npm run build` verdes**

- [ ] **Step 3: Commit**

```bash
git add src/lib/vendas/endereco.ts
git commit -m "feat(vendas): busca de CEP (ViaCEP) e CRUD de endereço"
```

---

### Task 9: Migration — pessoa_documentos + buckets de Storage

**Files:**
- Create: `supabase/migrations/20260817130000_vendas_pessoa_documentos.sql`

**Interfaces:**
- Produz: tabela `pessoa_documentos`; buckets de Storage `pessoa-documentos` (privado) e `pessoa-fotos` (público).

- [ ] **Step 1: Escrever a migration completa**

```sql
-- ============================================================================
-- MIGRATION 035 — Vendas: pessoa_documentos + buckets de Storage
-- Sistema de Gestão ArrudaCred
-- Spec: docs/superpowers/specs/2026-08-17-modulo-vendas-design.md, seção 3.1.2
-- ============================================================================

create table pessoa_documentos (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references pessoas(id) on delete cascade,
  tipo_documento text not null,
  descricao text,
  url text not null,
  nome_arquivo text not null,
  enviado_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table pessoa_documentos is
  'Documentos anexados ao cadastro de uma Pessoa (RG, CNH, comprovante de residência, contrato social, etc.) — sem consumidor além do próprio cadastro nesta frente; futuras sub-frentes (Contrato/Operação) podem usar. Armazenado no bucket privado pessoa-documentos.';
comment on column pessoa_documentos.tipo_documento is
  'Lista sugerida na UI (rg, cnh, comprovante_residencia, contrato_social, cartao_cnpj, outro), mas campo livre no banco pra não travar em lista fechada.';
comment on column pessoa_documentos.descricao is
  'Preenchido quando tipo_documento = ''outro'' — descrição livre de que documento é.';
comment on column pessoa_documentos.url is
  'Caminho do objeto no bucket privado pessoa-documentos (Supabase Storage) — NÃO é uma URL pública. O acesso real é via signed URL gerada sob demanda (o bucket é privado de propósito, documento de identificação é dado sensível).';

create index idx_pessoa_documentos_pessoa on pessoa_documentos(pessoa_id);

alter table pessoa_documentos enable row level security;
create policy admin_acesso_total on pessoa_documentos for all to authenticated using (true) with check (true);
create trigger trg_auditoria_pessoa_documentos
  after insert or update or delete on pessoa_documentos
  for each row execute function fn_auditoria_log();

-- -----------------------------------------------------------------------------
-- Buckets de Storage
-- -----------------------------------------------------------------------------
-- pessoa-documentos: PRIVADO (RG/CNH/comprovante são dado sensível — acesso só via
-- signed URL, nunca URL pública direta).
insert into storage.buckets (id, name, public)
values ('pessoa-documentos', 'pessoa-documentos', false)
on conflict (id) do nothing;

create policy pessoa_documentos_storage_acesso_total on storage.objects
  for all to authenticated
  using (bucket_id = 'pessoa-documentos')
  with check (bucket_id = 'pessoa-documentos');

-- pessoa-fotos: PÚBLICO (mesma natureza da foto de perfil do WhatsApp já salva em
-- pessoa_fotos.url como URL pública direta — precisa continuar sendo URL de verdade,
-- não path interno, pra não quebrar conversas_resumo.pessoa_foto_url já em produção).
insert into storage.buckets (id, name, public)
values ('pessoa-fotos', 'pessoa-fotos', true)
on conflict (id) do nothing;

create policy pessoa_fotos_storage_acesso_total on storage.objects
  for all to authenticated
  using (bucket_id = 'pessoa-fotos')
  with check (bucket_id = 'pessoa-fotos');

-- ============================================================================
-- Fim da migration 035.
-- ============================================================================
```

- [ ] **Step 2: Conferir contra o padrão de migrations existente (cabeçalho, comment, RLS, trigger) — comparar com `supabase/migrations/20260817110000_vendas_cadastro_nucleo.sql` (desta mesma frente)**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260817130000_vendas_pessoa_documentos.sql
git commit -m "feat(vendas): migration pessoa_documentos + buckets pessoa-documentos/pessoa-fotos"
```

---

### Task 10: Repositório de upload — documentos e foto da pessoa

**Files:**
- Create: `src/lib/vendas/pessoa-documentos.ts`
- Create: `src/lib/vendas/pessoa-fotos.ts`

**Interfaces:**
- Consome: `createClient` (`src/lib/supabase/server.ts`).
- Produz: `PessoaDocumento`, `listarDocumentosPessoa(pessoaId): Promise<PessoaDocumento[]>`, `EntradaEnviarDocumento`, `enviarDocumentoPessoa(entrada): Promise<{ id: string }>`, `excluirDocumentoPessoa(id): Promise<void>`; `enviarFotoPessoa(pessoaId, conteudo: Blob, extensao: string): Promise<{ url: string }>`, `buscarFotoMaisRecente(pessoaId): Promise<string | null>` — consumidos pelos componentes de upload (Task 14) e pelas telas (Tasks 16/17).

- [ ] **Step 1: Implementar `pessoa-documentos.ts` (sem teste unitário — I/O de Storage/banco)**

```ts
import { createClient } from "@/lib/supabase/server";

const BUCKET = "pessoa-documentos";

export type PessoaDocumento = {
  id: string;
  tipoDocumento: string;
  descricao: string | null;
  url: string;
  nomeArquivo: string;
  enviadoEm: string;
};

export async function listarDocumentosPessoa(pessoaId: string): Promise<PessoaDocumento[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pessoa_documentos")
    .select("id, tipo_documento, descricao, url, nome_arquivo, enviado_em")
    .eq("pessoa_id", pessoaId)
    .order("enviado_em", { ascending: false });
  if (error) throw new Error(`Falha ao listar documentos: ${error.message}`);

  return Promise.all(
    (data ?? []).map(async (linha) => {
      const { data: assinada } = await supabase.storage.from(BUCKET).createSignedUrl(linha.url, 3600);
      return {
        id: linha.id,
        tipoDocumento: linha.tipo_documento,
        descricao: linha.descricao,
        url: assinada?.signedUrl ?? "",
        nomeArquivo: linha.nome_arquivo,
        enviadoEm: linha.enviado_em,
      };
    }),
  );
}

export type EntradaEnviarDocumento = {
  pessoaId: string;
  tipoDocumento: string;
  descricao: string | null;
  nomeArquivo: string;
  conteudo: Blob;
};

export async function enviarDocumentoPessoa(entrada: EntradaEnviarDocumento): Promise<{ id: string }> {
  const supabase = await createClient();
  const caminho = `${entrada.pessoaId}/${Date.now()}-${entrada.nomeArquivo}`;

  const { error: erroUpload } = await supabase.storage.from(BUCKET).upload(caminho, entrada.conteudo);
  if (erroUpload) throw new Error(`Falha ao enviar arquivo: ${erroUpload.message}`);

  const { data, error } = await supabase
    .from("pessoa_documentos")
    .insert({
      pessoa_id: entrada.pessoaId,
      tipo_documento: entrada.tipoDocumento,
      descricao: entrada.descricao,
      url: caminho,
      nome_arquivo: entrada.nomeArquivo,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao registrar documento: ${error.message}`);
  return { id: data.id };
}

export async function excluirDocumentoPessoa(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("pessoa_documentos").delete().eq("id", id);
  if (error) throw new Error(`Falha ao excluir documento: ${error.message}`);
}
```

- [ ] **Step 2: Implementar `pessoa-fotos.ts` (sem teste unitário)**

```ts
import { createClient } from "@/lib/supabase/server";

const BUCKET = "pessoa-fotos";

export async function enviarFotoPessoa(pessoaId: string, conteudo: Blob, extensao: string): Promise<{ url: string }> {
  const supabase = await createClient();
  const caminho = `${pessoaId}/${Date.now()}.${extensao}`;

  const { error: erroUpload } = await supabase.storage.from(BUCKET).upload(caminho, conteudo);
  if (erroUpload) throw new Error(`Falha ao enviar foto: ${erroUpload.message}`);

  const { data: urlPublica } = supabase.storage.from(BUCKET).getPublicUrl(caminho);

  const { error } = await supabase.from("pessoa_fotos").insert({ pessoa_id: pessoaId, url: urlPublica.publicUrl });
  if (error) throw new Error(`Falha ao registrar foto: ${error.message}`);

  return { url: urlPublica.publicUrl };
}

export async function buscarFotoMaisRecente(pessoaId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pessoa_fotos")
    .select("url")
    .eq("pessoa_id", pessoaId)
    .order("capturada_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar foto: ${error.message}`);
  return data?.url ?? null;
}
```

**Nota importante pro implementador:** `pessoa_fotos` já existe (migration 031, feita originalmente pra foto de perfil do WhatsApp) — não criar tabela nova, só reaproveitar. A coluna `url` dessa tabela já é consumida como URL pública direta em `conversas_resumo.pessoa_foto_url` (Tela de Atendimento) — por isso o bucket `pessoa-fotos` é público e usamos `getPublicUrl`, diferente de `pessoa-documentos` (privado, signed URL). Não inverter isso.

- [ ] **Step 3: `npm run lint` e `npm run build` verdes**

- [ ] **Step 4: Commit**

```bash
git add src/lib/vendas/pessoa-documentos.ts src/lib/vendas/pessoa-fotos.ts
git commit -m "feat(vendas): upload de documentos (privado) e foto (público) da pessoa"
```

---

### Task 11: Leitura de documento por IA (Claude, visão)

**Files:**
- Create: `src/lib/vendas/leitura-documento-ia.ts`

**Interfaces:**
- Produz: `ArquivoParaLeitura`, `DadosExtraidosDocumento`, `lerDocumentoComIA(arquivos: ArquivoParaLeitura[]): Promise<DadosExtraidosDocumento | null>` — consumido pela Server Action de leitura por IA na Task 12.
- **Incerteza a verificar na implementação:** o bloco `type: "document"` (PDF nativo) da API da Anthropic pode não estar disponível em todos os modelos/versões — confirmar contra `node_modules/@anthropic-ai/sdk` (tipos TypeScript do pacote) ou a documentação oficial antes de assumir que Haiku 4.5 aceita PDF direto. Se não aceitar, o fallback aceitável pra esta frente é restringir `lerDocumentoComIA` a imagens (jpeg/png/webp/gif) só, retornando erro amigável se o arquivo for PDF, e registrar isso como pendência pra revisitar — não é bloqueante pro resto da funcionalidade (upload/leitura de imagem continua funcionando).

- [ ] **Step 1: Implementar (sem teste unitário — chamada de API externa, mesmo padrão de `src/lib/motor-fluxo/interpretacao-ia.ts`, que também não tem teste)**

```ts
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const MODELO_LEITURA_DOCUMENTO = "claude-haiku-4-5-20251001";

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

const FERRAMENTA_LEITURA = {
  name: "registrar_dados_documento",
  description: "Registra os dados extraídos do(s) documento(s) fornecido(s).",
  input_schema: {
    type: "object" as const,
    properties: {
      nome: { type: "string", description: "Nome completo (PF) ou razão social (PJ) encontrado. String vazia se não encontrado." },
      documento: { type: "string", description: "CPF ou CNPJ encontrado, só dígitos. String vazia se não encontrado." },
      cep: { type: "string", description: "CEP do endereço encontrado, só dígitos. String vazia se não encontrado." },
      logradouro: { type: "string", description: "Logradouro encontrado. String vazia se não encontrado." },
      numero: { type: "string", description: "Número do endereço encontrado. String vazia se não encontrado." },
      bairro: { type: "string", description: "Bairro encontrado. String vazia se não encontrado." },
      cidade: { type: "string", description: "Cidade encontrada. String vazia se não encontrado." },
      uf: { type: "string", description: "UF (2 letras) encontrada. String vazia se não encontrado." },
    },
    required: ["nome", "documento", "cep", "logradouro", "numero", "bairro", "cidade", "uf"],
  },
};

export type ArquivoParaLeitura = { base64: string; mediaType: string };

export type DadosExtraidosDocumento = {
  nome: string;
  documento: string;
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export async function lerDocumentoComIA(arquivos: ArquivoParaLeitura[]): Promise<DadosExtraidosDocumento | null> {
  if (arquivos.length === 0) return null;

  const cliente = obterCliente();

  const blocosArquivo = arquivos.map((arquivo) => {
    if (arquivo.mediaType === "application/pdf") {
      return {
        type: "document" as const,
        source: { type: "base64" as const, media_type: arquivo.mediaType, data: arquivo.base64 },
      };
    }
    return {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: arquivo.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        data: arquivo.base64,
      },
    };
  });

  try {
    const resposta = await cliente.messages.create({
      model: MODELO_LEITURA_DOCUMENTO,
      max_tokens: 500,
      tools: [FERRAMENTA_LEITURA],
      tool_choice: { type: "tool", name: "registrar_dados_documento" },
      messages: [
        {
          role: "user",
          content: [
            ...blocosArquivo,
            {
              type: "text",
              text: "Estas imagens/documento(s) são de um documento de identificação ou comprovante de endereço brasileiro (RG, CNH, cartão CNPJ, comprovante de residência, etc. — pode ser mais de uma imagem do mesmo documento, ex.: frente e verso). Extraia nome/razão social, CPF/CNPJ e endereço, quando existirem. Use a ferramenta pra registrar o resultado — nunca invente um dado que não está visível, deixe o campo vazio nesse caso.",
            },
          ],
        },
      ],
    });

    const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
    if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") return null;

    return blocoFerramenta.input as DadosExtraidosDocumento;
  } catch (e) {
    console.error("[leitura-documento-ia] erro ao chamar Claude:", e);
    return null;
  }
}
```

- [ ] **Step 2: `npm run lint` e `npm run build` verdes**

- [ ] **Step 3: Commit**

```bash
git add src/lib/vendas/leitura-documento-ia.ts
git commit -m "feat(vendas): leitura de documento por IA (Claude, visão) para pré-preencher cadastro"
```

---

### Task 12: Componente compartilhado — Leitor de Documento por IA

**Files:**
- Create: `src/components/vendas/leitor-documento-ia.tsx`
- Create: `src/components/vendas/leitor-documento-ia-actions.ts`

**Interfaces:**
- Consome: `lerDocumentoComIA` (Task 11).
- Produz: componente `<LeitorDocumentoIA onDadosExtraidos={(dados) => void} />` — consumido pelas Tasks 17 e 18 (reaproveitado nas duas telas, evita duplicar a UI de upload/paste + chamada de IA).

- [ ] **Step 1: `leitor-documento-ia-actions.ts` — Server Action**

```ts
"use server";

import { lerDocumentoComIA, type DadosExtraidosDocumento } from "@/lib/vendas/leitura-documento-ia";

export type ResultadoLerDocumento = { sucesso: true; dados: DadosExtraidosDocumento } | { sucesso: false; erro: string };

export async function lerDocumentoAction(formData: FormData): Promise<ResultadoLerDocumento> {
  const arquivos = formData.getAll("arquivos") as File[];
  if (arquivos.length === 0) {
    return { sucesso: false, erro: "Selecione ao menos um arquivo." };
  }

  const arquivosBase64 = await Promise.all(
    arquivos.map(async (arquivo) => {
      const bytes = await arquivo.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      return { base64, mediaType: arquivo.type };
    }),
  );

  const dados = await lerDocumentoComIA(arquivosBase64);
  if (!dados) {
    return { sucesso: false, erro: "Não consegui ler o documento. Tente uma foto mais nítida ou preencha manualmente." };
  }
  return { sucesso: true, dados };
}
```

- [ ] **Step 2: `leitor-documento-ia.tsx` — Client Component**

```tsx
"use client";

import { useRef, useState } from "react";
import type { DadosExtraidosDocumento } from "@/lib/vendas/leitura-documento-ia";
import { lerDocumentoAction } from "./leitor-documento-ia-actions";

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";

export function LeitorDocumentoIA({ onDadosExtraidos }: { onDadosExtraidos: (dados: DadosExtraidosDocumento) => void }) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function adicionarArquivos(novos: FileList | File[]) {
    setArquivos((atual) => [...atual, ...Array.from(novos)]);
  }

  function aoColar(evento: React.ClipboardEvent) {
    const imagens = Array.from(evento.clipboardData.items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((arquivo): arquivo is File => arquivo !== null);
    if (imagens.length > 0) adicionarArquivos(imagens);
  }

  async function ler() {
    if (arquivos.length === 0) return;
    setCarregando(true);
    setErro(null);
    const formData = new FormData();
    arquivos.forEach((arquivo) => formData.append("arquivos", arquivo));

    const resultado = await lerDocumentoAction(formData);
    setCarregando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onDadosExtraidos(resultado.dados);
    setArquivos([]);
  }

  return (
    <div
      className="rounded-lg border border-dashed border-zinc-300 p-3 text-sm dark:border-zinc-700"
      onPaste={aoColar}
      tabIndex={0}
      title="Cole (Ctrl+V) uma ou mais imagens do documento aqui, ou escolha os arquivos abaixo"
    >
      <p className="mb-2 font-medium text-zinc-700 dark:text-zinc-300">
        📄 Ler documento com IA <span className="font-normal text-zinc-500">(opcional — só pré-preenche, você confere antes de salvar)</span>
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        onChange={(e) => e.target.files && adicionarArquivos(e.target.files)}
        className={campo}
      />
      {arquivos.length > 0 && (
        <p className="mt-1 text-xs text-zinc-500">{arquivos.length} arquivo(s) selecionado(s) — pode colar (Ctrl+V) mais imagens aqui.</p>
      )}
      {erro && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erro}</p>}
      <button
        onClick={ler}
        disabled={arquivos.length === 0 || carregando}
        className="mt-2 rounded-full bg-zinc-900 px-4 py-1.5 text-xs text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {carregando ? "Lendo..." : "Ler documento"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: `npm run lint` e `npm run build` verdes**

- [ ] **Step 4: Commit**

```bash
git add src/components/vendas/leitor-documento-ia.tsx src/components/vendas/leitor-documento-ia-actions.ts
git commit -m "feat(vendas): componente compartilhado de leitura de documento por IA"
```

---

### Task 13: Componente compartilhado — Campo de Endereço (CEP-primeiro)

**Files:**
- Create: `src/components/vendas/campo-endereco.tsx`
- Create: `src/components/vendas/campo-endereco-actions.ts`

**Interfaces:**
- Consome: `buscarEnderecoPorCep` (Task 8), `formatarCep` (Task 6).
- Produz: tipo `ValorEndereco` e componente `<CampoEndereco value={ValorEndereco} onChange={(v) => void} />` (controlado pelo pai) — consumido pelas Tasks 17 e 18.

- [ ] **Step 1: `campo-endereco-actions.ts` — Server Action**

```ts
"use server";

import { buscarEnderecoPorCep } from "@/lib/vendas/endereco";

export async function buscarEnderecoPorCepAction(cep: string) {
  return buscarEnderecoPorCep(cep);
}
```

- [ ] **Step 2: `campo-endereco.tsx` — Client Component**

```tsx
"use client";

import { formatarCep, normalizarCep } from "@/lib/vendas/mascaras";
import { buscarEnderecoPorCepAction } from "./campo-endereco-actions";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export type ValorEndereco = {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export const enderecoVazio: ValorEndereco = { cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" };

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

export function CampoEndereco({ value, onChange }: { value: ValorEndereco; onChange: (v: ValorEndereco) => void }) {
  async function aoMudarCep(cepDigitado: string) {
    const cepFormatado = formatarCep(cepDigitado);
    onChange({ ...value, cep: cepFormatado });

    if (normalizarCep(cepFormatado).length !== 8) return;
    const encontrado = await buscarEnderecoPorCepAction(cepFormatado);
    if (encontrado) {
      onChange({
        ...value,
        cep: cepFormatado,
        logradouro: encontrado.logradouro,
        bairro: encontrado.bairro,
        cidade: encontrado.cidade,
        uf: encontrado.uf,
      });
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <label className={rotulo} title="Digite o CEP primeiro — o resto do endereço preenche sozinho">
          CEP
        </label>
        <input className={campo} value={value.cep} onChange={(e) => aoMudarCep(e.target.value)} placeholder="00000-000" maxLength={9} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className={rotulo}>Logradouro</label>
          <input className={campo} value={value.logradouro} onChange={(e) => onChange({ ...value, logradouro: e.target.value })} />
        </div>
        <div>
          <label className={rotulo}>Número</label>
          <input className={campo} value={value.numero} onChange={(e) => onChange({ ...value, numero: e.target.value })} />
        </div>
      </div>
      <div>
        <label className={rotulo}>Complemento</label>
        <input className={campo} value={value.complemento} onChange={(e) => onChange({ ...value, complemento: e.target.value })} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={rotulo}>Bairro</label>
          <input className={campo} value={value.bairro} onChange={(e) => onChange({ ...value, bairro: e.target.value })} />
        </div>
        <div>
          <label className={rotulo}>Cidade</label>
          <input className={campo} value={value.cidade} onChange={(e) => onChange({ ...value, cidade: e.target.value })} />
        </div>
        <div>
          <label className={rotulo}>UF</label>
          <select className={campo} value={value.uf} onChange={(e) => onChange({ ...value, uf: e.target.value })}>
            <option value="">--</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `npm run lint` e `npm run build` verdes**

- [ ] **Step 4: Commit**

```bash
git add src/components/vendas/campo-endereco.tsx src/components/vendas/campo-endereco-actions.ts
git commit -m "feat(vendas): componente compartilhado de endereço com autopreenchimento por CEP"
```

---

### Task 14: Componentes compartilhados — Upload de Documentos e Foto

**Files:**
- Create: `src/components/vendas/upload-documentos-pessoa.tsx`
- Create: `src/components/vendas/upload-foto-pessoa.tsx`
- Create: `src/components/vendas/upload-pessoa-actions.ts`

**Interfaces:**
- Consome: `enviarDocumentoPessoa`, `listarDocumentosPessoa`, `excluirDocumentoPessoa`, `enviarFotoPessoa`, `buscarFotoMaisRecente` (Task 10).
- Produz: `<UploadDocumentosPessoa pessoaId={string} />`, `<UploadFotoPessoa pessoaId={string} />` — consumidos pelas Tasks 16/17, só renderizados depois que a Pessoa já existe (tem `pessoaId`).

- [ ] **Step 1: `upload-pessoa-actions.ts` — Server Actions**

```ts
"use server";

import {
  enviarDocumentoPessoa,
  excluirDocumentoPessoa as excluirDocumentoPessoaRepo,
  listarDocumentosPessoa,
  type PessoaDocumento,
} from "@/lib/vendas/pessoa-documentos";
import { enviarFotoPessoa, buscarFotoMaisRecente } from "@/lib/vendas/pessoa-fotos";

export async function listarDocumentosPessoaAction(pessoaId: string): Promise<PessoaDocumento[]> {
  return listarDocumentosPessoa(pessoaId);
}

export type ResultadoEnviarDocumento = { sucesso: true } | { sucesso: false; erro: string };

export async function enviarDocumentoPessoaAction(formData: FormData): Promise<ResultadoEnviarDocumento> {
  const pessoaId = formData.get("pessoaId") as string;
  const tipoDocumento = formData.get("tipoDocumento") as string;
  const descricao = (formData.get("descricao") as string) || null;
  const arquivo = formData.get("arquivo") as File;

  if (!arquivo || arquivo.size === 0) {
    return { sucesso: false, erro: "Selecione um arquivo." };
  }
  if (!tipoDocumento) {
    return { sucesso: false, erro: "Selecione o tipo do documento." };
  }

  await enviarDocumentoPessoa({ pessoaId, tipoDocumento, descricao, nomeArquivo: arquivo.name, conteudo: arquivo });
  return { sucesso: true };
}

export async function excluirDocumentoPessoaAction(id: string): Promise<void> {
  await excluirDocumentoPessoaRepo(id);
}

export async function buscarFotoMaisRecenteAction(pessoaId: string): Promise<string | null> {
  return buscarFotoMaisRecente(pessoaId);
}

export type ResultadoEnviarFoto = { sucesso: true; url: string } | { sucesso: false; erro: string };

export async function enviarFotoPessoaAction(formData: FormData): Promise<ResultadoEnviarFoto> {
  const pessoaId = formData.get("pessoaId") as string;
  const arquivo = formData.get("arquivo") as File;
  if (!arquivo || arquivo.size === 0) {
    return { sucesso: false, erro: "Selecione uma foto." };
  }
  const extensao = arquivo.name.split(".").pop() ?? "jpg";
  const resultado = await enviarFotoPessoa(pessoaId, arquivo, extensao);
  return { sucesso: true, url: resultado.url };
}
```

- [ ] **Step 2: `upload-documentos-pessoa.tsx` — Client Component**

```tsx
"use client";

import { useEffect, useState } from "react";
import type { PessoaDocumento } from "@/lib/vendas/pessoa-documentos";
import { enviarDocumentoPessoaAction, excluirDocumentoPessoaAction, listarDocumentosPessoaAction } from "./upload-pessoa-actions";

const TIPOS_DOCUMENTO = [
  { valor: "rg", rotulo: "RG" },
  { valor: "cnh", rotulo: "CNH" },
  { valor: "comprovante_residencia", rotulo: "Comprovante de Residência" },
  { valor: "contrato_social", rotulo: "Contrato Social" },
  { valor: "cartao_cnpj", rotulo: "Cartão CNPJ" },
  { valor: "outro", rotulo: "Outro" },
] as const;

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";

export function UploadDocumentosPessoa({ pessoaId }: { pessoaId: string }) {
  const [documentos, setDocumentos] = useState<PessoaDocumento[]>([]);
  const [tipo, setTipo] = useState<(typeof TIPOS_DOCUMENTO)[number]["valor"]>("rg");
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    listarDocumentosPessoaAction(pessoaId).then(setDocumentos);
  }, [pessoaId]);

  async function enviar(arquivo: File) {
    setErro(null);
    const formData = new FormData();
    formData.append("pessoaId", pessoaId);
    formData.append("tipoDocumento", tipo);
    formData.append("descricao", descricao);
    formData.append("arquivo", arquivo);

    const resultado = await enviarDocumentoPessoaAction(formData);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    setDescricao("");
    listarDocumentosPessoaAction(pessoaId).then(setDocumentos);
  }

  async function excluir(id: string) {
    await excluirDocumentoPessoaAction(id);
    setDocumentos((atual) => atual.filter((d) => d.id !== id));
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">📎 Documentos anexados</p>
      <div className="flex flex-wrap items-end gap-2">
        <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} style={{ maxWidth: 220 }}>
          {TIPOS_DOCUMENTO.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.rotulo}
            </option>
          ))}
        </select>
        {tipo === "outro" && (
          <input
            className={campo}
            placeholder="Descreva o documento"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            style={{ maxWidth: 220 }}
          />
        )}
        <input type="file" onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])} />
      </div>
      {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
      <ul className="space-y-1 text-sm">
        {documentos.map((doc) => (
          <li key={doc.id} className="flex items-center justify-between rounded border border-zinc-200 px-2 py-1 dark:border-zinc-700">
            <a href={doc.url} target="_blank" rel="noreferrer" className="truncate text-zinc-700 hover:underline dark:text-zinc-300">
              {TIPOS_DOCUMENTO.find((t) => t.valor === doc.tipoDocumento)?.rotulo ?? doc.tipoDocumento}
              {doc.descricao ? ` — ${doc.descricao}` : ""}
            </a>
            <button onClick={() => excluir(doc.id)} className="ml-2 text-xs text-red-600 dark:text-red-400">
              Excluir
            </button>
          </li>
        ))}
        {documentos.length === 0 && <li className="text-xs text-zinc-500">Nenhum documento anexado ainda.</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: `upload-foto-pessoa.tsx` — Client Component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { buscarFotoMaisRecenteAction, enviarFotoPessoaAction } from "./upload-pessoa-actions";

export function UploadFotoPessoa({ pessoaId }: { pessoaId: string }) {
  const [urlFoto, setUrlFoto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    buscarFotoMaisRecenteAction(pessoaId).then(setUrlFoto);
  }, [pessoaId]);

  async function enviar(arquivo: File) {
    setErro(null);
    const formData = new FormData();
    formData.append("pessoaId", pessoaId);
    formData.append("arquivo", arquivo);
    const resultado = await enviarFotoPessoaAction(formData);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    setUrlFoto(resultado.url);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">🖼️ Foto (opcional)</p>
      <div className="flex items-center gap-3">
        {urlFoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urlFoto} alt="Foto da pessoa" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-200 text-xs text-zinc-500 dark:bg-zinc-700">
            sem foto
          </div>
        )}
        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])} />
      </div>
      {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}
```

- [ ] **Step 4: `npm run lint` e `npm run build` verdes**

- [ ] **Step 5: Commit**

```bash
git add src/components/vendas/upload-documentos-pessoa.tsx src/components/vendas/upload-foto-pessoa.tsx src/components/vendas/upload-pessoa-actions.ts
git commit -m "feat(vendas): componentes compartilhados de upload de documento e foto da pessoa"
```

---

### Task 15: Repositório de Cliente (promoção de papel) e de Venda sem funil prévio

**Files:**
- Create: `src/lib/vendas/clientes.ts`

**Interfaces:**
- Produz: `promoverPessoaACliente(pessoaId: string, unidadeNegocioId: string): Promise<void>`, `EntradaOportunidadeSemFunil`, `criarOportunidadeSemFunilPrevio(entrada): Promise<{ oportunidadeId: string }>` — consumidos pela Task 18 (tela de Vendas).

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

### Task 16: Tela `/admin/fornecedores` (CRUD completo: máscara, endereço, documentos, foto, IA)

**Files:**
- Create: `src/app/admin/(shell)/fornecedores/page.tsx`
- Create: `src/app/admin/(shell)/fornecedores/actions.ts`
- Create: `src/app/admin/(shell)/fornecedores/fornecedores-client.tsx`

**Interfaces:**
- Consome: `listarFornecedores`, `salvarFornecedor`, `excluirFornecedor` (Task 4), `buscarPessoaPorDocumento`, `resolverOuCriarPessoa` (Task 5), `formatarCpfCnpj` (Task 6), `salvarEndereco`, `buscarEnderecoPorPessoa` (Task 8), `<LeitorDocumentoIA>` (Task 12), `<CampoEndereco>`/`ValorEndereco`/`enderecoVazio` (Task 13), `<UploadDocumentosPessoa>`/`<UploadFotoPessoa>` (Task 14).

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
import { salvarEndereco, type EntradaSalvarEndereco } from "@/lib/vendas/endereco";

export type ResultadoBuscarPessoa =
  | { encontrada: true; id: string; nome: string; documento: string }
  | { encontrada: false };

export async function buscarPessoaPorDocumentoAction(documento: string): Promise<ResultadoBuscarPessoa> {
  const pessoa = await buscarPessoaPorDocumento(documento);
  if (!pessoa) return { encontrada: false };
  return { encontrada: true, id: pessoa.id, nome: pessoa.nome, documento: pessoa.documento };
}

export type ResultadoSalvarFornecedor = { sucesso: true; id: string; pessoaId: string } | { sucesso: false; erro: string };

export async function salvarFornecedorAction(
  entrada: EntradaSalvarFornecedor & {
    pessoaNova: { nome: string; documento: string } | null;
    endereco: Omit<EntradaSalvarEndereco, "pessoaId" | "tipo"> | null;
  },
): Promise<ResultadoSalvarFornecedor> {
  const pessoa = await resolverOuCriarPessoa({ pessoaId: entrada.pessoaId || null, pessoaNova: entrada.pessoaNova });
  if (!pessoa.sucesso) {
    return { sucesso: false, erro: pessoa.erro };
  }

  const resultado = await salvarFornecedorRepo({ ...entrada, pessoaId: pessoa.pessoaId });

  if (entrada.endereco && entrada.endereco.cep) {
    await salvarEndereco({ ...entrada.endereco, pessoaId: pessoa.pessoaId, tipo: "comercial" });
  }

  revalidatePath("/admin/fornecedores");
  return { sucesso: true, id: resultado.id, pessoaId: pessoa.pessoaId };
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
import { formatarCpfCnpj } from "@/lib/vendas/mascaras";
import { CampoEndereco, enderecoVazio, type ValorEndereco } from "@/components/vendas/campo-endereco";
import { LeitorDocumentoIA } from "@/components/vendas/leitor-documento-ia";
import { UploadDocumentosPessoa } from "@/components/vendas/upload-documentos-pessoa";
import { UploadFotoPessoa } from "@/components/vendas/upload-foto-pessoa";
import { buscarPessoaPorDocumentoAction, excluirFornecedorAction, salvarFornecedorAction } from "./actions";

const CATEGORIAS = [
  { valor: "consorcio", rotulo: "Consórcio" },
  { valor: "credito", rotulo: "Crédito" },
  { valor: "subcontratado_servico", rotulo: "Subcontratado de serviço" },
  { valor: "administrativo", rotulo: "Administrativo" },
] as const;

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

export function FornecedoresClient({ fornecedoresIniciais }: { fornecedoresIniciais: FornecedorAdmin[] }) {
  const [fornecedores, setFornecedores] = useState(fornecedoresIniciais);
  const [formAberto, setFormAberto] = useState(false);
  const [documentoBusca, setDocumentoBusca] = useState("");
  const [pessoaSelecionada, setPessoaSelecionada] = useState<{ id: string; nome: string } | null>(null);
  const [nomeNovaPessoa, setNomeNovaPessoa] = useState("");
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS)[number]["valor"]>("consorcio");
  const [endereco, setEndereco] = useState<ValorEndereco>(enderecoVazio);
  const [erro, setErro] = useState<string | null>(null);
  const [pessoaIdSalva, setPessoaIdSalva] = useState<string | null>(null);

  async function buscarPessoa(documento: string) {
    const resultado = await buscarPessoaPorDocumentoAction(documento);
    setPessoaSelecionada(resultado.encontrada ? { id: resultado.id, nome: resultado.nome } : null);
  }

  async function salvar() {
    setErro(null);
    const resultado = await salvarFornecedorAction({
      id: null,
      pessoaId: pessoaSelecionada?.id ?? "",
      categoria,
      ativo: true,
      pessoaNova: pessoaSelecionada ? null : { nome: nomeNovaPessoa, documento: documentoBusca },
      endereco: endereco.cep
        ? {
            cep: endereco.cep,
            logradouro: endereco.logradouro,
            numero: endereco.numero,
            complemento: endereco.complemento || null,
            bairro: endereco.bairro,
            cidade: endereco.cidade,
            uf: endereco.uf,
          }
        : null,
    });
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    setPessoaIdSalva(resultado.pessoaId);
  }

  function fecharNovo() {
    setFormAberto(false);
    setDocumentoBusca("");
    setPessoaSelecionada(null);
    setNomeNovaPessoa("");
    setEndereco(enderecoVazio);
    setPessoaIdSalva(null);
    window.location.reload();
  }

  async function excluir(id: string) {
    await excluirFornecedorAction(id);
    setFornecedores((atual) => atual.filter((f) => f.id !== id));
  }

  return (
    <div className="max-w-3xl space-y-3 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Fornecedores</h1>
        <button
          onClick={() => setFormAberto(true)}
          disabled={formAberto}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          + Novo fornecedor
        </button>
      </div>

      {formAberto && !pessoaIdSalva && (
        <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
          <LeitorDocumentoIA
            onDadosExtraidos={(dados) => {
              if (dados.documento) setDocumentoBusca(dados.documento);
              if (dados.nome) setNomeNovaPessoa(dados.nome);
              setEndereco((atual) => ({
                ...atual,
                cep: dados.cep || atual.cep,
                logradouro: dados.logradouro || atual.logradouro,
                numero: dados.numero || atual.numero,
                bairro: dados.bairro || atual.bairro,
                cidade: dados.cidade || atual.cidade,
                uf: dados.uf || atual.uf,
              }));
            }}
          />

          <div>
            <label className={rotulo} title="Buscamos automaticamente se esse CPF/CNPJ já está cadastrado">
              CPF ou CNPJ
            </label>
            <input
              className={campo}
              value={formatarCpfCnpj(documentoBusca)}
              onChange={(e) => {
                setDocumentoBusca(e.target.value);
                buscarPessoa(e.target.value);
              }}
              placeholder="000.000.000-00"
            />
          </div>
          {pessoaSelecionada ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">✓ Pessoa já cadastrada: {pessoaSelecionada.nome}</p>
          ) : (
            <div>
              <label className={rotulo}>Nome / Razão Social</label>
              <input className={campo} value={nomeNovaPessoa} onChange={(e) => setNomeNovaPessoa(e.target.value)} />
            </div>
          )}

          <div>
            <label className={rotulo}>Categoria</label>
            <select className={campo} value={categoria} onChange={(e) => setCategoria(e.target.value as typeof categoria)}>
              {CATEGORIAS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </div>

          <CampoEndereco value={endereco} onChange={setEndereco} />

          {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
          <div className="flex gap-2">
            <button onClick={salvar} className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900">
              Salvar
            </button>
            <button onClick={() => setFormAberto(false)} className="rounded-full px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {pessoaIdSalva && (
        <div className="space-y-3 rounded-lg border border-emerald-300 p-4 dark:border-emerald-700">
          <p className="text-sm text-emerald-700 dark:text-emerald-400">✓ Fornecedor salvo. Pode anexar documentos e foto agora, ou fazer isso depois.</p>
          <UploadFotoPessoa pessoaId={pessoaIdSalva} />
          <UploadDocumentosPessoa pessoaId={pessoaIdSalva} />
          <button onClick={fecharNovo} className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900">
            Concluir
          </button>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left dark:border-zinc-700">
            <th className="py-1">Nome</th>
            <th className="py-1">Documento</th>
            <th className="py-1">Categoria</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {fornecedores.map((f) => (
            <tr key={f.id} className="border-b border-zinc-100 dark:border-zinc-800">
              <td className="py-1">{f.nome}</td>
              <td className="py-1">{formatarCpfCnpj(f.documento)}</td>
              <td className="py-1">{CATEGORIAS.find((c) => c.valor === f.categoria)?.rotulo}</td>
              <td className="py-1 text-right">
                <button onClick={() => excluir(f.id)} className="text-xs text-red-600 dark:text-red-400">
                  Excluir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {fornecedores.length === 0 && <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum fornecedor cadastrado ainda.</p>}
    </div>
  );
}
```

- [ ] **Step 4: `npm run lint` e `npm run build` verdes**

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/\(shell\)/fornecedores/
git commit -m "feat(vendas): tela /admin/fornecedores completa (máscara, endereço, documentos, foto, IA)"
```

---

### Task 17: Tela `/admin/vendas/nova` (venda sem funil prévio, completa)

**Files:**
- Create: `src/app/admin/(shell)/vendas/nova/page.tsx`
- Create: `src/app/admin/(shell)/vendas/nova/actions.ts`
- Create: `src/app/admin/(shell)/vendas/nova/nova-venda-client.tsx`

**Interfaces:**
- Consome: `buscarPessoaPorDocumento`, `resolverOuCriarPessoa` (Task 5), `formatarCpfCnpj` (Task 6), `salvarEndereco` (Task 8), `criarOportunidadeSemFunilPrevio` (Task 15), `listarProdutos` (`src/lib/motor-fluxo/repositorio-admin.ts`), `<LeitorDocumentoIA>` (Task 12), `<CampoEndereco>`/`ValorEndereco`/`enderecoVazio` (Task 13), `<UploadDocumentosPessoa>`/`<UploadFotoPessoa>` (Task 14).
- **Antes de escrever `page.tsx`:** abrir `src/lib/motor-fluxo/repositorio-admin.ts` e conferir a assinatura real de `listarProdutos()` — o `type Produto = { id: string; nome: string }` abaixo é um palpite, ajustar pra bater com a assinatura real antes de usar.

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
import { salvarEndereco, type EntradaSalvarEndereco } from "@/lib/vendas/endereco";

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
  endereco: Omit<EntradaSalvarEndereco, "pessoaId" | "tipo"> | null;
};

export type ResultadoCriarVenda = { sucesso: true; oportunidadeId: string; pessoaId: string } | { sucesso: false; erro: string };

export async function criarVendaSemFunilPrevioAction(entrada: EntradaCriarVenda): Promise<ResultadoCriarVenda> {
  const pessoa = await resolverOuCriarPessoa({ pessoaId: entrada.pessoaId, pessoaNova: entrada.pessoaNova });
  if (!pessoa.sucesso) {
    return { sucesso: false, erro: pessoa.erro };
  }
  if (!entrada.produtoId) {
    return { sucesso: false, erro: "Selecione um Serviço." };
  }

  if (entrada.endereco && entrada.endereco.cep) {
    await salvarEndereco({ ...entrada.endereco, pessoaId: pessoa.pessoaId, tipo: "residencial" });
  }

  const resultado = await criarOportunidadeSemFunilPrevio({
    pessoaId: pessoa.pessoaId,
    produtoId: entrada.produtoId,
    valorEstimado: entrada.valorEstimado,
  });
  return { sucesso: true, oportunidadeId: resultado.oportunidadeId, pessoaId: pessoa.pessoaId };
}
```

- [ ] **Step 3: `nova-venda-client.tsx` — Client Component**

```tsx
"use client";

import { useState } from "react";
import { formatarCpfCnpj } from "@/lib/vendas/mascaras";
import { CampoEndereco, enderecoVazio, type ValorEndereco } from "@/components/vendas/campo-endereco";
import { LeitorDocumentoIA } from "@/components/vendas/leitor-documento-ia";
import { UploadDocumentosPessoa } from "@/components/vendas/upload-documentos-pessoa";
import { UploadFotoPessoa } from "@/components/vendas/upload-foto-pessoa";
import { buscarPessoaPorDocumentoAction, criarVendaSemFunilPrevioAction } from "./actions";

type Produto = { id: string; nome: string };

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

export function NovaVendaClient({ produtos }: { produtos: Produto[] }) {
  const [documento, setDocumento] = useState("");
  const [pessoaEncontrada, setPessoaEncontrada] = useState<{ id: string; nome: string } | null>(null);
  const [nomeNovaPessoa, setNomeNovaPessoa] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [valorEstimado, setValorEstimado] = useState("");
  const [endereco, setEndereco] = useState<ValorEndereco>(enderecoVazio);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ oportunidadeId: string; pessoaId: string } | null>(null);

  async function buscarPessoa(doc: string) {
    const resultadoBusca = await buscarPessoaPorDocumentoAction(doc);
    setPessoaEncontrada(resultadoBusca.encontrada ? { id: resultadoBusca.id, nome: resultadoBusca.nome } : null);
  }

  async function criarVenda() {
    setErro(null);
    const resultadoAction = await criarVendaSemFunilPrevioAction({
      pessoaId: pessoaEncontrada?.id ?? null,
      pessoaNova: pessoaEncontrada ? null : { nome: nomeNovaPessoa, documento },
      produtoId,
      valorEstimado: valorEstimado ? Number(valorEstimado) : null,
      endereco: endereco.cep
        ? {
            cep: endereco.cep,
            logradouro: endereco.logradouro,
            numero: endereco.numero,
            complemento: endereco.complemento || null,
            bairro: endereco.bairro,
            cidade: endereco.cidade,
            uf: endereco.uf,
          }
        : null,
    });
    if (!resultadoAction.sucesso) {
      setErro(resultadoAction.erro);
      return;
    }
    setResultado({ oportunidadeId: resultadoAction.oportunidadeId, pessoaId: resultadoAction.pessoaId });
  }

  if (resultado) {
    return (
      <div className="max-w-2xl space-y-3 p-8">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          ✓ Venda criada — Oportunidade já está na etapa &quot;Dados para Contrato&quot;. Pode anexar documentos e foto do cliente agora, ou fazer isso depois.
        </p>
        <UploadFotoPessoa pessoaId={resultado.pessoaId} />
        <UploadDocumentosPessoa pessoaId={resultado.pessoaId} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-3 p-8">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Nova venda (sem funil prévio)</h1>

      <LeitorDocumentoIA
        onDadosExtraidos={(dados) => {
          if (dados.documento) setDocumento(dados.documento);
          if (dados.nome) setNomeNovaPessoa(dados.nome);
          setEndereco((atual) => ({
            ...atual,
            cep: dados.cep || atual.cep,
            logradouro: dados.logradouro || atual.logradouro,
            numero: dados.numero || atual.numero,
            bairro: dados.bairro || atual.bairro,
            cidade: dados.cidade || atual.cidade,
            uf: dados.uf || atual.uf,
          }));
        }}
      />

      <div>
        <label className={rotulo}>CPF ou CNPJ do cliente</label>
        <input
          className={campo}
          value={formatarCpfCnpj(documento)}
          onChange={(e) => {
            setDocumento(e.target.value);
            buscarPessoa(e.target.value);
          }}
          placeholder="000.000.000-00"
        />
      </div>
      {pessoaEncontrada ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">✓ Cliente já cadastrado: {pessoaEncontrada.nome}</p>
      ) : (
        <div>
          <label className={rotulo}>Nome (cliente novo)</label>
          <input className={campo} value={nomeNovaPessoa} onChange={(e) => setNomeNovaPessoa(e.target.value)} />
        </div>
      )}

      <div>
        <label className={rotulo}>Serviço</label>
        <select className={campo} value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
          <option value="">Selecione o Serviço</option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={rotulo}>Valor estimado (R$)</label>
        <input className={campo} type="number" value={valorEstimado} onChange={(e) => setValorEstimado(e.target.value)} />
      </div>

      <CampoEndereco value={endereco} onChange={setEndereco} />

      {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
      <button onClick={criarVenda} className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900">
        Criar venda
      </button>
    </div>
  );
}
```

- [ ] **Step 4: `npm run lint` e `npm run build` verdes**

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/\(shell\)/vendas/
git commit -m "feat(vendas): tela /admin/vendas/nova completa (máscara, endereço, documentos, foto, IA)"
```

---

### Task 18: Item de navegação "Vendas" no sidebar do admin

**Files:**
- Modify: `src/app/admin/(shell)/sidebar.tsx`

- [ ] **Step 1: Adicionar grupo/itens de Vendas**

Abrir `src/app/admin/(shell)/sidebar.tsx`, localizar `GRUPO_CRM`/`GRUPO_GERAL` e adicionar, seguindo o mesmo padrão (`type ItemMenu = { rotulo: string; href: string } | { rotulo: string; emBreve: true }`):

```tsx
const GRUPO_VENDAS: ItemMenu[] = [
  { rotulo: "Nova venda", href: "/admin/vendas/nova" },
  { rotulo: "Fornecedores", href: "/admin/fornecedores" },
];
```

Renderizar `GRUPO_VENDAS` numa seção própria "Vendas" no menu, ao lado de "CRM"/"Geral" — seguir exatamente o mesmo padrão JSX já usado para renderizar `GRUPO_CRM`/`GRUPO_GERAL`.

- [ ] **Step 2: Verificar visualmente no navegador**

Rodar `npm run dev`, abrir `/admin`, confirmar que "Vendas" aparece no menu com "Nova venda" e "Fornecedores" clicáveis.

- [ ] **Step 3: `npm run lint` e `npm run build` verdes**

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/\(shell\)/sidebar.tsx
git commit -m "feat(vendas): item de navegação Vendas no sidebar do admin"
```

---

### Task 19: Verificação manual de ponta a ponta

**Files:** nenhum arquivo novo — só verificação.

- [ ] **Step 1: Rodar as três migrations no Supabase**

Luiz roda, nessa ordem: `20260817110000_vendas_cadastro_nucleo.sql`, `20260817120000_vendas_seguranca_nucleo_pessoa.sql`, `20260817130000_vendas_pessoa_documentos.sql` no SQL Editor do Supabase.

- [ ] **Step 2: Testar `/admin/fornecedores` no navegador**

Criar um fornecedor com CPF/CNPJ novo, confirmando: máscara aplicada ao digitar, nome salvo em CAIXA ALTA no banco, CEP autopreenchendo o resto do endereço, upload de foto e de ao menos um documento funcionando (documento abre via signed URL, foto aparece via URL pública). Criar outro reaproveitando um documento já existente (confirma dedup). Testar o botão "Ler documento com IA" com uma foto real de documento (RG/CNH) — confirmar que pré-preenche sem salvar sozinho.

- [ ] **Step 3: Testar `/admin/vendas/nova` no navegador**

Mesma bateria de testes do Step 2, agora na tela de venda — cliente novo e cliente existente, endereço com CEP, upload de documento/foto pós-criação, leitura por IA. Confirmar no Supabase que a `oportunidade` criada tem `etapa_kanban = 'dados_contrato'` direto.

- [ ] **Step 4: Testar `promoverPessoaACliente` (sem tela própria ainda — função pronta pra sub-frente Financeiro usar)**

Criar um arquivo temporário `scripts/testar-promover-cliente.ts` que importa `promoverPessoaACliente` de `src/lib/vendas/clientes.ts` e chama com o `pessoaId`/`unidadeNegocioId` de uma pessoa criada no Step 3, rodar com `npx tsx scripts/testar-promover-cliente.ts`, confirmar no Supabase que `pessoa_papeis` ganhou uma linha `tipo_papel = 'cliente'`, chamar de novo e confirmar idempotência. Apagar o arquivo temporário depois.

- [ ] **Step 5: Atualizar a seção 11 do plano mestre**

Registrar em `docs/PLANO_MESTRE_SISTEMA_ARRUDACRED.md` seção 11 que a sub-frente Cadastro do módulo Vendas está construída e testada (incluindo o escopo ampliado: endereço/CEP, upload de documentos, leitura por IA, foto), com a data e um resumo curto.

- [ ] **Step 6: Commit**

```bash
git add docs/PLANO_MESTRE_SISTEMA_ARRUDACRED.md
git commit -m "docs: registra sub-frente Cadastro do módulo Vendas (ampliada) como construída"
```
