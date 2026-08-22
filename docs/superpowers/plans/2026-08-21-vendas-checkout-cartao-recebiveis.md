# Vendas — Reconciliação do Checkout de cartão: conclusão automática + parcelas a receber da Asaas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans pra implementar task a task. Steps usam checkbox (`- [ ]`).

> **⚠️ Escopo reduzido em 22/08/2026 (ver spec seção 0) — status atual de cada task:**
> - **Task 4** (`concluirVenda`/`deveConcluirAoConfirmarParcela`, TDD) — ✅ **já implementada**, em 21/08/2026, como parte da feature "Recebido em dinheiro" (`src/lib/vendas/conclusao-venda.ts`). Reaproveitar sem trabalho extra.
> - **Task 5** (webhook `CHECKOUT_PAID` + chargeback + refatoração) — a parte que ficou pro Vendas (achar contrato pelo `checkout.id`, chamar `concluirVenda`, sem esperar parcela) **✅ implementada em 22/08/2026** (`buscarContratoPorAsaasCheckoutId` em `src/lib/vendas/contratos.ts`, tratamento do evento `CHECKOUT_PAID` em `src/app/api/webhooks/asaas/route.ts`). A captura do parcelamento real (dentro da mesma task, no código do plano) e o tratamento de chargeback **NÃO são mais escopo do Vendas** — ver abaixo.
> - **Tasks 1, 2, 3 (parte de `substituirParcelasPorParcelamentoReal`/`marcarParcelaContestada`/`cancelarParcelasNaoPagas`), 6, 7, 8** — **MOVIDAS PRO FUTURO MÓDULO FINANCEIRO.** Decisão do Luiz: reconciliação de recebíveis/chargeback é tesouraria, não decisão de venda. O conteúdo das tasks fica registrado abaixo como pesquisa/desenho pronto pro Financeiro reaproveitar (endpoints e payloads já confirmados na doc oficial da Asaas) — o Vendas não implementa nada disso.
> - **Task 9** (verificação manual) — só a parte de confirmar que o `CHECKOUT_PAID` conclui a venda continua relevante pro Vendas; o resto (parcelas reais, chargeback de teste) é do Financeiro quando ele existir.

**Goal:** Fazer o sistema saber quando uma venda por Checkout de cartão foi paga (concluir a venda na hora, sem depender de nenhuma parcela específica) e capturar o cronograma real das parcelas que a Asaas vai repassar pra ArrudaCred, vinculado à venda, com cancelamento manual em caso de chargeback/estorno.

**Architecture:** Extensão do webhook `/api/webhooks/asaas` (já existe) com 3 caminhos novos: `CHECKOUT_PAID` (conclui a venda + dispara a captura do parcelamento real), os 6 eventos de estorno/chargeback (marcam a parcela atingida como `'contestado'`), e uma refatoração do caminho já existente de `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` (extrai a lógica de "concluir venda" pra uma função compartilhada, com um gate que impede repetir a conclusão pro cartão). Um botão manual novo em Detalhes da Venda cancela as parcelas restantes de um parcelamento contestado.

**Tech Stack:** Next.js 16 App Router (Route Handler + Server Action), Supabase Postgres, API REST da Asaas (`access_token` no header, mesmo cliente HTTP já usado no resto do módulo).

**Spec:** `docs/superpowers/specs/2026-08-21-vendas-checkout-cartao-recebiveis-design.md`

## Global Constraints

- Mesmas convenções de nomenclatura/RLS/auditoria/comment do resto do módulo Vendas (ver plano `docs/superpowers/plans/2026-08-18-vendas-contrato.md`, "Global Constraints" — não repetido aqui).
- Migration **não é aplicada por quem executa este plano** — reservar o timestamp em `docs/COORDENACAO_AGENTES_ARRUDACRED.md` seção 2 **antes** de criar o arquivo `.sql`, avisar que está pronta, e nunca rodar `supabase` CLI/SQL Editor.
- `pnpm exec tsc --noEmit`, `pnpm exec eslint src` e `pnpm exec vitest run` verdes antes de cada commit.
- Convenção de teste do módulo: **I/O (banco, chamada HTTP externa, parse de webhook) não ganha teste unitário** — verificado manualmente. **Lógica pura ganha teste Vitest de verdade** — nesta spec, isso é só `deveConcluirAoConfirmarParcela` (Task 4).
- **Regra de ouro:** nunca codar contra API externa sem doc em mãos — os endpoints/payloads usados neste plano já foram confirmados contra `docs.asaas.com` (ver spec seção 2); qualquer coisa não confirmada (spec seção 7) é tratada com fallback resiliente, nunca assumida.
- Sem PR neste repo — push direto pra `vendas-contrato` e `main` depois de testado (protocolo: `git fetch origin` → checar se `origin/main` ainda é ancestral do HEAD local → se divergiu, `git merge origin/main --no-edit` e reconferir os testes → push nos dois branches).

---

## Task 1: Migration — novo status `'contestado'` em `contrato_parcelas`

**Files:**
- Reservar timestamp em `docs/COORDENACAO_AGENTES_ARRUDACRED.md` seção 2 primeiro (conferir a tabela de migrations reservadas — a última entrada de 21/08/2026 é `20260821100000`; use `20260821110000` se ainda estiver livre quando for reservar, ou o próximo horário livre daquele dia).
- Create: `supabase/migrations/<timestamp>_vendas_parcela_status_contestado.sql`

- [ ] **Step 1: Reservar o timestamp na tabela de migrations**

Adicionar uma linha na tabela da seção 2 de `docs/COORDENACAO_AGENTES_ARRUDACRED.md`, mesmo formato das linhas vizinhas:

```
| `<timestamp>` | `<timestamp>_vendas_parcela_status_contestado.sql` | Vendas | ⏸️ Escrita, aguardando envio ao Luiz — novo valor 'contestado' no CHECK de contrato_parcelas.status, pra sinalizar chargeback/estorno da Asaas (pedido do Luiz, 21/08/2026, reconciliação do Checkout de cartão). Aditiva, nenhum DROP de dado. |
```

- [ ] **Step 2: Criar o arquivo da migration**

```sql
-- ============================================================================
-- MIGRATION — Vendas: novo status 'contestado' em contrato_parcelas
-- Sistema de Gestão ArrudaCred
-- Contexto (Luiz, 21/08/2026, reconciliação do Checkout de cartão): quando a
-- Asaas notifica um chargeback ou estorno numa parcela, ela precisa ficar
-- visualmente distinta de 'cancelado' (que já significa "resolvido, não vai
-- mais ser cobrado") — 'contestado' marca "em disputa, aguardando decisão
-- manual do Luiz" (ver botão "Cancelar parcelas restantes" em Detalhes da
-- Venda). Ver docs/superpowers/specs/2026-08-21-vendas-checkout-cartao-recebiveis-design.md,
-- seção 6.
--
-- A constraint é recriada via bloco PL/pgSQL que acha o nome real do CHECK em
-- vez de supor `contrato_parcelas_status_check` — mais seguro contra
-- qualquer nome diferente do padrão do Postgres que já esteja em produção.
-- ============================================================================

do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'contrato_parcelas'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%previsto%';

  if v_conname is not null then
    execute format('alter table contrato_parcelas drop constraint %I', v_conname);
  end if;
end $$;

alter table contrato_parcelas add constraint contrato_parcelas_status_check
  check (status in ('previsto', 'gerado', 'pago', 'atrasado', 'cancelado', 'contestado'));

comment on column contrato_parcelas.status is
  'previsto/gerado/pago/atrasado/cancelado (ciclo normal) + contestado (chargeback/estorno recebido da Asaas, aguardando decisão manual — ver botão "Cancelar parcelas restantes" em Detalhes da Venda).';

-- ============================================================================
-- Fim da migration.
-- ============================================================================
```

- [ ] **Step 3: Commit**

```bash
git add docs/COORDENACAO_AGENTES_ARRUDACRED.md supabase/migrations/<timestamp>_vendas_parcela_status_contestado.sql
git commit -m "feat(vendas): migration do status 'contestado' em contrato_parcelas (nao aplicada)"
```

---

## Task 2: `src/lib/asaas/cliente.ts` — listar e cancelar parcelas de um parcelamento

**Files:**
- Modify: `src/lib/asaas/cliente.ts`

**Interfaces:**
- Produces: `ParcelaParcelamento = { id: string; value: number; dueDate: string; status: string }`, `listarParcelasDoParcelamento(installmentId: string): Promise<ParcelaParcelamento[]>`, `cancelarParcelasDoParcelamento(installmentId: string): Promise<void>`.

- [ ] **Step 1: Adicionar as duas funções no fim do arquivo**

Acrescentar ao fim de `src/lib/asaas/cliente.ts` (depois da função `criarCheckout` existente):

```ts
export type ParcelaParcelamento = { id: string; value: number; dueDate: string; status: string };

/**
 * Lista cada parcela real de um parcelamento de cartão — usado depois que o Checkout é pago
 * (`checkout.installment` no payload do evento `CHECKOUT_PAID`) pra capturar o cronograma real de
 * recebíveis. Confirmado na doc oficial (docs.asaas.com/reference/listar-cobrancas-de-um-parcelamento,
 * 21/08/2026): `GET /v3/installments/{id}/payments`, resposta `PaymentListResponseDTO` com `data[]`.
 */
export async function listarParcelasDoParcelamento(installmentId: string): Promise<ParcelaParcelamento[]> {
  const resposta = await chamarApi<{ data: ParcelaParcelamento[] }>(`/installments/${installmentId}/payments`, { method: "GET" });
  return resposta.data;
}

/**
 * Cancela de uma vez as parcelas AINDA NÃO PAGAS de um parcelamento inteiro — o que já foi
 * confirmado não é mexido (confirmado na doc). Risco documentado pela própria Asaas: se cancelar
 * todas as parcelas, o parcelamento inteiro é apagado sem volta — por isso só é chamada a partir de
 * uma confirmação explícita do usuário (ver botão "Cancelar parcelas restantes" em Detalhes da
 * Venda, Task 8).
 */
export async function cancelarParcelasDoParcelamento(installmentId: string): Promise<void> {
  await chamarApi(`/installments/${installmentId}/payments`, { method: "DELETE" });
}
```

- [ ] **Step 2: Checar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sem erro.

- [ ] **Step 3: Commit**

```bash
git add src/lib/asaas/cliente.ts
git commit -m "feat(asaas): funcoes cruas pra listar/cancelar parcelas de um parcelamento de cartao"
```

---

## Task 3: `src/lib/vendas/contratos.ts` — expor `asaasInstallmentId` + funções novas de repositório

**Files:**
- Modify: `src/lib/vendas/contratos.ts`

**Interfaces:**
- Consumes: nenhuma função de tasks anteriores.
- Produces: `ContratoParcela.asaasInstallmentId: string | null`, `buscarContratoPorAsaasCheckoutId(checkoutId: string): Promise<Contrato | null>`, `ParcelaRealAsaas = { asaasPaymentId: string; asaasInstallmentId: string; valor: number; vencimento: string }`, `substituirParcelasPorParcelamentoReal(contratoId: string, parcelasReais: ParcelaRealAsaas[]): Promise<void>`, `marcarParcelaContestada(asaasPaymentId: string): Promise<{ contratoId: string } | null>`, `cancelarParcelasNaoPagas(contratoId: string): Promise<void>`.

- [ ] **Step 1: Expor `asaas_installment_id` (coluna já existente no banco desde a migration original, nunca lida até agora)**

Em `ContratoParcela` (por volta da linha 122-129), trocar:

```ts
export type ContratoParcela = {
  id: string;
  numero: number;
  valor: number;
  vencimentoPrevisto: string;
  status: string;
  asaasPaymentId: string | null;
};
```

por:

```ts
export type ContratoParcela = {
  id: string;
  numero: number;
  valor: number;
  vencimentoPrevisto: string;
  status: string;
  asaasPaymentId: string | null;
  // id do parcelamento completo na Asaas — mesmo valor em todas as parcelas do mesmo contrato,
  // preenchido só pro caminho de cartão (ver substituirParcelasPorParcelamentoReal). Usado pra
  // montar o cancelamento em lote (DELETE /v3/installments/{id}/payments).
  asaasInstallmentId: string | null;
};
```

Em `LinhaContratoParcelaBruta` (por volta da linha 169-176), trocar:

```ts
type LinhaContratoParcelaBruta = {
  id: string;
  numero: number;
  valor: number;
  vencimento_previsto: string;
  status: string;
  asaas_payment_id: string | null;
};
```

por:

```ts
type LinhaContratoParcelaBruta = {
  id: string;
  numero: number;
  valor: number;
  vencimento_previsto: string;
  status: string;
  asaas_payment_id: string | null;
  asaas_installment_id: string | null;
};
```

Em `SELECT_CONTRATO`, trocar o final da string:

```
contrato_parcelas(id, numero, valor, vencimento_previsto, status, asaas_payment_id)
```

por:

```
contrato_parcelas(id, numero, valor, vencimento_previsto, status, asaas_payment_id, asaas_installment_id)
```

Em `mapearContrato`, no `.map()` das parcelas, trocar:

```ts
      .map((parcela) => ({
        id: parcela.id,
        numero: parcela.numero,
        valor: parcela.valor,
        vencimentoPrevisto: parcela.vencimento_previsto,
        status: parcela.status,
        asaasPaymentId: parcela.asaas_payment_id,
      }))
```

por:

```ts
      .map((parcela) => ({
        id: parcela.id,
        numero: parcela.numero,
        valor: parcela.valor,
        vencimentoPrevisto: parcela.vencimento_previsto,
        status: parcela.status,
        asaasPaymentId: parcela.asaas_payment_id,
        asaasInstallmentId: parcela.asaas_installment_id,
      }))
```

- [ ] **Step 2: `buscarContratoPorAsaasCheckoutId`**

Adicionar logo depois de `buscarContratoPorAssinafyDocumentId` (mesmo padrão exato):

```ts
export async function buscarContratoPorAsaasCheckoutId(checkoutId: string): Promise<Contrato | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contratos")
    .select(SELECT_CONTRATO)
    .eq("asaas_checkout_id", checkoutId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar contrato por checkout Asaas: ${error.message}`);
  if (!data) return null;

  return mapearContrato(data as unknown as LinhaContratoBruta);
}
```

- [ ] **Step 3: `substituirParcelasPorParcelamentoReal`**

Adicionar depois de `atualizarCheckoutContrato`:

```ts
export type ParcelaRealAsaas = { asaasPaymentId: string; asaasInstallmentId: string; valor: number; vencimento: string };

/**
 * Troca a(s) parcela-placeholder do contrato (criada sem dado real da Asaas, na hora da venda)
 * pelas parcelas reais do parcelamento de cartão, capturadas via
 * `GET /v3/installments/{id}/payments` depois que o Checkout é pago (webhook `CHECKOUT_PAID`).
 * Apaga tudo que existia antes pra este contrato e insere de novo, numerando 1..N na ordem
 * recebida — o placeholder nunca teve `asaas_payment_id` pra casar linha a linha com nada mesmo.
 */
export async function substituirParcelasPorParcelamentoReal(contratoId: string, parcelasReais: ParcelaRealAsaas[]): Promise<void> {
  const supabase = await createClient();

  const { error: erroDelete } = await supabase.from("contrato_parcelas").delete().eq("contrato_id", contratoId);
  if (erroDelete) throw new Error(`Falha ao apagar parcelas-placeholder do contrato: ${erroDelete.message}`);

  const { error: erroInsert } = await supabase.from("contrato_parcelas").insert(
    parcelasReais.map((parcela, indice) => ({
      contrato_id: contratoId,
      numero: indice + 1,
      valor: parcela.valor,
      vencimento_previsto: parcela.vencimento,
      asaas_payment_id: parcela.asaasPaymentId,
      asaas_installment_id: parcela.asaasInstallmentId,
    })),
  );
  if (erroInsert) throw new Error(`Falha ao gravar parcelas reais do parcelamento: ${erroInsert.message}`);

  const { error: erroUpdate } = await supabase
    .from("contratos")
    .update({ parcelas_qtd: parcelasReais.length })
    .eq("id", contratoId);
  if (erroUpdate) throw new Error(`Falha ao atualizar quantidade de parcelas do contrato: ${erroUpdate.message}`);
}
```

- [ ] **Step 4: `marcarParcelaContestada` e `cancelarParcelasNaoPagas`**

Adicionar depois de `marcarParcelaPaga`:

```ts
/**
 * Marca a parcela atingida por um chargeback/estorno — status `'contestado'` fica visível na tela
 * até o Luiz decidir (botão "Cancelar parcelas restantes", ação manual, ver
 * `cancelarParcelasNaoPagas`). Espelha `marcarParcelaPaga` (mesmo padrão de busca por
 * `asaas_payment_id` + retorno do vínculo com o contrato). Method-agnostic de propósito — o mesmo
 * caminho serve pra parcela de boleto/pix ou de cartão, sem distinção.
 */
export async function marcarParcelaContestada(asaasPaymentId: string): Promise<{ contratoId: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contrato_parcelas")
    .update({ status: "contestado" })
    .eq("asaas_payment_id", asaasPaymentId)
    .select("contrato_id")
    .maybeSingle();
  if (error) throw new Error(`Falha ao marcar parcela como contestada: ${error.message}`);
  return data ? { contratoId: data.contrato_id } : null;
}

/**
 * Marca como `'cancelado'` as parcelas ainda não pagas do contrato — chamado depois que o
 * `DELETE /v3/installments/{id}/payments` na Asaas já rodou com sucesso
 * (`cancelarParcelasRestantesDoContrato`, `src/lib/asaas/adapter.ts`), pra nosso banco refletir o
 * mesmo estado. Não mexe em parcelas já `'pago'` — a Asaas também não mexe nessas (ver spec).
 */
export async function cancelarParcelasNaoPagas(contratoId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contrato_parcelas")
    .update({ status: "cancelado" })
    .eq("contrato_id", contratoId)
    .in("status", ["previsto", "gerado", "contestado"]);
  if (error) throw new Error(`Falha ao cancelar parcelas restantes: ${error.message}`);
}
```

- [ ] **Step 5: Checar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/lib/vendas/contratos.ts
git commit -m "feat(vendas): expoe asaas_installment_id e novas funcoes de repositorio pro parcelamento de cartao"
```

---

## Task 4: `src/lib/vendas/conclusao-venda.ts` (novo arquivo) — gate testável + efeitos de conclusão

**Files:**
- Create: `src/lib/vendas/conclusao-venda.ts`
- Test: `src/lib/vendas/conclusao-venda.test.ts`

**Interfaces:**
- Consumes: `atualizarStatusContrato` (`./contratos`, já existe), `MetodoPagamento` (`./contratos`, já existe), `buscarUnidadeNegocioDaPessoa`/`promoverPessoaACliente` (`./clientes`, já existem), `sincronizarEtapaKanban` (`./oportunidades`, já existe).
- Produces: `deveConcluirAoConfirmarParcela(metodoPagamento: MetodoPagamento | null, numeroParcela: number): boolean`, `concluirVenda(contrato: { id: string; oportunidadeId: string; pessoaSignatarioId: string }): Promise<void>`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { deveConcluirAoConfirmarParcela } from "./conclusao-venda";

describe("deveConcluirAoConfirmarParcela", () => {
  it("conclui no boleto/pix quando é a 1ª parcela", () => {
    expect(deveConcluirAoConfirmarParcela("boleto_pix", 1)).toBe(true);
  });

  it("não conclui no boleto/pix quando não é a 1ª parcela", () => {
    expect(deveConcluirAoConfirmarParcela("boleto_pix", 2)).toBe(false);
  });

  it("nunca conclui de novo no cartão, mesmo quando seria a 1ª parcela", () => {
    expect(deveConcluirAoConfirmarParcela("cartao", 1)).toBe(false);
  });

  it("não conclui quando o método de pagamento é nulo (venda comissionada não usa este caminho)", () => {
    expect(deveConcluirAoConfirmarParcela(null, 1)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm exec vitest run src/lib/vendas/conclusao-venda.test.ts`
Expected: FAIL — `Failed to resolve import "./conclusao-venda"`.

- [ ] **Step 3: Implementar**

```ts
import { atualizarStatusContrato, type MetodoPagamento } from "./contratos";
import { buscarUnidadeNegocioDaPessoa, promoverPessoaACliente } from "./clientes";
import { sincronizarEtapaKanban } from "./oportunidades";

/**
 * Decide se a venda deve ser concluída neste exato momento, ao confirmar uma parcela paga.
 * Boleto/pix: só a 1ª parcela conclui (regra de negócio já existente, preservada). Cartão: nunca
 * aqui — a venda já foi concluída antes, no evento `CHECKOUT_PAID` (ver `concluirVenda` abaixo,
 * chamada direto do webhook nesse ponto), porque no cartão o cliente já pagou o valor cheio pra
 * Asaas no ato da compra; o que vem depois é só repasse escalonado pra nossa conta, e isso não
 * deveria segurar a entrega do serviço nem repetir a promoção de cliente. Pura, sem I/O.
 */
export function deveConcluirAoConfirmarParcela(metodoPagamento: MetodoPagamento | null, numeroParcela: number): boolean {
  return metodoPagamento !== "cartao" && numeroParcela === 1;
}

/**
 * Efeitos de "a venda foi paga/concluída" — extraída pra ser compartilhada entre os dois pontos que
 * disparam isso em `src/app/api/webhooks/asaas/route.ts`: `processarPagamentoConfirmado`
 * (boleto/pix, 1ª parcela) e `processarCheckoutPago` (cartão, na hora do `CHECKOUT_PAID`).
 */
export async function concluirVenda(contrato: { id: string; oportunidadeId: string; pessoaSignatarioId: string }): Promise<void> {
  await atualizarStatusContrato(contrato.id, "concluida");
  await sincronizarEtapaKanban(contrato.oportunidadeId, "ganha");

  const unidadeNegocioId = await buscarUnidadeNegocioDaPessoa(contrato.pessoaSignatarioId);
  if (unidadeNegocioId) {
    await promoverPessoaACliente(contrato.pessoaSignatarioId, unidadeNegocioId);
  } else {
    console.error(`[concluirVenda] pessoa ${contrato.pessoaSignatarioId} sem unidade de negócio — não promovida a cliente`);
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm exec vitest run src/lib/vendas/conclusao-venda.test.ts`
Expected: PASS — 4 testes.

- [ ] **Step 5: Checar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/lib/vendas/conclusao-venda.ts src/lib/vendas/conclusao-venda.test.ts
git commit -m "feat(vendas): concluirVenda compartilhada + gate testavel pra nao repetir no cartao"
```

---

## Task 5: Webhook `/api/webhooks/asaas` — `CHECKOUT_PAID`, refatoração da conclusão, chargeback/estorno

**Files:**
- Modify: `src/app/api/webhooks/asaas/route.ts` (substituição integral do conteúdo atual)

**Interfaces:**
- Consumes: `listarParcelasDoParcelamento` (Task 2), `buscarContratoPorAsaasCheckoutId`/`marcarParcelaContestada`/`substituirParcelasPorParcelamentoReal`/`buscarContratoPorId`/`marcarParcelaPaga` (Task 3), `concluirVenda`/`deveConcluirAoConfirmarParcela` (Task 4).

- [ ] **Step 1: Substituir o conteúdo inteiro do arquivo**

```ts
import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { listarParcelasDoParcelamento } from "@/lib/asaas/cliente";
import { concluirVenda, deveConcluirAoConfirmarParcela } from "@/lib/vendas/conclusao-venda";
import {
  buscarContratoPorAsaasCheckoutId,
  buscarContratoPorId,
  marcarParcelaContestada,
  marcarParcelaPaga,
  substituirParcelasPorParcelamentoReal,
} from "@/lib/vendas/contratos";

export const maxDuration = 30;

/**
 * Webhook da Asaas — clone estrutural de src/app/api/webhooks/zapster/route.ts, mas com uma
 * diferença real: **a Asaas assina o webhook nativamente** por header (confirmado na doc oficial),
 * então o segredo vai no header `asaas-access-token` (configurado por nós ao registrar o webhook
 * via `POST /v3/webhooks`, campo `authToken`) — não precisa do padrão de query param do
 * Zapster/Assinafy, que não têm esse recurso.
 *
 * Payload confirmado na doc: {id, event, dateCreated, payment: {id, status, value, ...}} —
 * payment.id é o asaas_payment_id que já gravamos em contrato_parcelas ao criar a cobrança.
 *
 * Eventos de Checkout (CHECKOUT_PAID) e de estorno/chargeback foram adicionados nesta rodada — ver
 * docs/superpowers/specs/2026-08-21-vendas-checkout-cartao-recebiveis-design.md. O payload de
 * CHECKOUT_PAID só foi confirmado parcialmente na doc oficial (docs.asaas.com/docs/eventos-para-checkout
 * mostra o payload completo do evento "irmão" CHECKOUT_CREATED, não de CHECKOUT_PAID em si) —
 * tratado de forma resiliente por causa disso (ver processarCheckoutPago).
 */
function segredosBatem(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

type PayloadAsaas = {
  event?: string;
  payment?: { id?: string };
  checkout?: { id?: string; installment?: string | null };
};

async function processarPagamentoConfirmado(asaasPaymentId: string): Promise<void> {
  try {
    const parcelaPaga = await marcarParcelaPaga(asaasPaymentId, new Date().toISOString());
    if (!parcelaPaga) {
      console.error(`[webhook asaas] parcela não encontrada pra cobrança ${asaasPaymentId}`);
      return;
    }

    const contrato = await buscarContratoPorId(parcelaPaga.contratoId);
    if (!contrato) {
      console.error(`[webhook asaas] contrato ${parcelaPaga.contratoId} não encontrado`);
      return;
    }

    // Boleto/pix: só a 1ª parcela conclui a venda. Cartão nunca entra aqui de novo — já foi
    // concluído no CHECKOUT_PAID (ver deveConcluirAoConfirmarParcela).
    if (!deveConcluirAoConfirmarParcela(contrato.metodoPagamento, parcelaPaga.numero)) return;

    await concluirVenda(contrato);

    // TODO(módulo Operação, fora de escopo desta sub-frente): handoff pra Ordem de Serviço — a
    // Oportunidade "ganha" já carrega tudo que a OS vai precisar (spec seção 3.5).
  } catch (e) {
    console.error("[webhook asaas] erro ao processar pagamento confirmado:", e);
  }
}

/**
 * CHECKOUT_PAID — conclui a venda na hora (sem esperar nenhuma parcela: no cartão o cliente já
 * pagou o valor cheio pra Asaas no ato da compra) e, separadamente, tenta capturar o cronograma
 * real de recebíveis. A captura roda em try/catch próprio: se falhar (ex.: `checkout.installment`
 * vazio, formato de payload inesperado), a venda continua concluída — só fica faltando a tabela de
 * parcelas a receber, a ser investigada depois.
 */
async function processarCheckoutPago(checkoutId: string, installmentId: string | null | undefined): Promise<void> {
  try {
    const contrato = await buscarContratoPorAsaasCheckoutId(checkoutId);
    if (!contrato) {
      console.error(`[webhook asaas] contrato não encontrado pro checkout ${checkoutId}`);
      return;
    }

    await concluirVenda(contrato);

    if (!installmentId) {
      console.error(
        `[webhook asaas] checkout ${checkoutId} pago mas sem id de parcelamento no payload — parcelas a receber não foram capturadas, conferir manualmente (contrato ${contrato.id}).`,
      );
      return;
    }

    try {
      const parcelasReais = await listarParcelasDoParcelamento(installmentId);
      await substituirParcelasPorParcelamentoReal(
        contrato.id,
        parcelasReais.map((p) => ({ asaasPaymentId: p.id, asaasInstallmentId: installmentId, valor: p.value, vencimento: p.dueDate })),
      );
    } catch (erroParcelamento) {
      console.error(
        `[webhook asaas] checkout ${checkoutId} pago, mas falhou ao capturar o parcelamento real (contrato ${contrato.id}):`,
        erroParcelamento,
      );
    }
  } catch (e) {
    console.error("[webhook asaas] erro ao processar checkout pago:", e);
  }
}

/**
 * Chargeback/estorno — marca a parcela atingida como 'contestado', visível em Detalhes da Venda com
 * um botão manual pra cancelar o restante do parcelamento. Method-agnostic de propósito — o mesmo
 * tratamento serve pra parcela de boleto/pix ou de cartão, sem distinção (mesmo padrão de
 * marcarParcelaPaga).
 */
async function processarContestacaoParcela(asaasPaymentId: string, evento: string): Promise<void> {
  try {
    const resultado = await marcarParcelaContestada(asaasPaymentId);
    if (!resultado) {
      console.error(`[webhook asaas] parcela não encontrada pra contestação (${evento}) na cobrança ${asaasPaymentId}`);
    }
  } catch (e) {
    console.error(`[webhook asaas] erro ao processar contestação (${evento}):`, e);
  }
}

const EVENTOS_CONTESTACAO = new Set([
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
]);

export async function POST(request: Request) {
  const segredo = process.env.ASAAS_WEBHOOK_SECRET;
  const recebido = request.headers.get("asaas-access-token") ?? "";

  if (!segredo) {
    if (process.env.VERCEL) {
      console.error("[webhook asaas] ASAAS_WEBHOOK_SECRET não configurada em produção — rejeitando.");
      return new Response("Não autorizado", { status: 401 });
    }
  } else if (!segredosBatem(recebido, segredo)) {
    return new Response("Não autorizado", { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as PayloadAsaas | null;
  console.log("[webhook asaas] payload recebido:", JSON.stringify(payload));

  if (!payload || !payload.event) {
    return Response.json({ ignorado: true, motivo: "payload vazio ou incompleto" });
  }

  if ((payload.event === "PAYMENT_RECEIVED" || payload.event === "PAYMENT_CONFIRMED") && payload.payment?.id) {
    after(() => processarPagamentoConfirmado(payload.payment!.id!));
    return Response.json({ recebido: true });
  }

  if (payload.event === "CHECKOUT_PAID" && payload.checkout?.id) {
    after(() => processarCheckoutPago(payload.checkout!.id!, payload.checkout!.installment));
    return Response.json({ recebido: true });
  }

  if (EVENTOS_CONTESTACAO.has(payload.event) && payload.payment?.id) {
    after(() => processarContestacaoParcela(payload.payment!.id!, payload.event!));
    return Response.json({ recebido: true });
  }

  return Response.json({ ignorado: true, motivo: `evento "${payload.event}" ainda não tratado` });
}
```

- [ ] **Step 2: Checar tipos e lint**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint src/app/api/webhooks/asaas/route.ts`
Expected: sem erro.

- [ ] **Step 3: Rodar a suíte inteira (garantir que nada quebrou)**

Run: `pnpm exec vitest run`
Expected: mesma contagem de antes + os 4 testes novos da Task 4, sem regressão.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks/asaas/route.ts
git commit -m "feat(vendas): webhook asaas trata CHECKOUT_PAID e chargeback/estorno, reusa concluirVenda"
```

---

## Task 6: `src/lib/asaas/adapter.ts` — cancelar parcelas restantes do contrato

**Files:**
- Modify: `src/lib/asaas/adapter.ts`

**Interfaces:**
- Consumes: `cancelarParcelasDoParcelamento` (Task 2), `cancelarParcelasNaoPagas`/`buscarContratoPorId` (Task 3, `buscarContratoPorId` já existe).
- Produces: `cancelarParcelasRestantesDoContrato(contratoId: string): Promise<void>`.

- [ ] **Step 1: Atualizar os imports do arquivo**

No topo de `src/lib/asaas/adapter.ts`, trocar:

```ts
import { buscarClientePorCpfCnpj, criarCheckout, criarCliente, criarCobranca } from "./cliente";
import {
  atualizarCheckoutContrato,
  atualizarParcelaAsaas,
  atualizarStatusContrato,
  atualizarVencimentoParcela,
  buscarContratoPorId,
  type Contrato,
  type MetodoPagamento,
} from "@/lib/vendas/contratos";
```

por:

```ts
import { buscarClientePorCpfCnpj, cancelarParcelasDoParcelamento, criarCheckout, criarCliente, criarCobranca } from "./cliente";
import {
  atualizarCheckoutContrato,
  atualizarParcelaAsaas,
  atualizarStatusContrato,
  atualizarVencimentoParcela,
  buscarContratoPorId,
  cancelarParcelasNaoPagas,
  type Contrato,
  type MetodoPagamento,
} from "@/lib/vendas/contratos";
```

- [ ] **Step 2: Adicionar a função no fim do arquivo**

```ts
/**
 * Cancela as parcelas restantes (ainda não pagas) do parcelamento de cartão do contrato — chamado
 * a partir do botão manual "Cancelar parcelas restantes" em Detalhes da Venda, depois de um
 * chargeback/estorno (ver `marcarParcelaContestada`). Usa o `asaasInstallmentId` de qualquer
 * parcela do contrato — é o mesmo valor em todas (ver comentário do campo em `contratos.ts`).
 */
export async function cancelarParcelasRestantesDoContrato(contratoId: string): Promise<void> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato) throw new Error("Contrato não encontrado.");

  const installmentId = contrato.parcelas.find((p) => p.asaasInstallmentId)?.asaasInstallmentId;
  if (!installmentId) throw new Error("Este contrato não tem um parcelamento de cartão vinculado — nada pra cancelar.");

  await cancelarParcelasDoParcelamento(installmentId);
  await cancelarParcelasNaoPagas(contratoId);
}
```

- [ ] **Step 3: Checar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sem erro.

- [ ] **Step 4: Commit**

```bash
git add src/lib/asaas/adapter.ts
git commit -m "feat(asaas): cancelarParcelasRestantesDoContrato orquestra o cancelamento em lote"
```

---

## Task 7: Server Action — `cancelarParcelasRestantesAction`

**Files:**
- Modify: `src/app/admin/(shell)/vendas/[oportunidadeId]/actions.ts`

**Interfaces:**
- Consumes: `cancelarParcelasRestantesDoContrato` (Task 6).
- Produces: `cancelarParcelasRestantesAction(contratoId: string): Promise<ResultadoAcao>`.

- [ ] **Step 1: Atualizar o import de `@/lib/asaas/adapter`**

Trocar:

```ts
import { criarCheckoutManual } from "@/lib/asaas/adapter";
```

por:

```ts
import { cancelarParcelasRestantesDoContrato, criarCheckoutManual } from "@/lib/asaas/adapter";
```

- [ ] **Step 2: Adicionar a Server Action no fim do arquivo**

```ts
/** Cancela as parcelas restantes de um parcelamento de cartão contestado (chargeback/estorno) —
 * botão manual em Detalhes da Venda, dentro do quadro Financeiro (CardCheckoutCartao). */
export async function cancelarParcelasRestantesAction(contratoId: string): Promise<ResultadoAcao> {
  try {
    await cancelarParcelasRestantesDoContrato(contratoId);
    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, erro: mensagemErro(erro, "Falha ao cancelar as parcelas restantes.") };
  }
}
```

- [ ] **Step 3: Checar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sem erro.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(shell)/vendas/[oportunidadeId]/actions.ts"
git commit -m "feat(vendas): server action cancelarParcelasRestantesAction"
```

---

## Task 8: UI — aviso de contestação + botão "Cancelar parcelas restantes" em `CardCheckoutCartao`

**Files:**
- Modify: `src/app/admin/(shell)/vendas/[oportunidadeId]/detalhes-venda-client.tsx`

**Interfaces:**
- Consumes: `cancelarParcelasRestantesAction` (Task 7).

- [ ] **Step 1: Importar a Server Action nova**

No bloco de import de `./actions` (início do arquivo), acrescentar `cancelarParcelasRestantesAction` à lista (ordem alfabética, mesmo padrão do resto do bloco):

```ts
import {
  buscarStatusAssinaturaAction,
  buscarStatusCobrancasAction,
  cancelarParcelasRestantesAction,
  cancelarVendaDetalhesAction,
  confirmarAssinaturaManualAction,
  excluirVendaDetalhesAction,
  gerarCheckoutManualAction,
  gerarUrlDownloadContratoAction,
  marcarComissaoRecebidaAction,
  reenviarLinkAction,
  tentarNovamenteAction,
} from "./actions";
```

- [ ] **Step 2: Acrescentar `'contestado'` ao mapa de badges de parcela**

Trocar:

```ts
const BADGE_STATUS_PARCELA: Record<string, string> = {
  previsto: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  gerado: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  pago: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  atrasado: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  cancelado: "bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-800 dark:text-zinc-500",
};
```

por:

```ts
const BADGE_STATUS_PARCELA: Record<string, string> = {
  previsto: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  gerado: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  pago: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  atrasado: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  cancelado: "bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-800 dark:text-zinc-500",
  contestado: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
};
```

- [ ] **Step 3: Renomear o callback de `CardCheckoutCartao` e acrescentar o bloco de contestação**

Trocar a assinatura e o corpo de `CardCheckoutCartao` (função inteira):

```ts
function CardCheckoutCartao({ contrato, onGerado }: { contrato: Contrato; onGerado: () => void }) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Date.now() capturado uma vez (lazy initializer do useState) em vez de lido direto no corpo do
  // componente — chamar uma função impura durante a renderização quebra a regra de pureza do React
  // (achado do eslint-plugin-react-hooks, 21/08/2026); aqui só precisa do "agora" de quando a tela
  // abriu, não de um relógio vivo, então uma leitura única já resolve.
  const [agora] = useState(() => Date.now());
  const geradoEm = contrato.asaasCheckoutGeradoEm ? new Date(contrato.asaasCheckoutGeradoEm) : null;
  const VALIDADE_MS = 24 * 60 * 60 * 1000;
  const linkValido = Boolean(contrato.asaasCheckoutUrl && geradoEm && agora - geradoEm.getTime() < VALIDADE_MS);

  async function gerarNovo() {
    setGerando(true);
    setErro(null);
    const resultado = await gerarCheckoutManualAction(contrato.id);
    setGerando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onGerado();
  }

  return (
    <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">💳 Checkout de cartão</p>
      {linkValido ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <a href={contrato.asaasCheckoutUrl!} target="_blank" rel="noreferrer" className={botaoSecundario} title="Abre a página de pagamento hospedada pela Asaas">
            👁️ Ver checkout
          </a>
          <LinkCopiavel link={contrato.asaasCheckoutUrl!} />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">gerado em {formatarData(contrato.asaasCheckoutGeradoEm!)}</span>
        </div>
      ) : (
        <div className="mt-2">
          {contrato.asaasCheckoutUrl && (
            <p className="text-xs text-amber-600 dark:text-amber-400">O link anterior já passou das 24h de validade — gere um novo.</p>
          )}
          <button type="button" onClick={gerarNovo} disabled={gerando} className={`${botaoSecundario} mt-1`}>
            {gerando ? "Gerando..." : "🔄 Gerar novo link de pagamento"}
          </button>
        </div>
      )}
      {erro && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}
```

por:

```ts
function CardCheckoutCartao({ contrato, onMudou }: { contrato: Contrato; onMudou: () => void }) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [erroCancelar, setErroCancelar] = useState<string | null>(null);

  // Date.now() capturado uma vez (lazy initializer do useState) em vez de lido direto no corpo do
  // componente — chamar uma função impura durante a renderização quebra a regra de pureza do React
  // (achado do eslint-plugin-react-hooks, 21/08/2026); aqui só precisa do "agora" de quando a tela
  // abriu, não de um relógio vivo, então uma leitura única já resolve.
  const [agora] = useState(() => Date.now());
  const geradoEm = contrato.asaasCheckoutGeradoEm ? new Date(contrato.asaasCheckoutGeradoEm) : null;
  const VALIDADE_MS = 24 * 60 * 60 * 1000;
  const linkValido = Boolean(contrato.asaasCheckoutUrl && geradoEm && agora - geradoEm.getTime() < VALIDADE_MS);

  const parcelasContestadas = contrato.parcelas.filter((p) => p.status === "contestado");

  async function gerarNovo() {
    setGerando(true);
    setErro(null);
    const resultado = await gerarCheckoutManualAction(contrato.id);
    setGerando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onMudou();
  }

  async function cancelarRestantes() {
    setCancelando(true);
    setErroCancelar(null);
    const resultado = await cancelarParcelasRestantesAction(contrato.id);
    setCancelando(false);
    if (!resultado.sucesso) {
      setErroCancelar(resultado.erro);
      return;
    }
    onMudou();
  }

  return (
    <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">💳 Checkout de cartão</p>
      {linkValido ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <a href={contrato.asaasCheckoutUrl!} target="_blank" rel="noreferrer" className={botaoSecundario} title="Abre a página de pagamento hospedada pela Asaas">
            👁️ Ver checkout
          </a>
          <LinkCopiavel link={contrato.asaasCheckoutUrl!} />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">gerado em {formatarData(contrato.asaasCheckoutGeradoEm!)}</span>
        </div>
      ) : (
        <div className="mt-2">
          {contrato.asaasCheckoutUrl && (
            <p className="text-xs text-amber-600 dark:text-amber-400">O link anterior já passou das 24h de validade — gere um novo.</p>
          )}
          <button type="button" onClick={gerarNovo} disabled={gerando} className={`${botaoSecundario} mt-1`}>
            {gerando ? "Gerando..." : "🔄 Gerar novo link de pagamento"}
          </button>
        </div>
      )}
      {erro && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erro}</p>}
      {parcelasContestadas.length > 0 && (
        <div className="mt-3 rounded border border-red-300 bg-red-50 p-2 dark:border-red-700 dark:bg-red-950">
          <p className="text-xs text-red-700 dark:text-red-400">
            ⚠️ {parcelasContestadas.length === 1 ? "A parcela" : `${parcelasContestadas.length} parcelas`} nº{" "}
            {parcelasContestadas.map((p) => p.numero).join(", ")} sofreu chargeback/estorno na Asaas — em disputa.
          </p>
          {!confirmandoCancelamento ? (
            <button
              type="button"
              onClick={() => setConfirmandoCancelamento(true)}
              className="mt-2 text-xs font-medium text-red-700 underline dark:text-red-400"
            >
              Cancelar parcelas restantes
            </button>
          ) : (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-red-700 dark:text-red-400">
                Isso cancela na Asaas todas as parcelas deste parcelamento que ainda não foram pagas — sem volta. Confirma?
              </p>
              <button
                type="button"
                onClick={cancelarRestantes}
                disabled={cancelando}
                className="text-xs font-medium text-red-700 underline dark:text-red-400"
              >
                {cancelando ? "Cancelando..." : "Sim, cancelar definitivamente"}
              </button>
            </div>
          )}
          {erroCancelar && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erroCancelar}</p>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Atualizar o único call site de `CardCheckoutCartao`**

Trocar:

```tsx
        <CardCheckoutCartao contrato={contrato} onGerado={() => window.location.reload()} />
```

por:

```tsx
        <CardCheckoutCartao contrato={contrato} onMudou={() => window.location.reload()} />
```

- [ ] **Step 5: Checar tipos e lint**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint src/app/admin/\(shell\)/vendas/\[oportunidadeId\]/detalhes-venda-client.tsx`
Expected: sem erro.

- [ ] **Step 6: Rodar a suíte inteira**

Run: `pnpm exec vitest run`
Expected: mesma contagem da Task 5, sem regressão.

- [ ] **Step 7: Commit**

```bash
git add "src/app/admin/(shell)/vendas/[oportunidadeId]/detalhes-venda-client.tsx"
git commit -m "feat(vendas): aviso de parcela contestada + botao cancelar parcelas restantes no Checkout de cartao"
```

---

## Task 9: Verificação manual ponta a ponta (não automatizável)

Nenhum código nesta task — só checklist de verificação, a ser rodado pelo Luiz (o agente que executa este plano não tem conta Asaas real nem acesso a produção):

- [ ] Rodar a migration da Task 1 no Supabase (SQL Editor, feito pelo Luiz).
- [ ] Fazer uma venda de teste por cartão de verdade (Checkout), completar o pagamento.
- [ ] Confirmar que a venda aparece "Concluída" no Painel de Vendas assim que o Checkout é pago — sem esperar nenhuma parcela.
- [ ] Confirmar em Detalhes da Venda, quadro Financeiro, que as parcelas reais aparecem (não mais um placeholder único) com vencimento/valor reais.
- [ ] **Ponto de risco registrado na spec (seção 7):** se `checkout.installment` não vier preenchido no payload real de `CHECKOUT_PAID`, o log do webhook (Vercel) vai mostrar o aviso "checkout pago mas sem id de parcelamento" — se isso acontecer, é sinal de que o payload real é diferente do assumido, e o tratamento em `processarCheckoutPago` precisa ser ajustado contra o payload de verdade (trazer o JSON real pro próximo round de implementação).
- [ ] Simular (ou aguardar) um chargeback/estorno de teste, se a Asaas permitir isso em sandbox — confirmar que a parcela vira "contestado" na tela e o botão "Cancelar parcelas restantes" aparece e funciona.

---

## Verification

- `pnpm exec tsc --noEmit` limpo em todas as tasks.
- `pnpm exec eslint src` limpo em todas as tasks.
- `pnpm exec vitest run` verde, com os 4 testes novos de `deveConcluirAoConfirmarParcela` (Task 4) somados ao total já existente, sem regressão.
- Verificação ao vivo (Task 9) depende de conta Asaas real e de uma venda de cartão de teste — registrar como pendência em `docs/status/vendas.md` até o Luiz confirmar, mesma convenção já usada nas rodadas anteriores desta sub-frente.
