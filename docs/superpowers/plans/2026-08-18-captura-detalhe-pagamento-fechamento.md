# Captura de detalhe de pagamento no fechamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O bot (motor de fluxo) passa a capturar 100% do detalhe de pagamento no fechamento — forma (Boleto/Pix ou Cartão), e o vencimento/valor de cada parcela — em vez de só `"avista"|"parcelado"`, via uma mensagem de confirmação que o lead pode negociar naturalmente antes de aceitar.

**Architecture:** Reaproveita o padrão de interpretador especializado com 3 saídas já usado por `tipo_resposta: "lista_documentos"|"faixas_documentos"` (`interpretar-faixas-documentos.ts` como referência direta) — um novo `tipo_resposta: "negociacao_pagamento"`, um novo branch em `engine.ts`, e o checkpoint `ln_passo16_1` (hoje "qual a melhor data", texto livre) reformulado pra montar/reenviar a mensagem de confirmação em loop. Os valores/quantidade de parcela continuam vindo do cálculo de precificação já existente (`combinarFaixasPacote`/`combinarParcelas`, `regras-limpeza-nome.ts`) — este plano só adiciona o cálculo de **vencimento** (que não existe hoje) e a captura estruturada.

**Tech Stack:** TypeScript, Vitest, Anthropic SDK (`@anthropic-ai/sdk`, já em uso no projeto), Next.js/Supabase (sem migration nesta frente — `conversas.dados` já é jsonb).

**Spec:** `docs/superpowers/specs/2026-08-18-captura-detalhe-pagamento-fechamento-design.md`

## Global Constraints

- `conversas.dados` é `Record<string, string>` (`DadosConversa`, `tipos.ts`) — **nunca objeto aninhado**. Listas usam CSV em campos paralelos, mesmo padrão de `documentos_tipos`/`documentos_valores` (ver spec seção 4).
- 1ª parcela: vence hoje por padrão; lead pode adiar até **+15 dias**, nunca mais.
- Parcelas 2+: dia-âncora fixo **01, 10 ou 20** (padrão 10) do **mês seguinte ao mês em que caiu a 1ª parcela**, mesmo dia em todas, rolando o ano quando necessário.
- Forma de pagamento: só **`"boleto_pix"`** ou **`"cartao"`** (padrão `"boleto_pix"`) — não afeta valor/quantidade de parcela, só a forma de cobrança.
- "Agora"/"hoje" é sempre parâmetro injetável com default `new Date()` — nunca `Date.now()` direto dentro de função pura (mesmo padrão de `saudacaoPorHorario` em `engine.ts` e `selo-risco.ts`).
- Convenção de teste do projeto: lógica pura ganha teste Vitest de verdade; I/O (chamada de IA) é mockado nos testes, verificado de verdade manualmente no simulador.
- Projeto usa `pnpm`, não `npm`.
- **Nenhuma migration nesta frente** — regra dura de `docs/COORDENACAO_AGENTES_ARRUDACRED.md` seção 2 nem se aplica aqui, mas registre isso explicitamente ao terminar (nada pra levar ao Coordenador).

---

### Task 1: Cálculo de vencimentos — função pura (TDD)

**Files:**
- Create: `src/lib/motor-fluxo/calculo-vencimentos-pagamento.ts`
- Test: `src/lib/motor-fluxo/calculo-vencimentos-pagamento.test.ts`

**Interfaces:**
- Consumes: `ParcelaTier` de `./regras-limpeza-nome` (`{ quantidade: number; valor: number }`, já existe).
- Produces: `DIAS_ANCORA_VALIDOS`, `DiaAncora`, `LIMITE_DIAS_ADIAR_PRIMEIRA_PARCELA`, `dataDeHojeISO(agora?: Date): string`, `validarDataPrimeiraParcela(dataPedidaISO: string, hojeISO: string): string | null`, `expandirParcelas(tiers: ParcelaTier[], dataPrimeiraParcelaISO: string, diaAncora: DiaAncora): ParcelaCalculada[]`, `type ParcelaCalculada = { numero: number; valor: number; vencimento: string }` — usados pela Task 4 (derivados) e Task 6 (checkpoint).

- [ ] **Step 1: Escrever os testes (todos falhando)**

```typescript
import { describe, expect, it } from "vitest";
import {
  dataDeHojeISO,
  DIAS_ANCORA_VALIDOS,
  expandirParcelas,
  LIMITE_DIAS_ADIAR_PRIMEIRA_PARCELA,
  validarDataPrimeiraParcela,
} from "./calculo-vencimentos-pagamento";
import type { ParcelaTier } from "./regras-limpeza-nome";

describe("dataDeHojeISO", () => {
  it("formata a data injetada em ISO sem hora", () => {
    expect(dataDeHojeISO(new Date("2026-08-18T14:32:00-03:00"))).toBe("2026-08-18");
  });
});

describe("validarDataPrimeiraParcela", () => {
  it("aceita a própria data de hoje", () => {
    expect(validarDataPrimeiraParcela("2026-08-18", "2026-08-18")).toBe("2026-08-18");
  });

  it("aceita adiamento dentro do limite de 15 dias", () => {
    expect(validarDataPrimeiraParcela("2026-08-28", "2026-08-18")).toBe("2026-08-28");
  });

  it("aceita exatamente o limite de 15 dias", () => {
    expect(validarDataPrimeiraParcela("2026-09-02", "2026-08-18")).toBe("2026-09-02");
  });

  it("rejeita adiamento além de 15 dias", () => {
    expect(validarDataPrimeiraParcela("2026-09-03", "2026-08-18")).toBeNull();
  });

  it("rejeita data anterior a hoje", () => {
    expect(validarDataPrimeiraParcela("2026-08-17", "2026-08-18")).toBeNull();
  });

  it("rejeita data inválida", () => {
    expect(validarDataPrimeiraParcela("não é data", "2026-08-18")).toBeNull();
  });

  it("expõe o limite como constante (não valor mágico espalhado)", () => {
    expect(LIMITE_DIAS_ADIAR_PRIMEIRA_PARCELA).toBe(15);
  });
});

describe("expandirParcelas", () => {
  it("à vista (tier único de 1 parcela) — vencimento é a própria data da 1ª parcela", () => {
    const tiers: ParcelaTier[] = [{ quantidade: 1, valor: 3840 }];
    const parcelas = expandirParcelas(tiers, "2026-08-18", 10);
    expect(parcelas).toEqual([{ numero: 1, valor: 3840, vencimento: "2026-08-18" }]);
  });

  it("exemplo da spec: 18/08/2026, âncora 10, 6 parcelas tier único — mês seguinte ao da 1ª, rolando o ano", () => {
    const tiers: ParcelaTier[] = [{ quantidade: 6, valor: 1280 }];
    const parcelas = expandirParcelas(tiers, "2026-08-18", 10);
    expect(parcelas.map((p) => p.vencimento)).toEqual([
      "2026-08-18",
      "2026-09-10",
      "2026-10-10",
      "2026-11-10",
      "2026-12-10",
      "2027-01-10",
    ]);
    expect(parcelas.map((p) => p.valor)).toEqual([1280, 1280, 1280, 1280, 1280, 1280]);
    expect(parcelas.map((p) => p.numero)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("dois tiers (pacote CPF+CNPJ, ver regras-limpeza-nome.ts combinarParcelas) — valor muda de tier sem quebrar a sequência de vencimento", () => {
    const tiers: ParcelaTier[] = [
      { quantidade: 3, valor: 300 },
      { quantidade: 3, valor: 100 },
    ];
    const parcelas = expandirParcelas(tiers, "2026-08-18", 10);
    expect(parcelas.map((p) => p.valor)).toEqual([300, 300, 300, 100, 100, 100]);
    expect(parcelas.map((p) => p.vencimento)).toEqual([
      "2026-08-18",
      "2026-09-10",
      "2026-10-10",
      "2026-11-10",
      "2026-12-10",
      "2027-01-10",
    ]);
  });

  it("troca de âncora — dia 01 e dia 20 calculam corretamente", () => {
    const tiers: ParcelaTier[] = [{ quantidade: 2, valor: 500 }];
    expect(expandirParcelas(tiers, "2026-08-18", 1).map((p) => p.vencimento)).toEqual([
      "2026-08-18",
      "2026-09-01",
    ]);
    expect(expandirParcelas(tiers, "2026-08-18", 20).map((p) => p.vencimento)).toEqual([
      "2026-08-18",
      "2026-09-20",
    ]);
  });

  it("1ª parcela adiada muda o mês-base das seguintes (parte do mês em que ela caiu, não do mês da venda)", () => {
    const tiers: ParcelaTier[] = [{ quantidade: 2, valor: 500 }];
    // venda em 28/08, lead adia a 1ª pra 02/09 (dentro do limite de 15 dias) — mês da 1ª parcela
    // passa a ser setembro, então a 2ª parcela cai no mês seguinte (outubro), não em setembro.
    expect(expandirParcelas(tiers, "2026-09-02", 10).map((p) => p.vencimento)).toEqual([
      "2026-09-02",
      "2026-10-10",
    ]);
  });

  it("lista de tiers vazia devolve lista vazia", () => {
    expect(expandirParcelas([], "2026-08-18", 10)).toEqual([]);
  });

  expect(DIAS_ANCORA_VALIDOS).toEqual([1, 10, 20]);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham (módulo não existe ainda)**

Run: `pnpm vitest run src/lib/motor-fluxo/calculo-vencimentos-pagamento.test.ts`
Expected: FAIL — `Cannot find module './calculo-vencimentos-pagamento'`

- [ ] **Step 3: Implementar**

```typescript
// Cálculo de vencimentos do detalhe de pagamento no fechamento — spec:
// docs/superpowers/specs/2026-08-18-captura-detalhe-pagamento-fechamento-design.md
//
// Puro e testável: "agora"/"hoje" é sempre parâmetro injetável com default `new Date()`, nunca lido
// de Date.now() direto dentro da função — mesmo padrão de saudacaoPorHorario (engine.ts) e
// selo-risco.ts.

import type { ParcelaTier } from "./regras-limpeza-nome";

export const LIMITE_DIAS_ADIAR_PRIMEIRA_PARCELA = 15;
export const DIAS_ANCORA_VALIDOS = [1, 10, 20] as const;
export type DiaAncora = (typeof DIAS_ANCORA_VALIDOS)[number];

function paraISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** Data de hoje em ISO (YYYY-MM-DD), sem hora — base pra "1ª parcela vence hoje" por padrão. */
export function dataDeHojeISO(agora: Date = new Date()): string {
  return paraISO(agora);
}

/**
 * Valida se a data de 1ª parcela pedida pelo lead está dentro da regra (hoje até +15 dias, nunca
 * antes de hoje). `dataPedidaISO`/`hojeISO` em ISO (YYYY-MM-DD). `null` = fora da regra ou inválida.
 */
export function validarDataPrimeiraParcela(dataPedidaISO: string, hojeISO: string): string | null {
  const pedida = new Date(`${dataPedidaISO}T00:00:00Z`);
  const hoje = new Date(`${hojeISO}T00:00:00Z`);
  if (Number.isNaN(pedida.getTime())) return null;
  const diffDias = Math.round((pedida.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDias < 0 || diffDias > LIMITE_DIAS_ADIAR_PRIMEIRA_PARCELA) return null;
  return dataPedidaISO;
}

export type ParcelaCalculada = { numero: number; valor: number; vencimento: string };

/**
 * Vencimento de UMA parcela: a 1ª cai exatamente na data confirmada; da 2ª em diante, no dia-âncora
 * do mês seguinte ao mês em que caiu a 1ª parcela, avançando um mês por parcela — nunca do mês da
 * venda (regra confirmada com o Luiz, 18/08/2026: se a 1ª parcela foi adiada pra outro mês, a
 * contagem parte do mês em que ela caiu). `Date.UTC` com mês > 11 rola o ano sozinho.
 */
function vencimentoParcela(dataPrimeiraParcelaISO: string, diaAncora: DiaAncora, numeroParcela: number): string {
  if (numeroParcela === 1) return dataPrimeiraParcelaISO;
  const primeira = new Date(`${dataPrimeiraParcelaISO}T00:00:00Z`);
  const data = new Date(
    Date.UTC(primeira.getUTCFullYear(), primeira.getUTCMonth() + (numeroParcela - 1), diaAncora),
  );
  return paraISO(data);
}

/**
 * Expande os tiers já combinados pela precificação (`combinarParcelas`/`combinarFaixasPacote`, em
 * regras-limpeza-nome.ts — cada tier é "N meses seguidos neste valor mensal") numa lista de parcelas
 * individuais com número/valor/vencimento, uma por mês, na ordem dos tiers.
 */
export function expandirParcelas(
  tiers: ParcelaTier[],
  dataPrimeiraParcelaISO: string,
  diaAncora: DiaAncora,
): ParcelaCalculada[] {
  const parcelas: ParcelaCalculada[] = [];
  let numero = 1;
  for (const tier of tiers) {
    for (let i = 0; i < tier.quantidade; i++) {
      parcelas.push({
        numero,
        valor: tier.valor,
        vencimento: vencimentoParcela(dataPrimeiraParcelaISO, diaAncora, numero),
      });
      numero++;
    }
  }
  return parcelas;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `pnpm vitest run src/lib/motor-fluxo/calculo-vencimentos-pagamento.test.ts`
Expected: PASS (16 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/motor-fluxo/calculo-vencimentos-pagamento.ts src/lib/motor-fluxo/calculo-vencimentos-pagamento.test.ts
git commit -m "feat(motor-fluxo): calculo puro de vencimentos do detalhe de pagamento"
```

---

### Task 2: Tipos novos em `tipos.ts`

**Files:**
- Modify: `src/lib/motor-fluxo/tipos.ts`

**Interfaces:**
- Consumes: nada de fora do arquivo.
- Produces: `"negociacao_pagamento"` (novo valor de `TipoResposta`), `type ResultadoNegociacaoPagamento`, `type InterpretadorNegociacaoPagamento`, campo `interpretarNegociacaoPagamento?` em `ContextoAvanco` — consumidos pela Task 3 (interpretador) e Task 4 (engine.ts).

- [ ] **Step 1: Adicionar `"negociacao_pagamento"` a `TipoResposta`**

Editar o union em `tipos.ts` (linha 8-32), acrescentando depois de `"faixas_documentos"`:

```typescript
  | "faixas_documentos"
  /**
   * Negociação natural do detalhe de pagamento no fechamento (forma, data da 1ª parcela,
   * dia-âncora das seguintes) — spec: docs/superpowers/specs/2026-08-18-captura-detalhe-pagamento-fechamento-design.md.
   * Mesma filosofia de interpretador especializado de lista_documentos/faixas_documentos, mas com
   * 3 saídas diferentes (`ResultadoNegociacaoPagamento`): confirmado / ajuste válido / precisa
   * negociar — nunca binário reconhecido/não-reconhecido.
   */
  | "negociacao_pagamento";
```

- [ ] **Step 2: Adicionar os tipos de resultado/interpretador**

Acrescentar no final do arquivo (depois de `InterpretadorFaixasDocumentos`, antes de `ContextoAvanco`):

```typescript
/**
 * Resultado do interpretador especializado de `tipo_resposta: "negociacao_pagamento"` — 3 saídas:
 * - `confirmado`: o lead aceitou a mensagem de confirmação como está — motor grava o detalhe final
 *   em `dados` e segue em frente.
 * - `ajuste_valido`: o lead pediu uma mudança dentro das regras (forma, data ≤15 dias, âncora
 *   01/10/20) — motor persiste o ajuste, recalcula vencimentos e reenvia a confirmação atualizada.
 * - `negociando`: o lead pediu algo fora das regras ou ambíguo — a IA explica o limite/opções em
 *   linguagem natural (não uma mensagem fixa) e o motor permanece no checkpoint.
 */
export type ResultadoNegociacaoPagamento =
  | { status: "confirmado" }
  | {
      status: "ajuste_valido";
      formaPagamento: "boleto_pix" | "cartao";
      dataPrimeiraParcela: string; // ISO, já validada contra a regra de +15 dias
      diaAncora: 1 | 10 | 20 | null; // null quando à vista (não se aplica)
      mensagemConfirmando: string; // frase curta, natural, confirmando o que mudou
    }
  | { status: "negociando"; mensagemNegociacao: string };

export type InterpretadorNegociacaoPagamento = (params: {
  etapaAtual: EtapaCarregada;
  respostaLead: string;
  dados: DadosConversa;
}) => Promise<ResultadoNegociacaoPagamento>;
```

- [ ] **Step 3: Registrar o hook em `ContextoAvanco`**

Em `ContextoAvanco` (linha 242-255), acrescentar depois de `interpretarFaixasDocumentos?: InterpretadorFaixasDocumentos;`:

```typescript
  interpretarNegociacaoPagamento?: InterpretadorNegociacaoPagamento;
```

- [ ] **Step 4: Checar que o projeto ainda compila**

Run: `pnpm tsc --noEmit`
Expected: sem erro novo (os novos tipos não são usados em lugar nenhum ainda, isso é esperado — TypeScript não reclama de tipo exportado não-usado)

- [ ] **Step 5: Commit**

```bash
git add src/lib/motor-fluxo/tipos.ts
git commit -m "feat(motor-fluxo): tipos do interpretador de negociacao de pagamento"
```

---

### Task 3: Interpretador especializado (validação pura + chamada de IA)

**Files:**
- Create: `src/lib/motor-fluxo/interpretar-negociacao-pagamento-validacao.ts`
- Test: `src/lib/motor-fluxo/interpretar-negociacao-pagamento-validacao.test.ts`
- Create: `src/lib/motor-fluxo/interpretar-negociacao-pagamento.ts`

**Interfaces:**
- Consumes: `ResultadoNegociacaoPagamento`, `InterpretadorNegociacaoPagamento`, `EtapaCarregada`, `DadosConversa` (Task 2); `validarDataPrimeiraParcela`, `dataDeHojeISO`, `DIAS_ANCORA_VALIDOS` (Task 1); `textoDeMensagem` de `./engine` (já existe, usado por `interpretar-faixas-documentos.ts` do mesmo jeito).
- Produces: `validarRespostaNegociacaoPagamento(bruta, estadoAtual, hojeISO): ResultadoNegociacaoPagamento` (puro, testado isoladamente); `interpretarNegociacaoPagamento: InterpretadorNegociacaoPagamento` (I/O, consumido pela Task 4/engine.ts).

- [ ] **Step 1: Escrever os testes da validação pura (falhando)**

```typescript
import { describe, expect, it } from "vitest";
import { validarRespostaNegociacaoPagamento, type RespostaBrutaNegociacaoPagamento } from "./interpretar-negociacao-pagamento-validacao";

const HOJE = "2026-08-18";
const ESTADO_PADRAO = { formaPagamento: "boleto_pix" as const, dataPrimeiraParcela: HOJE, diaAncora: 10 as const, parcelado: true };

describe("validarRespostaNegociacaoPagamento", () => {
  it("confirmado passa direto", () => {
    const bruta: RespostaBrutaNegociacaoPagamento = { status: "confirmado", forma_pagamento: "boleto_pix", data_primeira_parcela: HOJE, dia_ancora: 10, mensagem: "" };
    expect(validarRespostaNegociacaoPagamento(bruta, ESTADO_PADRAO, HOJE)).toEqual({ status: "confirmado" });
  });

  it("ajuste_valido de forma de pagamento pra cartao", () => {
    const bruta: RespostaBrutaNegociacaoPagamento = { status: "ajuste_valido", forma_pagamento: "cartao", data_primeira_parcela: HOJE, dia_ancora: 10, mensagem: "Combinado, ajustei pra cartão!" };
    expect(validarRespostaNegociacaoPagamento(bruta, ESTADO_PADRAO, HOJE)).toEqual({
      status: "ajuste_valido",
      formaPagamento: "cartao",
      dataPrimeiraParcela: HOJE,
      diaAncora: 10,
      mensagemConfirmando: "Combinado, ajustei pra cartão!",
    });
  });

  it("ajuste_valido de data dentro do limite de 15 dias", () => {
    const bruta: RespostaBrutaNegociacaoPagamento = { status: "ajuste_valido", forma_pagamento: "boleto_pix", data_primeira_parcela: "2026-08-28", dia_ancora: 10, mensagem: "Fechado, dia 28!" };
    expect(validarRespostaNegociacaoPagamento(bruta, ESTADO_PADRAO, HOJE)).toEqual({
      status: "ajuste_valido",
      formaPagamento: "boleto_pix",
      dataPrimeiraParcela: "2026-08-28",
      diaAncora: 10,
      mensagemConfirmando: "Fechado, dia 28!",
    });
  });

  it("data pedida além de 15 dias vira negociando (nao aceita cegamente o que a IA mandou)", () => {
    const bruta: RespostaBrutaNegociacaoPagamento = { status: "ajuste_valido", forma_pagamento: "boleto_pix", data_primeira_parcela: "2026-09-10", dia_ancora: 10, mensagem: "" };
    const resultado = validarRespostaNegociacaoPagamento(bruta, ESTADO_PADRAO, HOJE);
    expect(resultado.status).toBe("negociando");
  });

  it("dia-ancora fora de 01/10/20 vira negociando mesmo se a IA mandou ajuste_valido", () => {
    const bruta: RespostaBrutaNegociacaoPagamento = { status: "ajuste_valido", forma_pagamento: "boleto_pix", data_primeira_parcela: HOJE, dia_ancora: 15, mensagem: "" };
    const resultado = validarRespostaNegociacaoPagamento(bruta, ESTADO_PADRAO, HOJE);
    expect(resultado.status).toBe("negociando");
  });

  it("dia-ancora em pedido a vista fica null mesmo se a IA mandou um numero", () => {
    const estadoAvista = { ...ESTADO_PADRAO, parcelado: false };
    const bruta: RespostaBrutaNegociacaoPagamento = { status: "ajuste_valido", forma_pagamento: "cartao", data_primeira_parcela: HOJE, dia_ancora: 10, mensagem: "Combinado!" };
    expect(validarRespostaNegociacaoPagamento(bruta, estadoAvista, HOJE)).toEqual({
      status: "ajuste_valido",
      formaPagamento: "cartao",
      dataPrimeiraParcela: HOJE,
      diaAncora: null,
      mensagemConfirmando: "Combinado!",
    });
  });

  it("negociando repassa a mensagem da IA", () => {
    const bruta: RespostaBrutaNegociacaoPagamento = { status: "negociando", forma_pagamento: "boleto_pix", data_primeira_parcela: HOJE, dia_ancora: 10, mensagem: "Consigo adiar até 15 dias — quer que eu deixe pro dia 28?" };
    expect(validarRespostaNegociacaoPagamento(bruta, ESTADO_PADRAO, HOJE)).toEqual({
      status: "negociando",
      mensagemNegociacao: "Consigo adiar até 15 dias — quer que eu deixe pro dia 28?",
    });
  });

  it("status desconhecido vira negociando com mensagem generica (nunca quebra o motor)", () => {
    const bruta = { status: "algo_invalido", forma_pagamento: "boleto_pix", data_primeira_parcela: HOJE, dia_ancora: 10, mensagem: "" } as unknown as RespostaBrutaNegociacaoPagamento;
    const resultado = validarRespostaNegociacaoPagamento(bruta, ESTADO_PADRAO, HOJE);
    expect(resultado.status).toBe("negociando");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run src/lib/motor-fluxo/interpretar-negociacao-pagamento-validacao.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar a validação pura**

```typescript
// Parte pura de interpretar-negociacao-pagamento.ts, separada sem `server-only` de propósito —
// mesmo motivo de interpretacao-ia-validacao.ts / interpretar-faixas-documentos-validacao.ts (o SDK
// da Anthropic quebra o Vitest se importado direto).

import { DIAS_ANCORA_VALIDOS, validarDataPrimeiraParcela, type DiaAncora } from "./calculo-vencimentos-pagamento";
import type { ResultadoNegociacaoPagamento } from "./tipos";

export type RespostaBrutaNegociacaoPagamento = {
  status: "confirmado" | "ajuste_valido" | "negociando";
  forma_pagamento: "boleto_pix" | "cartao";
  data_primeira_parcela: string;
  dia_ancora: number;
  mensagem: string;
};

/** Estado atual da negociação (o que já está em `dados` — defaults ou ajuste de rodada anterior). */
export type EstadoNegociacaoPagamento = {
  formaPagamento: "boleto_pix" | "cartao";
  dataPrimeiraParcela: string;
  diaAncora: DiaAncora;
  /** false = à vista, parcela única — dia-âncora não se aplica */
  parcelado: boolean;
};

const MENSAGEM_NEGOCIANDO_GENERICA = "Deixa eu confirmar isso direitinho com você antes de seguir.";

/**
 * Valida a resposta bruta da IA contra as regras de negócio (spec, seção 1) — nunca confia cegamente
 * que o modelo respeitou o limite de 15 dias ou o dia-âncora 01/10/20 sozinho; rebaixa pra
 * "negociando" com mensagem genérica sempre que o que a IA mandou não bate com a regra.
 */
export function validarRespostaNegociacaoPagamento(
  bruta: RespostaBrutaNegociacaoPagamento,
  estadoAtual: EstadoNegociacaoPagamento,
  hojeISO: string,
): ResultadoNegociacaoPagamento {
  if (bruta.status === "confirmado") return { status: "confirmado" };

  if (bruta.status === "negociando") {
    const mensagem = bruta.mensagem?.trim();
    return { status: "negociando", mensagemNegociacao: mensagem || MENSAGEM_NEGOCIANDO_GENERICA };
  }

  if (bruta.status !== "ajuste_valido") {
    return { status: "negociando", mensagemNegociacao: MENSAGEM_NEGOCIANDO_GENERICA };
  }

  const dataValidada = validarDataPrimeiraParcela(bruta.data_primeira_parcela, hojeISO);
  if (!dataValidada) return { status: "negociando", mensagemNegociacao: MENSAGEM_NEGOCIANDO_GENERICA };

  let diaAncora: DiaAncora | null = null;
  if (estadoAtual.parcelado) {
    if (!DIAS_ANCORA_VALIDOS.includes(bruta.dia_ancora as DiaAncora)) {
      return { status: "negociando", mensagemNegociacao: MENSAGEM_NEGOCIANDO_GENERICA };
    }
    diaAncora = bruta.dia_ancora as DiaAncora;
  }

  if (bruta.forma_pagamento !== "boleto_pix" && bruta.forma_pagamento !== "cartao") {
    return { status: "negociando", mensagemNegociacao: MENSAGEM_NEGOCIANDO_GENERICA };
  }

  const mensagemConfirmando = bruta.mensagem?.trim();
  if (!mensagemConfirmando) return { status: "negociando", mensagemNegociacao: MENSAGEM_NEGOCIANDO_GENERICA };

  return {
    status: "ajuste_valido",
    formaPagamento: bruta.forma_pagamento,
    dataPrimeiraParcela: dataValidada,
    diaAncora,
    mensagemConfirmando,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm vitest run src/lib/motor-fluxo/interpretar-negociacao-pagamento-validacao.test.ts`
Expected: PASS (9 testes)

- [ ] **Step 5: Implementar a chamada de IA (mirror de `interpretar-faixas-documentos.ts`)**

```typescript
// Interpretador especializado de `tipo_resposta: "negociacao_pagamento"` — negocia naturalmente o
// detalhe de pagamento do fechamento (forma, data da 1ª parcela, dia-âncora das seguintes) em vez de
// um menu fechado. Spec: docs/superpowers/specs/2026-08-18-captura-detalhe-pagamento-fechamento-design.md.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { dataDeHojeISO } from "./calculo-vencimentos-pagamento";
import { textoDeMensagem } from "./engine";
import {
  validarRespostaNegociacaoPagamento,
  type EstadoNegociacaoPagamento,
  type RespostaBrutaNegociacaoPagamento,
} from "./interpretar-negociacao-pagamento-validacao";
import type { EtapaCarregada, InterpretadorNegociacaoPagamento } from "./tipos";

const MODELO_INTERPRETACAO = "claude-haiku-4-5-20251001";

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

function ferramenta() {
  return {
    name: "interpretar_negociacao_pagamento",
    description:
      "Registra se o lead confirmou a mensagem de pagamento como está, pediu um ajuste válido, ou precisa de mais negociação/explicação.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["confirmado", "ajuste_valido", "negociando"],
          description:
            "'confirmado' quando o lead aceitou a proposta como está (ex.: 'confirmo', 'pode ser', 'tá bom'). 'ajuste_valido' quando pediu uma mudança que está dentro do que é permitido (forma boleto_pix/cartão, data até 15 dias a partir de hoje, dia-âncora 01/10/20). 'negociando' quando pediu algo fora do permitido, foi ambíguo, ou fez uma pergunta — gere uma resposta natural explicando o que é possível.",
        },
        forma_pagamento: {
          type: "string",
          enum: ["boleto_pix", "cartao"],
          description: "Forma de pagamento final (mesmo quando não mudou, repita o valor atual).",
        },
        data_primeira_parcela: {
          type: "string",
          description: "Data da 1ª parcela em ISO (YYYY-MM-DD) — mesmo quando não mudou, repita a data atual.",
        },
        dia_ancora: {
          type: "number",
          description: "Dia-âncora das parcelas seguintes (1, 10 ou 20) — mesmo quando não mudou, repita o valor atual. Ignorado se a venda é à vista.",
        },
        mensagem: {
          type: "string",
          description:
            "Se status=ajuste_valido: frase curta e natural confirmando a mudança (ex.: 'Combinado, ajustei pra cartão!'). Se status=negociando: mensagem explicando o que é possível dentro do que o lead pediu, no tom da Malala — natural, não robótica, pode fazer pergunta de volta. Vazio se status=confirmado.",
        },
      },
      required: ["status", "forma_pagamento", "data_primeira_parcela", "dia_ancora", "mensagem"],
    },
  };
}

function montarPrompt(params: {
  etapaAtual: EtapaCarregada;
  respostaLead: string;
  estadoAtual: EstadoNegociacaoPagamento;
  hojeISO: string;
}): string {
  const { etapaAtual, respostaLead, estadoAtual, hojeISO } = params;
  const mensagemAtual = etapaAtual.conteudo.mensagens.map(textoDeMensagem).join("\n");

  return [
    "Você é a Malala, atendente automatizada de WhatsApp da ArrudaCred (limpeza de nome/crédito). Você acabou de mandar uma mensagem de confirmação de pagamento pro lead e ele respondeu.",
    "",
    `Mensagem de confirmação que o lead recebeu:\n"""\n${mensagemAtual}\n"""`,
    "",
    `Estado atual (o que está na mensagem acima): forma de pagamento ${estadoAtual.formaPagamento}, 1ª parcela em ${estadoAtual.dataPrimeiraParcela}${estadoAtual.parcelado ? `, parcelas seguintes sempre no dia ${estadoAtual.diaAncora}` : " (pagamento único, à vista)"}.`,
    `Hoje é ${hojeISO}.`,
    "",
    `Resposta do lead: "${respostaLead}"`,
    "",
    "Regras de negócio pra validar qualquer pedido de mudança:",
    "- Forma de pagamento: só Boleto/Pix ou Cartão.",
    `- Data da 1ª parcela: pode ser adiada a partir de hoje (${hojeISO}), no máximo até 15 dias depois — nunca antes de hoje, nunca mais que 15 dias.`,
    estadoAtual.parcelado
      ? "- Dia-âncora das parcelas seguintes: só 01, 10 ou 20 do mês."
      : "- Esta venda é à vista — não existe dia-âncora, só a data da 1ª (e única) parcela.",
    "",
    "Se o lead confirmou (mesmo implicitamente, tipo 'combinado' ou 'pode fechar assim'), marque confirmado. Se pediu algo dentro do permitido, marque ajuste_valido com os valores finais. Se pediu algo fora do permitido, foi vago, ou fez uma pergunta, marque negociando e escreva uma resposta natural (não robótica) explicando o que é possível — pode negociar em várias mensagens, não precisa fechar nesta.",
  ].join("\n");
}

export const interpretarNegociacaoPagamento: InterpretadorNegociacaoPagamento = async ({
  etapaAtual,
  respostaLead,
  dados,
}) => {
  const hojeISO = dataDeHojeISO();
  const estadoAtual: EstadoNegociacaoPagamento = {
    formaPagamento: dados.forma_pagamento_detalhe === "cartao" ? "cartao" : "boleto_pix",
    dataPrimeiraParcela: dados.data_primeira_parcela || hojeISO,
    diaAncora: dados.dia_ancora_parcelas === "1" || dados.dia_ancora_parcelas === "20" ? Number(dados.dia_ancora_parcelas) as 1 | 20 : 10,
    parcelado: dados.forma_pagamento === "parcelado",
  };

  const cliente = obterCliente();
  const prompt = montarPrompt({ etapaAtual, respostaLead, estadoAtual, hojeISO });

  try {
    const resposta = await cliente.messages.create({
      model: MODELO_INTERPRETACAO,
      max_tokens: 800,
      tools: [ferramenta()],
      tool_choice: { type: "tool", name: "interpretar_negociacao_pagamento" },
      messages: [{ role: "user", content: prompt }],
    });

    const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
    if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") {
      return { status: "negociando", mensagemNegociacao: "Deixa eu confirmar isso direitinho com você antes de seguir." };
    }

    const bruta = blocoFerramenta.input as RespostaBrutaNegociacaoPagamento;
    return validarRespostaNegociacaoPagamento(bruta, estadoAtual, hojeISO);
  } catch (e) {
    console.error("[interpretar-negociacao-pagamento] erro ao chamar Claude:", e);
    return { status: "negociando", mensagemNegociacao: "Deixa eu confirmar isso direitinho com você antes de seguir." };
  }
};
```

- [ ] **Step 6: Checar tipos**

Run: `pnpm tsc --noEmit`
Expected: sem erro

- [ ] **Step 7: Commit**

```bash
git add src/lib/motor-fluxo/interpretar-negociacao-pagamento-validacao.ts src/lib/motor-fluxo/interpretar-negociacao-pagamento-validacao.test.ts src/lib/motor-fluxo/interpretar-negociacao-pagamento.ts
git commit -m "feat(motor-fluxo): interpretador especializado de negociacao de pagamento"
```

---

### Task 4: Campos derivados — expandir estado padrão/negociado em `dados`

**Files:**
- Modify: `src/lib/motor-fluxo/fluxo-limpeza-nome.ts` (função `criarCalculadoraDadosDerivados`, linhas 825-844)
- Modify: `src/lib/motor-fluxo/engine.test.ts` (ou arquivo de teste dedicado, ver Step 3)

**Interfaces:**
- Consumes: `combinarFaixasPacote`, `ParcelaTier` (`regras-limpeza-nome.ts`, já importados no arquivo); `dataDeHojeISO`, `expandirParcelas` (Task 1).
- Produces: quando `dados.forma_pagamento` está setado (à vista ou parcelado já escolhido) e `dados.parcelas_valores` ainda não existe, calcula e grava os defaults: `forma_pagamento_detalhe`, `data_primeira_parcela`, `dia_ancora_parcelas` (só se parcelado), `parcelas_valores`, `parcelas_vencimentos` — consumidos pela Task 5 (resolver de mensagem) e pela Task 6 (checkpoint em loop).

- [ ] **Step 1: Escrever o teste (falhando)**

Em `src/lib/motor-fluxo/fluxo-limpeza-nome.test.ts` se existir, senão criar `src/lib/motor-fluxo/calcular-dados-derivados-pagamento.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { criarCalculadoraDadosDerivados } from "./fluxo-limpeza-nome";
import type { FaixaPreco } from "./regras-limpeza-nome";

const FAIXA_TESTE: FaixaPreco = {
  faixaMin: 0,
  faixaMax: null,
  precoCheio: 3840,
  precoAvista: 3840,
  parcelasBoletoQtd: 6,
  parcelasBoletoValor: 640,
  parcelasCartaoMax: 12,
  voucherAvista: null,
  voucherParcelasQtd: null,
  voucherParcelasValor: null,
};

const CONFIG_TESTE = { altoValorFixo: 0, altoValorPercentual: 0, corteAltoValor: 500_000 };

describe("criarCalculadoraDadosDerivados — detalhe de pagamento", () => {
  const calcular = criarCalculadoraDadosDerivados(CONFIG_TESTE, [FAIXA_TESTE]);

  it("parcelado: calcula defaults (boleto_pix, hoje, ancora 10) e expande parcelas", () => {
    const derivados = calcular({
      forma_pagamento: "parcelado",
      documentos_valores: "2000",
    });
    expect(derivados.forma_pagamento_detalhe).toBe("boleto_pix");
    expect(derivados.dia_ancora_parcelas).toBe("10");
    expect(derivados.data_primeira_parcela).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(derivados.parcelas_valores).toBe("640,640,640,640,640,640");
    expect(derivados.parcelas_vencimentos?.split(",")).toHaveLength(6);
  });

  it("a vista: sem dia-ancora, uma parcela so", () => {
    const derivados = calcular({ forma_pagamento: "avista", documentos_valores: "2000" });
    expect(derivados.dia_ancora_parcelas).toBeUndefined();
    expect(derivados.parcelas_valores?.split(",")).toHaveLength(1);
  });

  it("nao recalcula (nem sobrescreve ajuste ja negociado) quando parcelas_valores ja existe", () => {
    const derivados = calcular({
      forma_pagamento: "parcelado",
      documentos_valores: "2000",
      parcelas_valores: "999",
      forma_pagamento_detalhe: "cartao",
    });
    expect(derivados.forma_pagamento_detalhe).toBeUndefined();
    expect(derivados.parcelas_valores).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run src/lib/motor-fluxo/calcular-dados-derivados-pagamento.test.ts`
Expected: FAIL — `criarCalculadoraDadosDerivados` ainda não recebe `faixasPrecos`/não calcula esses campos

- [ ] **Step 3: Implementar**

`criarCalculadoraDadosDerivados` (linha 825-844) ganha um 2º parâmetro `faixasPrecos: FaixaPreco[]` e o bloco novo:

```typescript
export function criarCalculadoraDadosDerivados(
  config: Pick<ConfigPrecificacaoLimpaNome, "altoValorFixo" | "altoValorPercentual" | "corteAltoValor">,
  faixasPrecos: FaixaPreco[],
) {
  return (dados: DadosConversa): DadosConversa => {
    const derivados: DadosConversa = {};

    if (dados.documentos_tipos) {
      derivados.tipo_documento = resumoTipoDocumento(dados.documentos_tipos);
    }

    if (dados.documentos_valores) {
      const total = somarValoresDocumentos(dados.documentos_valores);
      derivados.valor_restricao_estimado = String(total);
      derivados.alto_valor = classificarAltoValor(total, config.corteAltoValor) ? "sim" : "nao";
      derivados.documentos_valor_baixo = total < 3000 ? "sim" : "nao";
    }

    // Defaults do detalhe de pagamento (spec 2026-08-18) — calculados UMA vez, assim que
    // forma_pagamento é escolhida (ln_passo15_normal/selfservice); se parcelas_valores já existe,
    // é porque já foi calculado antes (ou já foi ajustado pela negociação, Task 6) — nunca
    // sobrescreve, senão perderia um ajuste que o lead já tinha feito.
    if (dados.forma_pagamento && !dados.parcelas_valores) {
      const parcelado = dados.forma_pagamento === "parcelado";
      const faixaCombinada = combinarFaixasPacote(valoresPorDocumento(dados), faixasPrecos);
      const tiers: ParcelaTier[] = parcelado
        ? faixaCombinada?.parcelasBoleto ?? []
        : [{ quantidade: 1, valor: faixaCombinada?.precoAvista ?? 0 }];

      if (tiers.length > 0) {
        const hojeISO = dataDeHojeISO();
        const diaAncora: DiaAncora = 10;
        const parcelas = expandirParcelas(tiers, hojeISO, diaAncora);

        derivados.forma_pagamento_detalhe = "boleto_pix";
        derivados.data_primeira_parcela = hojeISO;
        if (parcelado) derivados.dia_ancora_parcelas = String(diaAncora);
        derivados.parcelas_valores = parcelas.map((p) => p.valor.toFixed(2)).join(",");
        derivados.parcelas_vencimentos = parcelas.map((p) => p.vencimento).join(",");
      }
    }

    return derivados;
  };
}
```

E os imports do topo do arquivo (linha 21-32) ganham `type ParcelaTier` na lista já existente de `regras-limpeza-nome`, mais a nova linha de import de `calculo-vencimentos-pagamento`:

```typescript
import { dataDeHojeISO, expandirParcelas, type DiaAncora } from "./calculo-vencimentos-pagamento";
```

- [ ] **Step 4: Atualizar os 2 call sites de `criarCalculadoraDadosDerivados`**

Dois lugares chamam `criarCalculadoraDadosDerivados(config)` só com 1 argumento — os dois precisam passar `faixasPrecos` como 2º argumento (a mesma lista que cada um já carrega pra passar em `criarResolverMensagensDinamicas` logo ao lado, mesmo import):
- `src/app/simulador/actions.ts:53` — `calcularDadosDerivados: criarCalculadoraDadosDerivados(config),` → `criarCalculadoraDadosDerivados(config, faixasPrecos)`
- `src/app/api/webhooks/zapster/route.ts:67` — mesma mudança

Também `src/lib/motor-fluxo/engine.test.ts:22` — `criarCalculadoraDadosDerivados(CONFIG)` já existente vira `criarCalculadoraDadosDerivados(CONFIG, [])` (array vazio nos testes que não exercitam o cálculo de pagamento; os testes novos da Task 4 usam sua própria instância com `[FAIXA_TESTE]`, não essa).

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `pnpm vitest run src/lib/motor-fluxo/calcular-dados-derivados-pagamento.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 6: Rodar a suíte inteira do motor pra garantir que nada quebrou**

Run: `pnpm vitest run src/lib/motor-fluxo`
Expected: PASS em tudo (a assinatura de `criarCalculadoraDadosDerivados` mudou — confirme que os testes existentes que a chamam direto também foram atualizados com o novo argumento)

- [ ] **Step 7: Commit**

```bash
git add src/lib/motor-fluxo/fluxo-limpeza-nome.ts src/lib/motor-fluxo/calcular-dados-derivados-pagamento.test.ts
git commit -m "feat(motor-fluxo): defaults do detalhe de pagamento como dados derivados"
```

---

### Task 5: Mensagem de confirmação — `criarResolverMensagensDinamicas`

**Files:**
- Modify: `src/lib/motor-fluxo/fluxo-limpeza-nome.ts` (função `criarResolverMensagensDinamicas`, linhas 883-948)

**Interfaces:**
- Consumes: campos derivados da Task 4 (`forma_pagamento_detalhe`, `data_primeira_parcela`, `dia_ancora_parcelas`, `parcelas_valores`, `parcelas_vencimentos`), já presentes em `dados` quando este branch roda (a Task 4 sempre roda antes, no mesmo turno em que `forma_pagamento` é gravado).
- Produces: texto da mensagem de confirmação no formato exato da spec (seção 2) — consumido só visualmente (nenhum outro código depende do texto).

- [ ] **Step 1: Implementar (sem teste dedicado — é geração de texto, verificado no simulador; segue a mesma convenção dos outros branches desta função, nenhum deles tem teste unitário de string)**

Acrescentar um branch novo em `criarResolverMensagensDinamicas` (depois do branch `"ln_passo15_selfservice"`, antes do `return null;` final):

```typescript
    if (codigo === "ln_passo16_1") {
      const valores = (dados.parcelas_valores ?? "").split(",").filter(Boolean).map(Number);
      const vencimentos = (dados.parcelas_vencimentos ?? "").split(",").filter(Boolean);
      if (valores.length === 0 || vencimentos.length !== valores.length) return null;

      const formaTexto = dados.forma_pagamento_detalhe === "cartao" ? "Cartão" : "Boleto/Pix";
      const totalContrato = valores.reduce((soma, v) => soma + v, 0);

      if (valores.length === 1) {
        return [
          t(
            `Valor do Contrato:\n${formatarReais(totalContrato)}\n\nPagamento:\nÀ Vista no ${formaTexto}\n\nVencimento:\n${formatarDataBr(vencimentos[0])}`,
          ),
        ];
      }

      const linhasVencimentos = vencimentos.map((venc, i) => `${formatarDataBr(venc)} - ${formatarReais(valores[i])}`).join("\n");
      return [
        t(
          `Valor do Contrato: ${formatarReais(totalContrato)}\n\nPagamento:\nem ${valores.length} vezes - Parcelado no ${formaTexto}\n\nValor da Parcela:\n${formatarReais(valores[0])}\n\nVencimentos:\n${linhasVencimentos}`,
        ),
      ];
    }

    return null;
```

Acrescentar `formatarDataBr` no arquivo `regras-limpeza-nome.ts` (perto de `formatarReais`, mesmo estilo — recebe ISO `YYYY-MM-DD`, devolve `DD/MM/AA`) e importar junto com `formatarReais`/`formatarParcelas` no topo de `fluxo-limpeza-nome.ts`:

```typescript
export function formatarDataBr(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano.slice(2)}`;
}
```

- [ ] **Step 2: Checar tipos**

Run: `pnpm tsc --noEmit`
Expected: sem erro

- [ ] **Step 3: Commit**

```bash
git add src/lib/motor-fluxo/fluxo-limpeza-nome.ts src/lib/motor-fluxo/regras-limpeza-nome.ts
git commit -m "feat(motor-fluxo): mensagem de confirmacao do detalhe de pagamento"
```

---

### Task 6: Branch em `engine.ts` + reformular o checkpoint `ln_passo16_1`

**Files:**
- Modify: `src/lib/motor-fluxo/engine.ts` (novo branch em `avancarConversa`, ao lado dos de `lista_documentos`/`faixas_documentos`, linhas 298-343)
- Modify: `src/lib/motor-fluxo/fluxo-limpeza-nome.ts` (definição do checkpoint `ln_passo16_1`, linhas 618-633)
- Modify: `src/lib/motor-fluxo/engine.test.ts`

**Interfaces:**
- Consumes: `interpretarNegociacaoPagamento` (Task 3, via `ContextoAvanco`); `ResultadoNegociacaoPagamento` (Task 2).
- Produces: comportamento final do checkpoint — quando confirmado, grava `forma_pagamento_detalhe`/`data_primeira_parcela`/`dia_ancora_parcelas`/`parcelas_valores`/`parcelas_vencimentos` definitivos em `dados` (via `campoSalvo`) e segue pra `ln_passo17a`; quando ajuste válido, persiste o ajuste e recalcula vencimentos, permanece no checkpoint; quando negociando, só responde, permanece no checkpoint.

- [ ] **Step 1: Escrever os testes em `engine.test.ts` (falhando)**

Seguir o padrão dos testes existentes de `faixas_documentos` no mesmo arquivo (buscar `describe("faixas_documentos"` pra copiar a estrutura de mock). Acrescentar:

```typescript
describe("negociacao_pagamento", () => {
  const etapaPagamento: EtapaCarregada = {
    id: "e1",
    fluxoId: "f1",
    ordem: 24,
    campoSalvo: "detalhe_pagamento_confirmado_bruto",
    conteudo: {
      codigo: "ln_passo16_1",
      mensagens: [{ tipo: "texto", texto: "(confirmação gerada dinamicamente)" }],
      aguarda_resposta: true,
      tipo_resposta: "negociacao_pagamento",
    },
  };
  const dadosBase: DadosConversa = {
    forma_pagamento: "parcelado",
    forma_pagamento_detalhe: "boleto_pix",
    data_primeira_parcela: "2026-08-18",
    dia_ancora_parcelas: "10",
    parcelas_valores: "640,640,640,640,640,640",
    parcelas_vencimentos: "2026-08-18,2026-09-10,2026-10-10,2026-11-10,2026-12-10,2027-01-10",
  };

  it("confirmado: grava o composto final em campoSalvo e avanca", async () => {
    const resultado = await avancarConversa({
      etapaAtual: etapaPagamento,
      etapasPorCodigo: { ln_passo16_1: etapaPagamento },
      dados: dadosBase,
      respostaLead: "confirmo",
      interpretarNegociacaoPagamento: async () => ({ status: "confirmado" }),
    });
    expect(resultado.naoReconhecido).toBe(false);
    expect(resultado.dadosNovos.detalhe_pagamento_confirmado_bruto).toBe(
      "boleto_pix|2026-08-18|10|640,640,640,640,640,640|2026-08-18,2026-09-10,2026-10-10,2026-11-10,2026-12-10,2027-01-10",
    );
  });

  it("ajuste_valido: persiste o ajuste, recalcula vencimentos, permanece no checkpoint", async () => {
    const resultado = await avancarConversa({
      etapaAtual: etapaPagamento,
      etapasPorCodigo: { ln_passo16_1: etapaPagamento },
      dados: dadosBase,
      respostaLead: "pode ser no cartão?",
      interpretarNegociacaoPagamento: async () => ({
        status: "ajuste_valido",
        formaPagamento: "cartao",
        dataPrimeiraParcela: "2026-08-18",
        diaAncora: 10,
        mensagemConfirmando: "Combinado, ajustei pra cartão!",
      }),
    });
    expect(resultado.etapaFinal?.conteudo.codigo).toBe("ln_passo16_1");
    expect(resultado.naoReconhecido).toBe(true);
    expect(resultado.dadosNovos.forma_pagamento_detalhe).toBe("cartao");
    expect(resultado.dadosNovos.parcelas_vencimentos).toBe(dadosBase.parcelas_vencimentos);
    expect(resultado.mensagens[0].mensagem).toEqual({ tipo: "texto", texto: "Combinado, ajustei pra cartão!" });
  });

  it("ajuste_valido com nova data: recalcula parcelas_vencimentos a partir da nova 1a parcela", async () => {
    const resultado = await avancarConversa({
      etapaAtual: etapaPagamento,
      etapasPorCodigo: { ln_passo16_1: etapaPagamento },
      dados: dadosBase,
      respostaLead: "posso pagar a primeira daqui a 10 dias?",
      interpretarNegociacaoPagamento: async () => ({
        status: "ajuste_valido",
        formaPagamento: "boleto_pix",
        dataPrimeiraParcela: "2026-08-28",
        diaAncora: 10,
        mensagemConfirmando: "Fechado, dia 28!",
      }),
    });
    expect(resultado.dadosNovos.data_primeira_parcela).toBe("2026-08-28");
    expect(resultado.dadosNovos.parcelas_vencimentos?.split(",")[0]).toBe("2026-08-28");
    expect(resultado.dadosNovos.parcelas_vencimentos?.split(",")[1]).toBe("2026-09-10");
  });

  it("negociando: manda a mensagem de negociacao, nao persiste nada, permanece no checkpoint", async () => {
    const resultado = await avancarConversa({
      etapaAtual: etapaPagamento,
      etapasPorCodigo: { ln_passo16_1: etapaPagamento },
      dados: dadosBase,
      respostaLead: "quero pagar dia 15 de cada mês",
      interpretarNegociacaoPagamento: async () => ({
        status: "negociando",
        mensagemNegociacao: "Só temos os dias 01, 10 ou 20 como opção — qual prefere?",
      }),
    });
    expect(resultado.etapaFinal?.conteudo.codigo).toBe("ln_passo16_1");
    expect(resultado.naoReconhecido).toBe(true);
    expect(resultado.dadosNovos).toEqual({});
    expect(resultado.mensagens[0].mensagem).toEqual({
      tipo: "texto",
      texto: "Só temos os dias 01, 10 ou 20 como opção — qual prefere?",
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run src/lib/motor-fluxo/engine.test.ts -t "negociacao_pagamento"`
Expected: FAIL — branch ainda não existe em `avancarConversa`

- [ ] **Step 3: Implementar o branch em `engine.ts`**

Acrescentar em `avancarConversa` (depois do bloco de `faixas_documentos`, linha 343, antes do `if (!reconhecido && conteudo.interpretacao_ia?.habilitado...)`):

```typescript
  // "negociacao_pagamento" — confirmação/negociação natural do detalhe de pagamento no fechamento
  // (spec: docs/superpowers/specs/2026-08-18-captura-detalhe-pagamento-fechamento-design.md). Ao
  // contrário de lista_documentos/faixas_documentos, "ajuste_valido" PERSISTE o ajuste (dadosNovos
  // não fica vazio) mesmo permanecendo no checkpoint — é assim que a negociação lembra o que já foi
  // combinado na próxima rodada, já que o interpretador só recebe `dados` (sem histórico de turnos).
  if (!reconhecido && conteudo.tipo_resposta === "negociacao_pagamento" && contexto.interpretarNegociacaoPagamento) {
    const resultado = await contexto.interpretarNegociacaoPagamento({ etapaAtual, respostaLead, dados });
    interpretadoPorIA = true;

    if (resultado.status === "confirmado") {
      const composto = [
        dados.forma_pagamento_detalhe ?? "boleto_pix",
        dados.data_primeira_parcela ?? "",
        dados.dia_ancora_parcelas ?? "",
        dados.parcelas_valores ?? "",
        dados.parcelas_vencimentos ?? "",
      ].join("|");
      reconhecido = { valor: composto };
      // cai pro bloco genérico abaixo, que grava em campoSalvo e segue pro próximo código
    } else if (resultado.status === "ajuste_valido") {
      const tiers: ParcelaTier[] = (dados.parcelas_valores ?? "")
        .split(",")
        .filter(Boolean)
        .map((valor) => ({ quantidade: 1, valor: Number(valor) }));
      const diaAncora = resultado.diaAncora ?? 10;
      const parcelasRecalculadas = tiers.length > 0 ? expandirParcelas(tiers, resultado.dataPrimeiraParcela, diaAncora) : [];

      const dadosAjustados: DadosConversa = {
        forma_pagamento_detalhe: resultado.formaPagamento,
        data_primeira_parcela: resultado.dataPrimeiraParcela,
        parcelas_vencimentos: parcelasRecalculadas.map((p) => p.vencimento).join(","),
      };
      if (resultado.diaAncora !== null) dadosAjustados.dia_ancora_parcelas = String(resultado.diaAncora);

      const retomada: MensagemEtapa = { tipo: "texto", texto: resultado.mensagemConfirmando };
      return {
        mensagens: [empacotar(substituirVariaveisMensagem(retomada, dados, variaveisGlobais), conteudo)],
        etapaFinal: etapaAtual,
        dadosNovos: dadosAjustados,
        efeitos: [],
        naoReconhecido: true,
        interpretadoPorIA: true,
        kanbanSubetapa: conteudo.kanban_subetapa ?? null,
      };
    } else {
      const retomada: MensagemEtapa = { tipo: "texto", texto: resultado.mensagemNegociacao };
      return {
        mensagens: [empacotar(substituirVariaveisMensagem(retomada, dados, variaveisGlobais), conteudo)],
        etapaFinal: etapaAtual,
        dadosNovos: {},
        efeitos: [],
        naoReconhecido: true,
        interpretadoPorIA: true,
        kanbanSubetapa: conteudo.kanban_subetapa ?? null,
      };
    }
  }
```

Import novo no topo de `engine.ts`: `import { expandirParcelas } from "./calculo-vencimentos-pagamento";` e `type { ParcelaTier } from "./regras-limpeza-nome"` (checar se já não está importado antes de duplicar).

- [ ] **Step 4: Reformular a definição do checkpoint `ln_passo16_1` em `fluxo-limpeza-nome.ts`**

Trocar o bloco atual (linhas 618-633):

```typescript
  {
    codigo: "ln_passo16_1",
    ordem: 24,
    campoSalvo: "data_primeira_parcela",
    conteudo: {
      codigo: "ln_passo16_1",
      mensagens: [
        t(
          "Perfeito! Só preciso confirmar uma coisa: qual a melhor data pra você pra realizar o pagamento da primeira parcela? O processo só dá entrada depois que o pagamento for confirmado, viu?",
        ),
      ],
      aguarda_resposta: true,
      tipo_resposta: "texto_livre",
      proximo_codigo: "ln_passo17a",
      kanban_subetapa: KANBAN_NEGOCIACAO_DUVIDAS,
    },
  },
```

por:

```typescript
  {
    // Conteúdo real (mensagem de confirmação de pagamento) gerado em tempo de execução por
    // criarResolverMensagensDinamicas — varia por valores/vencimentos calculados. Ver Task 5.
    codigo: "ln_passo16_1",
    ordem: 24,
    campoSalvo: "detalhe_pagamento_confirmado_bruto",
    conteudo: {
      codigo: "ln_passo16_1",
      mensagens: [t("(mensagem de confirmação de pagamento gerada dinamicamente)")],
      aguarda_resposta: true,
      tipo_resposta: "negociacao_pagamento",
      proximo_codigo: "ln_passo17a",
      kanban_subetapa: KANBAN_NEGOCIACAO_DUVIDAS,
    },
  },
```

(Sem `opcional_apos_tentativas` — decisão da spec seção 3: não faz sentido desistir de fechar uma venda por causa de negociação de data.)

- [ ] **Step 5: Rodar os testes novos e confirmar que passam**

Run: `pnpm vitest run src/lib/motor-fluxo/engine.test.ts -t "negociacao_pagamento"`
Expected: PASS (4 testes)

- [ ] **Step 6: Rodar a suíte inteira do motor**

Run: `pnpm vitest run src/lib/motor-fluxo`
Expected: PASS em tudo — nenhum teste antigo de `ln_passo16_1`/`data_primeira_parcela` deve ter sobrado quebrado (procure por esses nomes em `engine.test.ts` e atualize os que dependiam do comportamento antigo de texto livre)

- [ ] **Step 7: `pnpm lint` e `pnpm tsc --noEmit`**

Run: `pnpm lint && pnpm tsc --noEmit`
Expected: sem erro novo

- [ ] **Step 8: Commit**

```bash
git add src/lib/motor-fluxo/engine.ts src/lib/motor-fluxo/fluxo-limpeza-nome.ts src/lib/motor-fluxo/engine.test.ts
git commit -m "feat(motor-fluxo): checkpoint de confirmacao/negociacao de pagamento"
```

---

### Task 7: Ligar `interpretarNegociacaoPagamento` nos pontos de entrada reais

**Files:**
- Modify: onde `interpretarFaixasDocumentos`/`interpretarListaDocumentos` já são passados pro `ContextoAvanco` real (grep `interpretarFaixasDocumentos` fora de `motor-fluxo/` pra achar — webhook do Zapster e `/simulador`, mesmo padrão das Fases 2b/2c já implementadas)

**Interfaces:**
- Consumes: `interpretarNegociacaoPagamento` (Task 3).
- Produces: nada novo — só fecha a ligação de ponta a ponta.

- [ ] **Step 1: Os 2 call sites (mesmo padrão já usado por `interpretarFaixasDocumentos`)**

- `src/app/simulador/actions.ts:10` (import) e `:110` (uso dentro do objeto de contexto passado a `avancarConversa`)
- `src/app/api/webhooks/zapster/route.ts:10` (import) e `:185` (mesmo uso)

- [ ] **Step 2: Acrescentar `interpretarNegociacaoPagamento` nos dois**

Em cada um dos 2 arquivos: acrescentar `import { interpretarNegociacaoPagamento } from "@/lib/motor-fluxo/interpretar-negociacao-pagamento";` ao lado do import existente de `interpretarFaixasDocumentos`, e a linha `interpretarNegociacaoPagamento,` dentro do objeto de contexto, ao lado da linha `interpretarFaixasDocumentos,` já existente (`actions.ts:110`, `route.ts:185`).

- [ ] **Step 3: Checar tipos e build**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: sem erro

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(motor-fluxo): liga negociacao de pagamento nos pontos de entrada reais"
```

---

### Task 8: Verificação manual no simulador + atualizar documentação

**Files:**
- Nenhum arquivo de código — só verificação e docs.

- [ ] **Step 1: Rodar o dev server e abrir `/simulador`**

Run: `pnpm dev`

- [ ] **Step 2: Percorrer o fluxo até o Passo 15, escolher "parcelado", confirmar que a mensagem de confirmação aparece no formato da spec (seção 2) com valores/vencimentos reais**

- [ ] **Step 3: Testar um ajuste (ex.: "pode ser no cartão?") e confirmar que a Malala responde negociando/confirmando, e que a mensagem de confirmação é reenviada atualizada**

- [ ] **Step 4: Testar um pedido fora da regra (ex.: "posso pagar em 20 dias?") e confirmar que a Malala explica o limite sem travar a conversa**

- [ ] **Step 5: Confirmar e verificar que o fluxo segue normalmente pra `ln_passo17a`**

- [ ] **Step 6: Rodar a suíte completa uma última vez**

Run: `pnpm vitest run && pnpm lint && pnpm tsc --noEmit`
Expected: tudo verde

- [ ] **Step 7: Atualizar `docs/PLANO_MESTRE_SISTEMA_ARRUDACRED.md`**

Marcar esta frente como concluída na seção correspondente (buscar a referência ao pedido do Vendas registrada em 18/08/2026, ou a seção 8 "Módulo Comercial — Detalhamento" do CRM).

- [ ] **Step 8: Avisar Vendas em `docs/COORDENACAO_AGENTES_ARRUDACRED.md` seção 3**

Confirmar que os 6 campos (`forma_pagamento`, `forma_pagamento_detalhe`, `data_primeira_parcela`, `dia_ancora_parcelas`, `parcelas_valores`, `parcelas_vencimentos`) já estão sendo gravados de verdade em produção — não é mais só a spec, é o comportamento real.

- [ ] **Step 9: Atualizar `docs/status/crm.md`** com a próxima tarefa (Kanban, conforme prioridade já registrada).

- [ ] **Step 10: Commit final**

```bash
git add docs/PLANO_MESTRE_SISTEMA_ARRUDACRED.md docs/COORDENACAO_AGENTES_ARRUDACRED.md docs/status/crm.md
git commit -m "docs: captura de detalhe de pagamento concluida e verificada"
```
