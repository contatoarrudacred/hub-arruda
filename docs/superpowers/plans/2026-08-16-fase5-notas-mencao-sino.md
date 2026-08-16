# Fase 5 — Notas Internas + @Menção + Sino de Notificação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atendentes deixam notas visíveis só pra equipe na própria timeline da conversa (nunca vão pro WhatsApp), podem @mencionar um colega pelo primeiro nome pra notificá-lo, e um sino no topo da lista mostra menções recebidas + atribuições recebidas de outros atendentes, com contador de não lidas.

**Architecture:** Duas tabelas novas (`notas_internas`, `notificacoes`). `carregarConversaDetalhe` passa a trazer as notas junto das mensagens; o client monta uma timeline única ordenada por horário. @menção é resolução simples de texto (`@PrimeiroNome` contra os atendentes ativos, sem autocomplete nesta fase) — ao salvar a nota, cria uma notificação por atendente mencionado. Atribuir a um atendente específico (Fase 2/3, `atribuirParaAtendente`) passa a também criar uma notificação de atribuição. O sino faz polling próprio (mesmo padrão de 4s já usado no resto da tela).

**Tech Stack:** Next.js 16 (Server Actions), Supabase, Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-16-bloco-b-tela-atendimento-design.md` seção 3.

## Global Constraints

- Mesmo padrão de RLS de todas as tabelas do projeto: `for all to authenticated using (true) with check (true)` (nível único ADMIN/MASTER).
- `notas_internas` leva trigger de auditoria (mesmo padrão de `mensagens`/`conversas`); `notificacoes` não leva (estado operacional de notificação, não registro de negócio — mesmo raciocínio já usado em `cron_locks`).
- `pnpm lint`, `pnpm vitest run` e `pnpm exec tsc --noEmit` (ou `pnpm build` se `.next` não estiver travado) precisam passar limpos antes de cada commit.

---

### Task 1: Migration — `notas_internas` + `notificacoes`

**Files:**
- Create: `supabase/migrations/20260817010000_notas_internas_notificacoes.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- ============================================================================
-- MIGRATION 023 — Notas internas + @menção + notificações (Fase 5 do Bloco B)
-- Sistema de Gestão ArrudaCred
-- ============================================================================

create table notas_internas (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references conversas(id) on delete cascade,
  autor_id uuid not null references usuarios_sistema(id),
  texto text not null,
  created_at timestamptz not null default now()
);
comment on table notas_internas is
  'Nota visível só pra equipe, ligada a uma conversa — nunca é enviada pro lead no WhatsApp. Pode conter @PrimeiroNome pra mencionar um colega (gera linha em notificacoes).';
comment on column notas_internas.texto is
  'Texto livre da nota. @PrimeiroNome dentro do texto que bate com um usuarios_sistema ativo vira menção (ver criarNotaInterna).';

create index idx_notas_internas_conversa on notas_internas(conversa_id);

alter table notas_internas enable row level security;
create policy admin_acesso_total on notas_internas for all to authenticated using (true) with check (true);

create trigger trg_auditoria_notas_internas
  after insert or update or delete on notas_internas
  for each row execute function fn_auditoria_log();

create table notificacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios_sistema(id) on delete cascade,
  tipo text not null check (tipo in ('mencao', 'atribuicao')),
  conversa_id uuid not null references conversas(id) on delete cascade,
  nota_id uuid references notas_internas(id) on delete cascade,
  lida boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table notificacoes is
  'Notificação in-app pro sino da Tela de Atendimento — @menção numa nota interna, ou atribuição de conversa recebida de outro atendente. Estado de notificação (lida/não lida), não trigger de auditoria de propósito (a nota/atribuição em si já é auditada nas próprias tabelas).';
comment on column notificacoes.tipo is
  'mencao = foi @mencionado numa nota interna (nota_id preenchido); atribuicao = uma conversa foi atribuída a ele por outro atendente (nota_id nulo).';

create index idx_notificacoes_usuario_nao_lida on notificacoes(usuario_id) where lida = false;

alter table notificacoes enable row level security;
create policy admin_acesso_total on notificacoes for all to authenticated using (true) with check (true);

-- ============================================================================
-- Fim da migration 023.
-- ============================================================================
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260817010000_notas_internas_notificacoes.sql
git commit -m "feat(db): tabelas notas_internas e notificacoes (Fase 5 do Bloco B)"
```

---

### Task 2: Repositório — notas internas, @menção, notificações

**Files:**
- Modify: `src/lib/motor-fluxo/repositorio-atendimento.ts`

**Interfaces:**
- Produces: `NotaInterna`, `Notificacao` (tipos); `criarNotaInterna(conversaId, texto)`, `listarNotificacoes(usuarioId)`, `contarNotificacoesNaoLidas(usuarioId)`, `marcarNotificacaoLida(id)`; `ConversaDetalhe` ganha `notas: NotaInterna[]`; `atribuirParaAtendente` passa a criar notificação de atribuição.

- [ ] **Step 1: Tipos novos**

Logo antes de `export type ConversaDetalhe`:

```typescript
export type NotaInterna = {
  id: string;
  conversaId: string;
  autorId: string;
  autorNome: string;
  texto: string;
  criadoEm: string;
};

export type Notificacao = {
  id: string;
  tipo: "mencao" | "atribuicao";
  conversaId: string;
  pessoaNome: string;
  lida: boolean;
  criadoEm: string;
};
```

- [ ] **Step 2: `ConversaDetalhe` ganha `notas`**

```typescript
  atendenteNome: string | null;
  atendenteCor: CorBadge | null;
  notas: NotaInterna[];
  mensagens: MensagemConversa[];
};
```

- [ ] **Step 3: `carregarConversaDetalhe` busca as notas junto**

Depois do bloco que carrega `mensagens` (antes do `return`), acrescentar:

```typescript
  const { data: notas, error: erroNotas } = await supabase
    .from("notas_internas")
    .select("id, autor_id, texto, created_at, usuarios_sistema(pessoas(nome_razao_social))")
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: true });
  if (erroNotas) throw new Error(`Falha ao carregar notas internas: ${erroNotas.message}`);
```

E no `return`, acrescentar o campo `notas` (antes de `mensagens`):

```typescript
    notas: (notas ?? []).map((n) => {
      const autorInfo = n.usuarios_sistema as unknown as { pessoas: { nome_razao_social: string } | null } | null;
      return {
        id: n.id,
        conversaId,
        autorId: n.autor_id,
        autorNome: autorInfo?.pessoas?.nome_razao_social ?? "Atendente",
        texto: n.texto,
        criadoEm: n.created_at,
      };
    }),
```

- [ ] **Step 4: `atribuirParaAtendente` também notifica**

Trocar a função inteira:

```typescript
/** Atribui a conversa a um atendente humano específico (diferente de "Assumir" — pode ser feito por qualquer atendente, não só o destinatário) e notifica quem recebeu. */
export async function atribuirParaAtendente(conversaId: string, atendenteId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversas")
    .update({ sob_supervisor: true, atendente_id: atendenteId })
    .eq("id", conversaId);
  if (error) throw new Error(`Falha ao atribuir conversa ao atendente: ${error.message}`);

  const { error: erroNotif } = await supabase
    .from("notificacoes")
    .insert({ usuario_id: atendenteId, tipo: "atribuicao", conversa_id: conversaId });
  if (erroNotif) throw new Error(`Falha ao notificar atribuição: ${erroNotif.message}`);
}
```

- [ ] **Step 5: `criarNotaInterna` com @menção**

Adicionar no final do arquivo:

```typescript
/** Casa @PrimeiroNome (case-insensitive, limite de palavra) contra os atendentes ativos. Sem autocomplete nesta fase — é resolução de texto simples. */
function extrairMencoes(texto: string, atendentes: UsuarioSistema[]): UsuarioSistema[] {
  return atendentes.filter((atendente) => {
    const primeiroNome = atendente.nome.split(" ")[0];
    const regex = new RegExp(`@${primeiroNome}\\b`, "i");
    return regex.test(texto);
  });
}

/** Cria uma nota interna e notifica quem foi @mencionado (exceto o próprio autor, se ele se mencionar). */
export async function criarNotaInterna(conversaId: string, texto: string): Promise<void> {
  const supabase = await createClient();
  const autor = await obterUsuarioSistemaAtual();

  const { data: nota, error } = await supabase
    .from("notas_internas")
    .insert({ conversa_id: conversaId, autor_id: autor.id, texto })
    .select("id")
    .single();
  if (error || !nota) throw new Error(`Falha ao criar nota interna: ${error?.message}`);

  const atendentes = await listarUsuariosSistema();
  const mencionados = extrairMencoes(texto, atendentes).filter((a) => a.id !== autor.id);
  if (mencionados.length > 0) {
    const { error: erroNotif } = await supabase
      .from("notificacoes")
      .insert(mencionados.map((m) => ({ usuario_id: m.id, tipo: "mencao", conversa_id: conversaId, nota_id: nota.id })));
    if (erroNotif) throw new Error(`Falha ao notificar menção: ${erroNotif.message}`);
  }
}

/** Notificações do usuário, mais recentes primeiro — usadas pelo sino da Tela de Atendimento. */
export async function listarNotificacoes(usuarioId: string): Promise<Notificacao[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notificacoes")
    .select("id, tipo, conversa_id, lida, created_at, conversas(pessoas(nome_razao_social))")
    .eq("usuario_id", usuarioId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`Falha ao listar notificações: ${error.message}`);
  return (data ?? []).map((n) => {
    const conversaInfo = n.conversas as unknown as { pessoas: { nome_razao_social: string } | null } | null;
    return {
      id: n.id,
      tipo: n.tipo as "mencao" | "atribuicao",
      conversaId: n.conversa_id,
      pessoaNome: conversaInfo?.pessoas?.nome_razao_social ?? "Contato",
      lida: n.lida,
      criadoEm: n.created_at,
    };
  });
}

export async function contarNotificacoesNaoLidas(usuarioId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notificacoes")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", usuarioId)
    .eq("lida", false);
  if (error) throw new Error(`Falha ao contar notificações: ${error.message}`);
  return count ?? 0;
}

export async function marcarNotificacaoLida(notificacaoId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("notificacoes").update({ lida: true }).eq("id", notificacaoId);
  if (error) throw new Error(`Falha ao marcar notificação como lida: ${error.message}`);
}
```

- [ ] **Step 6: Teste de `extrairMencoes` — como ela não é exportada, testar via `criarNotaInterna` está fora de alcance nesta camada (precisa de Supabase). Pular teste automatizado aqui, mesmo padrão já usado nas outras funções deste arquivo (repositório com I/O não é unit-testado neste projeto — só lógica pura em módulos como `cores-atendimento.ts`/`motor-followup.ts`).**

- [ ] **Step 7: Lint + typecheck**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: sem erros (o client ainda não usa `notas`/`Notificacao` — normal, ajustado nas próximas tasks).

- [ ] **Step 8: Commit**

```bash
git add src/lib/motor-fluxo/repositorio-atendimento.ts
git commit -m "feat(atendimento): notas internas com @menção + notificações (repositório)"
```

---

### Task 3: Server Actions

**Files:**
- Modify: `src/app/admin/(shell)/atendimento/actions.ts`

- [ ] **Step 1: Import + actions novas**

No import de `repositorio-atendimento`, acrescentar: `contarNotificacoesNaoLidas`, `criarNotaInterna`, `listarNotificacoes`, `marcarNotificacaoLida`, `type Notificacao`.

No final do arquivo:

```typescript
export type ResultadoCriarNota = { sucesso: true } | { sucesso: false; erro: string };

export async function criarNotaAction(conversaId: string, texto: string): Promise<ResultadoCriarNota> {
  if (!texto.trim()) return { sucesso: false, erro: "Nota vazia." };
  await criarNotaInterna(conversaId, texto.trim());
  revalidatePath("/admin/atendimento");
  return { sucesso: true };
}

export async function listarNotificacoesAction(usuarioId: string): Promise<Notificacao[]> {
  return listarNotificacoes(usuarioId);
}

export async function contarNotificacoesNaoLidasAction(usuarioId: string): Promise<number> {
  return contarNotificacoesNaoLidas(usuarioId);
}

export async function marcarNotificacaoLidaAction(id: string): Promise<void> {
  await marcarNotificacaoLida(id);
  revalidatePath("/admin/atendimento");
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `pnpm lint && pnpm exec tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(shell)/atendimento/actions.ts"
git commit -m "feat(atendimento): Server Actions de notas internas e notificações"
```

---

### Task 4: UI — timeline unificada (notas como chip amarelo) + composer com modo Nota

**Files:**
- Modify: `src/app/admin/(shell)/atendimento/atendimento-client.tsx`

- [ ] **Step 1: Import das actions novas**

```typescript
  criarNotaAction,
```
(acrescentar à lista de imports de `./actions`, ordem alfabética)

- [ ] **Step 2: Tipo da timeline unificada + `useMemo`**

Perto do topo do arquivo, depois do tipo `ChaveFiltro`:

```typescript
type ItemTimeline =
  | { tipo: "mensagem"; dado: MensagemConversa }
  | { tipo: "nota"; dado: NotaInterna };
```

(Import `MensagemConversa` e `NotaInterna` de `@/lib/motor-fluxo/repositorio-atendimento` — acrescentar aos imports de tipo já existentes no topo do arquivo.)

Dentro de `AtendimentoClient`, perto de `resultadosBusca`:

```typescript
  const itensTimeline = useMemo<ItemTimeline[]>(() => {
    if (!detalhe) return [];
    const msgs: ItemTimeline[] = detalhe.mensagens.map((m) => ({ tipo: "mensagem", dado: m }));
    const notas: ItemTimeline[] = detalhe.notas.map((n) => ({ tipo: "nota", dado: n }));
    return [...msgs, ...notas].sort((a, b) => {
      const ta = a.tipo === "mensagem" ? a.dado.enviadoEm : a.dado.criadoEm;
      const tb = b.tipo === "mensagem" ? b.dado.enviadoEm : b.dado.criadoEm;
      return ta.localeCompare(tb);
    });
  }, [detalhe]);
```

- [ ] **Step 3: Função de destaque de @menção**

Antes de `export function AtendimentoClient`:

```tsx
function renderizarTextoComMencoes(texto: string, atendentes: UsuarioSistema[]) {
  const partes = texto.split(/(@\w+)/g);
  return partes.map((parte, i) => {
    if (parte.startsWith("@")) {
      const nomeBuscado = parte.slice(1).toLowerCase();
      const atendente = atendentes.find((a) => a.nome.split(" ")[0].toLowerCase() === nomeBuscado);
      if (atendente) {
        const tom = CORES_BADGE[atendente.corBadge];
        return (
          <span key={i} className={`rounded px-1 font-medium ${tom.bg} ${tom.texto}`}>
            {parte}
          </span>
        );
      }
    }
    return <span key={i}>{parte}</span>;
  });
}
```

- [ ] **Step 4: Trocar `detalhe.mensagens.map(...)` por `itensTimeline.map(...)` na timeline**

Trocar o bloco:
```tsx
              {detalhe.mensagens.map((m) => {
                const doLead = m.remetente === "lead";
                const cor = doLead
                  ? "bg-emerald-600 text-white"
                  : m.remetente === "supervisor"
                    ? "bg-[#c8a55d] text-[#141e33]"
                    : "bg-white text-zinc-900 shadow dark:bg-zinc-900 dark:text-zinc-50";
                return (
                  <div key={m.id} id={`mensagem-${m.id}`} className={`flex ${doLead ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-md rounded-2xl px-4 py-2 text-sm ${cor} ${
                        resultadosBusca[indiceResultado]?.id === m.id ? "ring-2 ring-amber-400" : ""
                      }`}
                    >
                      {m.midiaUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- URL arbitrária de mídia trocada na conversa
                        <img src={m.midiaUrl} alt="" className="mb-1 max-w-full rounded-lg" />
                      )}
                      {m.conteudo && <p className="whitespace-pre-wrap">{m.conteudo}</p>}
                      <p className="mt-0.5 text-right text-[10px] opacity-60">{formatarHora(m.enviadoEm)}</p>
                    </div>
                  </div>
                );
              })}
```
por:
```tsx
              {itensTimeline.map((item) => {
                if (item.tipo === "nota") {
                  const nota = item.dado;
                  return (
                    <div
                      key={`nota-${nota.id}`}
                      className="rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm dark:border-amber-500 dark:bg-amber-950/30"
                    >
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-300">📝 {nota.autorNome}</p>
                      <p className="mt-0.5 text-zinc-700 dark:text-zinc-300">
                        {renderizarTextoComMencoes(nota.texto, atendentesIniciais)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-amber-700/70 dark:text-amber-400/70">
                        {formatarHora(nota.criadoEm)} · só a equipe vê
                      </p>
                    </div>
                  );
                }

                const m = item.dado;
                const doLead = m.remetente === "lead";
                const cor = doLead
                  ? "bg-emerald-600 text-white"
                  : m.remetente === "supervisor"
                    ? "bg-[#c8a55d] text-[#141e33]"
                    : "bg-white text-zinc-900 shadow dark:bg-zinc-900 dark:text-zinc-50";
                return (
                  <div key={m.id} id={`mensagem-${m.id}`} className={`flex ${doLead ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-md rounded-2xl px-4 py-2 text-sm ${cor} ${
                        resultadosBusca[indiceResultado]?.id === m.id ? "ring-2 ring-amber-400" : ""
                      }`}
                    >
                      {m.midiaUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- URL arbitrária de mídia trocada na conversa
                        <img src={m.midiaUrl} alt="" className="mb-1 max-w-full rounded-lg" />
                      )}
                      {m.conteudo && <p className="whitespace-pre-wrap">{m.conteudo}</p>}
                      <p className="mt-0.5 text-right text-[10px] opacity-60">{formatarHora(m.enviadoEm)}</p>
                    </div>
                  </div>
                );
              })}
```

- [ ] **Step 5: Estado do modo composer + handler de salvar nota**

Perto de `handleEnviar`:

```typescript
  const [modoComposer, setModoComposer] = useState<"mensagem" | "nota">("mensagem");
  const [enviandoNota, setEnviandoNota] = useState(false);

  async function handleSalvarNota() {
    if (!conversaSelecionadaId || !textoComposer.trim()) return;
    setEnviandoNota(true);
    const resultado = await criarNotaAction(conversaSelecionadaId, textoComposer);
    setEnviandoNota(false);
    if (resultado.sucesso) {
      setTextoComposer("");
      await recarregarDetalhe(conversaSelecionadaId);
    }
  }
```

- [ ] **Step 6: Composer — tabs de modo + comportamento condicional**

Trocar o bloco do composer inteiro:
```tsx
            <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
              {erroEnvio && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{erroEnvio}</p>}
              <div className="flex gap-2">
                <input
                  value={textoComposer}
                  onChange={(e) => setTextoComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleEnviar();
                    }
                  }}
                  disabled={!composerHabilitado || enviando}
                  placeholder={composerHabilitado ? "Digite uma mensagem..." : "A Malala está no controle desta conversa"}
                  className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
                <button
                  onClick={handleEnviar}
                  disabled={!composerHabilitado || enviando || !textoComposer.trim()}
                  className="rounded-full bg-[#141e33] px-4 py-2 text-sm text-white disabled:opacity-40"
                >
                  {enviando ? "..." : "Enviar"}
                </button>
              </div>
            </div>
```
por:
```tsx
            <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
              <div className="mb-2 flex gap-1">
                <button
                  type="button"
                  onClick={() => setModoComposer("mensagem")}
                  className={`rounded-full px-3 py-0.5 text-xs font-medium ${
                    modoComposer === "mensagem"
                      ? "bg-[#141e33] text-white"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  Mensagem
                </button>
                <button
                  type="button"
                  onClick={() => setModoComposer("nota")}
                  className={`rounded-full px-3 py-0.5 text-xs font-medium ${
                    modoComposer === "nota"
                      ? "bg-amber-500 text-white"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  Nota interna
                </button>
              </div>
              {erroEnvio && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{erroEnvio}</p>}
              <div className="flex gap-2">
                <input
                  value={textoComposer}
                  onChange={(e) => setTextoComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || e.shiftKey) return;
                    e.preventDefault();
                    if (modoComposer === "nota") handleSalvarNota();
                    else handleEnviar();
                  }}
                  disabled={modoComposer === "nota" ? enviandoNota : !composerHabilitado || enviando}
                  placeholder={
                    modoComposer === "nota"
                      ? "Escrever nota interna... (@PrimeiroNome pra mencionar)"
                      : composerHabilitado
                        ? "Digite uma mensagem..."
                        : "A Malala está no controle desta conversa"
                  }
                  className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
                <button
                  onClick={modoComposer === "nota" ? handleSalvarNota : handleEnviar}
                  disabled={
                    modoComposer === "nota"
                      ? enviandoNota || !textoComposer.trim()
                      : !composerHabilitado || enviando || !textoComposer.trim()
                  }
                  className={`rounded-full px-4 py-2 text-sm text-white disabled:opacity-40 ${
                    modoComposer === "nota" ? "bg-amber-500" : "bg-[#141e33]"
                  }`}
                >
                  {modoComposer === "nota" ? (enviandoNota ? "..." : "Salvar nota") : enviando ? "..." : "Enviar"}
                </button>
              </div>
            </div>
```

- [ ] **Step 7: Lint + typecheck + testes**

Run: `pnpm lint && pnpm vitest run && pnpm exec tsc --noEmit`

- [ ] **Step 8: Commit**

```bash
git add "src/app/admin/(shell)/atendimento/atendimento-client.tsx"
git commit -m "feat(atendimento): timeline unificada (notas internas + @menção) e composer com modo Nota"
```

---

### Task 5: UI — sino de notificação

**Files:**
- Modify: `src/app/admin/(shell)/atendimento/atendimento-client.tsx`

- [ ] **Step 1: Import das actions restantes + tipo `Notificacao`**

```typescript
  contarNotificacoesNaoLidasAction,
  listarNotificacoesAction,
  marcarNotificacaoLidaAction,
```
(acrescentar à lista de imports de `./actions`)

E acrescentar `type Notificacao` à lista de imports de tipo já existente vinda de `@/lib/motor-fluxo/repositorio-atendimento` (mesma lista onde `ContagemNaoLidas`/`ConversaDetalhe`/etc. já estão, e onde a Task 4 já acrescentou `MensagemConversa`/`NotaInterna`).

- [ ] **Step 2: Componente `SinoNotificacoes`**

Antes de `export function AtendimentoClient`:

```tsx
function SinoNotificacoes({
  usuarioId,
  onAbrirConversa,
}: {
  usuarioId: string;
  onAbrirConversa: (conversaId: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);

  const recarregar = useCallback(async () => {
    const [lista, contagem] = await Promise.all([
      listarNotificacoesAction(usuarioId),
      contarNotificacoesNaoLidasAction(usuarioId),
    ]);
    setNotificacoes(lista);
    setNaoLidas(contagem);
  }, [usuarioId]);

  useEffect(() => {
    Promise.resolve().then(() => recarregar());
    const intervalo = setInterval(recarregar, INTERVALO_POLLING_MS);
    return () => clearInterval(intervalo);
  }, [recarregar]);

  async function abrirNotificacao(n: Notificacao) {
    if (!n.lida) await marcarNotificacaoLidaAction(n.id);
    setAberto(false);
    onAbrirConversa(n.conversaId);
    recarregar();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        title="Notificações"
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        🔔
        {naoLidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute left-0 z-20 mt-1 max-h-96 w-72 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            {notificacoes.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-zinc-400">Nenhuma notificação ainda.</p>
            )}
            {notificacoes.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => abrirNotificacao(n)}
                className={`flex w-full flex-col gap-0.5 border-b border-zinc-100 px-3 py-2 text-left text-xs hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800 ${
                  n.lida ? "opacity-60" : ""
                }`}
              >
                <span className="text-zinc-700 dark:text-zinc-300">
                  {n.tipo === "mencao"
                    ? `📝 Você foi mencionado numa nota de ${n.pessoaNome}`
                    : `👤 ${n.pessoaNome} foi atribuída a você`}
                </span>
                <span className="text-[10px] text-zinc-400">{formatarHora(n.criadoEm)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Usar `SinoNotificacoes` na barra de busca da lista (painel esquerdo)**

Trocar o bloco:
```tsx
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone ou mensagem..."
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
```
por:
```tsx
          <div className="flex items-center gap-2">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, telefone ou mensagem..."
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <SinoNotificacoes usuarioId={usuarioAtual.id} onAbrirConversa={(conversaId) => setConversaSelecionadaId(conversaId)} />
          </div>
```

- [ ] **Step 4: Lint + typecheck + testes**

Run: `pnpm lint && pnpm vitest run && pnpm exec tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(shell)/atendimento/atendimento-client.tsx"
git commit -m "feat(atendimento): sino de notificações (@menção + atribuição recebida)"
```

---

### Task 6: Verificação manual no navegador

- [ ] **Step 1:** Criar conversa de teste via REST (mesmo padrão das fases anteriores).
- [ ] **Step 2:** Abrir a conversa, trocar composer pra "Nota interna", escrever uma nota sem menção, confirmar que aparece como chip amarelo na timeline (intercalada corretamente por horário) e nunca foi enviada por WhatsApp de verdade.
- [ ] **Step 3:** Escrever uma nota com `@` + o próprio primeiro nome do usuário logado (único atendente hoje) — como não dá pra mencionar outra pessoa de verdade com só 1 atendente, confirmar ao menos que o texto `@NomeDoAtendente` fica destacado na cor dele na timeline (prova que o parsing/render funciona, mesmo sem poder testar notificação cruzada entre 2 pessoas de verdade nesta rodada — limitação conhecida, mesma da Fase 2/3).
- [ ] **Step 4:** Confirmar no banco que a notificação foi criada em `notificacoes` (mesmo sendo pra si mesmo, já que só existe 1 atendente — a query some com `.filter(a => a.id !== autor.id)`, então checar que NÃO cria notificação de auto-menção é o teste real aqui).
- [ ] **Step 5:** Atribuir a conversa a si mesmo via "Assumir" (não deve gerar notificação — só `atribuirParaAtendente`, chamado pra outro atendente, gera) e confirmar no banco que não criou notificação incorreta.
- [ ] **Step 6:** Abrir o sino, confirmar que abre/fecha, mostra "Nenhuma notificação ainda" (esperado, dado o cenário de 1 atendente só).
