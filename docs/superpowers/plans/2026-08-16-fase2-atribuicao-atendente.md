# Fase 2 — Atribuição a Atendente Específico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um atendente consegue atribuir uma conversa a um colega específico (não só a si mesmo ou de volta pra Malala), e o submenu "Humano" da barra de filtros lista cada atendente ativo por nome com a cor dele.

**Architecture:** Reaproveita `conversas.atendente_id` (já existe desde o Bloco A) e o sistema de cores da Fase 1. O par de botões "Assumir Chat"/"Atribuir pra Malala" no cabeçalho vira um único dropdown "Atribuir a... ▾" com todos os destinos (Malala, mim, cada colega). O submenu "Humano ▾" da lista ganha um item por atendente.

**Tech Stack:** Next.js 16 (Server Actions), Supabase, Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-16-bloco-b-tela-atendimento-design.md` (seção 3, item 1).

## Global Constraints

- Mesma paleta/`corControlador` da Fase 1 — não redefinir cores aqui.
- `pnpm lint`, `pnpm vitest run` e `pnpm exec tsc --noEmit` precisam passar limpos antes de cada commit (usar `tsc --noEmit` em vez de `pnpm build` se outro processo estiver com `.next` travado).

---

### Task 1: Repositório — atribuir a atendente específico + contagem por atendente

**Files:**
- Modify: `src/lib/motor-fluxo/repositorio-atendimento.ts`

**Interfaces:**
- Produces: `atribuirParaAtendente(conversaId: string, atendenteId: string): Promise<void>`; `FiltroConversas` ganha `{ tipo: "humano_atendente"; atendenteId: string }`; `ContagemNaoLidas` ganha `porAtendente: Record<string, number>`.

- [ ] **Step 1: Novo tipo de filtro**

No tipo `FiltroConversas`, acrescentar mais uma variante:

```typescript
  | { tipo: "humano_atendente"; atendenteId: string }
```

- [ ] **Step 2: `listarConversasAtendimento` — tratar o novo filtro**

Depois da linha `if (filtro.tipo === "humano_todas") query = query.eq("sob_supervisor", true);`, acrescentar:

```typescript
  if (filtro.tipo === "humano_atendente") query = query.eq("atendente_id", filtro.atendenteId);
```

- [ ] **Step 3: `ContagemNaoLidas` — contagem por atendente**

Trocar o tipo:

```typescript
export type ContagemNaoLidas = {
  tudo: number;
  malala: number;
  humanoMinhas: number;
  humanoNaoAtribuidas: number;
  humanoTodas: number;
  porAtendente: Record<string, number>;
};
```

E dentro de `contarNaoLidas`, depois de calcular `naoLidas`, acrescentar o cálculo de `porAtendente` e incluir no retorno:

```typescript
  const porAtendente: Record<string, number> = {};
  for (const linha of naoLidas) {
    if (linha.atendente_id) porAtendente[linha.atendente_id] = (porAtendente[linha.atendente_id] ?? 0) + 1;
  }

  return {
    tudo: naoLidas.length,
    malala: naoLidas.filter((linha) => !linha.sob_supervisor).length,
    humanoMinhas: naoLidas.filter((linha) => linha.atendente_id === usuarioId).length,
    humanoNaoAtribuidas: naoLidas.filter((linha) => linha.sob_supervisor && !linha.atendente_id).length,
    humanoTodas: naoLidas.filter((linha) => linha.sob_supervisor).length,
    porAtendente,
  };
```

- [ ] **Step 4: Nova função `atribuirParaAtendente`**

Logo abaixo de `atribuirParaMalala`, acrescentar:

```typescript
/** Atribui a conversa a um atendente humano específico (diferente de "Assumir" — pode ser feito por qualquer atendente, não só o destinatário). */
export async function atribuirParaAtendente(conversaId: string, atendenteId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversas")
    .update({ sob_supervisor: true, atendente_id: atendenteId })
    .eq("id", conversaId);
  if (error) throw new Error(`Falha ao atribuir conversa ao atendente: ${error.message}`);
}
```

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: sem erros (o `atendimento-client.tsx` ainda não usa os campos novos — normal, ajustado na Task 3).

- [ ] **Step 6: Commit**

```bash
git add src/lib/motor-fluxo/repositorio-atendimento.ts
git commit -m "feat(atendimento): atribuir conversa a atendente específico + contagem por atendente"
```

---

### Task 2: Server Action `atribuirParaAtendenteAction`

**Files:**
- Modify: `src/app/admin/(shell)/atendimento/actions.ts`

**Interfaces:**
- Consumes: `atribuirParaAtendente` de `@/lib/motor-fluxo/repositorio-atendimento`.
- Produces: `atribuirParaAtendenteAction(conversaId: string, atendenteId: string): Promise<void>`.

- [ ] **Step 1: Import + action**

No import de `repositorio-atendimento`, acrescentar `atribuirParaAtendente`. Depois de `atribuirParaMalalaAction`, acrescentar:

```typescript
export async function atribuirParaAtendenteAction(conversaId: string, atendenteId: string): Promise<void> {
  await atribuirParaAtendente(conversaId, atendenteId);
  revalidatePath("/admin/atendimento");
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `pnpm lint && pnpm exec tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(shell)/atendimento/actions.ts"
git commit -m "feat(atendimento): Server Action pra atribuir a atendente específico"
```

---

### Task 3: `page.tsx` — carregar a lista de atendentes

**Files:**
- Modify: `src/app/admin/(shell)/atendimento/page.tsx`

**Interfaces:**
- Consumes: `listarUsuariosSistema` de `@/lib/motor-fluxo/repositorio-atendimento`.
- Produces: prop nova `atendentesIniciais: UsuarioSistema[]` pro `AtendimentoClient`.

- [ ] **Step 1: Buscar atendentes junto dos outros dados iniciais**

```typescript
import {
  contarNaoLidas,
  listarConversasAtendimento,
  listarUsuariosSistema,
  obterUsuarioSistemaAtual,
} from "@/lib/motor-fluxo/repositorio-atendimento";
import { AtendimentoClient } from "./atendimento-client";

export default async function AtendimentoPage() {
  const usuarioAtual = await obterUsuarioSistemaAtual();
  const [conversas, contagens, atendentes] = await Promise.all([
    listarConversasAtendimento({ tipo: "tudo" }, ""),
    contarNaoLidas(usuarioAtual.id),
    listarUsuariosSistema(),
  ]);

  return (
    <AtendimentoClient
      usuarioAtual={usuarioAtual}
      conversasIniciais={conversas}
      contagensIniciais={contagens}
      atendentesIniciais={atendentes}
    />
  );
}
```

- [ ] **Step 2: Lint + typecheck (vai reclamar que `AtendimentoClient` ainda não aceita essa prop — normal, resolvido na Task 4)**

Run: `pnpm lint`
Expected: erro de tipo em `atendentesIniciais` — esperado até a Task 4.

- [ ] **Step 3: Commit (junto com a Task 4, já que só fecha o build com as duas)**

(commit fica pra depois da Task 4)

---

### Task 4: `atendimento-client.tsx` — dropdown "Atribuir a..." + filtro por atendente

**Files:**
- Modify: `src/app/admin/(shell)/atendimento/atendimento-client.tsx`

**Interfaces:**
- Consumes: `atribuirParaAtendenteAction` de `./actions`; `UsuarioSistema` de `@/lib/motor-fluxo/repositorio-atendimento`; `CORES_BADGE` de `@/lib/motor-fluxo/cores-atendimento` (já importado na Fase 1).

- [ ] **Step 1: Import + prop nova**

```typescript
import {
  assumirConversaAction,
  atribuirParaAtendenteAction,
  atribuirParaMalalaAction,
  atualizarMinhaCorAction,
  carregarConversaAction,
  contarNaoLidasAction,
  enviarMensagemAction,
  listarConversasAction,
} from "./actions";
```

Assinatura de `AtendimentoClient`, acrescentar `atendentesIniciais`:

```typescript
export function AtendimentoClient({
  usuarioAtual,
  conversasIniciais,
  contagensIniciais,
  atendentesIniciais,
}: {
  usuarioAtual: UsuarioSistema;
  conversasIniciais: ConversaResumo[];
  contagensIniciais: ContagemNaoLidas;
  atendentesIniciais: UsuarioSistema[];
}) {
```

- [ ] **Step 2: `ChaveFiltro` e `filtroPorChave` — suportar filtro por atendente**

Trocar o tipo:

```typescript
type ChaveFiltro =
  | "tudo"
  | "malala"
  | "humano_minhas"
  | "humano_nao_atribuidas"
  | "humano_todas"
  | "nao_lidas"
  | { atendenteId: string };
```

E a função:

```typescript
function filtroPorChave(chave: ChaveFiltro, usuarioId: string): FiltroConversas {
  if (typeof chave === "object") return { tipo: "humano_atendente", atendenteId: chave.atendenteId };
  switch (chave) {
    case "humano_minhas":
      return { tipo: "humano_minhas", usuarioId };
    case "humano_nao_atribuidas":
      return { tipo: "humano_nao_atribuidas" };
    case "humano_todas":
      return { tipo: "humano_todas" };
    case "nao_lidas":
      return { tipo: "nao_lidas" };
    case "malala":
      return { tipo: "malala" };
    default:
      return { tipo: "tudo" };
  }
}
```

- [ ] **Step 3: Estado — `filtroChave` já usa `useState<ChaveFiltro>`, sem mudança de declaração, mas ajustar comparações de igualdade**

`humanoAtivo` hoje é `filtroChave === "humano_minhas" || ...` — acrescentar o caso de objeto:

```typescript
  const humanoAtivo =
    filtroChave === "humano_minhas" ||
    filtroChave === "humano_nao_atribuidas" ||
    filtroChave === "humano_todas" ||
    typeof filtroChave === "object";
```

- [ ] **Step 4: Submenu "Humano" — um item por atendente**

Dentro do bloco do submenu (onde estão `ItemSubmenu` de Minhas/Não atribuídas/Todas), acrescentar depois de "Todas":

```tsx
                    {atendentesIniciais
                      .filter((a) => a.id !== usuarioAtual.id)
                      .map((atendente) => (
                        <ItemSubmenu
                          key={atendente.id}
                          rotulo={atendente.nome}
                          contador={contagens.porAtendente[atendente.id]}
                          onClick={() => selecionarFiltro({ atendenteId: atendente.id })}
                        />
                      ))}
```

- [ ] **Step 5: Handler de atribuição a atendente específico**

Perto de `handleAtribuirMalala`, acrescentar:

```typescript
  async function handleAtribuirAtendente(atendenteId: string) {
    if (!conversaSelecionadaId) return;
    await atribuirParaAtendenteAction(conversaSelecionadaId, atendenteId);
    await recarregarDetalhe(conversaSelecionadaId);
    await recarregarLista();
    await recarregarContagens();
  }
```

- [ ] **Step 6: Cabeçalho — substituir o par de botões pelo dropdown "Atribuir a..."**

Novo componente, antes de `export function AtendimentoClient` (junto de `SeletorDeCor`):

```tsx
function DropdownAtribuir({
  atendentes,
  usuarioAtualId,
  onEscolherMalala,
  onEscolherAtendente,
}: {
  atendentes: UsuarioSistema[];
  usuarioAtualId: string;
  onEscolherMalala: () => void;
  onEscolherAtendente: (atendenteId: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="rounded-full bg-[#141e33] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
      >
        Atribuir a... ▾
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => {
                onEscolherMalala();
                setAberto(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <span className="h-4 w-4 rounded-full bg-violet-100 dark:bg-violet-900" />
              Malala
            </button>
            {atendentes.map((atendente) => (
              <button
                key={atendente.id}
                type="button"
                onClick={() => {
                  onEscolherAtendente(atendente.id);
                  setAberto(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <span className={`h-4 w-4 rounded-full ${CORES_BADGE[atendente.corBadge].bg}`} />
                {atendente.id === usuarioAtualId ? "Mim" : atendente.nome}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

No cabeçalho da conversa, trocar o bloco:

```tsx
              <div className="flex gap-2">
                {detalhe.sobSupervisor ? (
                  <button
                    onClick={handleAtribuirMalala}
                    className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Atribuir pra Malala
                  </button>
                ) : (
                  <button
                    onClick={handleAssumir}
                    className="rounded-full bg-[#141e33] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    Assumir Chat
                  </button>
                )}
              </div>
```

por:

```tsx
              <div className="flex gap-2">
                <DropdownAtribuir
                  atendentes={atendentesIniciais}
                  usuarioAtualId={usuarioAtual.id}
                  onEscolherMalala={handleAtribuirMalala}
                  onEscolherAtendente={(atendenteId) =>
                    atendenteId === usuarioAtual.id ? handleAssumir() : handleAtribuirAtendente(atendenteId)
                  }
                />
              </div>
```

(Continua reaproveitando `handleAssumir`/`handleAtribuirMalala` já existentes — "Mim" no dropdown chama a mesma ação de sempre.)

- [ ] **Step 7: Lint + typecheck + testes**

Run: `pnpm lint && pnpm vitest run && pnpm exec tsc --noEmit`
Expected: tudo verde.

- [ ] **Step 8: Commit (Task 3 + Task 4 juntas)**

```bash
git add "src/app/admin/(shell)/atendimento/page.tsx" "src/app/admin/(shell)/atendimento/atendimento-client.tsx"
git commit -m "feat(atendimento): dropdown \"Atribuir a...\" (Malala/mim/atendente) + filtro por atendente"
```

---

### Task 5: Verificação manual no navegador

- [ ] **Step 1:** Abrir `/admin/atendimento`, abrir uma conversa, clicar "Atribuir a..." — confirmar que lista Malala + a própria conta ("Mim") — como só existe 1 atendente hoje (Luiz), não dá pra testar atribuição a um COLEGA de verdade nesta rodada; documentar isso como limitação conhecida do teste (não do código).
- [ ] **Step 2:** Confirmar que o submenu "Humano ▾" não quebra com 0 outros atendentes (lista vazia, sem erro).
- [ ] **Step 3:** Escolher "Mim" no dropdown — confirmar que assume a conversa (mesmo comportamento de antes) e o fundo do painel fica com a cor do usuário (Fase 1).
