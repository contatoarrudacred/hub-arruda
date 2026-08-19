# Vendas — Nova Oportunidade + Kanban de Vendas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans pra implementar task a task. Steps usam checkbox (`- [ ]`).

**Goal:** Substituir "Nova Venda" + "Fechamento de Venda" por uma tela única "Nova Oportunidade" (caminho sem funil prévio) e dar ao Kanban de Vendas uma etapa inicial que existe desde o primeiro instante — resolve o bug de produção onde uma venda criada nunca aparecia no Painel porque `contratos` só nascia no fim do fluxo antigo.

**Architecture:** `contratos` passa a nascer em `status = 'nova_oportunidade'` assim que todos os dados são coletados (Nova Oportunidade) ou assim que alguém abre o Fechamento de Venda pela primeira vez (caminho CRM) — nunca mais depois de tudo pronto. Um orquestrador novo (`src/lib/vendas/progressao.ts`) tenta avançar as etapas automáticas (emissão de PDF, envio à Assinafy, geração de cobrança) com retry limitado (3x sozinho, depois manual), registrando erro visível em vez de falhar em silêncio. Pagamento por cartão passa a usar o Asaas Checkout (link hospedado, sem dado de cartão passando pelo nosso servidor); boleto/pix continua exatamente como está.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + Realtime), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-vendas-nova-oportunidade-kanban-design.md`

## Global Constraints

- Migrations **não são aplicadas por quem executa este plano** — reservar timestamp em `docs/COORDENACAO_AGENTES_ARRUDACRED.md` seção 2 **antes** de criar o arquivo `.sql`, e avisar o Coordenador (status `Aguardando envio ao Luiz`). Nenhum `supabase db push` ou equivalente.
- `pnpm test` e `pnpm lint` (`pnpm exec tsc --noEmit` + `pnpm exec eslint src`) limpos antes de cada commit.
- Convenção de teste: I/O passthrough (banco, Storage, HTTP externo) não ganha teste unitário — verificado manualmente/via integração. Lógica pura (cálculo, decisão, formatação) ganha teste Vitest de verdade.
- **Regra de ouro:** nunca codar contra uma API externa (BrasilAPI, Asaas Checkout) sem ter a documentação atual em mãos — cada task que toca API externa começa confirmando o formato exato antes de escrever o cliente.
- Nomenclatura/RLS/auditoria/comentário seguem o padrão já estabelecido nas migrations anteriores desta sub-frente (`supabase/migrations/20260818090001_vendas_contrato_nucleo.sql` é a referência).
- Nenhuma mudança em `src/lib/motor-fluxo/` (território do CRM) — a visibilidade de venda vinda do CRM é resolvida só pela tela de Fechamento de Venda (nosso arquivo), nunca pelo motor de fluxo deles.
- Commits por caminho explícito (`git add <caminho>`), nunca `-A`/`.` — a raiz é compartilhada com outros agentes.

---

## Task 1: Migration — schema novo

**Files:**
- Reservar timestamp em `docs/COORDENACAO_AGENTES_ARRUDACRED.md` seção 2 primeiro (usar `20260819120000` se ainda livre — conferir a tabela antes).
- Create: `supabase/migrations/20260819120000_vendas_nova_oportunidade_kanban.sql`

**Conteúdo:**

```sql
-- ============================================================================
-- MIGRATION 039 — Vendas: Nova Oportunidade + Kanban de Vendas (novo vocabulário)
-- Sistema de Gestão ArrudaCred
-- Spec: docs/superpowers/specs/2026-08-19-vendas-nova-oportunidade-kanban-design.md
-- ============================================================================

-- -----------------------------------------------------------------------------
-- produtos: novo campo — controla se a tela de Nova Oportunidade mostra a seção
-- de pacote de documentos (N CPF/CNPJ cobertos pelo mesmo contrato).
-- -----------------------------------------------------------------------------
alter table produtos add column exige_lista_documentos boolean not null default false;
comment on column produtos.exige_lista_documentos is
  'Quando true, a tela de Nova Oportunidade mostra a seção de pacote (array de documento+nome cobertos pelo mesmo contrato). Só faz sentido pra proprio/subcontratado.';

-- -----------------------------------------------------------------------------
-- contratos: novo vocabulário de status (etapa inicial "nova_oportunidade" —
-- existe desde o primeiro instante, antes até do PDF ser gerado) + campos de
-- erro/retentativa das etapas automáticas.
-- -----------------------------------------------------------------------------
alter table contratos drop constraint if exists contratos_status_check;
alter table contratos alter column status drop default;
update contratos set status = case status
  when 'contrato_gerado' then 'emitindo_contrato'
  when 'aguardando_assinatura' then 'aguardando_assinaturas'
  when 'assinado' then 'gerando_financeiro'
  when 'parcelas_emitidas' then 'gerando_financeiro'
  else status
end;
alter table contratos alter column status set default 'nova_oportunidade';
alter table contratos add constraint contratos_status_check
  check (status in (
    'nova_oportunidade', 'emitindo_contrato', 'envelopando_assinaturas', 'aguardando_assinaturas',
    'gerando_financeiro', 'aguardando_pagamento', 'concluida', 'cancelada'
  ));
comment on column contratos.status is
  'Etapa da venda no Kanban de Vendas: nova_oportunidade (registro criado, contrato ainda não gerado ou falhou) → emitindo_contrato (gerando PDF) → envelopando_assinaturas (enviando à Assinafy) → aguardando_assinaturas (esperando assinatura humana) → gerando_financeiro (criando cobrança na Asaas) → aguardando_pagamento (esperando pagamento humano) → concluida (1ª parcela paga) | cancelada. Etapas automáticas (emitindo_contrato/envelopando_assinaturas/gerando_financeiro) tentam de novo sozinhas até 3x em caso de erro (ver ultimo_erro/tentativas_erro) — depois disso, só ação manual. Comissionado não passa por nada disso, nasce direto em aguardando_pagamento (ver comentário da tabela).';

alter table contratos add column ultimo_erro text;
comment on column contratos.ultimo_erro is
  'Mensagem do último erro numa etapa automática (emitindo_contrato/envelopando_assinaturas/gerando_financeiro) — null quando não há erro pendente. Some quando a etapa dá certo ou quando alguém pede retentativa manual.';

alter table contratos add column tentativas_erro integer not null default 0;
comment on column contratos.tentativas_erro is
  'Quantas vezes a etapa automática atual falhou seguidas. Chega a 3 → para de tentar sozinha, precisa de retentativa manual (por card ou em lote). Reseta pra 0 a cada retentativa manual ou quando a etapa dá certo.';

-- -----------------------------------------------------------------------------
-- Realtime: Kanban de Vendas reflete mudança de etapa sem recarregar a página.
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table contratos;

-- ============================================================================
-- Fim da migration 039.
-- ============================================================================
```

- [ ] **Step 1: Reservar o timestamp na seção 2 de `docs/COORDENACAO_AGENTES_ARRUDACRED.md`** (linha nova na tabela, status "Escrita, aguardando envio ao Luiz").
- [ ] **Step 2: Criar o arquivo da migration com o conteúdo acima.**
- [ ] **Step 3: Registrar no `docs/status/vendas.md`** que essa migration está escrita e não aplicada.
- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260819120000_vendas_nova_oportunidade_kanban.sql docs/COORDENACAO_AGENTES_ARRUDACRED.md docs/status/vendas.md
git commit -m "feat(vendas): migration do novo vocabulário do Kanban + campos de erro/retentativa"
```

---

## Task 2: `estagio-venda.ts` — novo vocabulário (TDD)

**Files:**
- Modify: `src/lib/vendas/estagio-venda.ts`
- Modify: `src/lib/vendas/estagio-venda.test.ts` (se já existir; senão criar)
- Modify: `src/lib/vendas/contratos.ts:12-19` (o `StatusContrato` type)

**Interfaces:**
- Produces: `StatusContrato` (novo union type), `ESTAGIOS_VENDA`, `rotuloEstagio`, `corEstagio`, `ehEstagioTerminal` — assinaturas iguais às de hoje, só os valores/rótulos mudam.

- [ ] **Step 1: Atualizar o `StatusContrato` em `src/lib/vendas/contratos.ts`**

```typescript
export type StatusContrato =
  | "nova_oportunidade"
  | "emitindo_contrato"
  | "envelopando_assinaturas"
  | "aguardando_assinaturas"
  | "gerando_financeiro"
  | "aguardando_pagamento"
  | "concluida"
  | "cancelada";
```

- [ ] **Step 2: Escrever/atualizar o teste em `src/lib/vendas/estagio-venda.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { corEstagio, ehEstagioTerminal, ESTAGIOS_VENDA, rotuloEstagio } from "./estagio-venda";

describe("estagio-venda", () => {
  it("tem os 7 estágios na ordem certa, mais cancelada", () => {
    expect(ESTAGIOS_VENDA.map((e) => e.valor)).toEqual([
      "nova_oportunidade",
      "emitindo_contrato",
      "envelopando_assinaturas",
      "aguardando_assinaturas",
      "gerando_financeiro",
      "aguardando_pagamento",
      "concluida",
      "cancelada",
    ]);
  });

  it("rotuloEstagio devolve o texto certo pra cada valor novo", () => {
    expect(rotuloEstagio("nova_oportunidade")).toBe("Nova Oportunidade");
    expect(rotuloEstagio("emitindo_contrato")).toBe("Emitindo Contrato");
    expect(rotuloEstagio("envelopando_assinaturas")).toBe("Envelopando Assinaturas");
    expect(rotuloEstagio("aguardando_assinaturas")).toBe("Aguardando Assinaturas");
    expect(rotuloEstagio("gerando_financeiro")).toBe("Gerando Financeiro");
  });

  it("corEstagio devolve uma cor pra todo estágio (não cai no fallback cinza)", () => {
    for (const estagio of ESTAGIOS_VENDA) {
      expect(corEstagio(estagio.valor)).not.toBe("#a1a1aa");
    }
  });

  it("ehEstagioTerminal só é true pra concluida e cancelada", () => {
    expect(ehEstagioTerminal("concluida")).toBe(true);
    expect(ehEstagioTerminal("cancelada")).toBe(true);
    expect(ehEstagioTerminal("nova_oportunidade")).toBe(false);
    expect(ehEstagioTerminal("aguardando_pagamento")).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar o teste, confirmar que falha** (`ESTAGIOS_VENDA` ainda tem o vocabulário antigo)

Run: `pnpm exec vitest run src/lib/vendas/estagio-venda.test.ts`
Expected: FAIL

- [ ] **Step 4: Reescrever `src/lib/vendas/estagio-venda.ts`**

```typescript
import type { StatusContrato } from "./contratos";

/**
 * Colunas do Kanban de Vendas — SEM relação com src/lib/motor-fluxo/kanban.ts (Kanban do CRM,
 * quadro diferente, dados diferentes). Ordem = ordem de progressão da venda. Etapas 2/3/5 são
 * automáticas (o sistema avança sozinho); 4/6 esperam ação humana confirmada por webhook.
 */
export const ESTAGIOS_VENDA: { valor: StatusContrato; rotulo: string; cor: string }[] = [
  { valor: "nova_oportunidade", rotulo: "Nova Oportunidade", cor: "#a78bfa" },
  { valor: "emitindo_contrato", rotulo: "Emitindo Contrato", cor: "#fb923c" },
  { valor: "envelopando_assinaturas", rotulo: "Envelopando Assinaturas", cor: "#fbbf24" },
  { valor: "aguardando_assinaturas", rotulo: "Aguardando Assinaturas", cor: "#facc15" },
  { valor: "gerando_financeiro", rotulo: "Gerando Financeiro", cor: "#38bdf8" },
  { valor: "aguardando_pagamento", rotulo: "Aguardando Pagamento", cor: "#818cf8" },
  { valor: "concluida", rotulo: "Concluída", cor: "#4ade80" },
  { valor: "cancelada", rotulo: "Cancelada", cor: "#f87171" },
];

const POR_VALOR = new Map(ESTAGIOS_VENDA.map((e) => [e.valor, e]));

export function rotuloEstagio(status: StatusContrato): string {
  return POR_VALOR.get(status)?.rotulo ?? status;
}

export function corEstagio(status: StatusContrato): string {
  return POR_VALOR.get(status)?.cor ?? "#a1a1aa";
}

/** Estágios terminais — a venda não sai deles sozinha. */
export function ehEstagioTerminal(status: StatusContrato): boolean {
  return status === "concluida" || status === "cancelada";
}
```

- [ ] **Step 5: Rodar o teste de novo, confirmar que passa**

Run: `pnpm exec vitest run src/lib/vendas/estagio-venda.test.ts`
Expected: PASS (todos os 4 testes)

- [ ] **Step 6: Rodar `pnpm exec tsc --noEmit`** — vai apontar todo lugar que ainda usa os valores antigos de `StatusContrato` (assinafy/adapter.ts, asaas/adapter.ts, os dois webhooks). Anotar a lista — são exatamente os arquivos da Task 7, não corrigir agora.

- [ ] **Step 7: Commit**

```bash
git add src/lib/vendas/estagio-venda.ts src/lib/vendas/estagio-venda.test.ts src/lib/vendas/contratos.ts
git commit -m "feat(vendas): novo vocabulário do Kanban de Vendas em estagio-venda.ts"
```

---

## Task 3: `contratos.ts` — campos de erro/retentativa + status inicial

**Files:**
- Modify: `src/lib/vendas/contratos.ts`

**Interfaces:**
- Consumes: nada de fora.
- Produces: `Contrato.ultimoErro: string | null`, `Contrato.tentativasErro: number`; `registrarErroContrato(contratoId, mensagem): Promise<void>`; `limparErroContrato(contratoId): Promise<void>`. `criarContrato` passa a inserir com `status: "nova_oportunidade"` (era `"contrato_gerado"`).

- [ ] **Step 1: Adicionar os campos ao tipo `Contrato` e ao `LinhaContratoBruta`**

Em `src/lib/vendas/contratos.ts`, no tipo `Contrato` (perto de `assinafyDocumentStatus`):

```typescript
  ultimoErro: string | null;
  tentativasErro: number;
```

No `LinhaContratoBruta`:

```typescript
  ultimo_erro: string | null;
  tentativas_erro: number;
```

Em `SELECT_CONTRATO`, adicionar `ultimo_erro, tentativas_erro` na string de colunas.

Em `mapearContrato`, adicionar:

```typescript
    ultimoErro: linha.ultimo_erro,
    tentativasErro: linha.tentativas_erro,
```

- [ ] **Step 2: Trocar o status inicial em `criarContrato`**

Trocar `status: "contrato_gerado",` por `status: "nova_oportunidade",` dentro do `.insert({...})` de `criarContrato`.

- [ ] **Step 3: Adicionar as duas funções de erro, depois de `atualizarStatusContrato`**

```typescript
/** Registra uma falha numa etapa automática — incrementa o contador de tentativas e salva a
 * mensagem, pra aparecer no card do Kanban e na tela de Detalhes da Venda. */
export async function registrarErroContrato(contratoId: string, mensagem: string): Promise<void> {
  const supabase = await createClient();
  const { data: atual, error: erroBusca } = await supabase
    .from("contratos")
    .select("tentativas_erro")
    .eq("id", contratoId)
    .single();
  if (erroBusca) throw new Error(`Falha ao buscar contrato pra registrar erro: ${erroBusca.message}`);

  const { error } = await supabase
    .from("contratos")
    .update({ ultimo_erro: mensagem, tentativas_erro: (atual.tentativas_erro ?? 0) + 1 })
    .eq("id", contratoId);
  if (error) throw new Error(`Falha ao registrar erro do contrato: ${error.message}`);
}

/** Limpa o erro e zera o contador — chamado quando uma etapa automática dá certo, ou quando
 * alguém pede retentativa manual (dá mais 3 tentativas automáticas de novo). */
export async function limparErroContrato(contratoId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contratos")
    .update({ ultimo_erro: null, tentativas_erro: 0 })
    .eq("id", contratoId);
  if (error) throw new Error(`Falha ao limpar erro do contrato: ${error.message}`);
}
```

- [ ] **Step 4: Rodar `pnpm exec tsc --noEmit`** — confirma que os dois novos campos não quebraram nada que já lê `Contrato` (`detalhes-venda-client.tsx` etc. não usam esses campos ainda, então não deve dar erro).

- [ ] **Step 5: Commit**

```bash
git add src/lib/vendas/contratos.ts
git commit -m "feat(vendas): contratos.ts ganha ultimo_erro/tentativas_erro e nasce em nova_oportunidade"
```

---

## Task 4: `contrato-templates.ts` — `buscarTemplatePorId`

**Files:**
- Modify: `src/lib/vendas/contrato-templates.ts`

**Interfaces:**
- Produces: `buscarTemplatePorId(templateId: string): Promise<ContratoTemplate | null>`.

- [ ] **Step 1: Adicionar a função, logo depois de `buscarTemplateAtivoPorProduto`**

```typescript
export async function buscarTemplatePorId(templateId: string): Promise<ContratoTemplate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contrato_templates")
    .select("id, produto_id, conteudo_html, versao")
    .eq("id", templateId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar template de contrato: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    produtoId: data.produto_id,
    conteudoHtml: data.conteudo_html,
    versao: data.versao,
  };
}
```

- [ ] **Step 2: `pnpm exec tsc --noEmit`** limpo.

- [ ] **Step 3: Commit**

```bash
git add src/lib/vendas/contrato-templates.ts
git commit -m "feat(vendas): buscarTemplatePorId em contrato-templates.ts"
```

---

## Task 5: `emissao-contrato.ts` — reconstrói o HTML/PDF só a partir do banco

**Files:**
- Create: `src/lib/vendas/emissao-contrato.ts`

**Interfaces:**
- Consumes: `buscarContratoPorId`, `atualizarStatusContrato` (contratos.ts); `buscarPessoaCompleta` (pessoas.ts); `buscarEnderecoPorPessoa` (endereco.ts); `buscarRepresentante` (pessoa-representantes.ts); `listarDocumentosPacote` (oportunidades.ts); `buscarTemplatePorId`, `montarDadosClienteHtml`, `montarListaDocumentosHtml`, `montarTabelaVencimentosHtml`, `resolverPlaceholders`, `type PessoaContrato`, `type ParcelaTabela` (contrato-templates.ts); `gerarPdfContrato`, `uploadPdfContrato` (geracao-pdf.ts).
- Produces: `montarHtmlContrato(contratoId: string): Promise<string>`; `gerarEEmitirContrato(contratoId: string): Promise<void>`.

Isso substitui a lógica que hoje está inline dentro de `confirmarFechamentoAction` (steps de montar `PessoaContrato`/resolver placeholders) — a diferença é que aqui **tudo vem do banco**, não de um formulário em memória, então funciona igual pra Nova Oportunidade, Fechamento de Venda, e qualquer retentativa manual dias depois.

- [ ] **Step 1: Criar o arquivo**

```typescript
import { atualizarStatusContrato, buscarContratoPorId } from "./contratos";
import {
  buscarTemplatePorId,
  montarDadosClienteHtml,
  montarListaDocumentosHtml,
  montarTabelaVencimentosHtml,
  resolverPlaceholders,
  type ParcelaTabela,
  type PessoaContrato,
} from "./contrato-templates";
import { buscarEnderecoPorPessoa } from "./endereco";
import { gerarPdfContrato, uploadPdfContrato } from "./geracao-pdf";
import { listarDocumentosPacote } from "./oportunidades";
import { buscarPessoaCompleta } from "./pessoas";
import { buscarRepresentante } from "./pessoa-representantes";

const FORMA_PAGAMENTO_LABEL: Record<string, string> = { boleto_pix: "Boleto/Pix", cartao: "Cartão de crédito" };

function enderecoParaTexto(endereco: Awaited<ReturnType<typeof buscarEnderecoPorPessoa>>): string | null {
  if (!endereco) return null;
  return [
    `${endereco.logradouro}${endereco.numero ? `, ${endereco.numero}` : ""}`,
    endereco.complemento || null,
    endereco.bairro || null,
    endereco.cidade && endereco.uf ? `${endereco.cidade}/${endereco.uf}` : null,
    endereco.cep ? `CEP ${endereco.cep}` : null,
  ]
    .filter(Boolean)
    .join(" - ");
}

async function montarPessoaContrato(pessoaId: string): Promise<PessoaContrato> {
  const pessoa = await buscarPessoaCompleta(pessoaId);
  if (!pessoa) throw new Error(`Pessoa ${pessoaId} não encontrada.`);
  const endereco = await buscarEnderecoPorPessoa(pessoaId);

  return {
    tipoPessoa: pessoa.tipoPessoa,
    nomeRazaoSocial: pessoa.nomeRazaoSocial,
    documento: pessoa.documento,
    email: pessoa.email,
    whatsapp: pessoa.whatsapp,
    endereco: enderecoParaTexto(endereco),
    rg: pessoa.rg,
    estadoCivil: pessoa.estadoCivil,
    profissao: pessoa.profissao,
  };
}

/**
 * Reconstrói o HTML do contrato inteiramente a partir do que já está salvo no banco — não depende
 * de dado em memória de nenhum formulário. É o que permite reemitir/retentar a geração do PDF a
 * qualquer momento, mesmo dias depois da Oportunidade ter sido criada.
 */
export async function montarHtmlContrato(contratoId: string): Promise<string> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato) throw new Error("Contrato não encontrado.");
  if (!contrato.contratoTemplateId) throw new Error("Contrato sem template associado.");
  if (!contrato.metodoPagamento) throw new Error("Contrato sem método de pagamento definido.");

  const template = await buscarTemplatePorId(contrato.contratoTemplateId);
  if (!template) throw new Error("Template de contrato não encontrado.");

  const pessoaSignatario = await buscarPessoaCompleta(contrato.pessoaSignatarioId);
  if (!pessoaSignatario) throw new Error("Pessoa signatária não encontrada.");

  const pessoaContrato = await montarPessoaContrato(contrato.pessoaSignatarioId);

  let representanteContrato: PessoaContrato | null = null;
  if (pessoaSignatario.tipoPessoa === "pj") {
    const representante = await buscarRepresentante(contrato.pessoaSignatarioId);
    if (!representante) throw new Error("Pessoa jurídica sem representante legal cadastrado.");
    representanteContrato = await montarPessoaContrato(representante.pessoaFisicaId);
  }

  const documentosPacote = await listarDocumentosPacote(contrato.oportunidadeId);
  const parcelasTabela: ParcelaTabela[] = contrato.parcelas.map((p) => ({
    numero: p.numero,
    valor: p.valor,
    vencimento: new Date(p.vencimentoPrevisto),
  }));
  const formaPagamentoLabel = FORMA_PAGAMENTO_LABEL[contrato.metodoPagamento];

  return resolverPlaceholders(template.conteudoHtml, {
    dadosCliente: montarDadosClienteHtml(pessoaContrato, representanteContrato),
    valorTotal: contrato.valorTotal,
    formaPagamento: formaPagamentoLabel,
    tabelaVencimentos: parcelasTabela.length > 1 ? montarTabelaVencimentosHtml(parcelasTabela, formaPagamentoLabel) : "",
    listaDocumentos: montarListaDocumentosHtml(
      documentosPacote.map((d) => ({ documento: d.documento, nomeRazaoSocial: d.nomeRazaoSocial })),
    ),
  });
}

/** Gera o PDF a partir do HTML reconstruído e sobe pro Storage — não mexe no `status` (quem chama
 * já deixou o contrato em "emitindo_contrato" antes de chamar isto). */
export async function gerarEEmitirContrato(contratoId: string): Promise<void> {
  const html = await montarHtmlContrato(contratoId);
  const pdf = await gerarPdfContrato(html);
  const { path } = await uploadPdfContrato(contratoId, pdf);
  await atualizarStatusContrato(contratoId, "emitindo_contrato", { pdfUrl: path });
}
```

- [ ] **Step 2: `pnpm exec tsc --noEmit`** limpo.

- [ ] **Step 3: Commit**

```bash
git add src/lib/vendas/emissao-contrato.ts
git commit -m "feat(vendas): emissao-contrato.ts reconstrói HTML/PDF só a partir do banco"
```

---

## Task 6: `progressao.ts` — orquestração com retry (TDD na parte pura)

**Files:**
- Create: `src/lib/vendas/progressao.ts`
- Create: `src/lib/vendas/progressao.test.ts`

**Interfaces:**
- Consumes: `buscarContratoPorId`, `atualizarStatusContrato`, `registrarErroContrato`, `limparErroContrato` (contratos.ts); `gerarEEmitirContrato` (emissao-contrato.ts).
- Produces: `podeTentarAutomaticamente(tentativasErro: number): boolean` (pura, testada); `tentarEmitirContrato(contratoId): Promise<void>`; `tentarEnvelopar(contratoId): Promise<void>`; `tentarGerarFinanceiro(contratoId): Promise<void>`; `tentarNovamente(contratoId): Promise<void>` (dispatcher pro retry manual).

- [ ] **Step 1: Escrever o teste da parte pura**

```typescript
// src/lib/vendas/progressao.test.ts
import { describe, expect, it } from "vitest";
import { podeTentarAutomaticamente } from "./progressao";

describe("podeTentarAutomaticamente", () => {
  it("permite tentar de novo com 0, 1 ou 2 tentativas já feitas", () => {
    expect(podeTentarAutomaticamente(0)).toBe(true);
    expect(podeTentarAutomaticamente(1)).toBe(true);
    expect(podeTentarAutomaticamente(2)).toBe(true);
  });

  it("para de tentar sozinho a partir de 3 tentativas", () => {
    expect(podeTentarAutomaticamente(3)).toBe(false);
    expect(podeTentarAutomaticamente(10)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar, confirmar que falha** (`progressao.ts` ainda não existe)

Run: `pnpm exec vitest run src/lib/vendas/progressao.test.ts`
Expected: FAIL

- [ ] **Step 3: Criar `src/lib/vendas/progressao.ts`**

```typescript
import { atualizarStatusContrato, buscarContratoPorId, limparErroContrato, registrarErroContrato } from "./contratos";
import { gerarEEmitirContrato } from "./emissao-contrato";

const MAX_TENTATIVAS_AUTOMATICAS = 3;

/** true quando ainda vale tentar a etapa automática de novo sozinho — lógica pura, sem I/O, pra
 * poder testar sem banco. */
export function podeTentarAutomaticamente(tentativasErro: number): boolean {
  return tentativasErro < MAX_TENTATIVAS_AUTOMATICAS;
}

type ResultadoPasso = { sucesso: true } | { sucesso: false; erro: string };

async function executarPassoAutomatico(contratoId: string, executar: () => Promise<void>): Promise<ResultadoPasso> {
  try {
    await executar();
    await limparErroContrato(contratoId);
    return { sucesso: true };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha desconhecida.";
    await registrarErroContrato(contratoId, mensagem);
    return { sucesso: false, erro: mensagem };
  }
}

/** Etapa "Emitindo Contrato" — gera o PDF. Encadeia direto pra "Envelopando Assinaturas" quando dá
 * certo, porque as duas são automáticas (não param pra esperar ninguém). */
export async function tentarEmitirContrato(contratoId: string): Promise<void> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato || !podeTentarAutomaticamente(contrato.tentativasErro)) return;

  await atualizarStatusContrato(contratoId, "emitindo_contrato");
  const resultado = await executarPassoAutomatico(contratoId, () => gerarEEmitirContrato(contratoId));
  if (resultado.sucesso) await tentarEnvelopar(contratoId);
}

/** Etapa "Envelopando Assinaturas" — manda o PDF pra Assinafy. Ao dar certo, o próprio
 * enviarContratoParaAssinatura já deixa o contrato em "aguardando_assinaturas" (etapa 4, espera
 * ação humana — não encadeia mais nada automático a partir daqui). */
export async function tentarEnvelopar(contratoId: string): Promise<void> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato || !podeTentarAutomaticamente(contrato.tentativasErro)) return;

  await atualizarStatusContrato(contratoId, "envelopando_assinaturas");
  await executarPassoAutomatico(contratoId, async () => {
    const { enviarContratoParaAssinatura } = await import("@/lib/assinafy/adapter");
    await enviarContratoParaAssinatura(contratoId);
  });
}

/** Etapa "Gerando Financeiro" — cria a(s) cobrança(s) na Asaas. Disparada pelo webhook da Assinafy
 * quando todo mundo assina (não pela cadeia automática inicial — isso só acontece depois de uma
 * ação humana). Ao dar certo, criarCobrancasDoContrato já deixa o contrato em
 * "aguardando_pagamento" (etapa 6, espera ação humana). */
export async function tentarGerarFinanceiro(contratoId: string): Promise<void> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato || !podeTentarAutomaticamente(contrato.tentativasErro)) return;

  await atualizarStatusContrato(contratoId, "gerando_financeiro");
  await executarPassoAutomatico(contratoId, async () => {
    const { criarCobrancasDoContrato } = await import("@/lib/asaas/adapter");
    await criarCobrancasDoContrato(contratoId);
  });
}

/** Dispatcher usado pela retentativa manual (botão por card / ação em lote no Painel) — decide
 * qual etapa automática tentar de novo com base no status atual do contrato, e reseta o contador
 * de tentativas (dá mais 3 tentativas automáticas antes de precisar de ação manual de novo). */
export async function tentarNovamente(contratoId: string): Promise<void> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato) return;
  await limparErroContrato(contratoId);

  if (contrato.status === "nova_oportunidade" || contrato.status === "emitindo_contrato") {
    await tentarEmitirContrato(contratoId);
  } else if (contrato.status === "envelopando_assinaturas") {
    await tentarEnvelopar(contratoId);
  } else if (contrato.status === "gerando_financeiro") {
    await tentarGerarFinanceiro(contratoId);
  }
}
```

- [ ] **Step 4: Rodar o teste de novo, confirmar que passa**

Run: `pnpm exec vitest run src/lib/vendas/progressao.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: `pnpm exec tsc --noEmit`** — nesse ponto ainda vai reclamar dos alvos de status antigos em `assinafy/adapter.ts`/`asaas/adapter.ts`/webhooks (Task 7 corrige).

- [ ] **Step 6: Commit**

```bash
git add src/lib/vendas/progressao.ts src/lib/vendas/progressao.test.ts
git commit -m "feat(vendas): progressao.ts — orquestração automática com retry (3x + manual)"
```

---

## Task 7: Plugar a orquestração nova nos adapters e webhooks

**Files:**
- Modify: `src/lib/assinafy/adapter.ts`
- Modify: `src/lib/asaas/adapter.ts`
- Modify: `src/app/api/webhooks/assinafy/route.ts`
- Modify: `src/app/api/webhooks/asaas/route.ts`

**Interfaces:**
- Consumes: `tentarGerarFinanceiro` (progressao.ts).

- [ ] **Step 1: `src/lib/assinafy/adapter.ts`** — trocar o status alvo de `enviarContratoParaAssinatura`

Trocar:
```typescript
  await atualizarStatusContrato(contratoId, "aguardando_assinatura", {
```
por:
```typescript
  await atualizarStatusContrato(contratoId, "aguardando_assinaturas", {
```

- [ ] **Step 2: `src/lib/asaas/adapter.ts`** — `criarCobrancasDoContrato` não muda mais de status duas vezes (quem chama já deixou em "gerando_financeiro")

Trocar:
```typescript
  await atualizarStatusContrato(contratoId, "parcelas_emitidas");
  await atualizarStatusContrato(contratoId, "aguardando_pagamento");
```
por:
```typescript
  await atualizarStatusContrato(contratoId, "aguardando_pagamento");
```

- [ ] **Step 3: `src/app/api/webhooks/assinafy/route.ts`** — no evento `document_ready`, trocar o status alvo e disparar `tentarGerarFinanceiro` em vez de chamar `criarCobrancasDoContrato` direto

Onde hoje o handler faz algo como (ajustar pro nome exato das variáveis já existentes no arquivo):
```typescript
await atualizarStatusContrato(contrato.id, "assinado", { assinadoEm: ... });
await sincronizarEtapaKanban(contrato.oportunidadeId, "pagamento");
if (process.env.ASAAS_API_KEY) {
  const { criarCobrancasDoContrato } = await import("@/lib/asaas/adapter");
  await criarCobrancasDoContrato(contrato.id);
}
```
trocar por:
```typescript
await atualizarStatusContrato(contrato.id, "aguardando_assinaturas", { assinadoEm: ... });
await sincronizarEtapaKanban(contrato.oportunidadeId, "pagamento");
if (process.env.ASAAS_API_KEY) {
  const { tentarGerarFinanceiro } = await import("@/lib/vendas/progressao");
  await tentarGerarFinanceiro(contrato.id);
}
```
(o `assinadoEm` continua sendo gravado — só o `status` não vira mais um valor próprio "assinado", que saiu do vocabulário.)

No evento `signer_rejected_document`, o alvo `"cancelada"` não muda (nome igual no vocabulário novo) — conferir que continua assim, sem editar.

- [ ] **Step 4: `src/app/api/webhooks/asaas/route.ts`** — conferir que o alvo `"concluida"` (quando a 1ª parcela é confirmada) não precisa de mudança — nome igual no vocabulário novo, é só o `"aguardando_pagamento"` de origem que já está certo (Task 7 Step 2 garante que `criarCobrancasDoContrato` deixa o contrato lá).

- [ ] **Step 5: `pnpm exec tsc --noEmit`** limpo — se ainda sobrar erro, é sinal de algum outro lugar usando o vocabulário antigo, corrigir também.

- [ ] **Step 6: `pnpm exec vitest run`** — suite completa verde (nenhum destes arquivos tem teste unitário próprio, é I/O, mas garante que nada mais quebrou).

- [ ] **Step 7: Commit**

```bash
git add src/lib/assinafy/adapter.ts src/lib/asaas/adapter.ts src/app/api/webhooks/assinafy/route.ts src/app/api/webhooks/asaas/route.ts
git commit -m "feat(vendas): adapters e webhooks usam o novo vocabulário + orquestração automática"
```

---

## Task 8: `produtos.exige_lista_documentos` — UI do cadastro de Produto

**Files:**
- Modify: a tela de cadastro/edição de Produto já existente (localizar com `Grep` por `fonte_receita` ou `parceiro_executor` — são campos do mesmo formulário; ajustar o caminho abaixo pro arquivo real encontrado).
- Modify: a Server Action que salva Produto (mesmo módulo).

**Interfaces:**
- Produces: campo `exigeListaDocumentos: boolean` no tipo de entrada da action de salvar Produto.

- [ ] **Step 1: Localizar o arquivo do formulário de Produto**

Run: `grep -rl "fonte_receita" src/app/admin --include=*.tsx`

- [ ] **Step 2: Adicionar o checkbox no formulário**, próximo ao campo de tipo do produto:

```tsx
<label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
  <input
    type="checkbox"
    checked={exigeListaDocumentos}
    onChange={(e) => setExigeListaDocumentos(e.target.checked)}
  />
  Este serviço pode cobrir mais de um CPF/CNPJ (pacote)
</label>
```

com o `useState<boolean>` correspondente inicializado a partir do produto existente (edição) ou `false` (criação).

- [ ] **Step 3: Adicionar `exige_lista_documentos: entrada.exigeListaDocumentos` no `.insert()`/`.update()` da Server Action de salvar Produto**, e no `.select()` de leitura do produto pra edição.

- [ ] **Step 4: `pnpm exec tsc --noEmit`** limpo.

- [ ] **Step 5: Testar manualmente** — criar/editar um produto, marcar o checkbox, salvar, reabrir e confirmar que o valor persistiu (sem Supabase real neste worktree, usar o padrão de rota temporária isolada já estabelecido nesta sub-frente se precisar validar o componente visualmente).

- [ ] **Step 6: Commit**

```bash
git add <arquivos do formulário e da action de Produto>
git commit -m "feat(vendas): campo 'aceita pacote de documentos' no cadastro de Produto"
```

---

## Task 9: `cnpj-publico.ts` — busca automática de razão social

**Files:**
- Create: `src/lib/vendas/cnpj-publico.ts`

**Interfaces:**
- Produces: `buscarRazaoSocialPorCnpj(cnpj: string): Promise<{ razaoSocial: string } | null>`.

- [ ] **Step 1: Confirmar o formato atual da API antes de codar (regra de ouro)** — buscar a documentação oficial da BrasilAPI (`GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}`) e confirmar: nome exato do campo de razão social na resposta (era `razao_social` na última verificação, mas confirmar de novo), formato de erro pra CNPJ inválido/inexistente (404? corpo de erro?), e se existe rate limit documentado.

- [ ] **Step 2: Escrever o cliente**, ajustando o nome do campo conforme confirmado no Step 1:

```typescript
import { normalizarDocumento } from "./documento";

export async function buscarRazaoSocialPorCnpj(cnpj: string): Promise<{ razaoSocial: string } | null> {
  const cnpjNormalizado = normalizarDocumento(cnpj);
  if (cnpjNormalizado.length !== 14) return null;

  try {
    const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjNormalizado}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resposta.ok) return null;

    const dados = (await resposta.json()) as { razao_social?: string };
    if (!dados.razao_social) return null;

    return { razaoSocial: dados.razao_social };
  } catch {
    return null;
  }
}
```

(mesmo padrão defensivo de `buscarEnderecoPorCep` em `endereco.ts` — falha silenciosa vira `null`, nunca trava o formulário; quem chama sempre deixa o campo editável manualmente como alternativa.)

- [ ] **Step 3: `pnpm exec tsc --noEmit`** limpo.

- [ ] **Step 4: Commit**

```bash
git add src/lib/vendas/cnpj-publico.ts
git commit -m "feat(vendas): busca automática de razão social por CNPJ (BrasilAPI)"
```

---

## Task 10: Asaas Checkout — cliente HTTP

**Files:**
- Modify: `src/lib/asaas/cliente.ts`

**Interfaces:**
- Produces: `criarCheckout(entrada: EntradaCheckout): Promise<{ id: string; link: string }>`.

- [ ] **Step 1: Confirmar o formato atual antes de codar (regra de ouro)** — buscar a documentação oficial do Asaas Checkout (`POST /v3/checkouts`) e confirmar: nome exato dos campos de `billingType`(s) (singular ou array?), formato de `items`/valor (é um valor único ou lista de itens?), campo de referência externa pra religar a resposta do webhook à nossa Oportunidade (`externalReference`?), e o formato completo da resposta (o campo `link` já foi confirmado, mas conferir o resto).

- [ ] **Step 2: Escrever o cliente**, ajustando os campos conforme confirmado no Step 1:

```typescript
export type EntradaCheckout = {
  customerId: string;
  valorTotal: number;
  maxParcelas: number;
  descricao: string;
  externalReference: string;
};

export type Checkout = { id: string; link: string };

/**
 * Cria um Checkout hospedado pela Asaas pra pagamento por cartão — o cliente escolhe o
 * parcelamento (até maxParcelas) e digita o cartão na página deles, nunca no nosso sistema (evita
 * qualquer exigência de compliance PCI-DSS). Ver docs/superpowers/specs/2026-08-19-vendas-nova-oportunidade-kanban-design.md
 * seção 6 pra decisão de arquitetura.
 */
export async function criarCheckout(entrada: EntradaCheckout): Promise<Checkout> {
  return chamarApi<Checkout>("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      customer: entrada.customerId,
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["INSTALLMENT"],
      minutesToExpire: 1440,
      items: [{ description: entrada.descricao, value: entrada.valorTotal, quantity: 1 }],
      installment: { maxInstallmentCount: entrada.maxParcelas },
      externalReference: entrada.externalReference,
    }),
  });
}
```

- [ ] **Step 3: `pnpm exec tsc --noEmit`** limpo.

- [ ] **Step 4: Commit**

```bash
git add src/lib/asaas/cliente.ts
git commit -m "feat(vendas): cliente do Asaas Checkout (pagamento por cartão)"
```

---

## Task 10b: Ligar o Asaas Checkout ao fluxo de cartão

**Files:**
- Modify: `src/lib/asaas/adapter.ts`

**Interfaces:**
- Consumes: `criarCheckout` (Task 10, `cliente.ts`); `enviarLinkPagamentoWhatsapp` (`notificacoes.ts`, já existe).
- Produces: `criarCobrancasDoContrato` passa a ramificar por `metodoPagamento` em vez de sempre criar N cobranças individuais.

`criarCobrancasDoContrato` (chamada por `tentarGerarFinanceiro`, Task 6) hoje sempre cria uma cobrança por parcela — isso continua certo pra boleto/pix, mas cartão precisa do Checkout (spec seção 6).

- [ ] **Step 1: Reescrever `criarCobrancasDoContrato`**

```typescript
export async function criarCobrancasDoContrato(contratoId: string): Promise<void> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato) throw new Error("Contrato não encontrado.");
  if (!contrato.metodoPagamento) throw new Error("Venda comissionada não gera cobrança na Asaas — não deveria chegar aqui.");

  const customerId = await resolverClienteAsaas(contrato.pessoaSignatarioId);

  if (contrato.metodoPagamento === "cartao") {
    const { criarCheckout } = await import("./cliente");
    const checkout = await criarCheckout({
      customerId,
      valorTotal: contrato.valorTotal,
      maxParcelas: contrato.parcelasQtd,
      descricao: `Contrato ${contratoId}`,
      externalReference: contratoId,
    });
    await atualizarStatusContrato(contratoId, "aguardando_pagamento");
    await enviarLinkPagamentoWhatsapp(contrato.pessoaSignatarioId, checkout.link);
    return;
  }

  const billingType = BILLING_TYPE[contrato.metodoPagamento];
  let linkPrimeiraParcela: string | null = null;

  for (const parcela of contrato.parcelas) {
    const cobranca = await criarCobranca({
      customerId,
      billingType,
      value: parcela.valor,
      dueDate: parcela.vencimentoPrevisto,
      externalReference: parcela.id,
      description: `Parcela ${parcela.numero}/${contrato.parcelasQtd} — contrato ${contratoId}`,
    });
    await atualizarParcelaAsaas(parcela.id, cobranca.id);
    if (parcela.numero === 1) linkPrimeiraParcela = cobranca.invoiceUrl;
  }

  await atualizarStatusContrato(contratoId, "aguardando_pagamento");

  if (linkPrimeiraParcela) {
    await enviarLinkPagamentoWhatsapp(contrato.pessoaSignatarioId, linkPrimeiraParcela);
  }
}
```

(mantém os imports de `BILLING_TYPE`/`criarCobranca` que já existiam no arquivo; só adiciona o branch de cartão antes do loop de boleto/pix.)

- [ ] **Step 2: Pendência registrada, não resolvida nesta task.** Os "títulos a receber" reais do cartão (datas/valores exatos que a Asaas vai creditar por parcela) ainda não são gravados em `contrato_parcelas` — a parcela única criada no submit (Task 13) continua sendo só um placeholder pro valor total. Resolver isso depende da pesquisa pendente da spec seção 6.1 (onde/como a Asaas expõe o detalhe por parcela de um Checkout pago — webhook por parcela ou consulta em `GET /v3/installments/:id/payments`). Atualizar a spec e `docs/status/vendas.md` marcando essa reconciliação como pendência conhecida — não bloqueia o resto do plano.

- [ ] **Step 3: `pnpm exec tsc --noEmit`** limpo.

- [ ] **Step 4: Commit**

```bash
git add src/lib/asaas/adapter.ts
git commit -m "feat(vendas): pagamento por cartão usa Asaas Checkout em vez de cobrança individual"
```

---

## Task 11: `criarContratoInicial` — insere a linha completa em `nova_oportunidade`

**Files:**
- Modify: `src/lib/vendas/contratos.ts`

**Interfaces:**
- Consumes: `EntradaCriarContrato` (tipo já existente).
- Produces: `criarContratoInicial(entrada: EntradaCriarContrato): Promise<{ contratoId: string }>` — mesma assinatura de `criarContrato`, mas sem gerar PDF (isso passou pra `progressao.ts`).

Hoje `criarContrato` já insere a linha completa com `status: "nova_oportunidade"` (Task 3) — este task só precisa confirmar que **nenhum lugar que chama `criarContrato` espera mais que ele gere o PDF sozinho** (ele nunca gerou — quem fazia isso era `confirmarFechamentoAction`, chamando `gerarPdfContrato` logo em seguida). Ou seja: **não é preciso criar uma função nova** — `criarContrato` já serve. Este task é só de verificação/documentação.

- [ ] **Step 1: Atualizar o comentário de `criarContrato`** em `src/lib/vendas/contratos.ts` pra deixar claro o novo contrato de uso:

```typescript
/**
 * Insere o contrato + parcelas com todos os dados já coletados (signatário, forma de pagamento,
 * parcelas) — nasce em `status = 'nova_oportunidade'`. Não gera PDF nem manda pra Assinafy: isso é
 * responsabilidade de `progressao.ts` (`tentarEmitirContrato`), chamado por quem cria o contrato
 * logo em seguida.
 */
export async function criarContrato(entrada: EntradaCriarContrato): Promise<{ contratoId: string }> {
```

- [ ] **Step 2: `pnpm exec tsc --noEmit`** limpo.

- [ ] **Step 3: Commit**

```bash
git add src/lib/vendas/contratos.ts
git commit -m "docs(vendas): esclarece o contrato de uso de criarContrato pro fluxo novo"
```

---

## Task 12: Tela "Nova Oportunidade" — serviço + signatário + pacote

**Files:**
- Create: `src/app/admin/(shell)/vendas/nova-oportunidade/page.tsx`
- Create: `src/app/admin/(shell)/vendas/nova-oportunidade/actions.ts`
- Create: `src/app/admin/(shell)/vendas/nova-oportunidade/nova-oportunidade-client.tsx`

**Interfaces:**
- Consumes: `listarProdutos` (repositorio-admin.ts, do CRM — reaproveitado, já usado pela Nova Venda antiga), agora precisando também de `tipo`/`exige_lista_documentos` — ver Step 1; `buscarPessoaPorDocumentoAction`-like lookup; `buscarRazaoSocialPorCnpj` (Task 9); `resolverOuCriarPessoa`, `atualizarDadosContratoPessoa`, `buscarPessoaCompleta`, `buscarPessoaPorDocumento` (pessoas.ts); `salvarEndereco`, `buscarEnderecoPorCep` (endereco.ts); `definirRepresentante` (pessoa-representantes.ts); `salvarDocumentosPacote` (oportunidades.ts); `criarOportunidadeSemFunilPrevio` (clientes.ts).
- Produces: rota `/admin/vendas/nova-oportunidade` — só a parte de serviço/signatário/pacote nesta task; financeiro/documentos/submit final ficam pra Task 13 (mesmo arquivo, continuação).

Esta tela reaproveita bastante do que já existe em `src/app/admin/(shell)/vendas/nova/nova-venda-client.tsx` (busca por documento, `LeitorDocumentoIA`, `CampoEndereco`) e em `src/app/admin/(shell)/vendas/[oportunidadeId]/fechamento/fechamento-client.tsx` (dados de contrato PF/PJ, representante, pacote de documentos) — a novidade é juntar os dois numa página só.

- [ ] **Step 1: `listarProdutos` precisa devolver `tipo` e `exige_lista_documentos`** — hoje (`src/lib/motor-fluxo/repositorio-admin.ts`) devolve só `{id, nome}`. Como é arquivo do CRM, **não editar direto** — criar uma versão própria em Vendas:

```typescript
// src/lib/vendas/produtos.ts
import { createClient } from "@/lib/supabase/server";
import type { TipoProduto } from "./oportunidades";

export type ProdutoParaVenda = { id: string; nome: string; tipo: TipoProduto; exigeListaDocumentos: boolean };

export async function listarProdutosParaVenda(): Promise<ProdutoParaVenda[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produtos")
    .select("id, nome, tipo, exige_lista_documentos")
    .eq("ativo", true)
    .order("nome", { ascending: true });
  if (error) throw new Error(`Falha ao listar produtos: ${error.message}`);

  return (data ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    tipo: p.tipo as TipoProduto,
    exigeListaDocumentos: p.exige_lista_documentos,
  }));
}
```

- [ ] **Step 2: `page.tsx`**

```tsx
import { listarProdutosParaVenda } from "@/lib/vendas/produtos";
import { NovaOportunidadeClient } from "./nova-oportunidade-client";

export default async function NovaOportunidadePage() {
  const produtos = await listarProdutosParaVenda();
  return <NovaOportunidadeClient produtos={produtos} />;
}
```

- [ ] **Step 3: `actions.ts`** — ações de apoio (busca por documento, busca de razão social, submit final vem na Task 13)

```typescript
"use server";

import { buscarRazaoSocialPorCnpj } from "@/lib/vendas/cnpj-publico";
import { buscarPessoaPorDocumento } from "@/lib/vendas/pessoas";

export type ResultadoBuscarPessoa =
  | {
      encontrada: true;
      id: string;
      nome: string;
      email: string | null;
      whatsapp: string | null;
      rg: string | null;
      estadoCivil: string | null;
      profissao: string | null;
    }
  | { encontrada: false };

export async function buscarPessoaPorDocumentoAction(documento: string): Promise<ResultadoBuscarPessoa> {
  const pessoa = await buscarPessoaPorDocumento(documento);
  if (!pessoa) return { encontrada: false };
  // buscarPessoaPorDocumento (PessoaEncontrada) não traz rg/estadoCivil/profissao — busca completa:
  const { buscarPessoaCompleta } = await import("@/lib/vendas/pessoas");
  const completa = await buscarPessoaCompleta(pessoa.id);
  if (!completa) return { encontrada: false };
  return {
    encontrada: true,
    id: completa.id,
    nome: completa.nomeRazaoSocial,
    email: completa.email,
    whatsapp: completa.whatsapp,
    rg: completa.rg,
    estadoCivil: completa.estadoCivil,
    profissao: completa.profissao,
  };
}

export async function buscarRazaoSocialAction(cnpj: string): Promise<{ razaoSocial: string } | null> {
  return buscarRazaoSocialPorCnpj(cnpj);
}
```

- [ ] **Step 4: `nova-oportunidade-client.tsx`** — estrutura inicial com as seções 1 (serviço) e 2 (signatário), formulário longo (sem wizard). Usar os mesmos componentes já existentes: `CampoEndereco`, `LeitorDocumentoIA` (importar de `@/components/vendas/*`).

```tsx
"use client";

import { useState } from "react";
import { CampoEndereco, enderecoVazio, type ValorEndereco } from "@/components/vendas/campo-endereco";
import { LeitorDocumentoIA } from "@/components/vendas/leitor-documento-ia";
import { formatarCpfCnpj } from "@/lib/vendas/mascaras";
import { tipoPessoaPorDocumento } from "@/lib/vendas/documento";
import type { ProdutoParaVenda } from "@/lib/vendas/produtos";
import { buscarPessoaPorDocumentoAction, buscarRazaoSocialAction, type ResultadoBuscarPessoa } from "./actions";

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";
const secao = "space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700";

type DadosContratoForm = { nome: string; email: string; whatsapp: string; rg: string; estadoCivil: string; profissao: string };

const dadosContratoVazios: DadosContratoForm = { nome: "", email: "", whatsapp: "", rg: "", estadoCivil: "", profissao: "" };

export function NovaOportunidadeClient({ produtos }: { produtos: ProdutoParaVenda[] }) {
  const [produtoId, setProdutoId] = useState("");
  const produtoSelecionado = produtos.find((p) => p.id === produtoId) ?? null;
  const ehComissionado = produtoSelecionado?.tipo === "comissionado";

  const [documento, setDocumento] = useState("");
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [dadosContrato, setDadosContrato] = useState<DadosContratoForm>(dadosContratoVazios);
  const [endereco, setEndereco] = useState<ValorEndereco>(enderecoVazio);
  const [buscandoPessoa, setBuscandoPessoa] = useState(false);

  async function aoDigitarDocumento(valor: string) {
    const formatado = formatarCpfCnpj(valor);
    setDocumento(formatado);
    const tipo = tipoPessoaPorDocumento(formatado);
    if (!tipo) return;

    setBuscandoPessoa(true);
    const resultado: ResultadoBuscarPessoa = await buscarPessoaPorDocumentoAction(formatado);
    if (resultado.encontrada) {
      setPessoaId(resultado.id);
      setDadosContrato({
        nome: resultado.nome,
        email: resultado.email ?? "",
        whatsapp: resultado.whatsapp ?? "",
        rg: resultado.rg ?? "",
        estadoCivil: resultado.estadoCivil ?? "",
        profissao: resultado.profissao ?? "",
      });
    } else {
      setPessoaId(null);
      if (tipo === "pj") {
        const razaoSocial = await buscarRazaoSocialAction(formatado);
        setDadosContrato({ ...dadosContratoVazios, nome: razaoSocial?.razaoSocial ?? "" });
      } else {
        setDadosContrato(dadosContratoVazios);
      }
    }
    setBuscandoPessoa(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Nova Oportunidade</h1>

      <div className={secao}>
        <label className={rotulo}>Serviço</label>
        <select className={campo} value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
          <option value="">Selecione...</option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>

      <div className={secao}>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Quem assina o contrato</h2>
        <LeitorDocumentoIA
          onDadosExtraidos={(dados) => {
            if (dados.documento) aoDigitarDocumento(dados.documento);
            if (dados.nome) setDadosContrato((atual) => ({ ...atual, nome: dados.nome }));
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
        <label className={rotulo}>CPF/CNPJ</label>
        <input className={campo} value={documento} onChange={(e) => aoDigitarDocumento(e.target.value)} />
        {buscandoPessoa && <p className="text-xs text-zinc-500">Buscando...</p>}
        <label className={rotulo}>Nome completo / Razão social</label>
        <input
          className={campo}
          value={dadosContrato.nome}
          onChange={(e) => setDadosContrato({ ...dadosContrato, nome: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={rotulo}>RG</label>
            <input className={campo} value={dadosContrato.rg} onChange={(e) => setDadosContrato({ ...dadosContrato, rg: e.target.value })} />
          </div>
          <div>
            <label className={rotulo}>Estado civil</label>
            <input
              className={campo}
              value={dadosContrato.estadoCivil}
              onChange={(e) => setDadosContrato({ ...dadosContrato, estadoCivil: e.target.value })}
            />
          </div>
          <div>
            <label className={rotulo}>Profissão</label>
            <input
              className={campo}
              value={dadosContrato.profissao}
              onChange={(e) => setDadosContrato({ ...dadosContrato, profissao: e.target.value })}
            />
          </div>
          <div>
            <label className={rotulo}>E-mail</label>
            <input className={campo} value={dadosContrato.email} onChange={(e) => setDadosContrato({ ...dadosContrato, email: e.target.value })} />
          </div>
          <div>
            <label className={rotulo}>WhatsApp</label>
            <input
              className={campo}
              value={dadosContrato.whatsapp}
              onChange={(e) => setDadosContrato({ ...dadosContrato, whatsapp: e.target.value })}
            />
          </div>
        </div>
        <CampoEndereco valor={endereco} onChange={setEndereco} />
      </div>

      {/* Seções de pacote (se produtoSelecionado?.exigeListaDocumentos) e financeiro entram na Task 13 */}
    </div>
  );
}
```

- [ ] **Step 2: `pnpm exec tsc --noEmit`** limpo.

- [ ] **Step 3: Testar manualmente** via rota temporária isolada (padrão já estabelecido nesta sub-frente — criar, verificar no navegador, apagar antes de commitar).

- [ ] **Step 4: Commit**

```bash
git add src/lib/vendas/produtos.ts "src/app/admin/(shell)/vendas/nova-oportunidade/"
git commit -m "feat(vendas): tela Nova Oportunidade — serviço e signatário"
```

---

## Task 13: Tela "Nova Oportunidade" — pacote, financeiro, documentos e submit final

**Files:**
- Modify: `src/app/admin/(shell)/vendas/nova-oportunidade/nova-oportunidade-client.tsx`
- Modify: `src/app/admin/(shell)/vendas/nova-oportunidade/actions.ts`

**Interfaces:**
- Consumes: `calcularParcelasContrato`, `type DiaAncora`, `type Parcela` (calculo-parcelas.ts); `criarContrato` (contratos.ts); `tentarEmitirContrato` (progressao.ts); `criarOportunidadeSemFunilPrevio` (clientes.ts); `resolverOuCriarPessoa`, `atualizarDadosContratoPessoa` (pessoas.ts); `salvarEndereco` (endereco.ts); `definirRepresentante` (pessoa-representantes.ts); `salvarDocumentosPacote` (oportunidades.ts); `buscarPessoaArrudaCredSignatario`, `buscarTemplateAtivoPorProduto` (Task 4 já tem `buscarTemplatePorId`, mas aqui é por produto mesmo — reaproveitar `buscarTemplateAtivoPorProduto` de contrato-templates.ts).
- Produces: `confirmarNovaOportunidadeAction(entrada): Promise<ResultadoConfirmarNovaOportunidade>`.

- [ ] **Step 1: Adicionar em `actions.ts` o tipo de entrada e o submit final**, cobrindo os dois caminhos (comissionado vs. proprio/subcontratado):

```typescript
export type EntradaPacote = { documento: string; nomeRazaoSocial: string };

export type EntradaFinanceiro =
  | { especie: "boleto_pix"; formaPagamento: "avista" | "parcelado"; primeiraParcela: string; qtdParcelas: number; diaAncora: 1 | 10 | 20 }
  | { especie: "cartao"; maxParcelas: number };

export type EntradaConfirmarNovaOportunidade = {
  produtoId: string;
  pessoaId: string | null;
  pessoaNova: { nome: string; documento: string } | null;
  dadosContrato: { email: string; whatsapp: string; rg: string; estadoCivil: string; profissao: string };
  endereco: { cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string } | null;
  pacote: EntradaPacote[];
  valorTotal: number | null;
  financeiro: EntradaFinanceiro | null; // null quando comissionado
};

export type ResultadoConfirmarNovaOportunidade =
  | { sucesso: true; oportunidadeId: string }
  | { sucesso: false; erro: string };

export async function confirmarNovaOportunidadeAction(
  entrada: EntradaConfirmarNovaOportunidade,
): Promise<ResultadoConfirmarNovaOportunidade> {
  try {
    const { resolverOuCriarPessoa, atualizarDadosContratoPessoa } = await import("@/lib/vendas/pessoas");
    const { salvarEndereco } = await import("@/lib/vendas/endereco");
    const { salvarDocumentosPacote } = await import("@/lib/vendas/oportunidades");
    const { tipoPessoaPorDocumento } = await import("@/lib/vendas/documento");

    const pessoa = await resolverOuCriarPessoa({ pessoaId: entrada.pessoaId, pessoaNova: entrada.pessoaNova });
    if (!pessoa.sucesso) return { sucesso: false, erro: pessoa.erro };

    await atualizarDadosContratoPessoa(pessoa.pessoaId, {
      email: entrada.dadosContrato.email || null,
      whatsapp: entrada.dadosContrato.whatsapp || null,
      rg: entrada.dadosContrato.rg || null,
      estadoCivil: entrada.dadosContrato.estadoCivil || null,
      profissao: entrada.dadosContrato.profissao || null,
    });
    if (entrada.endereco?.cep) {
      await salvarEndereco({ ...entrada.endereco, pessoaId: pessoa.pessoaId, tipo: "residencial" });
    }

    if (entrada.pacote.length > 0) {
      const documentosValidos = entrada.pacote.filter((d) => d.documento.trim() && d.nomeRazaoSocial.trim());
      await salvarDocumentosPacote(
        "__preenchido_depois__", // ver Step 2: a Oportunidade só existe depois da linha abaixo — ajustar ordem no Step 2
        documentosValidos.map((d) => ({
          documento: d.documento,
          nomeRazaoSocial: d.nomeRazaoSocial,
          tipoDocumento: tipoPessoaPorDocumento(d.documento) === "pj" ? "cnpj" : "cpf",
        })),
      );
    }

    // Financeiro null = comissionado: só cria a Oportunidade, sem contratos (ver seção 3.1/3.6 da spec)
    const { criarOportunidadeSemFunilPrevio } = await import("@/lib/vendas/clientes");
    const { oportunidadeId } = await criarOportunidadeSemFunilPrevio({
      pessoaId: pessoa.pessoaId,
      produtoId: entrada.produtoId,
      valorEstimado: entrada.valorTotal,
    });

    if (!entrada.financeiro) {
      return { sucesso: true, oportunidadeId };
    }

    const { buscarTemplateAtivoPorProduto } = await import("@/lib/vendas/contrato-templates");
    const { buscarPessoaArrudaCredSignatario, criarContrato } = await import("@/lib/vendas/contratos");
    const { calcularParcelasContrato } = await import("@/lib/vendas/calculo-parcelas");

    const template = await buscarTemplateAtivoPorProduto(entrada.produtoId);
    if (!template) return { sucesso: false, erro: "Nenhum template de contrato configurado pra esse produto." };

    const pessoaArrudaCredId = await buscarPessoaArrudaCredSignatario();
    if (!pessoaArrudaCredId) {
      return { sucesso: false, erro: "Signatário da ArrudaCred não configurado (Configurações > contrato_arrudacred_signatario)." };
    }

    const valorTotal = entrada.valorTotal ?? 0;
    let parcelas;
    let formaPagamento: "avista" | "parcelado";
    let metodoPagamento: "boleto_pix" | "cartao";

    if (entrada.financeiro.especie === "boleto_pix") {
      formaPagamento = entrada.financeiro.formaPagamento;
      metodoPagamento = "boleto_pix";
      const primeiraParcela = new Date(entrada.financeiro.primeiraParcela);
      parcelas =
        formaPagamento === "avista"
          ? [{ numero: 1, valor: valorTotal, vencimento: primeiraParcela }]
          : calcularParcelasContrato(valorTotal, entrada.financeiro.qtdParcelas, primeiraParcela, entrada.financeiro.diaAncora);
    } else {
      formaPagamento = "parcelado";
      metodoPagamento = "cartao";
      // Cartão não tem tabela de parcelas prévia (ver spec seção 6) — 1 "parcela" placeholder cobrindo
      // o valor total; os títulos reais vêm da Asaas depois que o Checkout resultar num parcelamento.
      parcelas = [{ numero: 1, valor: valorTotal, vencimento: new Date() }];
    }

    const { contratoId } = await criarContrato({
      oportunidadeId,
      contratoTemplateId: template.id,
      pessoaSignatarioId: pessoa.pessoaId,
      pessoaArrudaCredSignatarioId: pessoaArrudaCredId,
      fornecedorId: null,
      formaPagamento,
      metodoPagamento,
      valorTotal,
      parcelas,
    });

    const { tentarEmitirContrato } = await import("@/lib/vendas/progressao");
    await tentarEmitirContrato(contratoId);

    return { sucesso: true, oportunidadeId };
  } catch (erro) {
    console.error("Falha ao confirmar Nova Oportunidade:", erro);
    const mensagem = erro instanceof Error ? erro.message : "Falha ao criar a Oportunidade. Tente novamente.";
    return { sucesso: false, erro: mensagem };
  }
}
```

- [ ] **Step 2: Corrigir a ordem** — `salvarDocumentosPacote` precisa do `oportunidadeId`, que só existe depois de `criarOportunidadeSemFunilPrevio`. Mover o bloco de `salvarDocumentosPacote` pra **depois** da criação da Oportunidade (antes do `if (!entrada.financeiro)`), removendo o placeholder `"__preenchido_depois__"`.

- [ ] **Step 3: Adicionar em `nova-oportunidade-client.tsx`** as seções de pacote (condicional a `produtoSelecionado?.exigeListaDocumentos`), financeiro (boleto/pix com tabela de parcelas editável reaproveitando a mesma UI de `fechamento-client.tsx`; cartão só com campo de máximo de parcelas), documentos (`UploadDocumentosPessoa`, opcional) e o botão de confirmar, chamando `confirmarNovaOportunidadeAction`. Ao suceder, redireciona (`router.push`) pra `/admin/vendas/${oportunidadeId}` (Detalhes da Venda) — não mostra mais a tela de upload de foto/documento separada como a Nova Venda antiga fazia (agora documentos já fazem parte do formulário único).

Reaproveitar a validação de soma de parcelas == valor total já existente em `confirmarFechamentoAction` (seção "3) Resolve forma de pagamento + parcelas" do arquivo `fechamento/actions.ts`) — copiar a mesma lógica de arredondamento em centavos pro client antes de submeter (evita round-trip só pra descobrir que não bate).

- [ ] **Step 4: `pnpm exec tsc --noEmit`** limpo.

- [ ] **Step 5: Testar manualmente ponta a ponta** via rota temporária isolada — os dois caminhos (comissionado sem financeiro, proprio com boleto/pix) — apagar a rota antes de commitar.

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/(shell)/vendas/nova-oportunidade/"
git commit -m "feat(vendas): Nova Oportunidade — pacote, financeiro, documentos e submit"
```

---

## Task 14: Retry manual — botão por card + ação em lote

**Files:**
- Modify: `src/app/admin/(shell)/vendas/[oportunidadeId]/actions.ts`
- Modify: `src/app/admin/(shell)/vendas/[oportunidadeId]/detalhes-venda-client.tsx`
- Modify: `src/app/admin/(shell)/vendas/actions.ts`
- Modify: `src/app/admin/(shell)/vendas/painel-vendas-client.tsx`

**Interfaces:**
- Consumes: `tentarNovamente` (progressao.ts).
- Produces: `tentarNovamenteAction(contratoId): Promise<ResultadoAcao>` (Detalhes); `tentarNovamenteEmLoteAction(status: StatusContrato): Promise<{ total: number }>` (Painel).

- [ ] **Step 1: Ação individual, em `[oportunidadeId]/actions.ts`**

```typescript
export async function tentarNovamenteAction(contratoId: string): Promise<ResultadoAcao> {
  try {
    const { tentarNovamente } = await import("@/lib/vendas/progressao");
    await tentarNovamente(contratoId);
    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, erro: mensagemErro(erro, "Falha ao tentar novamente.") };
  }
}
```

- [ ] **Step 2: No `detalhes-venda-client.tsx`**, mostrar `contrato.ultimoErro` quando existir (bloco vermelho, acima do card de estágio) e um botão "Tentar novamente" quando `contrato.tentativasErro >= 3` (chamando `tentarNovamenteAction` e recarregando a página, mesmo padrão de `recarregarPagina` já usado no arquivo).

- [ ] **Step 3: Ação em lote, em `vendas/actions.ts`**

```typescript
export async function tentarNovamenteEmLoteAction(status: string): Promise<{ total: number }> {
  const { createClient } = await import("@/lib/supabase/server");
  const { tentarNovamente } = await import("@/lib/vendas/progressao");
  const supabase = await createClient();

  const { data, error } = await supabase.from("contratos").select("id").eq("status", status).gte("tentativas_erro", 3);
  if (error) throw new Error(`Falha ao buscar cards travados: ${error.message}`);

  for (const linha of data ?? []) {
    await tentarNovamente(linha.id);
  }
  return { total: data?.length ?? 0 };
}
```

- [ ] **Step 4: No `painel-vendas-client.tsx`**, no cabeçalho de cada coluna do Kanban (`ESTAGIOS_VENDA.map`), mostrar um botão "Tentar novamente todos" quando houver pelo menos um card com `tentativasErro >= 3` naquela coluna (checar via `VendaResumo` — precisa incluir `tentativasErro`/`ultimoErro` no tipo `VendaResumo` e na query de `listarVendas()`, `src/lib/vendas/painel-vendas.ts` — adicionar `motivo_cancelamento` já está lá, seguir o mesmo padrão pras duas colunas novas).

- [ ] **Step 5: `pnpm exec tsc --noEmit`** limpo.

- [ ] **Step 6: Testar manualmente** — via rota temporária, simular um `contrato` com `tentativasErro: 3` e `ultimoErro` preenchido, confirmar que o botão aparece e a mensagem é legível.

- [ ] **Step 7: Commit**

```bash
git add "src/app/admin/(shell)/vendas/[oportunidadeId]/actions.ts" "src/app/admin/(shell)/vendas/[oportunidadeId]/detalhes-venda-client.tsx" "src/app/admin/(shell)/vendas/actions.ts" "src/app/admin/(shell)/vendas/painel-vendas-client.tsx" src/lib/vendas/painel-vendas.ts
git commit -m "feat(vendas): retentativa manual — por card e em lote por etapa"
```

---

## Task 15: Realtime no Painel de Vendas

**Files:**
- Modify: `src/app/admin/(shell)/vendas/painel-vendas-client.tsx`

**Interfaces:**
- Consumes: `createClient` do `@/lib/supabase/client` (cliente browser — conferir se já existe; se não, criar seguindo o padrão de `@/lib/supabase/server`, mas com `createBrowserClient` de `@supabase/ssr`).

- [ ] **Step 1: Confirmar/criar o cliente Supabase de browser**

Run: `grep -rl "createBrowserClient" src/lib/supabase`

Se não existir, criar `src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
```

- [ ] **Step 2: Assinar mudanças em `contratos` dentro de `PainelVendasClient`**, recarregando a lista quando qualquer linha mudar:

```typescript
useEffect(() => {
  const supabase = createClient();
  const canal = supabase
    .channel("painel-vendas")
    .on("postgres_changes", { event: "*", schema: "public", table: "contratos" }, () => {
      recarregar();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(canal);
  };
}, []);
```

(import `createClient` de `@/lib/supabase/client` e `useEffect` de `react`, junto com o `useState`/`useMemo` já existentes no arquivo.)

- [ ] **Step 3: `pnpm exec tsc --noEmit`** limpo.

- [ ] **Step 4: Testar manualmente** — com o Painel aberto em duas abas, mudar o status de um contrato numa (via ação de teste ou diretamente no Supabase) e confirmar que a outra reflete sozinha, sem F5.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(shell)/vendas/painel-vendas-client.tsx" src/lib/supabase/client.ts
git commit -m "feat(vendas): Painel de Vendas atualiza ao vivo via Supabase Realtime"
```

---

## Task 16: Fechamento de Venda cria o registro cedo (visibilidade CRM)

**Files:**
- Modify: `src/app/admin/(shell)/vendas/[oportunidadeId]/fechamento/page.tsx`
- Modify: `src/app/admin/(shell)/vendas/[oportunidadeId]/fechamento/actions.ts`

**Interfaces:**
- Consumes: `buscarContratoPorOportunidade` (contratos.ts, já existe).

- [ ] **Step 1: No `page.tsx` do Fechamento**, antes de renderizar o client, checar se já existe um `contrato` pra essa Oportunidade e — **se não existir** — não criar nada ainda no `page.tsx` (Server Component não deve ter efeito colateral de escrita numa leitura de página). Em vez disso, mover a criação pra dentro de `confirmarFechamentoAction`, que já faz tudo isso: trocar a chamada de `criarContrato` (que hoje roda só no final do fluxo) pra rodar **logo no início** da action, antes de montar HTML/gerar PDF — e usar `tentarEmitirContrato` (progressao.ts) no lugar da geração de PDF inline.

- [ ] **Step 2: Reescrever `confirmarFechamentoAction`** — a partir do Step "5) Cria o contrato + parcelas" (que hoje já existe e já roda cedo o bastante, antes da geração do PDF), trocar:

```typescript
    // 6) Gera o PDF e sobe pro Storage
    const pdf = await gerarPdfContrato(html);
    const { path } = await uploadPdfContrato(contratoId, pdf);
    const pdfUrl = await gerarUrlAssinadaContrato(path);
    await atualizarStatusContrato(contratoId, "contrato_gerado", { pdfUrl: path });

    // 7) Avança sozinho pra assinatura eletrônica quando a Assinafy já estiver configurada — sem
    // conta ainda (ASSINAFY_API_KEY vazia), a venda só fica parada em "contrato_gerado" até
    // alguém rodar isso manualmente depois (não quebra o Fechamento de Venda por causa disso).
    if (process.env.ASSINAFY_API_KEY) {
      try {
        const { enviarContratoParaAssinatura } = await import("@/lib/assinafy/adapter");
        await enviarContratoParaAssinatura(contratoId);
      } catch (erroAssinafy) {
        console.error("Contrato gerado, mas falhou ao enviar pra assinatura:", erroAssinafy);
      }
    }

    return { sucesso: true, contratoId, pdfUrl };
```

por:

```typescript
    // 6) Gera o PDF (com retry automático) e encadeia envio à Assinafy — mesma orquestração usada
    // pela Nova Oportunidade, agora que o contrato já nasce em "nova_oportunidade" no Step 5.
    const { tentarEmitirContrato } = await import("@/lib/vendas/progressao");
    await tentarEmitirContrato(contratoId);

    const contratoAtualizado = await buscarContratoPorId(contratoId);
    const pdfUrl = contratoAtualizado?.pdfUrl ? await gerarUrlAssinadaContrato(contratoAtualizado.pdfUrl) : null;

    return { sucesso: true, contratoId, pdfUrl };
```

(remover o import de `gerarPdfContrato`/`uploadPdfContrato` se não forem mais usados nesse arquivo depois da troca — `gerarUrlAssinadaContrato` continua sendo usado; adicionar import de `buscarContratoPorId`.)

- [ ] **Step 2: Ajustar o tipo `ResultadoConfirmarFechamento`** — `pdfUrl` passa a poder ser `null` (quando a geração falhou e ficou pra retentativa):

```typescript
export type ResultadoConfirmarFechamento =
  | { sucesso: true; contratoId: string; pdfUrl: string | null }
  | { sucesso: false; erro: string };
```

- [ ] **Step 3: `pnpm exec tsc --noEmit`** — ajustar quem consome `ResultadoConfirmarFechamento.pdfUrl` no client (`fechamento-client.tsx`) pra lidar com `null` (mostrar "PDF sendo gerado, confira em Detalhes da Venda" em vez de assumir que sempre existe).

- [ ] **Step 4: Testar manualmente** — Fechamento de Venda ponta a ponta continua funcionando, e o registro em `contratos` já existe assim que a action roda (não muda o comportamento visível pro caminho CRM além do vocabulário de status).

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(shell)/vendas/[oportunidadeId]/fechamento/actions.ts" "src/app/admin/(shell)/vendas/[oportunidadeId]/fechamento/fechamento-client.tsx"
git commit -m "feat(vendas): Fechamento de Venda usa a mesma orquestração automática da Nova Oportunidade"
```

---

## Task 17: Renomear "Nova Venda" → "Nova Oportunidade" em todo lugar visível

**Files:**
- Modify: `src/app/admin/(shell)/sidebar.tsx`
- Modify: `src/app/admin/(shell)/vendas/painel-vendas-client.tsx`
- Delete: `src/app/admin/(shell)/vendas/nova/` (tela antiga, substituída pela Task 12/13 — conferir que nada mais referencia essa rota antes de apagar)

**Interfaces:**
- Nenhuma nova — só troca de rótulo/rota.

- [ ] **Step 1: No `sidebar.tsx`**, trocar:

```typescript
{ tipo: "link", rotulo: "Nova venda", href: "/admin/vendas/nova", icone: "🧾" },
```

por:

```typescript
{ tipo: "link", rotulo: "Nova Oportunidade", href: "/admin/vendas/nova-oportunidade", icone: "🧾" },
```

- [ ] **Step 2: No `painel-vendas-client.tsx`**, trocar o botão:

```tsx
<Link href="/admin/vendas/nova" title="Cadastrar uma venda sem passar pelo funil de atendimento" ...>
  + Nova venda
</Link>
```

por:

```tsx
<Link href="/admin/vendas/nova-oportunidade" title="Cadastrar uma oportunidade sem passar pelo funil de atendimento" ...>
  + Nova Oportunidade
</Link>
```

- [ ] **Step 3: Conferir que nada mais linka pra `/admin/vendas/nova`**

Run: `grep -rn "vendas/nova\"" src --include=*.tsx --include=*.ts`

Ajustar qualquer resultado que não seja `vendas/nova-oportunidade`.

- [ ] **Step 4: Apagar a pasta antiga**

```bash
git rm -r "src/app/admin/(shell)/vendas/nova"
```

- [ ] **Step 5: `pnpm exec tsc --noEmit` e `pnpm exec eslint src`** limpos.

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/(shell)/sidebar.tsx" "src/app/admin/(shell)/vendas/painel-vendas-client.tsx"
git commit -m "feat(vendas): renomeia Nova Venda para Nova Oportunidade, remove a tela antiga"
```

---

## Task 18: Verificação manual ponta a ponta

Sem `.env.local` neste worktree — verificação real só é possível depois que o Luiz aplicar a migration (Task 1) e o deploy for feito. Roteiro pra rodar então:

- [ ] Criar uma Nova Oportunidade (produto `proprio`, boleto/pix, parcelado) — confirmar que aparece no Painel em "Nova Oportunidade" **imediatamente**, mesmo antes do PDF terminar de gerar.
- [ ] Confirmar que o card avança sozinho até "Aguardando Assinaturas" sem recarregar a página (Realtime).
- [ ] Forçar um erro (ex.: apagar temporariamente o template do produto) e confirmar que depois de 3 tentativas o card mostra o erro e o botão de retentativa manual aparece — corrigir a causa e confirmar que o retry funciona.
- [ ] Criar uma Nova Oportunidade com produto `comissionado` — confirmar que **não** aparece em `contratos`/Painel até rodar "Confirmar venda" (comportamento inalterado).
- [ ] Abrir o Fechamento de Venda de uma Oportunidade vinda do CRM (etapa `dados_contrato`) e confirmar que o registro aparece em "Nova Oportunidade" assim que a tela é aberta, antes de preencher qualquer campo.
- [ ] Testar o caminho de cartão — Checkout gerado, link funcional (mesmo que a confirmação final de pagamento dependa de conta Asaas real).
- [ ] `pnpm exec tsc --noEmit`, `pnpm exec eslint src`, `pnpm exec vitest run` — tudo limpo antes de considerar a sub-frente fechada.

- [ ] **Registrar em `docs/status/vendas.md`** o resultado da verificação (o que passou, o que ficou pendente por falta de conta Assinafy/Asaas real).
