# Fase 1 — Sistema de Cores por Controlador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O painel de conversa e o badge de estado na lista de contatos refletem visualmente quem está no controle agora (Malala/roxo, não atribuída/verde, atendente específico/cor escolhida por ele), e cada atendente pode escolher sua própria cor numa paleta curada de 7 opções.

**Architecture:** Nova coluna `usuarios_sistema.cor_badge` (paleta fechada via `check`). A view `conversas_resumo` passa a expor o atendente (nome + cor). Um módulo novo `src/lib/motor-fluxo/cores-atendimento.ts` centraliza a paleta (className Tailwind, com variante dark) e a função pura `corControlador()` que decide qual tom usar. `atendimento-client.tsx` consome esse módulo pro badge da lista e pro fundo do painel de conversa, mais um botão novo pra escolher a própria cor.

**Tech Stack:** Next.js 16 (Server Actions), Supabase (Postgres + PostgREST), Tailwind v4 (dark: nativo), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-16-bloco-b-tela-atendimento-design.md` (seção 1).

## Global Constraints

- Paleta fechada em 7 cores: `vermelho, laranja, marrom, rosa, ciano, azul, cinza` — verde e roxo são reservados (não atribuída / Malala), nunca escolhíveis pelo atendente.
- Um atendente só pode mudar a própria cor, nunca a de outro (Server Action deve usar `obterUsuarioSistemaAtual()` internamente, nunca aceitar um `usuarioId` vindo do cliente pra essa ação específica).
- Toda migration nova segue a convenção do projeto: `COMMENT ON` em toda coluna nova (`MODELAGEM_DADOS_ARRUDACRED.md`).
- `pnpm lint`, `pnpm vitest run` e `pnpm build` precisam passar limpos antes de cada commit (convenção do projeto).

---

### Task 1: Migration — coluna `cor_badge` + view `conversas_resumo` atualizada

**Files:**
- Create: `supabase/migrations/20260816050000_cor_badge_atendentes.sql`

**Interfaces:**
- Produces: coluna `usuarios_sistema.cor_badge text` (7 valores possíveis, default `'azul'`); view `conversas_resumo` ganha as colunas `atendente_nome text` e `atendente_cor text` (nulas quando `atendente_id` é nulo).

- [ ] **Step 1: Escrever a migration**

```sql
-- ============================================================================
-- MIGRATION 022 — Cor de badge por atendente (Fase 1 do Bloco B / Tela de Atendimento)
-- Sistema de Gestão ArrudaCred
--
-- Cada atendente humano escolhe uma cor (paleta fechada de 7) que aparece no
-- badge dele na lista de conversas e no fundo do painel quando ele está no
-- controle. Verde (não atribuída) e roxo (Malala) são reservados, não entram
-- nessa paleta — ver docs/superpowers/specs/2026-08-16-bloco-b-tela-atendimento-design.md.
-- ============================================================================

alter table usuarios_sistema
  add column cor_badge text not null default 'azul'
  check (cor_badge in ('vermelho', 'laranja', 'marrom', 'rosa', 'ciano', 'azul', 'cinza'));
comment on column usuarios_sistema.cor_badge is
  'Cor escolhida pelo próprio atendente (paleta fechada de 7) — aparece no badge dele na lista de conversas e no fundo do painel quando ele está no controle. Verde/roxo são reservados pra não-atribuída/Malala, fora desta paleta.';

-- View 006/021 recriada com o atendente (nome + cor) — precisa do CREATE OR REPLACE porque
-- é view, não tabela; colunas novas vão no fim, não quebra quem já consome as colunas antigas.
create or replace view conversas_resumo
  with (security_invoker = true) as
select
  c.id as conversa_id,
  c.pessoa_id,
  c.oportunidade_id,
  c.canal,
  c.status,
  c.sob_supervisor,
  c.atendente_id,
  c.created_at,
  p.nome_razao_social as pessoa_nome,
  p.whatsapp as pessoa_telefone,
  o.etapa_kanban,
  pr.nome as produto_nome,
  um.conteudo as ultima_mensagem_conteudo,
  um.remetente as ultima_mensagem_remetente,
  um.enviado_em as ultima_mensagem_em,
  pa.nome_razao_social as atendente_nome,
  u.cor_badge as atendente_cor
from conversas c
join pessoas p on p.id = c.pessoa_id
left join oportunidades o on o.id = c.oportunidade_id
left join produtos pr on pr.id = o.produto_id
left join lateral (
  select conteudo, remetente, enviado_em
  from mensagens m
  where m.conversa_id = c.id
  order by m.enviado_em desc
  limit 1
) um on true
left join usuarios_sistema u on u.id = c.atendente_id
left join pessoas pa on pa.id = u.pessoa_id;
comment on view conversas_resumo is
  'Lista de contatos da Tela de Atendimento — uma linha por conversa, já com pessoa/oportunidade/produto, a última mensagem trocada, e o atendente atribuído (nome + cor), evitando N+1 query. Só leitura.';

-- ============================================================================
-- Fim da migration 022.
-- ============================================================================
```

- [ ] **Step 2: Validar a sintaxe localmente (sem aplicar — Luiz roda no SQL Editor do Supabase depois)**

Não há banco local — conferir visualmente que o SQL é válido (parênteses balanceados, vírgulas corretas) e que os nomes de coluna/tabela batem com `supabase/migrations/20260812090000_nucleo.sql` (`pessoas.nome_razao_social`, `pessoas.whatsapp`) e `20260812093000_comercial.sql`/`20260816030000_atendimento_bloco_a.sql` (`usuarios_sistema.pessoa_id`, `conversas.atendente_id`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260816050000_cor_badge_atendentes.sql
git commit -m "feat(db): adiciona cor_badge por atendente e expõe na view conversas_resumo"
```

---

### Task 2: Módulo de paleta de cores (`cores-atendimento.ts`) + testes

**Files:**
- Create: `src/lib/motor-fluxo/cores-atendimento.ts`
- Create: `src/lib/motor-fluxo/cores-atendimento.test.ts`

**Interfaces:**
- Produces: `type CorBadge`, `CORES_BADGE: Record<CorBadge, Tom>`, `CORES_BADGE_LISTA: CorBadge[]`, `COR_NAO_ATRIBUIDA: Tom`, `COR_MALALA: Tom`, `ehCorBadgeValida(valor: string): valor is CorBadge`, `corControlador(params: { sobSupervisor: boolean; atendenteCor: CorBadge | null }): Tom`. `Tom = { bg: string; texto: string; nome: string }` — `bg`/`texto` são className Tailwind (com variante `dark:`), prontos pra usar em `className`.

- [ ] **Step 1: Escrever o teste (falhando)**

```typescript
// src/lib/motor-fluxo/cores-atendimento.test.ts
import { describe, expect, it } from "vitest";
import {
  CORES_BADGE,
  CORES_BADGE_LISTA,
  COR_MALALA,
  COR_NAO_ATRIBUIDA,
  corControlador,
  ehCorBadgeValida,
} from "./cores-atendimento";

describe("ehCorBadgeValida", () => {
  it("aceita as 7 cores da paleta", () => {
    for (const cor of CORES_BADGE_LISTA) {
      expect(ehCorBadgeValida(cor)).toBe(true);
    }
  });

  it("rejeita verde/roxo (reservados) e qualquer valor fora da paleta", () => {
    expect(ehCorBadgeValida("verde")).toBe(false);
    expect(ehCorBadgeValida("roxo")).toBe(false);
    expect(ehCorBadgeValida("dourado")).toBe(false);
    expect(ehCorBadgeValida("")).toBe(false);
  });
});

describe("corControlador", () => {
  it("Malala no controle sempre usa a cor reservada de Malala, mesmo com atendenteCor preenchido por engano", () => {
    expect(corControlador({ sobSupervisor: false, atendenteCor: "azul" })).toBe(COR_MALALA);
  });

  it("humano sem atendente específico usa a cor de 'não atribuída'", () => {
    expect(corControlador({ sobSupervisor: true, atendenteCor: null })).toBe(COR_NAO_ATRIBUIDA);
  });

  it("humano com atendente específico usa a cor daquele atendente", () => {
    expect(corControlador({ sobSupervisor: true, atendenteCor: "rosa" })).toBe(CORES_BADGE.rosa);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm vitest run cores-atendimento`
Expected: FAIL — `Cannot find module './cores-atendimento'`

- [ ] **Step 3: Implementar**

```typescript
// src/lib/motor-fluxo/cores-atendimento.ts
// Sistema de cores por controlador da conversa (Fase 1 do Bloco B) — ver
// docs/superpowers/specs/2026-08-16-bloco-b-tela-atendimento-design.md seção 1.
// Paleta fechada de 7 cores escolhíveis pelo atendente; verde/roxo são reservados
// (não atribuída / Malala) e nunca aparecem em CORES_BADGE.

export type CorBadge = "vermelho" | "laranja" | "marrom" | "rosa" | "ciano" | "azul" | "cinza";

export type Tom = { bg: string; texto: string; nome: string };

export const CORES_BADGE: Record<CorBadge, Tom> = {
  vermelho: { bg: "bg-red-100 dark:bg-red-900", texto: "text-red-700 dark:text-red-300", nome: "Vermelho" },
  laranja: { bg: "bg-orange-100 dark:bg-orange-900", texto: "text-orange-700 dark:text-orange-300", nome: "Laranja" },
  marrom: { bg: "bg-[#F5E3D3] dark:bg-[#3d2b17]", texto: "text-[#78350F] dark:text-[#d8b48a]", nome: "Marrom" },
  rosa: { bg: "bg-pink-100 dark:bg-pink-900", texto: "text-pink-700 dark:text-pink-300", nome: "Rosa" },
  ciano: { bg: "bg-cyan-100 dark:bg-cyan-900", texto: "text-cyan-700 dark:text-cyan-300", nome: "Ciano" },
  azul: { bg: "bg-blue-100 dark:bg-blue-900", texto: "text-blue-700 dark:text-blue-300", nome: "Azul" },
  cinza: { bg: "bg-stone-200 dark:bg-stone-800", texto: "text-stone-700 dark:text-stone-300", nome: "Cinza" },
};

export const CORES_BADGE_LISTA = Object.keys(CORES_BADGE) as CorBadge[];

/** Reservada — conversa escalada pra humano, ainda sem atendente específico. Verde estilo WhatsApp Web (pedido explícito de Luiz, 16/08/2026). */
export const COR_NAO_ATRIBUIDA: Tom = {
  bg: "bg-[#D9FDD3] dark:bg-[#0f2e21]",
  texto: "text-[#128C7E] dark:text-[#6ee7b7]",
  nome: "Não atribuída",
};

/** Reservada — Malala (motor automatizado) no controle. Era verde antes desta mudança. */
export const COR_MALALA: Tom = {
  bg: "bg-violet-100 dark:bg-violet-900",
  texto: "text-violet-700 dark:text-violet-300",
  nome: "Malala",
};

export function ehCorBadgeValida(valor: string): valor is CorBadge {
  return (CORES_BADGE_LISTA as string[]).includes(valor);
}

/** Decide qual tom usar — mesmo par para o badge da lista e o fundo do painel de conversa. */
export function corControlador(params: { sobSupervisor: boolean; atendenteCor: CorBadge | null }): Tom {
  if (!params.sobSupervisor) return COR_MALALA;
  if (params.atendenteCor) return CORES_BADGE[params.atendenteCor];
  return COR_NAO_ATRIBUIDA;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm vitest run cores-atendimento`
Expected: PASS (7 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/motor-fluxo/cores-atendimento.ts src/lib/motor-fluxo/cores-atendimento.test.ts
git commit -m "feat(atendimento): módulo de paleta de cores por controlador da conversa"
```

---

### Task 3: `repositorio-atendimento.ts` — expor cor/nome do atendente + ação de trocar a própria cor

**Files:**
- Modify: `src/lib/motor-fluxo/repositorio-atendimento.ts`

**Interfaces:**
- Consumes: `CorBadge`, `ehCorBadgeValida` de `./cores-atendimento`.
- Produces: `UsuarioSistema` ganha `corBadge: CorBadge`; `ConversaResumo` ganha `atendenteNome: string | null` e `atendenteCor: CorBadge | null`; `ConversaDetalhe` ganha os mesmos dois campos; nova função `atualizarCorBadge(usuarioId: string, cor: CorBadge): Promise<void>`.

- [ ] **Step 1: Import e tipo `UsuarioSistema`**

No topo do arquivo, adicionar o import:

```typescript
import { ehCorBadgeValida, type CorBadge } from "./cores-atendimento";
```

Substituir o tipo (linhas 20-24):

```typescript
export type UsuarioSistema = {
  id: string;
  nome: string;
  email: string;
  corBadge: CorBadge;
};
```

- [ ] **Step 2: `obterUsuarioSistemaAtual` — buscar e devolver `corBadge`**

Trocar a query e o retorno da função (linhas 39-47) por:

```typescript
  const { data: existente } = await supabase
    .from("usuarios_sistema")
    .select("id, email, cor_badge, pessoas(nome_razao_social)")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (existente) {
    const pessoa = existente.pessoas as unknown as { nome_razao_social: string } | null;
    const cor = ehCorBadgeValida(existente.cor_badge) ? existente.cor_badge : "azul";
    return { id: existente.id, email: existente.email, nome: pessoa?.nome_razao_social ?? existente.email, corBadge: cor };
  }
```

E no retorno de usuário recém-criado (linha 64), acrescentar `corBadge: "azul"` (mesmo default da migration):

```typescript
  return { id: usuario.id, email: user.email ?? "", nome: nomeInicial, corBadge: "azul" };
```

- [ ] **Step 3: `listarUsuariosSistema` — mesma coisa**

```typescript
export async function listarUsuariosSistema(): Promise<UsuarioSistema[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("usuarios_sistema")
    .select("id, email, cor_badge, pessoas(nome_razao_social)")
    .eq("ativo", true);
  if (error) throw new Error(`Falha ao listar usuários do sistema: ${error.message}`);
  return (data ?? []).map((linha) => {
    const pessoa = linha.pessoas as unknown as { nome_razao_social: string } | null;
    const cor = ehCorBadgeValida(linha.cor_badge) ? linha.cor_badge : "azul";
    return { id: linha.id, email: linha.email, nome: pessoa?.nome_razao_social ?? linha.email, corBadge: cor };
  });
}
```

- [ ] **Step 4: `ConversaResumo` — novos campos + mapeamento**

Tipo (linhas 89-102), acrescentar ao final:

```typescript
  atendenteNome: string | null;
  atendenteCor: CorBadge | null;
```

No mapeamento dentro de `listarConversasAtendimento` (linhas 156-169), acrescentar:

```typescript
    atendenteNome: linha.atendente_nome,
    atendenteCor: ehCorBadgeValida(linha.atendente_cor ?? "") ? (linha.atendente_cor as CorBadge) : null,
```

- [ ] **Step 5: `ConversaDetalhe` — novos campos + join na query**

Tipo (linhas 212-225), acrescentar:

```typescript
  atendenteNome: string | null;
  atendenteCor: CorBadge | null;
```

Na query de `carregarConversaDetalhe` (linha 233-235), trocar o `.select(...)` por:

```typescript
    .select(
      "id, pessoa_id, oportunidade_id, sob_supervisor, atendente_id, pessoas(nome_razao_social, whatsapp, email), oportunidades(etapa_kanban, valor_estimado, produtos(nome)), usuarios_sistema(cor_badge, pessoas(nome_razao_social))",
    )
```

Logo abaixo da desestruturação de `pessoa`/`oportunidade` (depois da linha 245), acrescentar:

```typescript
  const atendente = conversa.usuarios_sistema as unknown as {
    cor_badge: string;
    pessoas: { nome_razao_social: string } | null;
  } | null;
```

E no retorno do objeto (dentro do `return { ... }`, junto dos outros campos), acrescentar:

```typescript
    atendenteNome: atendente?.pessoas?.nome_razao_social ?? null,
    atendenteCor: atendente && ehCorBadgeValida(atendente.cor_badge) ? (atendente.cor_badge as CorBadge) : null,
```

- [ ] **Step 6: Nova função `atualizarCorBadge`**

Acrescentar no final do arquivo:

```typescript
/** Troca a cor do próprio atendente (paleta fechada, ver cores-atendimento.ts). */
export async function atualizarCorBadge(usuarioId: string, cor: CorBadge): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("usuarios_sistema").update({ cor_badge: cor }).eq("id", usuarioId);
  if (error) throw new Error(`Falha ao atualizar cor: ${error.message}`);
}
```

- [ ] **Step 7: Rodar lint e build (arquivo é só tipos/queries, sem teste unitário próprio — mesmo padrão dos demais repositórios do projeto)**

Run: `pnpm lint && pnpm build`
Expected: sem erros de tipo (os novos campos precisam bater com o uso em `actions.ts`, ajustado na Task 4 antes de rodar isso de novo)

- [ ] **Step 8: Commit (junto com a Task 4, já que o build só fecha com as duas)**

(commit fica pra depois da Task 4 — ver lá)

---

### Task 4: Server Action `atualizarMinhaCorAction`

**Files:**
- Modify: `src/app/admin/(shell)/atendimento/actions.ts`

**Interfaces:**
- Consumes: `atualizarCorBadge`, `ehCorBadgeValida`, `type CorBadge` de `@/lib/motor-fluxo/repositorio-atendimento` e `@/lib/motor-fluxo/cores-atendimento`.
- Produces: `atualizarMinhaCorAction(cor: string): Promise<{ sucesso: true } | { sucesso: false; erro: string }>`.

- [ ] **Step 1: Import e nova action**

No topo, acrescentar aos imports existentes de `repositorio-atendimento`:

```typescript
  atualizarCorBadge,
```

E um novo import:

```typescript
import { ehCorBadgeValida } from "@/lib/motor-fluxo/cores-atendimento";
```

No final do arquivo, acrescentar:

```typescript
export type ResultadoAtualizarCor = { sucesso: true } | { sucesso: false; erro: string };

/** Só troca a cor do próprio usuário logado — nunca aceita usuarioId do cliente, pra ninguém trocar a cor de outro atendente. */
export async function atualizarMinhaCorAction(cor: string): Promise<ResultadoAtualizarCor> {
  if (!ehCorBadgeValida(cor)) return { sucesso: false, erro: "Cor inválida." };
  const usuario = await obterUsuarioSistemaAtual();
  await atualizarCorBadge(usuario.id, cor);
  revalidatePath("/admin/atendimento");
  return { sucesso: true };
}
```

- [ ] **Step 2: Rodar lint, testes e build**

Run: `pnpm lint && pnpm vitest run && pnpm build`
Expected: tudo verde — este é o ponto em que os tipos novos de `ConversaResumo`/`ConversaDetalhe`/`UsuarioSistema` (Task 3) precisam bater em todo lugar que os consome, incluindo o `atendimento-client.tsx` ainda não tocado (Task 5) — se o build reclamar de propriedade faltando em algum uso desses tipos dentro de `atendimento-client.tsx`, é porque a Task 5 ainda não foi feita; tudo bem, resolve lá.

- [ ] **Step 3: Commit (Task 3 + Task 4 juntas)**

```bash
git add src/lib/motor-fluxo/repositorio-atendimento.ts "src/app/admin/(shell)/atendimento/actions.ts"
git commit -m "feat(atendimento): expõe cor/nome do atendente e ação de trocar a própria cor"
```

---

### Task 5: `atendimento-client.tsx` — badge de 3 estados, fundo do painel, seletor de cor

**Files:**
- Modify: `src/app/admin/(shell)/atendimento/atendimento-client.tsx`

**Interfaces:**
- Consumes: `CORES_BADGE, CORES_BADGE_LISTA, corControlador` de `@/lib/motor-fluxo/cores-atendimento`; `atualizarMinhaCorAction` de `./actions`.

- [ ] **Step 1: Imports**

```typescript
import { CORES_BADGE, CORES_BADGE_LISTA, corControlador } from "@/lib/motor-fluxo/cores-atendimento";
import {
  assumirConversaAction,
  atribuirParaMalalaAction,
  atualizarMinhaCorAction,
  carregarConversaAction,
  contarNaoLidasAction,
  enviarMensagemAction,
  listarConversasAction,
} from "./actions";
```

- [ ] **Step 2: Badge de 3 estados no card da lista**

Trocar o bloco atual (linhas 319-323):

```tsx
                {!c.sobSupervisor && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                    Malala
                  </span>
                )}
```

por:

```tsx
                {(() => {
                  const tom = corControlador({ sobSupervisor: c.sobSupervisor, atendenteCor: c.atendenteCor });
                  const rotulo = !c.sobSupervisor ? "Malala" : (c.atendenteNome ?? "Não atribuída");
                  return (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tom.bg} ${tom.texto}`}>
                      {rotulo}
                    </span>
                  );
                })()}
```

- [ ] **Step 3: Fundo do painel de conversa**

Logo antes do `return (` da função `AtendimentoClient`, calcular o tom (só existe quando há `detalhe`):

```typescript
  const tomConversa = detalhe
    ? corControlador({ sobSupervisor: detalhe.sobSupervisor, atendenteCor: detalhe.atendenteCor })
    : null;
```

Trocar a div da timeline (linha 366):

```tsx
            <div ref={timelineRef} className="flex-1 space-y-2 overflow-y-auto p-4">
```

por:

```tsx
            <div ref={timelineRef} className={`flex-1 space-y-2 overflow-y-auto p-4 ${tomConversa?.bg ?? ""}`}>
```

- [ ] **Step 4: Botão "Minha cor" — componente novo no mesmo arquivo**

Antes de `export function AtendimentoClient`, acrescentar:

```tsx
function SeletorDeCor({ corAtual, onEscolher }: { corAtual: string; onEscolher: (cor: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const tomAtual = CORES_BADGE[corAtual as keyof typeof CORES_BADGE] ?? CORES_BADGE.azul;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        title="Escolher minha cor"
        className={`h-6 w-6 rounded-full border border-black/10 dark:border-white/10 ${tomAtual.bg}`}
      />
      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute right-0 z-20 mt-1 flex w-40 flex-wrap gap-1.5 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            {CORES_BADGE_LISTA.map((cor) => (
              <button
                key={cor}
                type="button"
                title={CORES_BADGE[cor].nome}
                onClick={() => {
                  onEscolher(cor);
                  setAberto(false);
                }}
                className={`h-6 w-6 rounded-full border-2 ${CORES_BADGE[cor].bg} ${
                  cor === corAtual ? "border-zinc-900 dark:border-white" : "border-transparent"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Usar o `SeletorDeCor` na barra de busca/filtros + handler**

Dentro de `AtendimentoClient`, acrescentar a função handler (perto de `handleAssumir`/`handleAtribuirMalala`):

```typescript
  const [corAtual, setCorAtual] = useState(usuarioAtual.corBadge);

  async function handleTrocarCor(cor: string) {
    const resultado = await atualizarMinhaCorAction(cor);
    if (resultado.sucesso) setCorAtual(cor as typeof corAtual);
  }
```

No JSX, dentro do primeiro `<div>` do painel esquerdo (o cabeçalho da lista, junto da busca — linha ~233), colocar o seletor ao lado da barra de filtros:

```tsx
        <div className="space-y-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, telefone ou mensagem..."
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <SeletorDeCor corAtual={corAtual} onEscolher={handleTrocarCor} />
          </div>
```

(remove a linha antiga que só tinha o `<input .../>` sozinho, já substituída pelo bloco acima).

- [ ] **Step 6: Rodar lint, testes e build**

Run: `pnpm lint && pnpm vitest run && pnpm build`
Expected: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add "src/app/admin/(shell)/atendimento/atendimento-client.tsx"
git commit -m "feat(atendimento): badge de 3 estados, fundo do painel por controlador, seletor de cor"
```

---

### Task 6: Verificação manual no navegador

**Files:** nenhum (só verificação)

- [ ] **Step 1: Subir o dev server e abrir `/admin/atendimento`**

Confirmar visualmente: badge "Malala" agora roxo (era verde); badge "Não atribuída" verde clarinho; conversas com atendente mostram o nome dele com a cor escolhida; fundo do painel de conversa muda de acordo; botão de bolinha colorida abre o seletor com as 7 cores + marca a atual; escolher uma cor persiste (recarregar a página mantém).

- [ ] **Step 2: Reportar qualquer divergência visual antes de seguir pra Fase 2**

---

## Fases seguintes (planos próprios, não neste documento)

Fase 2 (atribuição a atendente específico + filtro por atendente), Fase 3 ("⋮" do card), Fase 4 (busca interna + dados do contato + "⋮" do cabeçalho), Fase 5 (notas internas + @menção + sino), Fase 6 (respostas prontas), Fase 7 (atalho de script), Fase 8 (modal de follow-up), Fase 9 (composer reorganizado), Fase 10 (avatar+nome do usuário no topo) — cada uma ganha seu próprio plano em `docs/superpowers/plans/`, na ordem descrita em `docs/superpowers/specs/2026-08-16-bloco-b-tela-atendimento-design.md` seção 6.
