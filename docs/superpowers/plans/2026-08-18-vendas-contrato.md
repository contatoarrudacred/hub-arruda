# Vendas — Contrato + Assinatura + Financeiro da venda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans pra implementar task a task. Steps usam checkbox (`- [ ]`).

## Context

A sub-frente **Cadastro** (Cliente/Fornecedor/Serviço) já está mesclada em `main` e as 3 migrations aplicadas no banco real. Esta passada cobre as 3 sub-frentes seguintes **juntas, ponta a ponta** — decisão explícita do Luiz em 18/08/2026 ("gostaria que já fizesse tudo de ponta a ponta sempre parando e me questionando se tiver dúvidas"), substituindo o plano inicial de separar Contrato/Assinatura/Financeiro em passadas distintas.

**Problema que isso resolve:** hoje uma Oportunidade que chega em `dados_contrato` não tem como virar contrato de verdade — falta captura de detalhe de pagamento (o bot do CRM só grava `avista`/`parcelado`, sem parcelas/vencimentos — pedido de captura nativa já registrado pro CRM no quadro-branco), falta geração de PDF, falta envio pra assinatura eletrônica, falta cobrança real. Esta passada fecha o processo inteiro até a Oportunidade virar `ganha`.

**Regra de ouro aplicada durante todo este plano** (definida pelo Luiz nesta sessão, vale pra **todos os agentes do projeto**, não só Vendas): nunca começar a codar contra uma API/plataforma externa sem ter a documentação atual em mãos. Documentação já obtida e registrada (ver Task 0 abaixo) para Assinafy e Asaas — as tasks de adapter (9, 13) citam exatamente os endpoints/campos confirmados nela, sem inventar nada.

**O que fica de fora, mesmo com o escopo "ponta a ponta":** o Luiz **já tem conta e API key na Assinafy e na Asaas** (confirmado pelo Coordenador em 18/08) — não é mais bloqueio esperado. Mesmo assim, a regra continua: não contratamos nada, não gastamos crédito, não pedimos a chave direto a ele — o código sai pronto pra funcionar e avisamos o Coordenador quando estiver pronto pra plugar, ele pede a chave na hora certa. Até lá, `ASSINAFY_API_KEY`/`ASAAS_API_KEY` ficam vazias em `.env.local.example` e as chamadas reais não são exercitadas.

## Arquitetura

- **`src/lib/vendas/`** (mesmo módulo da sub-frente Cadastro) ganha: `contratos.ts`, `contrato-templates.ts`, `valor-por-extenso.ts`, `calculo-parcelas.ts`, `geracao-pdf.ts`, `comissoes.ts`.
- **`src/components/vendas/`** ganha: `editor-html-contrato.tsx` (TipTap, Task 6a) — reaproveitado pela tela de template (Task 6b).
- **`src/lib/assinafy/`** (novo, mesmo padrão de `src/lib/whatsapp/`): `cliente.ts` (chamadas HTTP cruas, único arquivo que fala com a API deles) + `adapter.ts` (funções de mais alto nível: `enviarContratoParaAssinatura`, `buscarStatusDocumento`).
- **`src/lib/asaas/`** (novo, mesmo padrão): `cliente.ts` + `adapter.ts` (`criarOuBuscarCliente`, `criarCobrancaParcelada`).
- **Telas:** `src/app/admin/(shell)/vendas/[oportunidadeId]/fechamento/` (Fechamento de Venda, acesso direto por URL/id nesta passada — sem lista/painel ainda, spec seção 7 item 4) e `src/app/admin/(shell)/vendas/produtos/[produtoId]/contrato-template/` (edição do template, Task 6b).
- **Webhooks:** `src/app/api/webhooks/assinafy/route.ts`, `src/app/api/webhooks/asaas/route.ts` — clones estruturais de `src/app/api/webhooks/zapster/route.ts`.
- **PDF:** Server Action rodando Puppeteer + `@sparticuz/chromium` (dependência nova), exporta direto o `contrato_templates.conteudo_html` já resolvido (HTML de verdade, editado num editor rico — sem conversão de markdown), sobe pro bucket `contratos` (privado, mesmo padrão de `pessoa-documentos`).

**Tech Stack:** o mesmo da sub-frente Cadastro + `puppeteer-core` + `@sparticuz/chromium` + TipTap (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-table`, `@tiptap/extension-image`, `@tiptap/extension-text-align`, `@tiptap/extension-text-style`, `@tiptap/extension-font-family`, `@tiptap/extension-color` — todas novas, MIT/open-source).

**Spec:** `docs/superpowers/specs/2026-08-17-modulo-vendas-design.md` (seções 3.2, 3.3, 3.4, 3.5 — já atualizada nesta sessão com a tela de Fechamento de Venda).

---

## Global Constraints

- Mesmas convenções de nomenclatura/RLS/auditoria/comment da sub-frente Cadastro (ver `docs/superpowers/plans/2026-08-17-vendas-cadastro.md`, "Global Constraints" — não repetido aqui).
- Migrations **não são aplicadas por quem executa este plano** — reservar timestamp no quadro-branco (`docs/COORDENACAO_AGENTES_ARRUDACRED.md` seção 2) **antes** de criar o arquivo `.sql`, e avisar o Coordenador quando pronta (status `Aguardando envio ao Luiz`).
- `pnpm test` e `pnpm lint` verdes antes de cada commit (projeto migrou de `npm` pra `pnpm` durante o merge de Marketing).
- Convenção de teste: **I/O passthrough (banco, Storage, HTTP externo) não tem teste unitário** — verificado manualmente. **Lógica pura ganha teste Vitest de verdade** (`valor-por-extenso.ts`, cálculo de parcelas, validação de payload de webhook).
- **Nenhuma chamada a Assinafy/Asaas roda em Client Component** — sempre Server Action/Route Handler, mesmo padrão de `src/lib/whatsapp/zapster.ts`.
- **Timeline de eventos de sistema:** contrato/parcela mudando de status já cai em `auditoria_log` automaticamente via o trigger de auditoria padrão — **não mexer em `mensagens.remetente`** (território ativo do CRM; mudar isso quebraria a convenção de avisar antes de mexer em tabela compartilhada). Registrar essa decisão no quadro-branco pra quem for montar a timeline visual saber que eventos de Contrato já estão em `auditoria_log`.

---

## Task 0: Registrar documentação externa + regra de ouro (não é código)

**Status: ✅ feito** — `docs/api_reference/Assinafy-API-Reference.md` copiado pro worktree, `docs/COORDENACAO_AGENTES_ARRUDACRED.md` atualizado (seção 4.1 itens 5/6, seção 3 aviso de 18/08/2026).

**Achados-chave (resumo, pra não todo agente ter que reler as ~7000 linhas do arquivo Assinafy):**
- **Assinafy:** auth via header `X-Api-Key` (recomendado) ou `Authorization: Bearer {access_token}`. Fluxo: `POST /accounts/:id/documents` (upload PDF, multipart) → `POST /accounts/:id/signers` (criar signatário, `full_name`+`email`) → `POST /documents/:id/assignments` (`method: "virtual"`, `signerIds: [...]`) → status do documento evolui `uploaded → metadata_processing → metadata_ready → pending_signature → certificating → certificated` (ou `rejected_by_signer`). Webhook: **sem HMAC/assinatura nativa** — só `PUT /accounts/:id/webhooks/subscriptions` com `{events[], is_active, url, email}`; a URL pode carregar query string própria, então o segredo vai como query param (mesmo padrão do Zapster) já que não existe outro mecanismo. Eventos relevantes: `document_ready` (todos assinaram), `signer_signed_document` (assinatura individual), `signer_rejected_document` (recusa). Payload: `{id, event, object: {id, name, type}, subject: {...}, account_id}` — `object.id` é o `assinafy_document_id`.
- **Asaas:** auth via header `access_token: <chave>` (`$aact_prod_...`/`$aact_hmlg_...`), base `https://api.asaas.com/v3` (prod) / `https://api-sandbox.asaas.com/v3` (sandbox). Cliente: `POST /v3/customers` (`name`, `cpfCnpj`, `mobilePhone`, `externalReference`) → devolve `id` (`cus_...`). Cobrança parcelada: `POST /v3/payments` (`customer`, `billingType`, `installmentCount`, `installmentValue` ou `totalValue`, `dueDate`, `externalReference`) → resposta distingue `installment` (id do parcelamento) de `id` (cobrança individual). Webhook: `POST /v3/webhooks` (`url`, `email`, `authToken` — vira o header `asaas-access-token` enviado em toda chamada, 32-255 caracteres —, `events[]`, `enabled`, `sendType`). Eventos: `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`. Payload: `{id, event, dateCreated, payment: {id, status, value, netValue, installment, subscription}}`.

---

## Task 1: Migration — schema de Contrato/Assinatura/Financeiro

**Files:**
- Timestamp reservado: `20260818090001` (renomeado de `090000` em 18/08 — colidiu com a migration do Marketing; ver `docs/COORDENACAO_AGENTES_ARRUDACRED.md` seção 2).
- Create: `supabase/migrations/20260818090001_vendas_contrato_nucleo.sql`

**Tabelas** (todas com `comment on table/column`, RLS `admin_acesso_total`, trigger `trg_auditoria_*` — padrão exato de `20260817130000_vendas_pessoa_documentos.sql`):

```sql
create table contrato_templates (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos(id),
  conteudo_html text not null,
  versao integer not null default 1,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contratos (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null unique references oportunidades(id),
  contrato_template_id uuid not null references contrato_templates(id),
  pessoa_signatario_id uuid not null references pessoas(id),
  pessoa_arrudacred_signatario_id uuid not null references pessoas(id),
  fornecedor_id uuid references pessoas(id),
  pdf_url text,
  status text not null default 'gerado'
    check (status in ('gerado','enviado','assinado','recusado','cancelado')),
  assinafy_document_id text,
  assinafy_document_status text,
  forma_pagamento text not null check (forma_pagamento in ('avista','parcelado')),
  metodo_pagamento text not null check (metodo_pagamento in ('boleto','cartao','voucher','outro')),
  parcelas_qtd integer not null default 1,
  valor_total numeric(12,2) not null,
  enviado_em timestamptz,
  assinado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contrato_parcelas (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  numero integer not null,
  valor numeric(12,2) not null,
  vencimento_previsto date not null,
  asaas_payment_id text,
  asaas_installment_id text,
  status text not null default 'previsto'
    check (status in ('previsto','gerado','pago','atrasado','cancelado')),
  pago_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table comissoes_fornecedor_receber (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references oportunidades(id),
  fornecedor_id uuid not null references pessoas(id),
  produto_id uuid not null references produtos(id),
  numero integer not null,
  valor numeric(12,2) not null,
  data_prevista date not null,
  status text not null default 'previsto' check (status in ('previsto','recebido')),
  recebido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
+ índices (`oportunidade_id`, `contrato_id`, `fornecedor_id`) + storage bucket `contratos` (privado, mesmo padrão de `pessoa-documentos`).

## Task 1b: Migration — dados de Pessoa exigidos pelo contrato

**Status: ✅ feito** (`supabase/migrations/20260818100000_vendas_dados_contrato_pessoa.sql`, timestamp `20260818100000` reservado).

**Files:** `supabase/migrations/20260818100000_vendas_dados_contrato_pessoa.sql`

```sql
alter table pessoas add column rg text;
alter table pessoas add column estado_civil text;
alter table pessoas add column profissao text;
alter table oportunidade_documentos add column pessoa_id uuid references pessoas(id);
create index idx_oportunidade_documentos_pessoa on oportunidade_documentos(pessoa_id);
```

Todas nullable/aditivas — `pessoas` e `oportunidade_documentos` são núcleo compartilhado, registrado no quadro-branco por transparência, sem quebrar nenhum consumidor existente (CRM, motor de fluxo). `pessoa_id` em `oportunidade_documentos` é o que permite montar o bloco de dados completos (não só o CPF/CNPJ) de cada documento do "pacote" no contrato.

---

## Task 2: `valor-por-extenso.ts` (lógica pura, TDD)

**Files:** Create `src/lib/vendas/valor-por-extenso.ts` + `.test.ts`
**Produz:** `valorPorExtenso(valor: number): string` — ex. `1500` → `"mil e quinhentos reais"`. Cobrir: zero, centavos, milhões, negativo (deve lançar erro — não existe valor de contrato negativo).

## Task 3: Cálculo de parcelas (lógica pura, TDD)

**Status: ✅ feito, e atualizado em 18/08 depois da spec de captura de pagamento do CRM (`docs/superpowers/specs/2026-08-18-captura-detalhe-pagamento-fechamento-design.md`) sair.**

**Files:** `src/lib/vendas/calculo-parcelas.ts` + `.test.ts`
**Produz:**
- `dividirValorEmParcelas(valorTotal, qtd): number[]` — divide valor em centavos, última parcela absorve o resto de arredondamento (soma bate exatamente com `valorTotal`). Extraída como base compartilhada pelas duas funções abaixo.
- `calcularParcelas(valorTotal, qtd, primeiroVencimento, intervaloDias)` — vencimento por intervalo fixo de dias. Usada só por `comissoes.ts` (Task 12), que tem regra própria (`fornecedor_produtos.comissao_intervalo_dias_parcelas`).
- `calcularVencimentosPorAncora(primeiraParcela, diaAncora: 1|10|20, qtdParcelas): Date[]` — regra real de vencimento do contrato com cliente (spec seção 1): 1ª parcela na data informada, 2ª em diante no dia-âncora do mês **seguinte ao mês da 1ª parcela**, rolando o ano.
- `calcularParcelasContrato(valorTotal, qtdParcelas, primeiraParcela, diaAncora)` — combina as duas acima. É o que a tela de Fechamento de Venda usa (Task 8) pra venda sem funil prévio, ou quando o admin sobrescreve o que veio do CRM.

## Task 4: Repositório `contrato-templates.ts`

**Status: ✅ feito, mas com placeholders redesenhados em 18/08 — a função `resolverPlaceholders` em si não muda (é só substituição de string, indiferente a markdown/HTML), o que muda é o CONJUNTO de placeholders e quem monta cada bloco.**

**Files:** `src/lib/vendas/contrato-templates.ts`
**Produz:** `buscarTemplateAtivoPorProduto(produtoId)`, `resolverPlaceholders(conteudoHtml, dados)`.

**Placeholders finais** (decidido com o Luiz em 18/08, ver seção 3 do quadro-branco):
- `{{dados_cliente}}` — bloco HTML já pronto (montado por quem chama, não por `resolverPlaceholders`) com os dados do signatário principal:
  - **PF:** Nome completo, CPF, RG, Estado Civil, Profissão, E-mail, Fone/WhatsApp, Endereço.
  - **PJ:** Razão Social, CNPJ, e os mesmos 8 campos acima **do representante legal** (via `pessoa_representantes`, que é uma `pessoas` PF normal).
- `{{lista_documentos}}` — repete o mesmo bloco `dados_cliente` pra **cada documento do pacote** (`oportunidade_documentos`, quando > 1), resolvendo cada um contra uma `pessoas` real via `oportunidade_documentos.pessoa_id` (Task 1b). Vazio quando não é pacote.
- `{{valor_total}}` (moeda BRL) / `{{valor_total_extenso}}` — calculados aqui dentro, via `valorPorExtenso` (Task 2), como já estava.
- `{{tabela_vencimentos}}` — `<table>` HTML de verdade agora (não markdown): colunas Nº / Vencimento / Valor / Forma de Pagamento (mesma forma em toda linha, vem de `contratos.metodo_pagamento`).
- `{{forma_pagamento}}` — texto simples (ex. "Parcelado em 3x, Boleto/Pix").
- **Removidos:** `{{nome_cliente}}`/`{{documento_cliente}}` isolados — viraram parte do bloco `dados_cliente` (não fazia sentido separado do RG/estado civil/profissão/endereço, que sempre andam juntos no corpo de um contrato).

**Quem monta os blocos HTML** (`dados_cliente`, `lista_documentos`, `tabela_vencimentos`) é uma função nova, `montarDadosContratoHtml`, no mesmo arquivo — `resolverPlaceholders` só faz a substituição final, continua puro/testável.

## Task 5: Repositório `contratos.ts`

**Status: ✅ feito.**

**Files:** `src/lib/vendas/contratos.ts`
**Produz:** `criarContrato(entrada)` — recebe as parcelas **já calculadas** (`entrada.parcelas: Parcela[]`), não recalcula: quem chama decide se vêm de `conversas.dados.detalhe_pagamento.parcelas` (CRM) ou de `calcularParcelasContrato` (Task 3, venda sem funil prévio/edição manual). `buscarContratoPorOportunidade(oportunidadeId)`, `atualizarStatusContrato(id, status)`, `buscarPessoaArrudaCredSignatario()` (lê a chave `contrato_arrudacred_signatario` de `configuracoes`). `MetodoPagamento` é só `"boleto_pix" | "cartao"` (regra validada com o Luiz, ver Task 0/1).

## Task 6: Geração de PDF

**Files:** Create `src/lib/vendas/geracao-pdf.ts`
**Produz:** `gerarPdfContrato(html: string): Promise<Buffer>` via `puppeteer-core` + `@sparticuz/chromium`. Adicionar dependências ao `package.json`. **Simplificado em 18/08:** como `contrato_templates.conteudo_html` já é HTML de verdade (Task 1b/4), não existe mais etapa de conversão markdown→HTML — o HTML resolvido (placeholders já substituídos) vai direto pro Puppeteer. **Risco registrado, não bloqueia:** projeto está no plano Hobby da Vercel (sem `vercel.json` hoje) — validar tamanho/duração da function quando testar em preview real; pode exigir Pro depois. Upload do PDF resultante pro bucket `contratos` segue exatamente o padrão de `src/lib/vendas/pessoa-documentos.ts` (path `${contratoId}/${Date.now()}-contrato.pdf`, signed URL sob demanda).

## Task 6a: Editor HTML rico (TipTap) — componente compartilhado

**Decisão do Luiz, 18/08/2026:** editor "algo pronto", com tabela, formatação de texto/fonte, alinhamento e imagem — não um textarea simples nem construído do zero.

**Lib escolhida: TipTap** (MIT, open-source, confirmado na doc oficial antes de codar — regra de ouro):
- `@tiptap/react` + `@tiptap/pm` + `@tiptap/starter-kit` (núcleo — negrito/itálico/títulos/listas)
- `@tiptap/extension-table` (exporta `TableKit`, já inclui linha/célula/cabeçalho — não precisa instalar separado)
- `@tiptap/extension-image`
- `@tiptap/extension-text-align`
- `@tiptap/extension-text-style` + `@tiptap/extension-font-family` + `@tiptap/extension-color` (fonte e cor — dependem de `TextStyle` como base)

**Files:** Create `src/components/vendas/editor-html-contrato.tsx`
**Produz:** componente `"use client"` `EditorHtmlContrato({ valorInicial, aoMudar })` — `useEditor` com as extensions acima, `EditorContent` + barra de ferramentas (negrito/itálico/alinhamento/tabela/imagem/fonte/cor). Upload de imagem reaproveita o padrão de Storage já usado (`src/lib/vendas/pessoa-documentos.ts` como referência de path/signed-URL, bucket próprio ou o `contratos` mesmo). `aoMudar(html: string)` dispara a cada edição, componente pai decide quando salvar.

## Task 6b: Tela de edição de `contrato_templates`

**Files:** Create `src/app/admin/(shell)/vendas/produtos/[produtoId]/contrato-template/page.tsx` + `actions.ts` + `contrato-template-client.tsx`

Mesmo padrão `page.tsx`/`actions.ts`/`*-client.tsx`. Client usa `EditorHtmlContrato` (Task 6a) do lado esquerdo; do lado direito, lista os placeholders disponíveis (`{{dados_cliente}}`, `{{lista_documentos}}`, `{{valor_total}}`, `{{valor_total_extenso}}`, `{{tabela_vencimentos}}`, `{{forma_pagamento}}`) com descrição curta de cada um, clicáveis pra inserir no cursor do editor. Salvar grava `contrato_templates.conteudo_html` (cria nova linha se não existir template ativo pro Produto, ou atualiza + incrementa `versao` se já existir).

## Task 7: Config `pessoa_arrudacred_signatario_id`

**Files:** nenhum arquivo novo — só uma linha em `configuracoes` (`chave: 'contrato_arrudacred_signatario'`, `valor: {"pessoa_id": "..."}`) que o Luiz preenche manualmente via `/admin/configuracoes` já existente.

## Task 8: Tela de Fechamento de Venda

**⚠️ Correção de escopo (Coordenador, 18/08 17h45): volta a ser paliativo de prazo CURTO — o CRM já assumiu a captura de pagamento como prioridade 1 do Atendimento, antes do Kanban (não depois de duas frentes inteiras, como dito antes). Não superdimensionar: construir funcional, sem investir em polimento que não sobrevive à convergência com o bot.**

**Files:**
- Create: `src/app/admin/(shell)/vendas/[oportunidadeId]/fechamento/page.tsx` + `actions.ts` + `fechamento-client.tsx`

Mesmo padrão de `page.tsx`(Server Component)/`actions.ts`(`"use server"`)/`*-client.tsx` já usado em `vendas/nova/`.

- **Caminho CRM:** lê `conversas.dados.detalhe_pagamento` (formato exato, spec do CRM seção 4: `{ forma: "boleto_pix"|"cartao", tipo: "avista"|"parcelado", parcelas: [{numero, valor, vencimento}] }`). Quando existir, é **só exibir e confirmar** — os dados já vêm calculados pela mesma regra de âncora, não precisa recalcular. Mapeamento: `detalhe_pagamento.tipo` → `contratos.forma_pagamento`, `detalhe_pagamento.forma` → `contratos.metodo_pagamento`, `detalhe_pagamento.parcelas` → direto pra `criarContrato({ ..., parcelas })`.
- **Caminho venda sem funil prévio (ou `detalhe_pagamento` ainda não existir):** admin escolhe forma/método/data da 1ª parcela/dia-âncora, tela usa `calcularParcelasContrato` (Task 3) pra montar o preview da tabela de vencimentos.
- **Dados exigidos pro contrato (adicionado em 18/08, não é sobre pagamento — não conflita com a correção de escopo):** antes de gerar, a tela confere se a Pessoa signatária (e o representante legal, quando PJ) já tem RG/Estado Civil/Profissão/Endereço preenchidos (Task 1b). Se faltar, formulário simples pra completar — reaproveita `CampoEndereco` (já existe, sub-frente Cadastro) pro endereço; RG/Estado Civil/Profissão são 3 campos de texto novos, sem componente especial. Quando é pacote (`oportunidade_documentos` com mais de 1 linha), repete a checagem pra cada documento, resolvendo/criando a Pessoa por CPF/CNPJ via `resolverOuCriarPessoa` (já existe) e gravando `oportunidade_documentos.pessoa_id`.
- Validação: soma das parcelas confirmadas == `valor_total`. Ao confirmar, chama `criarContrato` (Task 5), gera PDF (Task 6) e sobe status pra `gerado`.

---

## Task 9: `src/lib/assinafy/cliente.ts` — chamadas HTTP cruas

**Files:** Create `src/lib/assinafy/cliente.ts`
**Baseado exatamente na doc registrada na Task 0.** Produz: `uploadDocumento(accountId, arquivo)`, `criarSignatario(accountId, {fullName, email})`, `solicitarAssinatura(documentId, signerIds[])`, `buscarDocumento(documentId)`. Header `X-Api-Key: process.env.ASSINAFY_API_KEY`. Lança erro claro se a env var não estiver setada (mesmo padrão de `ANTHROPIC_API_KEY`).

## Task 10: `src/lib/assinafy/adapter.ts` — orquestração

**Files:** Create `src/lib/assinafy/adapter.ts`
**Produz:** `enviarContratoParaAssinatura(contratoId)` — busca PDF do contrato, faz upload, cria/reaproveita os 2 signatários (cliente + ArrudaCred), solicita assinatura, grava `contratos.assinafy_document_id`, `status = 'enviado'`, `enviado_em`.

## Task 11: Webhook `/api/webhooks/assinafy`

**Files:** Create `src/app/api/webhooks/assinafy/route.ts`
Clone estrutural de `zapster/route.ts`: `maxDuration`, segredo via **query param** (`?secret=`, pois Assinafy não assina payload — decisão já registrada na Task 0), `timingSafeEqual`, fail-closed em produção (`process.env.VERCEL`), payload parseado defensivamente, evento desconhecido → `200 { ignorado: true }`, processamento real via `after()`. Eventos tratados: `document_ready` → `contratos.status='assinado'`, `assinado_em`, `oportunidades.etapa_kanban='pagamento'`, dispara Task 14 (criar cobrança). `signer_rejected_document` → `status='recusado'`.

## Task 12: `comissoes.ts` (produto comissionado)

**Files:** Create `src/lib/vendas/comissoes.ts`
**Produz:** `confirmarVendaComissionada(oportunidadeId, dataAssinaturaCliente)` — lê `fornecedor_produtos`, usa `calcularParcelas` (Task 3, mesma lógica de distribuir valor/datas) pra gerar linhas em `comissoes_fornecedor_receber`, avança `etapa_kanban='ganha'`, chama `promoverPessoaACliente` (já existe, Task 15 da sub-frente Cadastro).

## Task 13: `src/lib/asaas/cliente.ts` + `adapter.ts`

**Files:** Create `src/lib/asaas/cliente.ts`, `src/lib/asaas/adapter.ts`
Baseado na doc da Task 0. `cliente.ts`: `criarCliente(dados)`, `criarCobrancaParcelada(dados)`, header `access_token`. `adapter.ts`: `criarCobrancasDoContrato(contratoId)` — resolve/cria customer Asaas da Pessoa (guardar o `cus_...` retornado — decidir onde: campo novo `pessoas.asaas_customer_id`? **Levar pro Luiz como dúvida durante a implementação desta task**, não decidir sozinho — é mudança em tabela núcleo compartilhada, já registrado como pendência no quadro-branco), cria a cobrança via `POST /v3/payments` com os dados já calculados em `contrato_parcelas`, grava `asaas_payment_id`/`asaas_installment_id` de volta nas linhas.

## Task 14: Webhook `/api/webhooks/asaas`

**Files:** Create `src/app/api/webhooks/asaas/route.ts`
Mesmo clone estrutural, mas segredo vem no **header** `asaas-access-token` (não query — Asaas suporta isso nativamente, melhor que o padrão Zapster). Eventos `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` → `contrato_parcelas.status='pago'`, `pago_em`; ao confirmar a 1ª parcela do contrato: `oportunidades.etapa_kanban='ganha'` + `promoverPessoaACliente`.

## Task 15: Reenvio de link por WhatsApp

**Files:** Edit `src/lib/assinafy/adapter.ts` e `src/lib/asaas/adapter.ts` (ou um helper comum em `src/lib/vendas/`)
Usa `enviarSequenciaWhatsapp` (`src/lib/whatsapp/enviar.ts`, já existe) pra reenviar link de assinatura/pagamento — **não chama Zapster direto**.

## Task 16: Nova subetapa Kanban

**Files:** Edit `src/lib/motor-fluxo/kanban.ts`
Adiciona `aguardando_confirmacao_fornecedor` (só caminho comissionado, entre `dados_contrato` e `ganha`).

## Task 17: Verificação manual ponta a ponta

O que dá pra testar de verdade nesta passada (sem conta Assinafy/Asaas): criar Oportunidade → tela de Fechamento de Venda → contrato gerado com PDF real (abrir e conferir valor por extenso/tabela de vencimentos) → fluxo comissionado completo (sem depender de API externa, já que não tem contrato/Assinafy nesse caminho) até `ganha`. O que fica como **verificação adiada** até o Luiz criar as contas: envio real à Assinafy, webhook de assinatura, cobrança real na Asaas, webhook de pagamento — registrar isso explicitamente no quadro-branco como pendência de teste, não relatar como "funciona" sem ter sido exercitado de verdade.

---

## Verification

- `pnpm test` (Vitest — Tasks 2, 3 com teste real; resto é I/O, sem teste unitário).
- `pnpm lint` limpo.
- Gerar um contrato de teste ponta a ponta no navegador (produto `proprio`, venda sem funil prévio) e abrir o PDF resultante — conferir valor por extenso e tabela de vencimentos manualmente.
- Fluxo comissionado ponta a ponta no navegador até `etapa_kanban = 'ganha'` e `comissoes_fornecedor_receber` populada corretamente.
- Assinafy/Asaas: sem verificação end-to-end possível nesta passada (sem conta) — registrar como pendência.
