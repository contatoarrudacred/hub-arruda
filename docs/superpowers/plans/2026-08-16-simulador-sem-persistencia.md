# Simulador Sem Persistência — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/simulador` para de gravar qualquer coisa no banco de dados (pessoa/oportunidade/conversa/mensagens/e-mail de boas-vindas) — vira 100% client-side, rodando só o motor de fluxo puro. O quadrinho "Teste do follow-up" vira um preview de conteúdo (mostra o texto de cada item da régua em sequência), sem cronômetro real nem gravação, já que não existe mais timestamp de verdade pra contar.

**Architecture:** `EstadoSimulador` já guarda `dados`/`etapaAtualCodigo` no client — só precisa parar de chamar as três funções de persistência (`criarConversaSimulador`, `registrarMensagemLead`, `registrarTurnoMalala`) em `simulador/actions.ts`. O motor real (`iniciarFluxo`/`avancarConversa`) já é puro, não muda. `criarConversaSimulador` fica sem uso em nenhum lugar (só o simulador chamava) — remove de `persistencia.ts`. `registrarMensagemLead`/`registrarTurnoMalala`/`dispararItemFollowup` continuam existindo (usados pelo webhook real e pelo cron) — só o simulador para de chamá-los. O preview de follow-up vira uma Server Action nova, só leitura (`carregarPreviewFollowup`), que resolve a mesma agenda que a produção usaria (`etapa.agendaFollowupId ?? agenda padrão`) e devolve o texto de cada item já com `[Primeiro_Nome]` substituído — sem gravar nada.

**Tech Stack:** Next.js 16 (Server Actions, client state), Vitest.

**Spec:** Combinado em conversa com Luiz (16/08/2026) — sem doc de spec formal por ser um ajuste de ferramenta de teste, não uma feature de produto.

## Global Constraints

- **Não pode quebrar nada que já funciona:** o webhook real (`route.ts`) e o cron (`cron/followups/route.ts`) continuam usando `registrarMensagemLead`/`registrarTurnoMalala`/`dispararItemFollowup`/`ehUltimoItemDaAgenda` exatamente como hoje — essas funções NÃO mudam de assinatura nem de comportamento, só param de ser chamadas pelo simulador.
- `pnpm lint`, `pnpm vitest run` e `pnpm exec tsc --noEmit` precisam passar limpos antes de cada commit.

---

### Task 1: `simulador/actions.ts` — parar de persistir

**Files:**
- Modify: `src/app/simulador/actions.ts`

**Interfaces:**
- `EstadoSimulador`/`PassoSimulador` não mudam de forma — `conversaId`/`oportunidadeId`/`pessoaId` continuam existindo no tipo (já são `string | null`), só passam a ser sempre `null`.

- [ ] **Step 1: `iniciarSimulacaoComMensagem` sem persistência**

Trocar a função inteira por:

```typescript
export async function iniciarSimulacaoComMensagem(primeiraMensagemLead: string): Promise<PassoSimulador> {
  const { etapasPorCodigo, resolverMensagensDinamicas } = await montarDependencias();

  const dadosIniciais = criarExtratorAbertura()(primeiraMensagemLead);
  const resultado = iniciarFluxo(
    "saudacao_inicial",
    etapasPorCodigo,
    dadosIniciais,
    resolverMensagensDinamicas,
    { saudacao: saudacaoPorHorario() },
  );

  return {
    mensagens: resultado.mensagens,
    estado: {
      etapaAtualCodigo: resultado.etapaFinal?.conteudo.codigo ?? null,
      dados: dadosIniciais,
      conversaId: null,
      oportunidadeId: null,
      pessoaId: null,
    },
    encerrado: resultado.etapaFinal === null,
    naoReconhecido: false,
  };
}
```

- [ ] **Step 2: `enviarResposta` sem persistência**

Trocar a função inteira por:

```typescript
export async function enviarResposta(
  estado: EstadoSimulador,
  respostaLead: string,
): Promise<PassoSimulador> {
  if (!estado.etapaAtualCodigo) {
    return { mensagens: [], estado, encerrado: true, naoReconhecido: false };
  }

  const { etapasPorCodigo, resolverMensagensDinamicas, calcularDadosDerivados } =
    await montarDependencias();
  const etapaAtual = etapasPorCodigo[estado.etapaAtualCodigo];

  const resultado = await avancarConversa({
    etapaAtual,
    etapasPorCodigo,
    dados: estado.dados,
    respostaLead,
    resolverMensagensDinamicas,
    calcularDadosDerivados,
    variaveisGlobais: { saudacao: saudacaoPorHorario() },
  });

  return {
    mensagens: resultado.mensagens,
    estado: {
      etapaAtualCodigo: resultado.etapaFinal?.conteudo.codigo ?? null,
      conversaId: null,
      oportunidadeId: null,
      pessoaId: null,
      dados: { ...estado.dados, ...resultado.dadosNovos },
    },
    encerrado: resultado.etapaFinal === null,
    naoReconhecido: resultado.naoReconhecido,
  };
}
```

- [ ] **Step 3: Remover os imports que ficaram sem uso**

Trocar o bloco de import de `persistencia`:

```typescript
import {
  criarConversaSimulador,
  registrarMensagemLead,
  registrarTurnoMalala,
} from "@/lib/motor-fluxo/persistencia";
```

por: (remover completamente — nenhuma função de `persistencia.ts` é mais usada neste arquivo)

- [ ] **Step 4: Lint + typecheck**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/app/simulador/actions.ts
git commit -m "fix(simulador): para de gravar pessoa/conversa/mensagens no banco"
```

---

### Task 2: Remover `criarConversaSimulador` (fica sem uso)

**Files:**
- Modify: `src/lib/motor-fluxo/persistencia.ts`

- [ ] **Step 1: Confirmar que não sobrou nenhum uso**

Run: `grep -rn "criarConversaSimulador" src/`
Expected: nenhum resultado (a Task 1 já removeu o único uso).

- [ ] **Step 2: Remover a função inteira**

Apagar a função `criarConversaSimulador` (linhas ~55-97 de `persistencia.ts`, do `export async function criarConversaSimulador` até o `}` que fecha ela).

- [ ] **Step 3: Lint + typecheck**

Run: `pnpm lint && pnpm exec tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/lib/motor-fluxo/persistencia.ts
git commit -m "chore(simulador): remove criarConversaSimulador (sem uso após parar de persistir)"
```

---

### Task 3: Server Action de preview da régua (só leitura)

**Files:**
- Create: `src/app/simulador/actions-followup.ts` (reescreve o arquivo inteiro)

**Interfaces:**
- Consumes: `carregarEtapasPorCodigo`, `carregarIdAgendaPadrao`, `carregarItensAgenda`, `type ItemAgendaFollowupCarregado` de `@/lib/motor-fluxo/repositorio`; `substituirVariaveisTexto` de `@/lib/motor-fluxo/engine`; `ehUltimoItemDaAgenda` de `@/lib/motor-fluxo/motor-followup`.
- Produces: `ItemPreviewFollowup` (tipo), `carregarPreviewFollowup(etapaCodigo: string, dados: DadosConversa): Promise<ItemPreviewFollowup[] | null>`.

- [ ] **Step 1: Escrever o novo arquivo**

```typescript
"use server";

import { substituirVariaveisTexto } from "@/lib/motor-fluxo/engine";
import { ehUltimoItemDaAgenda } from "@/lib/motor-fluxo/motor-followup";
import {
  carregarEtapasPorCodigo,
  carregarIdAgendaPadrao,
  carregarItensAgenda,
  type ItemAgendaFollowupCarregado,
} from "@/lib/motor-fluxo/repositorio";
import type { DadosConversa } from "@/lib/motor-fluxo/tipos";

// Preview da régua de follow-up no /simulador (16/08/2026) — o simulador não persiste nada (ver
// actions.ts), então este quadrinho não testa o cron de verdade, só mostra como cada mensagem da
// régua fica (com [Primeiro_Nome] já resolvido). Só leitura: nunca grava mensagem, e-mail, nem
// muda estágio de nenhuma oportunidade.

export type ItemPreviewFollowup = {
  ordem: number;
  intervaloValor: number;
  intervaloUnidade: ItemAgendaFollowupCarregado["intervaloUnidade"];
  canal: ItemAgendaFollowupCarregado["canal"];
  conteudo: string;
  encerraAtendimento: boolean;
  ultimoDaAgenda: boolean;
};

/**
 * Régua inteira que se aplicaria a essa etapa, na mesma regra de produção (agenda da própria
 * etapa, senão a agenda padrão — ver persistencia.ts `registrarTurnoMalala`). Retorna null quando
 * a etapa não existe ou não é do tipo "aguarda resposta" (não teria follow-up nenhum armado).
 */
export async function carregarPreviewFollowup(
  etapaCodigo: string,
  dados: DadosConversa,
): Promise<ItemPreviewFollowup[] | null> {
  const etapasPorCodigo = await carregarEtapasPorCodigo();
  const etapa = etapasPorCodigo[etapaCodigo];
  if (!etapa || !etapa.conteudo.aguarda_resposta) return null;

  const agendaId = etapa.agendaFollowupId ?? (await carregarIdAgendaPadrao());
  const itens = [...(await carregarItensAgenda(agendaId))].sort((a, b) => a.ordem - b.ordem);

  return itens.map((item) => ({
    ordem: item.ordem,
    intervaloValor: item.intervaloValor,
    intervaloUnidade: item.intervaloUnidade,
    canal: item.canal,
    conteudo: substituirVariaveisTexto(item.conteudo, dados, {}),
    encerraAtendimento: item.encerraAtendimento,
    ultimoDaAgenda: ehUltimoItemDaAgenda(itens, item),
  }));
}
```

- [ ] **Step 2: Apagar o arquivo antigo de tipos que não existem mais**

Confirme que `EstadoFollowupTeste`, `ProximoItemFollowupPreview`, `obterEstadoFollowupTeste`, `avancarFollowupTeste`, `ResultadoAvancoFollowupTeste` não são usados em nenhum outro arquivo (só `teste-followup.tsx` os usava — a Task 4 troca esses usos).

Run: `grep -rn "obterEstadoFollowupTeste\|avancarFollowupTeste\|EstadoFollowupTeste" src/ --include=*.tsx --include=*.ts | grep -v actions-followup.ts`
Expected: só ocorrências em `teste-followup.tsx` (tratadas na Task 4).

- [ ] **Step 3: Lint + typecheck (vai reclamar de `teste-followup.tsx` ainda usando os tipos antigos — normal, resolvido na Task 4)**

- [ ] **Step 4: Commit (junto com a Task 4)**

---

### Task 4: `TesteFollowup` — vira stepper de preview, sem cronômetro

**Files:**
- Modify: `src/app/simulador/teste-followup.tsx`
- Modify: `src/app/simulador/simulador-chat.tsx`

**Interfaces:**
- Consumes: `carregarPreviewFollowup`, `type ItemPreviewFollowup` de `./actions-followup`.
- Produces: `TesteFollowup` passa a receber `etapaAtualCodigo: string | null`, `dados: DadosConversa`, `turno: number`, `desabilitado: boolean`, `onMostrarWhatsapp: (texto: string) => void`, `onMostrarEmail: (descricao: string) => void`, `onFimDaCadencia: () => void` (mesmos callbacks de hoje, só renomeados pra refletir que é preview, não disparo de verdade).

- [ ] **Step 1: Reescrever `teste-followup.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import type { DadosConversa } from "@/lib/motor-fluxo/tipos";
import { carregarPreviewFollowup, type ItemPreviewFollowup } from "./actions-followup";

// Quadrinho de PREVIEW da régua de follow-up (16/08/2026) — o simulador não persiste nada (ver
// actions.ts), então isso não testa o cron/disparo de verdade, só mostra como cada mensagem da
// régua fica. Sem cronômetro: não existe timestamp real de "aguardando desde" pra contar, já que
// nenhuma conversa é gravada. Testar a régua/cron de verdade é feito na Tela de Atendimento com
// dado real, não aqui.

const UNIDADE_SINGULAR: Record<string, string> = { minutos: "minuto", horas: "hora", dias: "dia" };
const UNIDADE_PLURAL: Record<string, string> = { minutos: "minutos", horas: "horas", dias: "dias" };

function rotuloIntervalo(valor: number, unidade: string): string {
  const rotulo = valor === 1 ? UNIDADE_SINGULAR[unidade] : UNIDADE_PLURAL[unidade];
  return `${valor} ${rotulo}`;
}

export function TesteFollowup({
  etapaAtualCodigo,
  dados,
  turno,
  desabilitado,
  onMostrarWhatsapp,
  onMostrarEmail,
  onFimDaCadencia,
}: {
  etapaAtualCodigo: string | null;
  dados: DadosConversa;
  /** muda a cada turno real da conversa — sinaliza pro quadrinho recarregar o preview */
  turno: number;
  desabilitado: boolean;
  onMostrarWhatsapp: (texto: string) => void;
  onMostrarEmail: (descricao: string) => void;
  onFimDaCadencia: () => void;
}) {
  const [itens, setItens] = useState<ItemPreviewFollowup[] | null>(null);
  const [indice, setIndice] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!etapaAtualCodigo) {
      setItens(null);
      return;
    }
    setCarregando(true);
    try {
      const resultado = await carregarPreviewFollowup(etapaAtualCodigo, dados);
      setItens(resultado);
      setIndice(0);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar o preview do follow-up.");
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapaAtualCodigo, turno]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  function mostrarProximo() {
    if (!itens || indice >= itens.length) return;
    const item = itens[indice];
    if (item.canal === "whatsapp") onMostrarWhatsapp(item.conteudo);
    else onMostrarEmail(item.conteudo);
    if (item.encerraAtendimento || item.ultimoDaAgenda) onFimDaCadencia();
    setIndice((i) => i + 1);
  }

  if (!etapaAtualCodigo) return null;

  return (
    <div className="mx-4 mb-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900/50">
      <p className="mb-1.5 font-medium text-zinc-600 dark:text-zinc-400">🧪 Preview da régua de follow-up</p>

      {carregando && <p className="text-zinc-400">Carregando...</p>}

      {!carregando && itens === null && (
        <p className="text-zinc-400">Esta etapa não aguarda resposta — sem régua de follow-up aqui.</p>
      )}

      {!carregando && itens !== null && indice >= itens.length && (
        <p className="text-emerald-700 dark:text-emerald-400">✅ Régua inteira já mostrada (todos os {itens.length} itens).</p>
      )}

      {!carregando && itens !== null && indice < itens.length && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-500 dark:text-zinc-400">
            Item {indice + 1} de {itens.length} · {itens[indice].canal === "whatsapp" ? "WhatsApp" : "E-mail"}
          </span>
          <button
            onClick={mostrarProximo}
            disabled={desabilitado}
            className="shrink-0 rounded-full bg-zinc-800 px-3 py-1 text-white disabled:opacity-40 dark:bg-zinc-200 dark:text-zinc-900"
          >
            Ver &quot;{rotuloIntervalo(itens[indice].intervaloValor, itens[indice].intervaloUnidade)}&quot;
          </button>
        </div>
      )}

      {erro && <p className="mt-1.5 text-red-600 dark:text-red-400">⚠️ {erro}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Atualizar `simulador-chat.tsx` pra passar as novas props**

Trocar o bloco `<TesteFollowup ... />`:

```tsx
      <TesteFollowup
        etapaAtualCodigo={estado.etapaAtualCodigo}
        dados={estado.dados}
        turno={mensagens.length}
        desabilitado={ocupado}
        onMostrarWhatsapp={(texto) =>
          setMensagens((atual) => [...atual, { autor: "malala", conteudo: { tipo: "texto", texto } }])
        }
        onMostrarEmail={(descricao) =>
          setMensagens((atual) => [...atual, { autor: "sistema", texto: `📧 Preview de e-mail: ${descricao}` }])
        }
        onFimDaCadencia={() => setEncerrado(true)}
      />
```

- [ ] **Step 3: Lint + typecheck + testes**

Run: `pnpm lint && pnpm vitest run && pnpm exec tsc --noEmit`
Expected: tudo verde.

- [ ] **Step 4: Commit (Task 3 + Task 4 juntas)**

```bash
git add src/app/simulador/actions-followup.ts src/app/simulador/teste-followup.tsx src/app/simulador/simulador-chat.tsx
git commit -m "feat(simulador): régua de follow-up vira preview de conteúdo, sem gravar nada"
```

---

### Task 5: Verificação manual no navegador

- [ ] **Step 1:** Abrir `/simulador`, mandar uma primeira mensagem, confirmar que a Malala responde normalmente (motor de fluxo intacto).
- [ ] **Step 2:** Confirmar (via SQL/REST, `select count(*) from pessoas`) que **nenhuma linha nova aparece** na tabela `pessoas` depois de conversar no simulador — essa é a prova real de que a persistência parou.
- [ ] **Step 3:** Confirmar que o quadrinho de preview mostra "Item 1 de N" numa etapa que aguarda resposta, e que clicar avança pro próximo item mostrando o texto (com nome substituído, se já capturado).
- [ ] **Step 4:** Confirmar que a Tela de Atendimento (`/admin/atendimento`) continua vazia (nenhuma conversa aparece) depois de usar o simulador.
- [ ] **Step 5:** Confirmar que `/admin/atendimento` com uma conversa de WhatsApp real simulada via webhook (se houver ambiente de teste) continua funcionando — não é possível testar isso sem tráfego real da Zapster nesta sessão; registrar como limitação do teste, não do código (o código do webhook não foi tocado nesta rodada).
