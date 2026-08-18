# Núcleo do Pipeline de Conteúdo Marketing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o núcleo do pipeline de conteúdo (geração → revisão → publicação no WordPress), rodando sem aprovação humana, com circuit breaker de tentativas.

**Architecture (revisado 17/08/2026):** função comum `processarProximaPauta` orquestrando Estrategista, Escritor, Revisor e o adaptador de canal (WordPress) — sem SDK de orquestração externo, reaproveitando o padrão status+tentativas já usado pelo cron de follow-up do WhatsApp. Disparada por rota de cron protegida por `CRON_SECRET`, com lock por matriz reaproveitando `cron_locks` já existente. Cada tick processa uma tentativa completa; reprovação devolve a pauta pro status `pendente` e o próximo tick tenta de novo. (Versão original usava Vercel Workflow SDK — abandonado por incompatibilidade com Node 24, ver spec seção 3.1.)

**Tech Stack:** Next.js 16 / TypeScript, Supabase (Postgres), `@anthropic-ai/sdk` (já instalado, modelo `claude-sonnet-5`), Vitest — sem dependência de orquestração nova.

**Spec:** `docs/superpowers/specs/2026-08-17-pipeline-conteudo-marketing-design.md` e `docs/MODULO_MARKETING_CONTEUDO_ARRUDACRED.md`

## Global Constraints

- Nada fica público sem passar pelo estágio de Revisão antes de Publicação — a ordem das etapas em `processarProximaPauta` nunca inverte isso.
- Nenhuma credencial em texto no repositório — `ANTHROPIC_API_KEY`, credenciais do WordPress e `CRON_SECRET` só via `process.env`.
- Limite de tentativas por pauta é configurável por propriedade (`propriedades_digitais.config_pipeline.max_tentativas`), padrão 3 — nunca hardcoded no código do workflow.
- Nomenclatura em português, seguindo o padrão já usado em `src/lib/motor-fluxo/` (funções, tipos, comentários).
- Cliente Supabase: sempre `createAdminClient()` de `@/lib/supabase/admin` (service_role) — o pipeline roda em cron, sem contexto de usuário logado.
- Cliente Anthropic: singleton lazy-init, mesmo padrão de `src/lib/motor-fluxo/interpretacao-ia.ts` (`obterCliente()`, lança erro se `ANTHROPIC_API_KEY` ausente).

**Escopo desta plan:** só o "Estrategista" que *seleciona* a próxima pauta pendente da fila — *gerar* pautas novas a partir dos eixos da matriz é responsabilidade do Construtor de Matriz de Conteúdo (`MODULO_MARKETING_CONTEUDO_ARRUDACRED.md`, seção 6), ainda não construído; por isso as pautas usadas nos testes/seed manual desta plan são inseridas diretamente no banco. Distribuição multi-canal (GMB/Instagram/Facebook/LinkedIn/Pinterest/Medium) é uma plan separada, fora deste escopo.

---

### Task 1: Migração — tabelas do módulo Marketing

**Files:**
- Create: `supabase/migrations/20260817070000_modulo_marketing_nucleo.sql`

**Interfaces:**
- Produces: tabelas `propriedades_digitais`, `matrizes_conteudo`, `pautas`, `posts`, `checklist_qa_itens` — nomes de coluna usados por todas as tasks seguintes.

- [ ] **Step 1: Escrever a migração**

```sql
-- Núcleo do pipeline de conteúdo Marketing (17/08/2026) — ver
-- docs/MODULO_MARKETING_CONTEUDO_ARRUDACRED.md seção 2 para o desenho completo.
-- Esta migração cobre só as tabelas necessárias pro núcleo geração→revisão→publicação
-- (sem distribuição multi-canal e sem PROSPECTS_BACKLINK, que ficam pra depois).

create table propriedades_digitais (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid references pessoas(id),
  unidade_negocio_id uuid references unidades_negocio(id),
  nome text not null,
  url_base text not null,
  tipo_cms text not null default 'wordpress' check (tipo_cms in ('wordpress')),
  ativo boolean not null default true,
  config_pipeline jsonb not null default '{"max_tentativas": 3, "canais_distribuicao": []}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_propriedade_tem_dono check (pessoa_id is not null or unidade_negocio_id is not null)
);
comment on table propriedades_digitais is
  'Cada site atendido pelo pipeline de conteúdo — do próprio grupo (ArrudaCred, Aetria) ou de clientes externos. Ver MODULO_MARKETING_CONTEUDO_ARRUDACRED.md seção 2.';
comment on column propriedades_digitais.config_pipeline is
  'jsonb: {"max_tentativas": number, "canais_distribuicao": string[]}. max_tentativas é o circuit breaker do workflow (padrão 3).';

create table matrizes_conteudo (
  id uuid primary key default gen_random_uuid(),
  propriedade_id uuid not null references propriedades_digitais(id) on delete cascade,
  nome text not null,
  eixos jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column matrizes_conteudo.eixos is
  'jsonb livre: {"temas": [...], "angulos": [...], "geografias": [...] | null, "sazonalidade": [...]}. Populado pelo Construtor de Matriz de Conteúdo (ainda não construído).';

create table pautas (
  id uuid primary key default gen_random_uuid(),
  matriz_conteudo_id uuid not null references matrizes_conteudo(id) on delete cascade,
  palavra_chave_principal text not null,
  palavras_secundarias jsonb not null default '[]'::jsonb,
  angulo text not null,
  geografia text,
  tipo_conteudo text not null default 'post_padrao'
    check (tipo_conteudo in ('post_padrao', 'post_storytelling', 'pagina_servico', 'pagina_geografica', 'homepage')),
  funil text not null check (funil in ('topo', 'meio', 'fundo')),
  status text not null default 'pendente'
    check (status in ('pendente', 'em_producao', 'publicado', 'rejeitado', 'bloqueada')),
  tentativas int not null default 0,
  motivo_ultima_reprovacao text,
  prioridade_score int not null default 0,
  created_at timestamptz not null default now()
);
comment on column pautas.tipo_conteudo is
  'Catálogo de formatos, MODULO_MARKETING_CONTEUDO_ARRUDACRED.md seção 5.3.';

create table posts (
  id uuid primary key default gen_random_uuid(),
  pauta_id uuid not null references pautas(id),
  propriedade_id uuid not null references propriedades_digitais(id),
  titulo text not null,
  conteudo_html text not null,
  meta_title text not null,
  meta_description text not null,
  slug text not null,
  imagem_destaque_url text,
  score_qa int,
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado', 'falhou')),
  canais jsonb not null default '{}'::jsonb,
  tentativas int not null default 0,
  publicado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on column posts.canais is
  'jsonb por plataforma: {"wordpress": {"rascunho_id", "status", "url"}, "gmb": {...}, ...}. Só "wordpress" é escrito nesta fase (núcleo); as demais chaves são da plan de distribuição multi-canal.';

create table checklist_qa_itens (
  id uuid primary key default gen_random_uuid(),
  propriedade_id uuid not null references propriedades_digitais(id) on delete cascade,
  item text not null,
  peso int not null default 1,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- RLS + auditoria, mesmo padrão do restante do sistema (ver 20260815120000_precos_config_agendas_rls.sql)
alter table propriedades_digitais enable row level security;
create policy admin_acesso_total on propriedades_digitais for all to authenticated using (true) with check (true);
create trigger trg_auditoria_propriedades_digitais
  after insert or update or delete on propriedades_digitais
  for each row execute function fn_auditoria_log();

alter table matrizes_conteudo enable row level security;
create policy admin_acesso_total on matrizes_conteudo for all to authenticated using (true) with check (true);
create trigger trg_auditoria_matrizes_conteudo
  after insert or update or delete on matrizes_conteudo
  for each row execute function fn_auditoria_log();

alter table pautas enable row level security;
create policy admin_acesso_total on pautas for all to authenticated using (true) with check (true);
create trigger trg_auditoria_pautas
  after insert or update or delete on pautas
  for each row execute function fn_auditoria_log();

alter table posts enable row level security;
create policy admin_acesso_total on posts for all to authenticated using (true) with check (true);
create trigger trg_auditoria_posts
  after insert or update or delete on posts
  for each row execute function fn_auditoria_log();

alter table checklist_qa_itens enable row level security;
create policy admin_acesso_total on checklist_qa_itens for all to authenticated using (true) with check (true);
create trigger trg_auditoria_checklist_qa_itens
  after insert or update or delete on checklist_qa_itens
  for each row execute function fn_auditoria_log();

create index idx_pautas_matriz_status on pautas (matriz_conteudo_id, status, prioridade_score desc, created_at);
create index idx_posts_propriedade on posts (propriedade_id, status);
create index idx_checklist_propriedade on checklist_qa_itens (propriedade_id) where ativo;
```

- [ ] **Step 2: Aplicar a migração localmente**

Run: `supabase db reset` (ou `supabase migration up` se preferir não resetar o banco local)
Expected: migração aplica sem erro, as 5 tabelas aparecem em `supabase db diff` como já sincronizadas.

- [ ] **Step 3: Verificar manualmente que as tabelas existem**

Run: `supabase db execute --sql "select table_name from information_schema.tables where table_name in ('propriedades_digitais','matrizes_conteudo','pautas','posts','checklist_qa_itens') order by table_name;"`
Expected: as 5 linhas retornam.

- [ ] **Step 4: Regenerar tipos do Supabase**

Run: `pnpm db:types`
Expected: `src/lib/supabase/database.types.ts` atualizado com as novas tabelas, sem erros.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260817070000_modulo_marketing_nucleo.sql src/lib/supabase/database.types.ts
git commit -m "feat(marketing): tabelas do núcleo do pipeline de conteúdo"
```

---

### Task 2: Tipos compartilhados

**Files:**
- Create: `src/lib/marketing/tipos.ts`

**Interfaces:**
- Consumes: nenhum (tipos puros)
- Produces: `PautaCarregada`, `ItemChecklistCarregado`, `PropriedadeCarregada`, `ConteudoGerado`, `ResultadoRevisao`, `TipoConteudo` — usados por todas as tasks seguintes.

- [ ] **Step 1: Criar o arquivo de tipos**

```typescript
// src/lib/marketing/tipos.ts
// Tipos compartilhados do núcleo do pipeline de conteúdo — ver
// docs/MODULO_MARKETING_CONTEUDO_ARRUDACRED.md seção 2 para o desenho das entidades.

export type TipoConteudo = "post_padrao" | "post_storytelling" | "pagina_servico" | "pagina_geografica" | "homepage";
export type FunilPauta = "topo" | "meio" | "fundo";
export type StatusPauta = "pendente" | "em_producao" | "publicado" | "rejeitado" | "bloqueada";
export type StatusPost = "rascunho" | "publicado" | "falhou";

export type PautaCarregada = {
  id: string;
  matrizConteudoId: string;
  palavraChavePrincipal: string;
  palavrasSecundarias: string[];
  angulo: string;
  geografia: string | null;
  tipoConteudo: TipoConteudo;
  funil: FunilPauta;
  status: StatusPauta;
  tentativas: number;
  motivoUltimaReprovacao: string | null;
};

export type ItemChecklistCarregado = {
  id: string;
  item: string;
  peso: number;
};

export type PropriedadeCarregada = {
  id: string;
  nome: string;
  urlBase: string;
  tipoCms: "wordpress";
  maxTentativas: number;
};

/** Saída do Escritor — o rascunho completo antes de qualquer revisão. */
export type ConteudoGerado = {
  titulo: string;
  conteudoHtml: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
};

/** Saída do Revisor. */
export type ResultadoRevisao = {
  aprovado: boolean;
  score: number;
  motivo: string | null;
};

export type PostCriado = {
  id: string;
  pautaId: string;
  propriedadeId: string;
  status: StatusPost;
};
```

- [ ] **Step 2: Verificar que compila**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros relacionados a `src/lib/marketing/tipos.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/marketing/tipos.ts
git commit -m "feat(marketing): tipos compartilhados do pipeline de conteúdo"
```

---

### Task 3: Repositório — pauta, checklist e posts

**Files:**
- Create: `src/lib/marketing/repositorio.ts`
- Test: `src/lib/marketing/repositorio.test.ts`

**Interfaces:**
- Consumes: tipos de `./tipos` (Task 2), `createAdminClient` de `@/lib/supabase/admin`
- Produces: `selecionarProximaPautaPendente(matrizId)`, `carregarPropriedade(propriedadeId)`, `carregarChecklistAtivo(propriedadeId)`, `marcarPautaEmProducao(pautaId)`, `registrarReprovacaoPauta(pautaId, motivo)`, `marcarPautaBloqueada(pautaId, motivo)`, `criarPost(dados)`, `atualizarStatusPost(postId, status, extra?)` — usados pelas Tasks 4-9.

Este repositório fala direto com o Supabase — a lógica pura (nenhuma) fica nas próprias funções de step. Como toda função aqui faz I/O de banco, os testes usam um cliente Supabase real apontando pro banco local (mesmo padrão que o resto do projeto já usa para testes de integração — não há mock de Supabase no codebase hoje).

- [ ] **Step 1: Escrever o teste de `selecionarProximaPautaPendente`**

```typescript
// src/lib/marketing/repositorio.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { selecionarProximaPautaPendente } from "./repositorio";

async function criarPropriedadeDeTeste() {
  const supabase = createAdminClient();
  const { data: pessoa } = await supabase
    .from("pessoas")
    .insert({ tipo_pessoa: "pj", nome_razao_social: "Propriedade Teste", documento: `teste-${Date.now()}` })
    .select("id")
    .single();
  const { data: propriedade } = await supabase
    .from("propriedades_digitais")
    .insert({ pessoa_id: pessoa!.id, nome: "Site Teste", url_base: "https://teste.exemplo.com" })
    .select("id")
    .single();
  const { data: matriz } = await supabase
    .from("matrizes_conteudo")
    .insert({ propriedade_id: propriedade!.id, nome: "Matriz Teste" })
    .select("id")
    .single();
  return { propriedadeId: propriedade!.id as string, matrizId: matriz!.id as string };
}

describe("selecionarProximaPautaPendente", () => {
  it("retorna a pauta pendente de maior prioridade, ignorando as em produção/publicadas", async () => {
    const { matrizId } = await criarPropriedadeDeTeste();
    const supabase = createAdminClient();

    await supabase.from("pautas").insert([
      {
        matriz_conteudo_id: matrizId,
        palavra_chave_principal: "pauta baixa prioridade",
        angulo: "informacional_direto",
        funil: "topo",
        status: "pendente",
        prioridade_score: 10,
      },
      {
        matriz_conteudo_id: matrizId,
        palavra_chave_principal: "pauta alta prioridade",
        angulo: "urgencia_temporal",
        funil: "fundo",
        status: "pendente",
        prioridade_score: 90,
      },
      {
        matriz_conteudo_id: matrizId,
        palavra_chave_principal: "pauta já em produção",
        angulo: "mito_ou_verdade",
        funil: "meio",
        status: "em_producao",
        prioridade_score: 100,
      },
    ]);

    const selecionada = await selecionarProximaPautaPendente(matrizId);

    expect(selecionada?.palavraChavePrincipal).toBe("pauta alta prioridade");
  });

  it("retorna null quando não há pauta pendente", async () => {
    const { matrizId } = await criarPropriedadeDeTeste();
    const selecionada = await selecionarProximaPautaPendente(matrizId);
    expect(selecionada).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm test repositorio`
Expected: FAIL — `selecionarProximaPautaPendente` não existe em `./repositorio`.

- [ ] **Step 3: Implementar o repositório**

```typescript
// src/lib/marketing/repositorio.ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ConteudoGerado,
  ItemChecklistCarregado,
  PautaCarregada,
  PostCriado,
  PropriedadeCarregada,
  StatusPost,
} from "./tipos";

export async function selecionarProximaPautaPendente(matrizConteudoId: string): Promise<PautaCarregada | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pautas")
    .select(
      "id, matriz_conteudo_id, palavra_chave_principal, palavras_secundarias, angulo, geografia, tipo_conteudo, funil, status, tentativas, motivo_ultima_reprovacao",
    )
    .eq("matriz_conteudo_id", matrizConteudoId)
    .eq("status", "pendente")
    .order("prioridade_score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Falha ao selecionar próxima pauta: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    matrizConteudoId: data.matriz_conteudo_id,
    palavraChavePrincipal: data.palavra_chave_principal,
    palavrasSecundarias: (data.palavras_secundarias as string[]) ?? [],
    angulo: data.angulo,
    geografia: data.geografia,
    tipoConteudo: data.tipo_conteudo,
    funil: data.funil,
    status: data.status,
    tentativas: data.tentativas,
    motivoUltimaReprovacao: data.motivo_ultima_reprovacao,
  };
}

export async function carregarPropriedade(propriedadeId: string): Promise<PropriedadeCarregada> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("propriedades_digitais")
    .select("id, nome, url_base, tipo_cms, config_pipeline")
    .eq("id", propriedadeId)
    .single();

  if (error || !data) throw new Error(`Falha ao carregar propriedade ${propriedadeId}: ${error?.message ?? "não encontrada"}`);

  const config = data.config_pipeline as { max_tentativas?: number };
  return {
    id: data.id,
    nome: data.nome,
    urlBase: data.url_base,
    tipoCms: data.tipo_cms,
    maxTentativas: config.max_tentativas ?? 3,
  };
}

export async function carregarChecklistAtivo(propriedadeId: string): Promise<ItemChecklistCarregado[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("checklist_qa_itens")
    .select("id, item, peso")
    .eq("propriedade_id", propriedadeId)
    .eq("ativo", true);

  if (error) throw new Error(`Falha ao carregar checklist da propriedade ${propriedadeId}: ${error.message}`);
  return (data ?? []).map((linha) => ({ id: linha.id, item: linha.item, peso: linha.peso }));
}

export async function marcarPautaEmProducao(pautaId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("pautas").update({ status: "em_producao" }).eq("id", pautaId);
  if (error) throw new Error(`Falha ao marcar pauta ${pautaId} em produção: ${error.message}`);
}

export async function registrarReprovacaoPauta(pautaId: string, motivo: string): Promise<void> {
  const supabase = createAdminClient();
  const { data, error: erroLeitura } = await supabase.from("pautas").select("tentativas").eq("id", pautaId).single();
  if (erroLeitura || !data) throw new Error(`Falha ao ler tentativas da pauta ${pautaId}: ${erroLeitura?.message}`);

  const { error } = await supabase
    .from("pautas")
    .update({ status: "pendente", tentativas: data.tentativas + 1, motivo_ultima_reprovacao: motivo })
    .eq("id", pautaId);
  if (error) throw new Error(`Falha ao registrar reprovação da pauta ${pautaId}: ${error.message}`);
}

export async function marcarPautaBloqueada(pautaId: string, motivo: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("pautas")
    .update({ status: "bloqueada", motivo_ultima_reprovacao: motivo })
    .eq("id", pautaId);
  if (error) throw new Error(`Falha ao bloquear pauta ${pautaId}: ${error.message}`);
}

export async function criarPost(params: {
  pautaId: string;
  propriedadeId: string;
  conteudo: ConteudoGerado;
  scoreQa: number;
}): Promise<PostCriado> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("posts")
    .insert({
      pauta_id: params.pautaId,
      propriedade_id: params.propriedadeId,
      titulo: params.conteudo.titulo,
      conteudo_html: params.conteudo.conteudoHtml,
      meta_title: params.conteudo.metaTitle,
      meta_description: params.conteudo.metaDescription,
      slug: params.conteudo.slug,
      score_qa: params.scoreQa,
      status: "rascunho",
    })
    .select("id, pauta_id, propriedade_id, status")
    .single();

  if (error || !data) throw new Error(`Falha ao criar post para pauta ${params.pautaId}: ${error?.message}`);
  return { id: data.id, pautaId: data.pauta_id, propriedadeId: data.propriedade_id, status: data.status };
}

export async function atualizarStatusPost(
  postId: string,
  status: StatusPost,
  extra?: { canais?: Record<string, unknown>; publicadoEm?: string },
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("posts")
    .update({
      status,
      ...(extra?.canais ? { canais: extra.canais } : {}),
      ...(extra?.publicadoEm ? { publicado_em: extra.publicadoEm } : {}),
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", postId);
  if (error) throw new Error(`Falha ao atualizar status do post ${postId}: ${error.message}`);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm test repositorio`
Expected: PASS — os 2 testes de `selecionarProximaPautaPendente`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/marketing/repositorio.ts src/lib/marketing/repositorio.test.ts
git commit -m "feat(marketing): repositório de pautas, checklist e posts"
```

---

### Task 4: Estrategista — seleção de pauta

**Files:**
- Create: `src/lib/marketing/estrategista.ts`
- Test: `src/lib/marketing/estrategista.test.ts`

**Interfaces:**
- Consumes: `selecionarProximaPautaPendente`, `marcarPautaEmProducao` de `./repositorio` (Task 3)
- Produces: `selecionarPauta(matrizConteudoId: string): Promise<PautaCarregada | null>` — usado pelo workflow (Task 8)

- [ ] **Step 1: Escrever o teste**

```typescript
// src/lib/marketing/estrategista.test.ts
import { describe, expect, it, vi } from "vitest";
import { selecionarPauta } from "./estrategista";
import * as repositorio from "./repositorio";

describe("selecionarPauta", () => {
  it("seleciona a pauta pendente e marca como em produção", async () => {
    const pautaFalsa = {
      id: "pauta-1",
      matrizConteudoId: "matriz-1",
      palavraChavePrincipal: "limpar nome serasa",
      palavrasSecundarias: [],
      angulo: "passo_a_passo",
      geografia: null,
      tipoConteudo: "post_padrao" as const,
      funil: "topo" as const,
      status: "pendente" as const,
      tentativas: 0,
      motivoUltimaReprovacao: null,
    };
    vi.spyOn(repositorio, "selecionarProximaPautaPendente").mockResolvedValue(pautaFalsa);
    const marcarSpy = vi.spyOn(repositorio, "marcarPautaEmProducao").mockResolvedValue(undefined);

    const resultado = await selecionarPauta("matriz-1");

    expect(resultado).toEqual(pautaFalsa);
    expect(marcarSpy).toHaveBeenCalledWith("pauta-1");
  });

  it("retorna null sem marcar nada quando não há pauta pendente", async () => {
    vi.spyOn(repositorio, "selecionarProximaPautaPendente").mockResolvedValue(null);
    const marcarSpy = vi.spyOn(repositorio, "marcarPautaEmProducao").mockResolvedValue(undefined);

    const resultado = await selecionarPauta("matriz-1");

    expect(resultado).toBeNull();
    expect(marcarSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm test estrategista`
Expected: FAIL — `./estrategista` não existe.

- [ ] **Step 3: Implementar**

```typescript
// src/lib/marketing/estrategista.ts
// Estágio 1 (parte 1) do pipeline — escolhe a próxima pauta pendente da fila.
// Gerar pautas NOVAS a partir dos eixos da matriz é responsabilidade do Construtor de Matriz de
// Conteúdo (ainda não construído, ver MODULO_MARKETING_CONTEUDO_ARRUDACRED.md seção 6) — aqui só
// consumimos o que já está na fila.

import "server-only";
import { marcarPautaEmProducao, selecionarProximaPautaPendente } from "./repositorio";
import type { PautaCarregada } from "./tipos";

export async function selecionarPauta(matrizConteudoId: string): Promise<PautaCarregada | null> {
  const pauta = await selecionarProximaPautaPendente(matrizConteudoId);
  if (!pauta) return null;

  await marcarPautaEmProducao(pauta.id);
  return pauta;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm test estrategista`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/marketing/estrategista.ts src/lib/marketing/estrategista.test.ts
git commit -m "feat(marketing): Estrategista seleciona próxima pauta da fila"
```

---

### Task 5: Escritor — geração de conteúdo

**Files:**
- Create: `src/lib/marketing/escritor.ts`
- Test: `src/lib/marketing/escritor.test.ts`

**Interfaces:**
- Consumes: `PautaCarregada`, `ItemChecklistCarregado`, `ConteudoGerado` de `./tipos` (Task 2)
- Produces: `gerarConteudo(pauta: PautaCarregada, checklist: ItemChecklistCarregado[]): Promise<ConteudoGerado>` — usado pelo workflow (Task 8)

- [ ] **Step 1: Escrever o teste**

```typescript
// src/lib/marketing/escritor.test.ts
import { describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { gerarConteudo } from "./escritor";
import type { ItemChecklistCarregado, PautaCarregada } from "./tipos";

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  return { default: vi.fn(function () { return { messages: { create } }; }) };
});

const pauta: PautaCarregada = {
  id: "pauta-1",
  matrizConteudoId: "matriz-1",
  palavraChavePrincipal: "limpar nome serasa",
  palavrasSecundarias: ["tirar nome do serasa"],
  angulo: "passo_a_passo",
  geografia: null,
  tipoConteudo: "post_padrao",
  funil: "topo",
  status: "em_producao",
  tentativas: 0,
  motivoUltimaReprovacao: null,
};

const checklist: ItemChecklistCarregado[] = [
  { id: "1", item: "H1 com a palavra-chave principal", peso: 10 },
  { id: "2", item: "Mínimo 1.800 palavras", peso: 10 },
];

describe("gerarConteudo", () => {
  it("monta o prompt com a pauta e o checklist, e retorna o conteúdo estruturado da ferramenta", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          input: {
            titulo: "Como Limpar o Nome no Serasa: Passo a Passo Completo",
            conteudo_html: "<h1>Como Limpar o Nome no Serasa</h1><p>...</p>".repeat(50),
            meta_title: "Como Limpar Nome no Serasa | Passo a Passo",
            meta_description: "Aprenda o passo a passo completo para limpar seu nome no Serasa em 2026.",
            slug: "como-limpar-nome-serasa",
          },
        },
      ],
    });

    const resultado = await gerarConteudo(pauta, checklist);

    expect(resultado.titulo).toContain("Serasa");
    expect(resultado.slug).toBe("como-limpar-nome-serasa");
    const argumentosChamada = mockCreate.mock.calls[0][0];
    expect(argumentosChamada.messages[0].content).toContain("limpar nome serasa");
    expect(argumentosChamada.messages[0].content).toContain("H1 com a palavra-chave principal");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm test escritor`
Expected: FAIL — `./escritor` não existe.

- [ ] **Step 3: Implementar**

```typescript
// src/lib/marketing/escritor.ts
// Estágio 1 (parte 2) do pipeline — gera o rascunho completo seguindo o checklist da propriedade.
// Mesmo padrão de cliente/ferramenta de src/lib/motor-fluxo/interpretacao-ia.ts, modelo Sonnet
// porque qualidade de escrita é crítica (diferente da classificação simples que usa Haiku).

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ConteudoGerado, ItemChecklistCarregado, PautaCarregada } from "./tipos";

const MODELO_ESCRITOR = "claude-sonnet-5";

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

const FERRAMENTA_ESCRITOR = {
  name: "registrar_conteudo",
  description: "Registra o rascunho completo do post gerado.",
  input_schema: {
    type: "object" as const,
    properties: {
      titulo: { type: "string", description: "Título do post (vira o H1)." },
      conteudo_html: { type: "string", description: "Corpo completo do post em HTML, incluindo headings, FAQ com Schema FAQPage embutido em JSON-LD, e CTA." },
      meta_title: { type: "string", description: "50-60 caracteres, contém a palavra-chave principal." },
      meta_description: { type: "string", description: "130-155 caracteres, contém CTA." },
      slug: { type: "string", description: "Slug em kebab-case, sem acentos, derivado da palavra-chave principal." },
    },
    required: ["titulo", "conteudo_html", "meta_title", "meta_description", "slug"],
  },
};

function montarPrompt(pauta: PautaCarregada, checklist: ItemChecklistCarregado[]): string {
  const linhasChecklist = checklist.map((c) => `- ${c.item}`).join("\n");
  const linhas = [
    "Você é o Agente Escritor de um pipeline de geração de conteúdo para blog, otimizado tanto para SEO tradicional quanto para citação por IAs (AEO/GEO).",
    "",
    `Palavra-chave principal: ${pauta.palavraChavePrincipal}`,
    pauta.palavrasSecundarias.length ? `Palavras secundárias: ${pauta.palavrasSecundarias.join(", ")}` : "",
    `Ângulo: ${pauta.angulo}`,
    pauta.geografia ? `Geografia: ${pauta.geografia}` : "",
    `Funil: ${pauta.funil}`,
    `Formato: ${pauta.tipoConteudo}`,
    "",
    "Checklist de qualidade obrigatório — todo item precisa ser atendido:",
    linhasChecklist,
    "",
    "Regra adicional de citabilidade por IA: logo abaixo de cada H2, inclua uma resposta direta e extraível de 40-60 palavras antes de aprofundar — é a técnica mais concreta para aumentar a chance de citação por ChatGPT/Perplexity/Gemini.",
    "",
    "Use a ferramenta para registrar o resultado.",
  ];
  return linhas.filter(Boolean).join("\n");
}

export async function gerarConteudo(pauta: PautaCarregada, checklist: ItemChecklistCarregado[]): Promise<ConteudoGerado> {
  const cliente = obterCliente();
  const prompt = montarPrompt(pauta, checklist);

  const resposta = await cliente.messages.create({
    model: MODELO_ESCRITOR,
    max_tokens: 8000,
    tools: [FERRAMENTA_ESCRITOR],
    tool_choice: { type: "tool", name: "registrar_conteudo" },
    messages: [{ role: "user", content: prompt }],
  });

  const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
  if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") {
    throw new Error("Escritor não retornou conteúdo estruturado.");
  }

  const bruta = blocoFerramenta.input as {
    titulo: string;
    conteudo_html: string;
    meta_title: string;
    meta_description: string;
    slug: string;
  };

  return {
    titulo: bruta.titulo,
    conteudoHtml: bruta.conteudo_html,
    metaTitle: bruta.meta_title,
    metaDescription: bruta.meta_description,
    slug: bruta.slug,
  };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm test escritor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/marketing/escritor.ts src/lib/marketing/escritor.test.ts
git commit -m "feat(marketing): Escritor gera rascunho completo via Claude"
```

---

### Task 6: Revisor — validação de qualidade

**Files:**
- Create: `src/lib/marketing/revisor.ts`
- Test: `src/lib/marketing/revisor.test.ts`

**Interfaces:**
- Consumes: `ConteudoGerado`, `ItemChecklistCarregado`, `ResultadoRevisao` de `./tipos` (Task 2)
- Produces: `revisarConteudo(conteudo: ConteudoGerado, checklist: ItemChecklistCarregado[]): Promise<ResultadoRevisao>` — usado pelo workflow (Task 8)

- [ ] **Step 1: Escrever o teste**

```typescript
// src/lib/marketing/revisor.test.ts
import { describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { revisarConteudo } from "./revisor";
import type { ConteudoGerado, ItemChecklistCarregado } from "./tipos";

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  return { default: vi.fn(function () { return { messages: { create } }; }) };
});

const conteudo: ConteudoGerado = {
  titulo: "Como Limpar o Nome no Serasa",
  conteudoHtml: "<h1>...</h1>".repeat(20),
  metaTitle: "Como Limpar Nome no Serasa",
  metaDescription: "Guia completo.",
  slug: "como-limpar-nome-serasa",
};

const checklist: ItemChecklistCarregado[] = [{ id: "1", item: "Mínimo 1.800 palavras", peso: 10 }];

describe("revisarConteudo", () => {
  it("aprova quando o score é >= 80", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue({
      content: [{ type: "tool_use", input: { score: 90, motivo: null } }],
    });

    const resultado = await revisarConteudo(conteudo, checklist);

    expect(resultado.aprovado).toBe(true);
    expect(resultado.score).toBe(90);
  });

  it("reprova quando o score é < 80 e exige motivo", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const clienteFalso = new Anthropic({ apiKey: "sk-test" });
    const mockCreate = clienteFalso.messages.create as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValue({
      content: [{ type: "tool_use", input: { score: 60, motivo: "Faltam links externos para fontes oficiais." } }],
    });

    const resultado = await revisarConteudo(conteudo, checklist);

    expect(resultado.aprovado).toBe(false);
    expect(resultado.motivo).toBe("Faltam links externos para fontes oficiais.");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm test revisor`
Expected: FAIL — `./revisor` não existe.

- [ ] **Step 3: Implementar**

```typescript
// src/lib/marketing/revisor.ts
// Estágio 2 do pipeline — valida o rascunho contra o checklist da propriedade + checagem de
// alucinação factual, score mínimo 80/100 (mesmo padrão do plano original da QMARKA).

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ConteudoGerado, ItemChecklistCarregado, ResultadoRevisao } from "./tipos";

const MODELO_REVISOR = "claude-sonnet-5";
const SCORE_MINIMO_APROVACAO = 80;

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

const FERRAMENTA_REVISOR = {
  name: "registrar_revisao",
  description: "Registra o resultado da revisão de qualidade do rascunho.",
  input_schema: {
    type: "object" as const,
    properties: {
      score: { type: "number", description: "Score de 0 a 100, ponderado pelo peso de cada item do checklist." },
      motivo: {
        type: "string",
        description: "Obrigatório quando score < 80: explica especificamente o que falhou, para o Escritor corrigir na próxima tentativa. Null quando score >= 80.",
      },
    },
    required: ["score"],
  },
};

function montarPrompt(conteudo: ConteudoGerado, checklist: ItemChecklistCarregado[]): string {
  const linhasChecklist = checklist.map((c) => `- (peso ${c.peso}) ${c.item}`).join("\n");
  return [
    "Você é o Agente QA/Revisor de um pipeline de geração de conteúdo. Avalie o rascunho abaixo contra o checklist, incluindo checagem de alucinação factual (dados numéricos citados precisam ser plausíveis, não inventados). Score mínimo para aprovação: 80/100.",
    "",
    "Checklist:",
    linhasChecklist,
    "",
    `Título: ${conteudo.titulo}`,
    `Meta title: ${conteudo.metaTitle}`,
    `Meta description: ${conteudo.metaDescription}`,
    `Conteúdo HTML:\n"""\n${conteudo.conteudoHtml}\n"""`,
    "",
    "Use a ferramenta para registrar o resultado. Se o score for menor que 80, o campo motivo é obrigatório e precisa ser específico o suficiente para o Escritor corrigir.",
  ].join("\n");
}

export async function revisarConteudo(conteudo: ConteudoGerado, checklist: ItemChecklistCarregado[]): Promise<ResultadoRevisao> {
  const cliente = obterCliente();
  const prompt = montarPrompt(conteudo, checklist);

  const resposta = await cliente.messages.create({
    model: MODELO_REVISOR,
    max_tokens: 1000,
    tools: [FERRAMENTA_REVISOR],
    tool_choice: { type: "tool", name: "registrar_revisao" },
    messages: [{ role: "user", content: prompt }],
  });

  const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
  if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") {
    throw new Error("Revisor não retornou resultado estruturado.");
  }

  const bruta = blocoFerramenta.input as { score: number; motivo?: string | null };
  const aprovado = bruta.score >= SCORE_MINIMO_APROVACAO;

  return { aprovado, score: bruta.score, motivo: aprovado ? null : (bruta.motivo ?? "Score abaixo do mínimo, sem motivo detalhado.") };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm test revisor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/marketing/revisor.ts src/lib/marketing/revisor.test.ts
git commit -m "feat(marketing): Revisor valida rascunho contra checklist"
```

---

### Task 7: Adaptador WordPress

**Files:**
- Create: `src/lib/marketing/canais/tipos.ts`
- Create: `src/lib/marketing/canais/wordpress.ts`
- Test: `src/lib/marketing/canais/wordpress.test.ts`

**Interfaces:**
- Consumes: `ConteudoGerado` de `../tipos` (Task 2)
- Produces: `AdaptadorCanal` interface, `criarAdaptadorWordPress(urlBase: string): AdaptadorCanal` — usado pelo workflow (Task 8)

- [ ] **Step 1: Criar o contrato do adaptador**

```typescript
// src/lib/marketing/canais/tipos.ts
// Contrato comum de canal de distribuição — mesmo princípio do adaptador de canal de atendimento
// já usado em src/lib/whatsapp/enviar.ts: tradução fina entre um formato canal-agnóstico e a API
// específica de cada provedor.

export type ConteudoCanal = {
  titulo: string;
  corpoHtml: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
};

export type ResultadoRascunho = { idRemoto: string; status: "rascunho" | "falhou" };
export type ResultadoVerificacao = { ok: boolean; detalhes?: string };
export type ResultadoPublicacao = { urlPublicada: string };

export interface AdaptadorCanal {
  criarRascunho(conteudo: ConteudoCanal): Promise<ResultadoRascunho>;
  verificarRascunho(idRemoto: string): Promise<ResultadoVerificacao>;
  aprovarPublicar(idRemoto: string): Promise<ResultadoPublicacao>;
}
```

- [ ] **Step 2: Escrever o teste do adaptador WordPress**

```typescript
// src/lib/marketing/canais/wordpress.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { criarAdaptadorWordPress } from "./wordpress";
import type { ConteudoCanal } from "./tipos";

const conteudo: ConteudoCanal = {
  titulo: "Como Limpar o Nome no Serasa",
  corpoHtml: "<h1>Como Limpar o Nome no Serasa</h1><p>...</p>",
  slug: "como-limpar-nome-serasa",
  metaTitle: "Como Limpar Nome no Serasa",
  metaDescription: "Guia completo.",
};

describe("criarAdaptadorWordPress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("criarRascunho chama a REST API com status draft e retorna o id remoto", async () => {
    process.env.WORDPRESS_USUARIO = "claude-conteudo";
    process.env.WORDPRESS_SENHA_APP = "senha-app-teste";
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 123, status: "draft" }),
    });
    vi.stubGlobal("fetch", fetchFalso);

    const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com");
    const resultado = await adaptador.criarRascunho(conteudo);

    expect(resultado).toEqual({ idRemoto: "123", status: "rascunho" });
    const [url, opcoes] = fetchFalso.mock.calls[0];
    expect(url).toBe("https://teste.exemplo.com/wp-json/wp/v2/posts");
    expect(opcoes.method).toBe("POST");
    const corpo = JSON.parse(opcoes.body);
    expect(corpo.status).toBe("draft");
    expect(corpo.slug).toBe("como-limpar-nome-serasa");
    expect(opcoes.headers.Authorization).toContain("Basic ");
  });

  it("aprovarPublicar atualiza o status para publish e retorna a URL", async () => {
    process.env.WORDPRESS_USUARIO = "claude-conteudo";
    process.env.WORDPRESS_SENHA_APP = "senha-app-teste";
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 123, status: "publish", link: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
    });
    vi.stubGlobal("fetch", fetchFalso);

    const adaptador = criarAdaptadorWordPress("https://teste.exemplo.com");
    const resultado = await adaptador.aprovarPublicar("123");

    expect(resultado).toEqual({ urlPublicada: "https://teste.exemplo.com/como-limpar-nome-serasa/" });
    const [, opcoes] = fetchFalso.mock.calls[0];
    expect(JSON.parse(opcoes.body).status).toBe("publish");
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `pnpm test wordpress`
Expected: FAIL — `./wordpress` não existe.

- [ ] **Step 4: Implementar o adaptador**

```typescript
// src/lib/marketing/canais/wordpress.ts
import "server-only";
import type { AdaptadorCanal, ConteudoCanal, ResultadoPublicacao, ResultadoRascunho, ResultadoVerificacao } from "./tipos";

function credenciaisBasicAuth(): string {
  const usuario = process.env.WORDPRESS_USUARIO;
  const senha = process.env.WORDPRESS_SENHA_APP;
  if (!usuario || !senha) throw new Error("WORDPRESS_USUARIO/WORDPRESS_SENHA_APP não configuradas.");
  return Buffer.from(`${usuario}:${senha}`).toString("base64");
}

export function criarAdaptadorWordPress(urlBase: string): AdaptadorCanal {
  const baseApi = `${urlBase.replace(/\/$/, "")}/wp-json/wp/v2`;

  async function chamarApi(caminho: string, corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resposta = await fetch(`${baseApi}${caminho}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credenciaisBasicAuth()}`,
      },
      body: JSON.stringify(corpo),
    });
    if (!resposta.ok) throw new Error(`WordPress REST API respondeu ${resposta.status} em ${caminho}`);
    return resposta.json();
  }

  return {
    async criarRascunho(conteudo: ConteudoCanal): Promise<ResultadoRascunho> {
      const post = await chamarApi("/posts", {
        title: conteudo.titulo,
        content: conteudo.corpoHtml,
        slug: conteudo.slug,
        status: "draft",
        meta: { _yoast_wpseo_title: conteudo.metaTitle, _yoast_wpseo_metadesc: conteudo.metaDescription },
      });
      return { idRemoto: String(post.id), status: "rascunho" };
    },

    async verificarRascunho(idRemoto: string): Promise<ResultadoVerificacao> {
      const resposta = await fetch(`${baseApi}/posts/${idRemoto}`, {
        headers: { Authorization: `Basic ${credenciaisBasicAuth()}` },
      });
      if (!resposta.ok) return { ok: false, detalhes: `REST API respondeu ${resposta.status}` };
      const post = (await resposta.json()) as { status: string; content?: { rendered?: string } };
      const temConteudo = Boolean(post.content?.rendered?.length);
      return temConteudo ? { ok: true } : { ok: false, detalhes: "Rascunho sem conteúdo renderizado." };
    },

    async aprovarPublicar(idRemoto: string): Promise<ResultadoPublicacao> {
      const post = await chamarApi(`/posts/${idRemoto}`, { status: "publish" });
      return { urlPublicada: String(post.link) };
    },
  };
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `pnpm test wordpress`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/marketing/canais/
git commit -m "feat(marketing): adaptador de canal WordPress"
```

---

### Task 8: Processador de pauta — geração até publicação (revisado 17/08/2026, sem Workflow SDK)

> **Substitui a versão anterior desta task**, que usava o Vercel Workflow SDK. Na implementação real, o empacotamento de steps do SDK esbarrou numa incompatibilidade entre Node 24 e uma dependência transitiva (`builtin-modules`, `ERR_IMPORT_ATTRIBUTE_MISSING`) sem correção viável sem mudar a versão de Node do projeto/Vercel — mudança que afetaria todos os módulos já em produção, não só este. Decisão de Luiz (17/08/2026): migrar pra uma função comum, sem dependência nova, reaproveitando o mesmo padrão status+tentativas que os repositórios da Task 3 já implementavam desde o início (nenhum deles era específico do SDK) — mesmo espírito do cron de follow-up do WhatsApp (`src/lib/motor-fluxo/motor-followup.ts`), já validado em produção. Ver `docs/superpowers/specs/2026-08-17-pipeline-conteudo-marketing-design.md` seção 3.1 pro raciocínio completo.

**Files:**
- Modify: `src/lib/marketing/repositorio.ts` (adicionar `marcarPautaPublicada`)
- Modify: `src/lib/marketing/repositorio.test.ts` (teste da função nova)
- Create: `src/lib/marketing/processar-pauta.ts`
- Test: `src/lib/marketing/processar-pauta.test.ts`

**Interfaces:**
- Consumes: `selecionarPauta` (Task 4), `gerarConteudo` (Task 5), `revisarConteudo` (Task 6), `criarAdaptadorWordPress` (Task 7), `carregarPropriedade`/`carregarChecklistAtivo`/`criarPost`/`atualizarStatusPost`/`registrarReprovacaoPauta`/`marcarPautaBloqueada`/`marcarPautaPublicada` (Task 3 + esta task)
- Produces: `processarProximaPauta(matrizConteudoId: string, propriedadeId: string)` — usado pela rota de cron (Task 9). Retorna `{ status: "sem_pauta" | "bloqueada" | "reprovado" | "publicado", ... }`.

- [ ] **Step 1: Escrever o teste de `marcarPautaPublicada`**

```typescript
// src/lib/marketing/repositorio.test.ts — acrescentar ao arquivo já existente
describe("marcarPautaPublicada", () => {
  it("marca a pauta como publicada", async () => {
    const { matrizId } = await criarPropriedadeDeTeste();
    const supabase = createAdminClient();
    const { data: pauta } = await supabase
      .from("pautas")
      .insert({
        matriz_conteudo_id: matrizId,
        palavra_chave_principal: "teste publicacao",
        angulo: "informacional_direto",
        funil: "topo",
        status: "em_producao",
      })
      .select("id")
      .single();

    await marcarPautaPublicada(pauta!.id);

    const { data: atualizada } = await supabase.from("pautas").select("status").eq("id", pauta!.id).single();
    expect(atualizada?.status).toBe("publicado");
  });
});
```

(Acrescentar `marcarPautaPublicada` ao import de `./repositorio` no topo do arquivo de teste.)

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm test repositorio`
Expected: FAIL — `marcarPautaPublicada` não existe em `./repositorio`.

- [ ] **Step 3: Implementar `marcarPautaPublicada`**

```typescript
// src/lib/marketing/repositorio.ts — acrescentar ao arquivo já existente, junto das outras funções de marcação de status
export async function marcarPautaPublicada(pautaId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("pautas").update({ status: "publicado" }).eq("id", pautaId);
  if (error) throw new Error(`Falha ao marcar pauta ${pautaId} como publicada: ${error.message}`);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm test repositorio`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/marketing/repositorio.ts src/lib/marketing/repositorio.test.ts
git commit -m "feat(marketing): adiciona marcarPautaPublicada ao repositório"
```

- [ ] **Step 6: Escrever o teste de `processarProximaPauta`**

```typescript
// src/lib/marketing/processar-pauta.test.ts
import { describe, expect, it, vi } from "vitest";
import { processarProximaPauta } from "./processar-pauta";
import * as estrategista from "./estrategista";
import * as escritor from "./escritor";
import * as revisor from "./revisor";
import * as repositorio from "./repositorio";
import { criarAdaptadorWordPress } from "./canais/wordpress";

vi.mock("./canais/wordpress");

const pautaFalsa = {
  id: "pauta-1",
  matrizConteudoId: "matriz-1",
  palavraChavePrincipal: "limpar nome serasa",
  palavrasSecundarias: [],
  angulo: "passo_a_passo",
  geografia: null,
  tipoConteudo: "post_padrao" as const,
  funil: "topo" as const,
  status: "em_producao" as const,
  tentativas: 0,
  motivoUltimaReprovacao: null,
};

const propriedadeFalsa = {
  id: "prop-1",
  nome: "Site Teste",
  urlBase: "https://teste.exemplo.com",
  tipoCms: "wordpress" as const,
  maxTentativas: 3,
};

describe("processarProximaPauta", () => {
  it("publica quando a revisão aprova de primeira", async () => {
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
      titulo: "Como Limpar o Nome no Serasa",
      conteudoHtml: "<h1>...</h1>",
      metaTitle: "Como Limpar Nome no Serasa",
      metaDescription: "Guia completo.",
      slug: "como-limpar-nome-serasa",
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({ aprovado: true, score: 92, motivo: null });
    vi.spyOn(repositorio, "criarPost").mockResolvedValue({ id: "post-1", pautaId: "pauta-1", propriedadeId: "prop-1", status: "rascunho" });
    vi.spyOn(repositorio, "atualizarStatusPost").mockResolvedValue(undefined);
    vi.spyOn(repositorio, "marcarPautaPublicada").mockResolvedValue(undefined);

    const adaptadorFalso = {
      criarRascunho: vi.fn().mockResolvedValue({ idRemoto: "123", status: "rascunho" }),
      verificarRascunho: vi.fn().mockResolvedValue({ ok: true }),
      aprovarPublicar: vi.fn().mockResolvedValue({ urlPublicada: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
    };
    vi.mocked(criarAdaptadorWordPress).mockReturnValue(adaptadorFalso);

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "publicado", url: "https://teste.exemplo.com/como-limpar-nome-serasa/" });
    expect(adaptadorFalso.aprovarPublicar).toHaveBeenCalledWith("123");
  });

  it("reprova sem publicar quando o score da revisão é baixo", async () => {
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
      titulo: "Rascunho fraco",
      conteudoHtml: "<p>curto</p>",
      metaTitle: "x",
      metaDescription: "y",
      slug: "rascunho-fraco",
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({ aprovado: false, score: 40, motivo: "Muito curto." });
    const reprovarSpy = vi.spyOn(repositorio, "registrarReprovacaoPauta").mockResolvedValue(undefined);

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "reprovado", pautaId: "pauta-1" });
    expect(reprovarSpy).toHaveBeenCalledWith("pauta-1", "Muito curto.");
  });

  it("bloqueia sem gerar quando o limite de tentativas já foi esgotado", async () => {
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue({
      ...pautaFalsa,
      tentativas: 3,
      motivoUltimaReprovacao: "Muito curto.",
    });
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    const bloquearSpy = vi.spyOn(repositorio, "marcarPautaBloqueada").mockResolvedValue(undefined);
    const gerarSpy = vi.spyOn(escritor, "gerarConteudo");

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "bloqueada", pautaId: "pauta-1" });
    expect(bloquearSpy).toHaveBeenCalledWith("pauta-1", "Muito curto.");
    expect(gerarSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Rodar o teste e confirmar que falha**

Run: `pnpm test processar-pauta`
Expected: FAIL — `./processar-pauta` não existe.

- [ ] **Step 8: Implementar `processarProximaPauta`**

```typescript
// src/lib/marketing/processar-pauta.ts
// Processa uma tentativa completa (gerar → revisar → publicar) de uma pauta por matriz — ver
// docs/superpowers/specs/2026-08-17-pipeline-conteudo-marketing-design.md seção 3.1. Chamado uma
// vez por tick do cron (Task 9). Nada fica público até a publicação de verdade; reprovação em
// qualquer etapa volta a pauta pro status "pendente" (registrarReprovacaoPauta) — o próximo tick
// do cron re-seleciona a mesma pauta e tenta de novo, sem precisar de máquina de estados própria
// além do que já está no banco (status + tentativas).

import { selecionarPauta } from "./estrategista";
import { gerarConteudo } from "./escritor";
import { revisarConteudo } from "./revisor";
import { criarAdaptadorWordPress } from "./canais/wordpress";
import {
  atualizarStatusPost,
  carregarChecklistAtivo,
  carregarPropriedade,
  criarPost,
  marcarPautaBloqueada,
  marcarPautaPublicada,
  registrarReprovacaoPauta,
} from "./repositorio";

export async function processarProximaPauta(matrizConteudoId: string, propriedadeId: string) {
  const propriedade = await carregarPropriedade(propriedadeId);
  const pauta = await selecionarPauta(matrizConteudoId);
  if (!pauta) return { status: "sem_pauta" as const };

  if (pauta.tentativas >= propriedade.maxTentativas) {
    await marcarPautaBloqueada(pauta.id, pauta.motivoUltimaReprovacao ?? "Limite de tentativas esgotado.");
    return { status: "bloqueada" as const, pautaId: pauta.id };
  }

  const checklist = await carregarChecklistAtivo(propriedadeId);
  const conteudo = await gerarConteudo(pauta, checklist);
  const revisao = await revisarConteudo(conteudo, checklist);

  if (!revisao.aprovado) {
    await registrarReprovacaoPauta(pauta.id, revisao.motivo ?? "Reprovado sem motivo detalhado.");
    return { status: "reprovado" as const, pautaId: pauta.id };
  }

  const post = await criarPost({ pautaId: pauta.id, propriedadeId, conteudo, scoreQa: revisao.score });
  const adaptador = criarAdaptadorWordPress(propriedade.urlBase);
  const rascunho = await adaptador.criarRascunho({
    titulo: conteudo.titulo,
    corpoHtml: conteudo.conteudoHtml,
    slug: conteudo.slug,
    metaTitle: conteudo.metaTitle,
    metaDescription: conteudo.metaDescription,
  });

  const verificacao = await adaptador.verificarRascunho(rascunho.idRemoto);
  if (!verificacao.ok) {
    await atualizarStatusPost(post.id, "falhou");
    await registrarReprovacaoPauta(pauta.id, verificacao.detalhes ?? "Rascunho não conforme no WordPress.");
    return { status: "reprovado" as const, pautaId: pauta.id };
  }

  const publicado = await adaptador.aprovarPublicar(rascunho.idRemoto);
  await atualizarStatusPost(post.id, "publicado", {
    canais: { wordpress: { rascunho_id: rascunho.idRemoto, status: "publicado", url: publicado.urlPublicada } },
    publicadoEm: new Date().toISOString(),
  });
  await marcarPautaPublicada(pauta.id);

  return { status: "publicado" as const, url: publicado.urlPublicada };
}
```

- [ ] **Step 9: Rodar o teste e confirmar que passa**

Run: `pnpm test processar-pauta`
Expected: PASS — os 3 cenários (publicado, reprovado, bloqueada).

- [ ] **Step 10: Commit**

```bash
git add src/lib/marketing/processar-pauta.ts src/lib/marketing/processar-pauta.test.ts
git commit -m "feat(marketing): processarProximaPauta orquestra geração até publicação sem SDK externo"
```

---

### Task 9: Rota de cron (revisado 17/08/2026 — chama `processarProximaPauta` direto, sem SDK)

**Files:**
- Create: `src/app/api/cron/marketing-pipeline/route.ts`
- Test: `src/app/api/cron/marketing-pipeline/route.test.ts`

**Interfaces:**
- Consumes: `processarProximaPauta` de `@/lib/marketing/processar-pauta` (Task 8), `createAdminClient` de `@/lib/supabase/admin`, `fn_tentar_lock_cron`/`fn_liberar_lock_cron` (RPCs já existentes)

- [ ] **Step 1: Escrever o teste**

```typescript
// src/app/api/cron/marketing-pipeline/route.test.ts
import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { createAdminClient } from "@/lib/supabase/admin";
import * as processarPauta from "@/lib/marketing/processar-pauta";

vi.mock("@/lib/supabase/admin");

function criarSupabaseFalso(matrizes: { id: string; propriedade_id: string }[]) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: matrizes }),
      }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: true }),
  };
}

describe("GET /api/cron/marketing-pipeline", () => {
  it("retorna 401 sem o CRON_SECRET correto", async () => {
    process.env.CRON_SECRET = "segredo-certo";
    const request = new Request("https://x.com/api/cron/marketing-pipeline", {
      headers: { authorization: "Bearer errado" },
    });

    const resposta = await GET(request);

    expect(resposta.status).toBe(401);
  });

  it("processa uma tentativa por matriz ativa, com lock por matriz", async () => {
    process.env.CRON_SECRET = "segredo-certo";
    const supabaseFalso = criarSupabaseFalso([
      { id: "matriz-1", propriedade_id: "prop-1" },
      { id: "matriz-2", propriedade_id: "prop-2" },
    ]);
    vi.mocked(createAdminClient).mockReturnValue(supabaseFalso as never);
    vi.spyOn(processarPauta, "processarProximaPauta").mockResolvedValue({
      status: "publicado",
      url: "https://x.com/post",
    });

    const request = new Request("https://x.com/api/cron/marketing-pipeline", {
      headers: { authorization: "Bearer segredo-certo" },
    });

    const resposta = await GET(request);
    const corpo = await resposta.json();

    expect(corpo.resultados).toEqual({ "matriz-1": "publicado", "matriz-2": "publicado" });
    expect(processarPauta.processarProximaPauta).toHaveBeenCalledTimes(2);
    expect(supabaseFalso.rpc).toHaveBeenCalledWith("fn_tentar_lock_cron", {
      p_id: "marketing-pipeline-matriz-1",
      p_duracao_segundos: 240,
    });
  });

  it("não processa matriz cujo lock já está em uso", async () => {
    process.env.CRON_SECRET = "segredo-certo";
    const supabaseFalso = criarSupabaseFalso([{ id: "matriz-1", propriedade_id: "prop-1" }]);
    supabaseFalso.rpc = vi.fn().mockResolvedValue({ data: false });
    vi.mocked(createAdminClient).mockReturnValue(supabaseFalso as never);
    const processarSpy = vi.spyOn(processarPauta, "processarProximaPauta");

    const request = new Request("https://x.com/api/cron/marketing-pipeline", {
      headers: { authorization: "Bearer segredo-certo" },
    });

    const resposta = await GET(request);
    const corpo = await resposta.json();

    expect(corpo.resultados).toEqual({});
    expect(processarSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm test marketing-pipeline`
Expected: FAIL — `./route` não existe.

- [ ] **Step 3: Implementar a rota**

```typescript
// src/app/api/cron/marketing-pipeline/route.ts
// Gatilho do pipeline de conteúdo, via cron-job.org (Vercel Hobby não libera cron nativo com
// frequência > 1x/dia) — mesmo padrão de src/app/api/cron/followups/route.ts, mas com lock POR
// MATRIZ em vez de lock global: cada matriz roda em paralelo sem travar as outras. Cada tick
// processa uma tentativa completa (gerar→revisar→publicar) de uma pauta por matriz — ver
// docs/superpowers/specs/2026-08-17-pipeline-conteudo-marketing-design.md seção 3.1.

import { createAdminClient } from "@/lib/supabase/admin";
import { processarProximaPauta } from "@/lib/marketing/processar-pauta";

const DURACAO_LOCK_SEGUNDOS = 240; // uma tentativa completa — bem mais curto que o loop inteiro de retries

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (segredo && request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return new Response("Não autorizado", { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: matrizes } = await supabase.from("matrizes_conteudo").select("id, propriedade_id").eq("ativo", true);

  const resultados: Record<string, string> = {};
  for (const matriz of matrizes ?? []) {
    const idLock = `marketing-pipeline-${matriz.id}`;
    const { data: obtido } = await supabase.rpc("fn_tentar_lock_cron", {
      p_id: idLock,
      p_duracao_segundos: DURACAO_LOCK_SEGUNDOS,
    });
    if (!obtido) continue;

    try {
      const resultado = await processarProximaPauta(matriz.id, matriz.propriedade_id);
      resultados[matriz.id] = resultado.status;
    } finally {
      await supabase.rpc("fn_liberar_lock_cron", { p_id: idLock });
    }
  }

  return Response.json({ resultados });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm test marketing-pipeline`
Expected: PASS — os 3 cenários.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/marketing-pipeline/
git commit -m "feat(marketing): rota de cron processa uma tentativa por matriz de conteúdo"
```

---

## Pendências desta plan (fora do escopo deliberadamente)

- **Distribuição multi-canal** (GMB, Instagram, Facebook, LinkedIn, Pinterest, Medium, recorte de imagem por formato) — plan separada, consome o `posts.canais` já preparado no schema desta plan.
- **Construtor de Matriz de Conteúdo** — quem popula `matrizes_conteudo.eixos` e gera `pautas` novas; até lá, pautas são inseridas manualmente no banco para testar o pipeline de ponta a ponta.
- **Navegação/telas de admin** (Marketing → Produção de Conteúdo, Configurações → Marketing → Geração de Conteúdo) — plan de UI separada, consome as tabelas desta plan.
- **`CRON_SECRET` no cron-job.org** — configuração manual de Luiz (fora do código), mesmo processo já usado pro cron de follow-up.
