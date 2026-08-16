# Fase 4 — Busca Interna + Painel de Contato + Menu do Cabeçalho — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cabeçalho da conversa ganha 🔍 (busca dentro do histórico já carregado), 👤 (painel de dados do contato/oportunidade, coluna própria à direita, aberta por padrão) e "⋮" (Copiar telefone / Resetar conversa, migrando a ferramenta hoje isolada em `/admin/reset-conversa` pra dentro da própria tela, com modal de confirmação).

**Architecture:** Busca e painel de contato são 100% client-side — `detalhe.mensagens`/`detalhe.pessoaNome` etc. já estão carregados no state, não precisam de Server Action nova. Resetar conversa reaproveita `resetarConversaAction` já existente (`src/app/admin/(shell)/reset-conversa/actions.ts`), só chamada de um lugar novo. Simplificação assumida nesta fase (registrada, não é a versão final): o painel de contato tem largura fixa (`w-80`), não é redimensionável arrastando — isso fica pra quando o layout de 3 colunas (25/50/25 arrastável) for feito por inteiro, item já registrado como pendência no plano mestre.

**Tech Stack:** Next.js 16 (Server Actions, client state), Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-16-bloco-b-tela-atendimento-design.md` seção 2 (Menus de ação).

## Global Constraints

- `resetarConversaAction` não muda de assinatura — mesma função que `/admin/reset-conversa` já usa.
- `pnpm lint`, `pnpm vitest run` e `pnpm exec tsc --noEmit` (ou `pnpm build` se `.next` não estiver travado por outro processo) precisam passar limpos antes de cada commit.
- Testar mudanças no navegador criando/apagando dados de teste direto via REST (service_role) — o simulador não persiste mais (16/08/2026), não serve pra gerar conversa de teste.

---

### Task 1: Busca dentro da conversa aberta

**Files:**
- Modify: `src/app/admin/(shell)/atendimento/atendimento-client.tsx`

- [ ] **Step 1: Import `useMemo`**

Trocar a linha de import do React:
```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
```

- [ ] **Step 2: Estado + resultados calculados**

Dentro de `AtendimentoClient`, perto dos outros `useState`:
```typescript
  const [buscaConversaAberta, setBuscaConversaAberta] = useState(false);
  const [termoBuscaConversa, setTermoBuscaConversa] = useState("");
  const [indiceResultado, setIndiceResultado] = useState(0);

  const resultadosBusca = useMemo(() => {
    const termo = termoBuscaConversa.trim().toLowerCase();
    if (!termo || !detalhe) return [];
    return detalhe.mensagens.filter((m) => m.conteudo?.toLowerCase().includes(termo));
  }, [termoBuscaConversa, detalhe]);

  useEffect(() => {
    setIndiceResultado(0);
  }, [termoBuscaConversa]);

  useEffect(() => {
    const alvo = resultadosBusca[indiceResultado];
    if (!alvo) return;
    document.getElementById(`mensagem-${alvo.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [indiceResultado, resultadosBusca]);

  function irParaResultadoAnterior() {
    if (resultadosBusca.length === 0) return;
    setIndiceResultado((i) => (i - 1 + resultadosBusca.length) % resultadosBusca.length);
  }

  function irParaProximoResultado() {
    if (resultadosBusca.length === 0) return;
    setIndiceResultado((i) => (i + 1) % resultadosBusca.length);
  }

  function fecharBuscaConversa() {
    setBuscaConversaAberta(false);
    setTermoBuscaConversa("");
  }
```

- [ ] **Step 3: Botão 🔍 no cabeçalho**

No `<div className="flex gap-2">` do cabeçalho (onde já está o `DropdownAtribuir`), adicionar ANTES dele:
```tsx
                <button
                  type="button"
                  onClick={() => setBuscaConversaAberta((v) => !v)}
                  title="Buscar nesta conversa"
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                    buscaConversaAberta ? "bg-zinc-200 dark:bg-zinc-700" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  🔍
                </button>
```

- [ ] **Step 4: Barra de busca (linha nova, entre o cabeçalho e a timeline)**

Logo depois do `</div>` que fecha o cabeçalho da conversa (antes da div da timeline), adicionar:
```tsx
            {buscaConversaAberta && (
              <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
                <input
                  autoFocus
                  value={termoBuscaConversa}
                  onChange={(e) => setTermoBuscaConversa(e.target.value)}
                  placeholder="Buscar nesta conversa..."
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
                <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                  {resultadosBusca.length > 0 ? `${indiceResultado + 1} de ${resultadosBusca.length}` : "0 resultados"}
                </span>
                <button
                  type="button"
                  onClick={irParaResultadoAnterior}
                  disabled={resultadosBusca.length === 0}
                  className="rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-800"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={irParaProximoResultado}
                  disabled={resultadosBusca.length === 0}
                  className="rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-800"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={fecharBuscaConversa}
                  className="rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                >
                  ✕
                </button>
              </div>
            )}
```

- [ ] **Step 5: `id` + destaque na bolha de mensagem**

Na div que envolve cada bolha (`<div key={m.id} className={... doLead ...}>`), acrescentar o `id` e o destaque condicional na bolha interna:
```tsx
                return (
                  <div key={m.id} id={`mensagem-${m.id}`} className={`flex ${doLead ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-md rounded-2xl px-4 py-2 text-sm ${cor} ${
                        resultadosBusca[indiceResultado]?.id === m.id ? "ring-2 ring-amber-400" : ""
                      }`}
                    >
```

- [ ] **Step 6: Lint + typecheck**

Run: `pnpm lint && pnpm exec tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add "src/app/admin/(shell)/atendimento/atendimento-client.tsx"
git commit -m "feat(atendimento): busca dentro da conversa aberta (🔍 no cabeçalho)"
```

---

### Task 2: Painel de dados do contato/oportunidade (coluna à direita)

**Files:**
- Modify: `src/app/admin/(shell)/atendimento/atendimento-client.tsx`

- [ ] **Step 1: Estado (aberto por padrão)**

```typescript
  const [painelContatoAberto, setPainelContatoAberto] = useState(true);
```

- [ ] **Step 2: Botão 👤 no cabeçalho, ao lado do 🔍**

```tsx
                <button
                  type="button"
                  onClick={() => setPainelContatoAberto((v) => !v)}
                  title="Dados do contato e da oportunidade"
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                    painelContatoAberto ? "bg-zinc-200 dark:bg-zinc-700" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  👤
                </button>
```

- [ ] **Step 3: Restructurar o container do painel direito pra virar uma linha (conversa + painel de contato)**

Trocar:
```tsx
      {/* Painel direito — conversa */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!detalhe ? (
```
por:
```tsx
      {/* Painel direito — conversa + dados do contato */}
      <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {!detalhe ? (
```

E, no fechamento (onde hoje é `</div>` seguido de `</div>` final do componente — a última linha antes do `);` de retorno), acrescentar o painel de contato como irmão da coluna de conversa, fechando a nova div de linha:

```tsx
      </div>

      {painelContatoAberto && detalhe && (
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-zinc-200 p-4 dark:border-zinc-800">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Contato</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{detalhe.pessoaNome}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatarTelefone(detalhe.pessoaTelefone)}</p>
            {detalhe.pessoaEmail && <p className="text-xs text-zinc-500 dark:text-zinc-400">{detalhe.pessoaEmail}</p>}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Oportunidade</p>
            {detalhe.produtoNome && <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{detalhe.produtoNome}</p>}
            {detalhe.etapaKanban && (
              <span className="mt-1 inline-block rounded-full bg-[#c8a55d]/20 px-2 py-0.5 text-[10px] text-[#8a6d34] dark:text-[#e0c07f]">
                {detalhe.etapaKanban}
              </span>
            )}
            {detalhe.valorEstimado != null && (
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                R$ {detalhe.valorEstimado.toLocaleString("pt-BR")}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Atendimento</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  corControlador({ sobSupervisor: detalhe.sobSupervisor, atendenteCor: detalhe.atendenteCor }).bg
                }`}
              />
              {!detalhe.sobSupervisor ? "Malala" : (detalhe.atendenteNome ?? "Não atribuída")}
            </p>
          </div>
        </div>
      )}
    </div>
```

(Repare que o `</div>` da coluna de conversa (`flex min-w-0 flex-1 flex-col`) já existe no arquivo hoje, logo depois do composer — ele passa a fechar a coluna, e a nova `</div>` no final fecha a linha externa. Conferir com cuidado a indentação/aninhamento ao aplicar.)

- [ ] **Step 4: Lint + typecheck**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: erro comum de esquecer de fechar uma div a mais/a menos — se der erro de JSX malformado, reconferir o Step 3 com cuidado (é o passo mais arriscado desta fase).

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(shell)/atendimento/atendimento-client.tsx"
git commit -m "feat(atendimento): painel de dados do contato/oportunidade (👤, coluna à direita)"
```

---

### Task 3: "⋮" do cabeçalho — Copiar telefone + Resetar conversa

**Files:**
- Modify: `src/app/admin/(shell)/atendimento/atendimento-client.tsx`

**Interfaces:**
- Consumes: `resetarConversaAction` de `../reset-conversa/actions`.

- [ ] **Step 1: Import**

```typescript
import { resetarConversaAction } from "../reset-conversa/actions";
```

- [ ] **Step 2: Componente `MenuAcoesCabecalho`**

Antes de `export function AtendimentoClient`:
```tsx
function MenuAcoesCabecalho({ telefone, onResetar }: { telefone: string | null; onResetar: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function copiarTelefone() {
    if (!telefone) return;
    await navigator.clipboard.writeText(telefone);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        title="Mais ações"
        className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        ⋮
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <button
              type="button"
              onClick={copiarTelefone}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              📋 {copiado ? "Copiado!" : "Copiar telefone"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAberto(false);
                onResetar();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              🗑️ Resetar conversa
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Estado do modal de confirmação + handler de reset**

Dentro de `AtendimentoClient`:
```typescript
  const [confirmandoReset, setConfirmandoReset] = useState(false);
  const [resetando, setResetando] = useState(false);

  async function confirmarReset() {
    if (!detalhe?.pessoaTelefone) return;
    setResetando(true);
    await resetarConversaAction(detalhe.pessoaTelefone);
    setResetando(false);
    setConfirmandoReset(false);
    setConversaSelecionadaId(null);
    await recarregarLista();
    await recarregarContagens();
  }
```

- [ ] **Step 4: Usar `MenuAcoesCabecalho` no cabeçalho, ao lado do `DropdownAtribuir`**

```tsx
                <MenuAcoesCabecalho telefone={detalhe.pessoaTelefone} onResetar={() => setConfirmandoReset(true)} />
```

- [ ] **Step 5: Modal de confirmação (mesmo padrão de `editor-etapa-modal.tsx`)**

Logo antes do `</div>` final do componente (fora de qualquer coluna, cobre a tela inteira):
```tsx
      {confirmandoReset && detalhe && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-900">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Resetar a conversa com {detalhe.pessoaNome}?
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Apaga pessoa, oportunidade, conversa e mensagens desse número — ação irreversível. A
              próxima mensagem desse número no WhatsApp começa do zero.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmandoReset(false)}
                className="rounded-full px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarReset}
                disabled={resetando}
                className="rounded-full bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-40"
              >
                {resetando ? "Resetando..." : "Resetar"}
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Lint + typecheck + testes**

Run: `pnpm lint && pnpm vitest run && pnpm exec tsc --noEmit`
Expected: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add "src/app/admin/(shell)/atendimento/atendimento-client.tsx"
git commit -m "feat(atendimento): \"⋮\" do cabeçalho — copiar telefone + resetar conversa"
```

---

### Task 4: Verificação manual no navegador

- [ ] **Step 1:** Criar uma conversa de teste direto via REST (pessoa + oportunidade + conversa + mensagem, mesmo padrão usado na verificação da Fase 3 — o simulador não persiste mais).
- [ ] **Step 2:** Abrir a conversa, clicar 🔍, digitar um termo que aparece na mensagem de teste, confirmar contador "1 de 1" e destaque na bolha.
- [ ] **Step 3:** Confirmar que 👤 está aberto por padrão mostrando nome/telefone/produto/etapa/atendimento; clicar fecha e reabre.
- [ ] **Step 4:** Clicar "⋮" → "Copiar telefone", confirmar texto muda pra "Copiado!" por 1,5s.
- [ ] **Step 5:** Clicar "⋮" → "Resetar conversa", confirmar que abre o modal (não reseta direto), cancelar uma vez pra confirmar que não fez nada, depois confirmar de verdade e checar no banco que pessoa/conversa/mensagens sumiram.
