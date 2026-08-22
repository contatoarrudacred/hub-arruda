# Comunicação Centralizada via CRM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar aos outros módulos (Vendas, Financeiro, Marketing, Operações...) uma função única para mandar WhatsApp/e-mail pro cliente, sempre passando pelo CRM (gravado na timeline da Pessoa), respeitando a regra de nunca iniciar conversa pelo WhatsApp oficial.

**Architecture:** Módulo novo `src/lib/comunicacao/` expõe `enviarComunicacao(...)` — chamada de função direta (mesmo processo Next.js, sem API interna). Internamente resolve conversa (oficial/secundária pro WhatsApp; canal `email` pro e-mail), envia de verdade (Zapster ou Resend), grava em `mensagens` com `remetente='sistema'`. Categoria de mensagem é uma tabela administrável (`categorias_comunicacao`) com tela própria em Configurações.

**Tech Stack:** Next.js App Router, Supabase (service_role via `createAdminClient()`), TypeScript, Vitest, Zapster (WhatsApp, 2 instâncias), Resend (e-mail), react-email.

**Spec:** [`docs/superpowers/specs/2026-08-22-comunicacao-centralizada-crm-design.md`](../specs/2026-08-22-comunicacao-centralizada-crm-design.md) — o plano abaixo argumenta a partir dessa spec; leia os dois.

## Global Constraints

- Nenhum agente roda migration no Supabase — toda migration é só ESCRITA aqui; avisar o Luiz pra rodar no SQL Editor, confirmar rodou antes de seguir pras tarefas que dependem do schema novo.
- Nunca silenciar erro de envio real (Zapster/Resend) — sempre lança, quem chama decide como mostrar.
- Nenhuma chamada de teste real ao Zapster/Resend em testes automatizados — só lógica pura (decisão de instância, idempotência) é testada com Vitest; I/O é verificado manualmente.
- `conversas.canal` e `mensagens.remetente` são colunas `text` com `CHECK`, não enum de banco — ampliar o `CHECK` existente é sempre um `alter table ... drop constraint ... add constraint ...` (mesmo padrão já usado em `20260815150000_motor_followup.sql`).
- Toda tabela nova precisa de RLS (`enable row level security` + `admin_acesso_total`) e trigger de auditoria (`fn_auditoria_log()`) — Supabase liga RLS automático e bloqueia o painel admin sem isso (achado já registrado na migration 009).

---

## Task 1: Migration — schema completo

**Files:**
- Create: `supabase/migrations/20260822130000_comunicacao_centralizada.sql`

**Interfaces:**
- Produces: tabela `categorias_comunicacao` (id, nome, ativo, created_at, updated_at); `conversas.instancia` (text nullable); `conversas_canal_check` ampliado com `'email'`; `mensagens.categoria_id` (uuid nullable, FK), `mensagens.chave_idempotencia` (text nullable, unique), `mensagens.provedor_message_id` (text nullable); `mensagens_remetente_check` ampliado com `'sistema'`.

- [ ] **Step 1: Escrever a migration completa**

```sql
-- ============================================================================
-- MIGRATION — Comunicação centralizada via CRM
-- Sistema de Gestão ArrudaCred
--
-- Spec: docs/superpowers/specs/2026-08-22-comunicacao-centralizada-crm-design.md
-- Luiz decidiu (21/08/2026, COORDENACAO_AGENTES_ARRUDACRED.md seção 4 item 7): só o CRM manda
-- comunicação pro cliente daqui pra frente. Este schema sustenta o módulo src/lib/comunicacao/.
-- ============================================================================

-- categorias_comunicacao: lista controlada e administrável (tela em Configurações), não um CHECK
-- fixo no código — Luiz quer adicionar/desativar categorias sem depender de migration a cada vez.
create table categorias_comunicacao (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table categorias_comunicacao is
  'Categoria/motivo de uma comunicação enviada via src/lib/comunicacao (ex.: cobrança, lembrete, institucional). Lista administrável em /admin/configuracoes/categorias-comunicacao, não fixa no código — vários módulos (Vendas, Financeiro, Marketing) usam a mesma lista.';

alter table categorias_comunicacao enable row level security;
create policy admin_acesso_total on categorias_comunicacao for all to authenticated using (true) with check (true);
create trigger trg_auditoria_categorias_comunicacao
  after insert or update or delete on categorias_comunicacao
  for each row execute function fn_auditoria_log();

insert into categorias_comunicacao (nome) values ('Cobrança'), ('Lembrete'), ('Institucional');

-- conversas.instancia: só relevante pra canal='whatsapp' — 'oficial' (conversa real, iniciada pelo
-- lead, nunca criada pelo mecanismo) ou 'secundaria' (número extra, só disparo automático, usado
-- quando NÃO existe conversa oficial ainda — nunca inicia contato pelo oficial, risco de banimento
-- em modo não-oficial). Texto livre (não CHECK fechado em 2 valores) — spec já prevê mais
-- instâncias secundárias por área no futuro, sem quebrar nada.
alter table conversas add column instancia text;
comment on column conversas.instancia is
  'Só relevante quando canal=whatsapp: "oficial" (conversa real, nunca criada por este mecanismo, só existe se o lead já contatou o número oficial) ou "secundaria" (número extra, só disparo automático — ver src/lib/comunicacao). Null pra conversas de outros canais.';

-- conversas.canal JÁ EXISTIA (conversas_canal_check, migration 20260815150000) com
-- ('whatsapp','instagram','messenger','widget','telegram','simulador') — só falta 'email'.
alter table conversas drop constraint if exists conversas_canal_check;
alter table conversas
  add constraint conversas_canal_check
  check (canal in ('whatsapp', 'instagram', 'messenger', 'widget', 'telegram', 'simulador', 'email'));

-- mensagens: 3 colunas novas + remetente ganha 'sistema' (mensagem automática originada por um
-- módulo via src/lib/comunicacao, distinta de 'malala'/'lead'/'supervisor').
alter table mensagens
  add column categoria_id uuid references categorias_comunicacao(id) on delete set null,
  add column chave_idempotencia text unique,
  add column provedor_message_id text;

comment on column mensagens.categoria_id is
  'Só preenchido quando remetente=sistema — categoria/motivo da comunicação (ver categorias_comunicacao), gerenciada em /admin/configuracoes/categorias-comunicacao.';
comment on column mensagens.chave_idempotencia is
  'Chave opcional que quem chama src/lib/comunicacao::enviarComunicacao pode passar (ex.: "cobranca_12345_lembrete") pra evitar reenvio duplicado em retry — UNIQUE na tabela inteira, cabe a quem chama prefixar o suficiente pro seu caso (módulo + entidade + motivo) pra nunca colidir com a de outro módulo.';
comment on column mensagens.provedor_message_id is
  'ID genérico devolvido pelo Zapster OU pela Resend, usado só por src/lib/comunicacao::enviarComunicacao — zapster_message_id (coluna já existente) continua sendo usada por todo o resto do sistema (motor de fluxo, atendente humano na Tela de Atendimento), sem migração de dados.';

alter table mensagens drop constraint if exists mensagens_remetente_check;
alter table mensagens
  add constraint mensagens_remetente_check
  check (remetente in ('malala', 'lead', 'supervisor', 'sistema'));

-- ============================================================================
-- Fim da migration.
-- ============================================================================
```

- [ ] **Step 2: Avisar o Luiz pra rodar no SQL Editor do Supabase**

Mande a mensagem: "Migration pronta em `supabase/migrations/20260822130000_comunicacao_centralizada.sql` — pode rodar no SQL Editor quando puder? Ela cria a tabela `categorias_comunicacao` (com 3 categorias iniciais), adiciona `conversas.instancia`, amplia o `CHECK` de `conversas.canal` pra incluir `'email'`, e adiciona `mensagens.categoria_id`/`chave_idempotencia`/`provedor_message_id` + `remetente='sistema'`."

Pare aqui e espere confirmação antes de rodar `supabase gen types` ou qualquer tarefa que dependa do schema novo existir de verdade no banco.

- [ ] **Step 3: Depois de confirmado, regenerar `database.types.ts`**

Run: `npx supabase gen types typescript --project-id <ver .env.local NEXT_PUBLIC_SUPABASE_URL> --schema public > src/lib/supabase/database.types.ts`

(Se não souber o project-id, rode `cat .env.local | grep SUPABASE_URL` primeiro — o id é o subdomínio antes de `.supabase.co`.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260822130000_comunicacao_centralizada.sql src/lib/supabase/database.types.ts
git commit -m "feat(comunicacao): migration + tipos — categorias_comunicacao, conversas.instancia, mensagens novas colunas"
```

---

## Task 2: `zapster.ts` — suporte a 2 instâncias (oficial/secundária)

**Files:**
- Modify: `src/lib/whatsapp/zapster.ts`

**Interfaces:**
- Produces: `export type InstanciaZapster = "oficial" | "secundaria";` e `enviarMensagemTexto(telefone: string, texto: string, instancia?: InstanciaZapster): Promise<{ messageId: string }>` (default `"oficial"`, backward-compatible — nenhum caller existente precisa mudar).

- [ ] **Step 1: Modificar `obterConfig` pra aceitar instância**

Substituir o topo do arquivo (linhas 1-19 hoje):

```ts
import "server-only";

// Envio real de WhatsApp via Zapster (Fase 7, decidido em 11/08/2026 — ver PLANO_MESTRE seção 8.5).
// 2 instâncias desde 22/08/2026 (comunicação centralizada via CRM, ver
// docs/superpowers/specs/2026-08-22-comunicacao-centralizada-crm-design.md): "oficial" é o número
// real de atendimento (nunca inicia conversa do zero — risco de banimento em modo não-oficial);
// "secundaria" é um número extra, só pra disparar mensagem quando ainda não existe conversa aberta
// no oficial (sempre acompanhada do aviso pra migrar pro oficial, ver src/lib/comunicacao).
// Único lugar do projeto que fala com a API da Zapster.

export type InstanciaZapster = "oficial" | "secundaria";

function obterConfig(instancia: InstanciaZapster = "oficial"): { baseUrl: string; token: string; instanceId: string } {
  const baseUrl = process.env.ZAPSTER_API_BASE_URL;
  const token = instancia === "oficial" ? process.env.ZAPSTER_API_TOKEN : process.env.ZAPSTER_SECUNDARIO_API_TOKEN;
  const instanceId = instancia === "oficial" ? process.env.ZAPSTER_INSTANCE_ID : process.env.ZAPSTER_SECUNDARIO_INSTANCE_ID;
  if (!baseUrl || !token || !instanceId) {
    const sufixo = instancia === "oficial" ? "" : "_SECUNDARIO";
    throw new Error(
      `Configuração do Zapster incompleta (instância ${instancia}) — falta ZAPSTER_API_BASE_URL / ZAPSTER_API_TOKEN${sufixo} / ZAPSTER_INSTANCE_ID${sufixo} no .env.local (dev) ou nas variáveis de ambiente da Vercel (produção).`,
    );
  }
  return { baseUrl, token, instanceId };
}
```

- [ ] **Step 2: Adicionar o parâmetro `instancia` em `enviarMensagemTexto`**

```ts
/** Envia uma mensagem de texto simples via WhatsApp. Lança erro em caso de falha. */
export async function enviarMensagemTexto(
  telefone: string,
  texto: string,
  instancia: InstanciaZapster = "oficial",
): Promise<{ messageId: string }> {
  const { baseUrl, token, instanceId } = obterConfig(instancia);

  const resposta = await fetch(`${baseUrl}/wa/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instance_id: instanceId,
      recipient: normalizarTelefone(telefone),
      text: texto,
    }),
  });

  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(`Falha ao enviar mensagem via Zapster (HTTP ${resposta.status}): ${JSON.stringify(corpo)}`);
  }
  return { messageId: corpo?.message_id ?? "" };
}
```

Não mexer em `definirDigitando`, `atualizarConfiguracoesInstancia` nem `enviarMensagemMidia` — o mecanismo novo só manda texto (YAGNI, ninguém pediu mídia por enquanto).

- [ ] **Step 3: Verificar que compila e nada quebrou**

Run: `npx tsc --noEmit`
Expected: sem erros (todos os callers existentes de `enviarMensagemTexto` continuam passando só 2 argumentos, o 3º é opcional).

Run: `npx eslint src/lib/whatsapp/zapster.ts`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/whatsapp/zapster.ts
git commit -m "feat(whatsapp): zapster.ts aceita instancia oficial/secundaria em enviarMensagemTexto"
```

---

## Task 3: Helper compartilhado de segredo de webhook

**Files:**
- Create: `src/lib/whatsapp/verificar-segredo-webhook.ts`
- Modify: `src/app/api/webhooks/zapster/route.ts` (reusar o helper, remover a função local `segredosBatem` + a checagem inline)

**Interfaces:**
- Produces: `export function verificarSegredoWebhook(request: Request, nomeEnvVar: string): boolean` — `true` = autorizado, `false` = rejeitar com 401. Usado pela rota existente e pela nova rota secundária (Task 8).

- [ ] **Step 1: Criar o helper**

```ts
import { timingSafeEqual } from "node:crypto";

// Extraído de src/app/api/webhooks/zapster/route.ts em 22/08/2026 — a rota do número secundário
// (ver src/app/api/webhooks/zapster-secundario/route.ts) precisa da MESMA checagem
// (segredo na query string, comparação em tempo constante, fail-closed em produção), só que com
// uma env var diferente. Único lugar com essa lógica agora.

/** Comparação em tempo constante — evita vazar, por timing, quantos caracteres do segredo já acertaram. */
function segredosBatem(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * `true` = requisição autorizada, pode processar. `false` = quem chamou deve responder 401
 * imediatamente. Fail-closed em produção (Vercel): sem a env var configurada, rejeita — um erro de
 * configuração não pode virar um endpoint aberto aceitando payload de qualquer um (achado real,
 * 16/08/2026, ver histórico do zapster/route.ts). Em dev local (sem `process.env.VERCEL`), pula a
 * checagem se a env var não estiver setada.
 */
export function verificarSegredoWebhook(request: Request, nomeEnvVar: string): boolean {
  const segredo = process.env[nomeEnvVar];

  if (!segredo) {
    if (process.env.VERCEL) {
      console.error(`[webhook] ${nomeEnvVar} não configurada em produção — rejeitando.`);
      return false;
    }
    return true;
  }

  const secretDaUrl = new URL(request.url).searchParams.get("secret") ?? "";
  return segredosBatem(secretDaUrl, segredo);
}
```

- [ ] **Step 2: Escrever teste da lógica de comparação**

Create: `src/lib/whatsapp/verificar-segredo-webhook.test.ts`

```ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { verificarSegredoWebhook } from "./verificar-segredo-webhook";

function requestCom(secret: string | null): Request {
  const url = secret === null ? "https://x.com/webhook" : `https://x.com/webhook?secret=${encodeURIComponent(secret)}`;
  return new Request(url);
}

describe("verificarSegredoWebhook", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("segredo certo na query string: autoriza", () => {
    vi.stubEnv("TESTE_WEBHOOK_SECRET", "abc123");
    expect(verificarSegredoWebhook(requestCom("abc123"), "TESTE_WEBHOOK_SECRET")).toBe(true);
  });

  it("segredo errado: rejeita", () => {
    vi.stubEnv("TESTE_WEBHOOK_SECRET", "abc123");
    expect(verificarSegredoWebhook(requestCom("errado"), "TESTE_WEBHOOK_SECRET")).toBe(false);
  });

  it("sem segredo na query string: rejeita", () => {
    vi.stubEnv("TESTE_WEBHOOK_SECRET", "abc123");
    expect(verificarSegredoWebhook(requestCom(null), "TESTE_WEBHOOK_SECRET")).toBe(false);
  });

  it("env var não configurada e não é produção (sem VERCEL): autoriza (dev local)", () => {
    vi.stubEnv("TESTE_WEBHOOK_SECRET", undefined);
    vi.stubEnv("VERCEL", undefined);
    expect(verificarSegredoWebhook(requestCom(null), "TESTE_WEBHOOK_SECRET")).toBe(true);
  });

  it("env var não configurada EM PRODUÇÃO (VERCEL setado): rejeita (fail-closed)", () => {
    vi.stubEnv("TESTE_WEBHOOK_SECRET", undefined);
    vi.stubEnv("VERCEL", "1");
    expect(verificarSegredoWebhook(requestCom(null), "TESTE_WEBHOOK_SECRET")).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar os testes**

Run: `npx vitest run src/lib/whatsapp/verificar-segredo-webhook.test.ts`
Expected: 5 testes verdes.

- [ ] **Step 4: Trocar a rota existente pra usar o helper**

Em `src/app/api/webhooks/zapster/route.ts`, remover a função local `segredosBatem` e o bloco de checagem inline dentro de `POST`, substituindo por:

```ts
import { verificarSegredoWebhook } from "@/lib/whatsapp/verificar-segredo-webhook";
```

E no início de `export async function POST(request: Request) {`:

```ts
export async function POST(request: Request) {
  if (!verificarSegredoWebhook(request, "ZAPSTER_WEBHOOK_SECRET")) {
    return new Response("Não autorizado", { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  // ... resto do handler continua igual (console.log do payload, etc.)
```

Remover a função `segredosBatem` local e o `import { timingSafeEqual } from "node:crypto";` do topo do arquivo (não é mais usado diretamente aqui).

- [ ] **Step 5: Verificar que compila e os testes existentes continuam passando**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npx eslint .`
Expected: sem erros.

Run: `npx vitest run`
Expected: todos os testes verdes (mais a 1 falha pré-existente conhecida, sem relação — `ponta a ponta: aceita agendar...` em `engine.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp/verificar-segredo-webhook.ts src/lib/whatsapp/verificar-segredo-webhook.test.ts src/app/api/webhooks/zapster/route.ts
git commit -m "refactor(whatsapp): extrai verificarSegredoWebhook compartilhado da rota zapster"
```

---

## Task 4: Lógica pura — resolver instância + idempotência (TDD)

**Files:**
- Create: `src/lib/comunicacao/resolver-envio-validacao.ts`
- Create: `src/lib/comunicacao/resolver-envio-validacao.test.ts`

**Interfaces:**
- Produces:
  - `resolverInstanciaWhatsapp(existeConversaOficial: boolean): "oficial" | "secundaria"`
  - `avaliarIdempotencia(mensagemExistente: { id: string } | null): { repetir: true; mensagemId: string } | { repetir: false }`
- Consumes: nada (módulo puro, sem I/O).

- [ ] **Step 1: Escrever os testes primeiro**

```ts
import { describe, expect, it } from "vitest";
import { avaliarIdempotencia, resolverInstanciaWhatsapp } from "./resolver-envio-validacao";

describe("resolverInstanciaWhatsapp", () => {
  it("já existe conversa oficial: usa oficial", () => {
    expect(resolverInstanciaWhatsapp(true)).toBe("oficial");
  });

  it("não existe conversa oficial: usa secundaria (nunca inicia contato pelo oficial)", () => {
    expect(resolverInstanciaWhatsapp(false)).toBe("secundaria");
  });
});

describe("avaliarIdempotencia", () => {
  it("sem mensagem existente: não repete, segue com o envio normal", () => {
    expect(avaliarIdempotencia(null)).toEqual({ repetir: false });
  });

  it("já existe mensagem com essa chave: repete o resultado anterior, não manda de novo", () => {
    expect(avaliarIdempotencia({ id: "msg-123" })).toEqual({ repetir: true, mensagemId: "msg-123" });
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham (módulo ainda não existe)**

Run: `npx vitest run src/lib/comunicacao/resolver-envio-validacao.test.ts`
Expected: FAIL — `Cannot find module './resolver-envio-validacao'`.

- [ ] **Step 3: Implementar**

```ts
// Parte pura do módulo de comunicação centralizada — sem I/O (nenhuma chamada a Supabase, Zapster
// ou Resend), testável direto. A resolução de QUAL conversa buscar/criar (I/O de verdade) fica em
// repositorio.ts; aqui só a DECISÃO, dado o que já foi buscado.

/**
 * Nunca inicia conversa pelo WhatsApp oficial (spec: docs/superpowers/specs/2026-08-22-comunicacao-centralizada-crm-design.md
 * — risco de banimento em modo não-oficial). "Já existe conversa oficial" = QUALQUER conversa que
 * já existiu com a pessoa no oficial, não importa há quanto tempo (decisão de Luiz).
 */
export function resolverInstanciaWhatsapp(existeConversaOficial: boolean): "oficial" | "secundaria" {
  return existeConversaOficial ? "oficial" : "secundaria";
}

export type ResultadoIdempotencia = { repetir: true; mensagemId: string } | { repetir: false };

/** Se já existe uma mensagem gravada com a mesma chave de idempotência, não manda de novo — devolve o resultado anterior. */
export function avaliarIdempotencia(mensagemExistente: { id: string } | null): ResultadoIdempotencia {
  if (mensagemExistente) return { repetir: true, mensagemId: mensagemExistente.id };
  return { repetir: false };
}
```

- [ ] **Step 4: Rodar os testes de novo, confirmar que passam**

Run: `npx vitest run src/lib/comunicacao/resolver-envio-validacao.test.ts`
Expected: PASS — 4 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comunicacao/resolver-envio-validacao.ts src/lib/comunicacao/resolver-envio-validacao.test.ts
git commit -m "feat(comunicacao): logica pura de resolucao de instancia + idempotencia (TDD)"
```

---

## Task 5: Tipos do módulo

**Files:**
- Create: `src/lib/comunicacao/tipos.ts`

**Interfaces:**
- Produces: `ConteudoWhatsapp`, `ConteudoEmail`, `ParametrosComunicacao`, `ResultadoComunicacao` — usados por todas as tarefas seguintes.

- [ ] **Step 1: Escrever os tipos**

```ts
// Tipos do módulo de comunicação centralizada — ver
// docs/superpowers/specs/2026-08-22-comunicacao-centralizada-crm-design.md.

export type ConteudoWhatsapp = { texto: string };

/** `corpo` é texto/parágrafos simples — o layout padrão de e-mail (EmailLayout) cuida do resto (cabeçalho, rodapé, identidade visual). Nunca HTML cru vindo de quem chama. */
export type ConteudoEmail = { assunto: string; corpo: string };

export type ParametrosComunicacao = {
  pessoaId: string;
  categoriaId: string;
  chaveIdempotencia?: string;
} & ({ canal: "whatsapp"; conteudo: ConteudoWhatsapp } | { canal: "email"; conteudo: ConteudoEmail });

export type ResultadoComunicacao =
  | { status: "enviado"; mensagemId: string; instancia?: "oficial" | "secundaria" }
  | { status: "idempotente_repetido"; mensagemId: string };
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros (arquivo novo, só tipos, nada consome ainda).

- [ ] **Step 3: Commit**

```bash
git add src/lib/comunicacao/tipos.ts
git commit -m "feat(comunicacao): tipos do modulo (ParametrosComunicacao, ResultadoComunicacao)"
```

---

## Task 6: Repositório do módulo — conversas + mensagens + idempotência (I/O)

**Files:**
- Create: `src/lib/comunicacao/repositorio.ts`

**Interfaces:**
- Consumes: nada de outro módulo novo (só `createAdminClient` e os tipos da Task 5).
- Produces:
  - `buscarConversaWhatsappOficial(pessoaId: string): Promise<{ id: string; telefone: string } | null>`
  - `buscarOuCriarConversaSecundaria(pessoaId: string): Promise<{ id: string; telefone: string }>`
  - `buscarOuCriarConversaEmail(pessoaId: string): Promise<{ id: string }>`
  - `buscarMensagemPorChaveIdempotencia(chave: string): Promise<{ id: string } | null>`
  - `inserirMensagemSistema(params: { conversaId: string; texto: string; categoriaId: string; chaveIdempotencia?: string; provedorMessageId: string | null }): Promise<{ id: string }>`

- [ ] **Step 1: Implementar**

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Camada de I/O do módulo de comunicação centralizada — único lugar que fala com o Supabase aqui
// dentro (mesmo padrão de motor-fluxo/repositorio.ts). Sem testes de unidade (não tem lógica pra
// testar sem mockar o Supabase — convenção deste projeto, ver motor-fluxo/repositorio.ts, sem
// testes próprios, verificado manualmente).

/** Conversa oficial de WhatsApp já existente pra essa pessoa — NUNCA cria uma nova aqui (só existe se o lead já contatou o oficial de verdade). Pega o telefone salvo em `pessoas.whatsapp`. */
export async function buscarConversaWhatsappOficial(pessoaId: string): Promise<{ id: string; telefone: string } | null> {
  const supabase = createAdminClient();

  const { data: pessoa } = await supabase.from("pessoas").select("whatsapp").eq("id", pessoaId).single();
  if (!pessoa?.whatsapp) return null;

  const { data: conversa } = await supabase
    .from("conversas")
    .select("id")
    .eq("pessoa_id", pessoaId)
    .eq("canal", "whatsapp")
    .is("instancia", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conversa) return null;
  return { id: conversa.id, telefone: pessoa.whatsapp };
}

/** Conversa da instância secundária — cria se ainda não existir pra essa pessoa. */
export async function buscarOuCriarConversaSecundaria(pessoaId: string): Promise<{ id: string; telefone: string }> {
  const supabase = createAdminClient();

  const { data: pessoa } = await supabase.from("pessoas").select("whatsapp").eq("id", pessoaId).single();
  if (!pessoa?.whatsapp) {
    throw new Error(`Pessoa ${pessoaId} não tem telefone de WhatsApp cadastrado — não é possível enviar.`);
  }

  const { data: existente } = await supabase
    .from("conversas")
    .select("id")
    .eq("pessoa_id", pessoaId)
    .eq("canal", "whatsapp")
    .eq("instancia", "secundaria")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existente) return { id: existente.id, telefone: pessoa.whatsapp };

  const { data: criada, error } = await supabase
    .from("conversas")
    .insert({ pessoa_id: pessoaId, canal: "whatsapp", instancia: "secundaria", status: "ativa" })
    .select("id")
    .single();
  if (error || !criada) throw new Error(`Falha ao criar conversa secundária pra pessoa ${pessoaId}: ${error?.message}`);

  return { id: criada.id, telefone: pessoa.whatsapp };
}

/** Conversa do canal e-mail — cria se ainda não existir pra essa pessoa. E-mail não tem o problema de "instância" (Resend não bane número, ver spec). */
export async function buscarOuCriarConversaEmail(pessoaId: string): Promise<{ id: string }> {
  const supabase = createAdminClient();

  const { data: existente } = await supabase
    .from("conversas")
    .select("id")
    .eq("pessoa_id", pessoaId)
    .eq("canal", "email")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existente) return { id: existente.id };

  const { data: criada, error } = await supabase
    .from("conversas")
    .insert({ pessoa_id: pessoaId, canal: "email", status: "ativa" })
    .select("id")
    .single();
  if (error || !criada) throw new Error(`Falha ao criar conversa de e-mail pra pessoa ${pessoaId}: ${error?.message}`);

  return { id: criada.id };
}

export async function buscarMensagemPorChaveIdempotencia(chave: string): Promise<{ id: string } | null> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("mensagens").select("id").eq("chave_idempotencia", chave).maybeSingle();
  return data ?? null;
}

export async function inserirMensagemSistema(params: {
  conversaId: string;
  texto: string;
  categoriaId: string;
  chaveIdempotencia?: string;
  provedorMessageId: string | null;
}): Promise<{ id: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("mensagens")
    .insert({
      conversa_id: params.conversaId,
      remetente: "sistema",
      conteudo: params.texto,
      categoria_id: params.categoriaId,
      chave_idempotencia: params.chaveIdempotencia ?? null,
      provedor_message_id: params.provedorMessageId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Falha ao gravar mensagem do sistema: ${error?.message}`);
  return { id: data.id };
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros. Se `conversas.instancia`/`mensagens.categoria_id`/etc. derem erro de tipo, confirme que a Task 1 (migration + `database.types.ts` regenerado) já foi concluída antes desta.

- [ ] **Step 3: Commit**

```bash
git add src/lib/comunicacao/repositorio.ts
git commit -m "feat(comunicacao): repositorio - conversas oficial/secundaria/email + idempotencia"
```

---

## Task 7: Template de e-mail genérico ("miolo" simples)

**Files:**
- Create: `src/lib/email/templates/comunicacao-generica.tsx`

**Interfaces:**
- Consumes: `EmailLayout` (`./layout-base`), `ContatoInstitucional`/`RedesSociais` (`../contato-institucional`).
- Produces: `EmailComunicacaoGenerica({ assunto, corpo, linkWhatsapp, redesSociais, linkDescadastro }): JSX.Element` — usado pela Task 9.

- [ ] **Step 1: Ler o template de boas-vindas existente pra confirmar a estrutura de props (referência, não copiar o conteúdo)**

Abra `src/lib/email/templates/boas-vindas.tsx` só pra confirmar como ele usa `EmailLayout` — o novo template segue a MESMA estrutura, só com conteúdo mais simples (título + parágrafos, sem seções de blog/vídeo).

- [ ] **Step 2: Implementar o template**

```tsx
import { Heading, Text } from "react-email";
import { EmailLayout, type EmailLayoutProps } from "./layout-base";

// Template genérico pro módulo src/lib/comunicacao — quem chama enviarComunicacao só fornece
// assunto + corpo (texto simples), nunca HTML cru. Reaproveita o MESMO layout padrão de todo
// e-mail da ArrudaCred (Luiz, 15/08/2026: "podemos salvar este modelo... padrão para todos
// e-mails que formos enviar, assim só muda o miolo").

export type EmailComunicacaoGenericaProps = Omit<EmailLayoutProps, "children" | "previewText"> & {
  assunto: string;
  corpo: string;
};

/** Quebra o corpo em parágrafos por linha em branco — texto simples vindo de quem chama, sem markup. */
function paragrafos(corpo: string): string[] {
  return corpo
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function EmailComunicacaoGenerica({ assunto, corpo, linkWhatsapp, redesSociais, linkDescadastro }: EmailComunicacaoGenericaProps) {
  return (
    <EmailLayout previewText={assunto} linkWhatsapp={linkWhatsapp} redesSociais={redesSociais} linkDescadastro={linkDescadastro}>
      <div style={{ padding: "28px 32px" }}>
        <Heading style={{ fontSize: 20, margin: "0 0 16px", color: "#1a1a1a" }}>{assunto}</Heading>
        {paragrafos(corpo).map((paragrafo, i) => (
          <Text key={i} style={{ fontSize: 15, lineHeight: "24px", color: "#333333", margin: "0 0 14px" }}>
            {paragrafo}
          </Text>
        ))}
      </div>
    </EmailLayout>
  );
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/templates/comunicacao-generica.tsx
git commit -m "feat(email): template generico reaproveitando EmailLayout padrao"
```

---

## Task 8: Núcleo — `enviarComunicacao`

**Files:**
- Create: `src/lib/comunicacao/enviar.ts`

**Interfaces:**
- Consumes: `resolverInstanciaWhatsapp`, `avaliarIdempotencia` (Task 4); `ParametrosComunicacao`, `ResultadoComunicacao` (Task 5); `buscarConversaWhatsappOficial`, `buscarOuCriarConversaSecundaria`, `buscarOuCriarConversaEmail`, `buscarMensagemPorChaveIdempotencia`, `inserirMensagemSistema` (Task 6); `EmailComunicacaoGenerica` (Task 7); `enviarMensagemTexto` (`@/lib/whatsapp/zapster`); `enviarEmail` (`@/lib/email/resend`); `carregarContatoInstitucional` (`@/lib/email/contato-institucional`).
- Produces: `export async function enviarComunicacao(params: ParametrosComunicacao): Promise<ResultadoComunicacao>` — é isto que Vendas/Financeiro/Marketing vão importar e chamar.

- [ ] **Step 1: Checar a assinatura real de `carregarContatoInstitucional` e o link de descadastro**

Rode: `grep -n "export" src/lib/email/contato-institucional.ts` — confirme o formato de retorno (`{ whatsappNumero, redesSociais }`, mesmo usado em `boas-vindas.ts`) antes do próximo passo. Ajuste os nomes usados no Step 2 se divergirem.

- [ ] **Step 2: Implementar**

```ts
import "server-only";
import { render } from "react-email";
import { carregarContatoInstitucional } from "@/lib/email/contato-institucional";
import { EmailComunicacaoGenerica } from "@/lib/email/templates/comunicacao-generica";
import { enviarEmail } from "@/lib/email/resend";
import { enviarMensagemTexto } from "@/lib/whatsapp/zapster";
import {
  buscarConversaWhatsappOficial,
  buscarMensagemPorChaveIdempotencia,
  buscarOuCriarConversaEmail,
  buscarOuCriarConversaSecundaria,
  inserirMensagemSistema,
} from "./repositorio";
import { avaliarIdempotencia, resolverInstanciaWhatsapp } from "./resolver-envio-validacao";
import type { ParametrosComunicacao, ResultadoComunicacao } from "./tipos";

// Núcleo do módulo de comunicação centralizada — ver
// docs/superpowers/specs/2026-08-22-comunicacao-centralizada-crm-design.md. Único ponto de entrada
// que outros módulos (Vendas, Financeiro, Marketing...) chamam pra mandar WhatsApp/e-mail pro
// cliente — nunca falam direto com Zapster/Resend.

function montarLinkWhatsapp(numero: string): string {
  return `https://wa.me/${numero}`;
}

const AVISO_INSTANCIA_SECUNDARIA_PREFIXO =
  "⚠️ Este número é apenas para envio automático e não consegue responder. " +
  "Se precisar de ajuda, fale com a gente pelo nosso WhatsApp oficial: ";

export async function enviarComunicacao(params: ParametrosComunicacao): Promise<ResultadoComunicacao> {
  const { pessoaId, categoriaId, chaveIdempotencia, canal, conteudo } = params;

  if (chaveIdempotencia) {
    const existente = await buscarMensagemPorChaveIdempotencia(chaveIdempotencia);
    const avaliacao = avaliarIdempotencia(existente);
    if (avaliacao.repetir) return { status: "idempotente_repetido", mensagemId: avaliacao.mensagemId };
  }

  if (canal === "whatsapp") {
    const conversaOficial = await buscarConversaWhatsappOficial(pessoaId);
    const instancia = resolverInstanciaWhatsapp(conversaOficial !== null);

    let conversaId: string;
    let telefone: string;
    let textoParaEnviar = conteudo.texto;

    if (instancia === "oficial" && conversaOficial) {
      conversaId = conversaOficial.id;
      telefone = conversaOficial.telefone;
    } else {
      const conversaSecundaria = await buscarOuCriarConversaSecundaria(pessoaId);
      conversaId = conversaSecundaria.id;
      telefone = conversaSecundaria.telefone;
      const contato = await carregarContatoInstitucional();
      const aviso = `${AVISO_INSTANCIA_SECUNDARIA_PREFIXO}${montarLinkWhatsapp(contato.whatsappNumero)}`;
      textoParaEnviar = `${aviso}\n\n${conteudo.texto}`;
    }

    const { messageId } = await enviarMensagemTexto(telefone, textoParaEnviar, instancia);
    const { id: mensagemId } = await inserirMensagemSistema({
      conversaId,
      texto: textoParaEnviar,
      categoriaId,
      chaveIdempotencia,
      provedorMessageId: messageId || null,
    });

    return { status: "enviado", mensagemId, instancia };
  }

  // canal === "email"
  const [conversaEmail, contato] = await Promise.all([buscarOuCriarConversaEmail(pessoaId), carregarContatoInstitucional()]);

  const html = await render(
    EmailComunicacaoGenerica({
      assunto: conteudo.assunto,
      corpo: conteudo.corpo,
      linkWhatsapp: montarLinkWhatsapp(contato.whatsappNumero),
      redesSociais: contato.redesSociais,
      linkDescadastro: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/descadastro?p=${pessoaId}`,
    }),
  );

  const { data: pessoaEmail } = await import("@/lib/supabase/admin").then((m) =>
    m.createAdminClient().from("pessoas").select("email").eq("id", pessoaId).single(),
  );
  if (!pessoaEmail?.email) throw new Error(`Pessoa ${pessoaId} não tem e-mail cadastrado — não é possível enviar.`);

  const { id: emailId } = await enviarEmail({ destinatario: pessoaEmail.email, assunto: conteudo.assunto, html });
  const { id: mensagemId } = await inserirMensagemSistema({
    conversaId: conversaEmail.id,
    texto: `${conteudo.assunto}\n\n${conteudo.corpo}`,
    categoriaId,
    chaveIdempotencia,
    provedorMessageId: emailId || null,
  });

  return { status: "enviado", mensagemId };
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros. Se `carregarContatoInstitucional`/`redesSociais` divergirem do que o Step 1 confirmou, ajuste os nomes aqui antes de seguir.

- [ ] **Step 4: Rodar eslint**

Run: `npx eslint src/lib/comunicacao/enviar.ts`
Expected: sem erros. Se o `import()` dinâmico de `createAdminClient` dentro do bloco de e-mail for sinalizado, mova pro topo do arquivo como import estático normal — foi escrito assim só pra ilustrar; o import no topo é o padrão do projeto.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comunicacao/enviar.ts
git commit -m "feat(comunicacao): nucleo enviarComunicacao (whatsapp oficial/secundaria + email)"
```

---

## Task 9: Rota de webhook do número secundário

**Files:**
- Create: `src/app/api/webhooks/zapster-secundario/route.ts`

**Interfaces:**
- Consumes: `verificarSegredoWebhook` (Task 3); `enviarMensagemTexto` (`@/lib/whatsapp/zapster`); repositório de persistência existente (`registrarMensagemLead`, de `@/lib/motor-fluxo/persistencia`, pra gravar a mensagem recebida).
- Produces: rota `POST /api/webhooks/zapster-secundario` — Luiz configura essa URL (com `?secret=...`) como webhook da instância secundária no painel do Zapster.

- [ ] **Step 1: Checar a assinatura de `registrarMensagemLead` antes de usar**

Rode: `grep -n "export async function registrarMensagemLead" -A 5 src/lib/motor-fluxo/persistencia.ts` — confirme os parâmetros exatos (conversaId, texto, midiaUrl, midiaTipo) antes do Step 2.

- [ ] **Step 2: Implementar a rota**

```ts
import { after } from "next/server";
import { registrarMensagemLead } from "@/lib/motor-fluxo/persistencia";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarSegredoWebhook } from "@/lib/whatsapp/verificar-segredo-webhook";
import { enviarMensagemTexto } from "@/lib/whatsapp/zapster";

// Webhook da instância SECUNDÁRIA do Zapster (ver
// docs/superpowers/specs/2026-08-22-comunicacao-centralizada-crm-design.md) — rota separada da
// principal (src/app/api/webhooks/zapster/route.ts) de propósito: aqui NUNCA roda o motor de
// fluxo automatizado. Esse número é só pra disparo automático de outros módulos (Vendas,
// Financeiro...); se o lead responder aqui mesmo assim, só manda uma resposta fixa e amigável
// pedindo pra migrar pro oficial — decisão de Luiz, 22/08/2026.

export const maxDuration = 30;

const RESPOSTA_FIXA_SECUNDARIO =
  "Oi! Esse número é só para envio automático e não consegue responder mensagens, desculpa a " +
  "confusão. Se precisar de ajuda, fale com a gente pelo nosso WhatsApp oficial — te mandamos o " +
  "link em instantes 🙂";

async function processarMensagemRecebidaSecundario(telefone: string, texto: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { data: conversa } = await supabase
      .from("conversas")
      .select("id, pessoa_id")
      .eq("canal", "whatsapp")
      .eq("instancia", "secundaria")
      .eq("pessoas.whatsapp", telefone)
      .maybeSingle();

    if (!conversa) {
      console.error(`[webhook zapster-secundario] mensagem recebida de número sem conversa secundária conhecida: ${telefone}`);
      return;
    }

    await registrarMensagemLead(conversa.id, texto, null, null);
    await enviarMensagemTexto(telefone, RESPOSTA_FIXA_SECUNDARIO, "secundaria");
  } catch (e) {
    console.error("[webhook zapster-secundario] erro ao processar:", e);
  }
}

export async function POST(request: Request) {
  if (!verificarSegredoWebhook(request, "ZAPSTER_SECUNDARIO_WEBHOOK_SECRET")) {
    return new Response("Não autorizado", { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  console.log("[webhook zapster-secundario] payload recebido:", JSON.stringify(payload));
  if (!payload || payload.type !== "message.received") {
    return Response.json({ ignorado: true });
  }

  const data = payload.data;
  const telefone: string | undefined = data?.sender?.phone_number;
  const texto: string | undefined = data?.content?.text;
  if (!telefone || !texto) {
    return Response.json({ ignorado: true, motivo: "sem phone_number ou texto no payload" });
  }

  after(() => processarMensagemRecebidaSecundario(telefone, texto));
  return Response.json({ recebido: true });
}
```

**Nota pra quem executar:** a query `.eq("pessoas.whatsapp", telefone)` acima assume que dá pra filtrar por uma coluna de tabela relacionada direto no `.eq()` do supabase-js — CONFIRME isso funciona (rodando localmente com uma conversa secundária de teste) antes de considerar a task pronta; se não funcionar (supabase-js normalmente exige um `!inner` join explícito no `.select()` pra filtrar por coluna de tabela relacionada), troque por 2 queries: primeiro `pessoas` por `whatsapp`, depois `conversas` por `pessoa_id` + `canal` + `instancia`, mesmo padrão já usado em `buscarOuCriarConversaSecundaria` (Task 6).

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks/zapster-secundario/route.ts
git commit -m "feat(comunicacao): webhook da instancia secundaria - so resposta fixa, sem motor de fluxo"
```

- [ ] **Step 5: Avisar o Luiz sobre as env vars novas e a configuração da instância**

Mande a mensagem: "Pra ligar a instância secundária, preciso que você configure no Zapster e me confirme: (1) as env vars `ZAPSTER_SECUNDARIO_API_TOKEN`, `ZAPSTER_SECUNDARIO_INSTANCE_ID` (Vercel + `.env.local`) e `ZAPSTER_SECUNDARIO_WEBHOOK_SECRET` (só Vercel, um segredo novo qualquer); (2) o webhook da instância secundária no painel do Zapster apontando pra `https://<seu-domínio>/api/webhooks/zapster-secundario?secret=<o segredo que você escolher>`."

---

## Task 10: Repositório + Server Actions de `categorias_comunicacao`

**Files:**
- Create: `src/lib/comunicacao/categorias-repositorio.ts`
- Create: `src/app/admin/(shell)/configuracoes/categorias-comunicacao/actions.ts`

**Interfaces:**
- Produces: `listarCategoriasComunicacao(): Promise<CategoriaComunicacao[]>`, `criarCategoriaComunicacao(nome: string): Promise<{ id: string }>`, `atualizarCategoriaComunicacao(id: string, entrada: { nome: string; ativo: boolean }): Promise<void>`; Server Action `salvarCategoriaComunicacaoAction`.

- [ ] **Step 1: Repositório**

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type CategoriaComunicacao = { id: string; nome: string; ativo: boolean };

export async function listarCategoriasComunicacao(): Promise<CategoriaComunicacao[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("categorias_comunicacao").select("id, nome, ativo").order("nome");
  if (error) throw new Error(`Falha ao carregar categorias de comunicação: ${error.message}`);
  return data ?? [];
}

/** Só as ativas — é isto que src/lib/comunicacao/enviar.ts (Task 8) usaria se precisasse validar categoriaId contra a lista ativa (fora de escopo desta rodada — o FK já garante que o id existe; validar "está ativa" fica pra quando algum módulo pedir). */
export async function listarCategoriasComunicacaoAtivas(): Promise<CategoriaComunicacao[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("categorias_comunicacao")
    .select("id, nome, ativo")
    .eq("ativo", true)
    .order("nome");
  if (error) throw new Error(`Falha ao carregar categorias de comunicação ativas: ${error.message}`);
  return data ?? [];
}

export async function criarCategoriaComunicacao(nome: string): Promise<{ id: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("categorias_comunicacao").insert({ nome }).select("id").single();
  if (error || !data) throw new Error(`Falha ao criar categoria: ${error?.message}`);
  return { id: data.id };
}

export async function atualizarCategoriaComunicacao(id: string, entrada: { nome: string; ativo: boolean }): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("categorias_comunicacao")
    .update({ nome: entrada.nome, ativo: entrada.ativo, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Falha ao atualizar categoria ${id}: ${error.message}`);
}

/** Exclusão física — mesmo padrão real já usado em objeções/FAQs (ver objecoes-client.tsx, excluirObjecaoAction). Mensagens antigas que já referenciam esta categoria mantêm categoria_id (FK sem ON DELETE CASCADE — a linha em mensagens não é afetada, só passa a ter categoria_id apontando pra um id que não existe mais seria um problema; CONFIRMAR na Task 1 que o FK usa ON DELETE SET NULL, não o padrão RESTRICT/NO ACTION — se a migration não especificou, adicionar `on delete set null` na coluna `categoria_id` antes de implementar esta função). */
export async function excluirCategoriaComunicacao(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("categorias_comunicacao").delete().eq("id", id);
  if (error) throw new Error(`Falha ao excluir categoria ${id}: ${error.message}`);
}
```

- [ ] **Step 2: Server Actions**

```ts
"use server";

import { revalidatePath } from "next/cache";
import {
  atualizarCategoriaComunicacao,
  criarCategoriaComunicacao,
  excluirCategoriaComunicacao,
} from "@/lib/comunicacao/categorias-repositorio";

export type ResultadoSalvarCategoria = { sucesso: true; id: string } | { sucesso: false; erro: string };

export async function salvarCategoriaComunicacaoAction(
  categoriaId: string | null,
  entrada: { nome: string; ativo: boolean },
): Promise<ResultadoSalvarCategoria> {
  if (!entrada.nome.trim()) {
    return { sucesso: false, erro: "Informe o nome da categoria." };
  }

  try {
    if (categoriaId) {
      await atualizarCategoriaComunicacao(categoriaId, entrada);
      revalidatePath("/admin/configuracoes/categorias-comunicacao");
      return { sucesso: true, id: categoriaId };
    }
    const { id } = await criarCategoriaComunicacao(entrada.nome);
    revalidatePath("/admin/configuracoes/categorias-comunicacao");
    return { sucesso: true, id };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha ao salvar a categoria. Tente novamente.";
    return { sucesso: false, erro: mensagem };
  }
}

export async function excluirCategoriaComunicacaoAction(categoriaId: string): Promise<void> {
  await excluirCategoriaComunicacao(categoriaId);
  revalidatePath("/admin/configuracoes/categorias-comunicacao");
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/comunicacao/categorias-repositorio.ts src/app/admin/\(shell\)/configuracoes/categorias-comunicacao/actions.ts
git commit -m "feat(comunicacao): repositorio + server action de categorias_comunicacao"
```

---

## Task 11: Tela admin — Categorias de Comunicação

**Files:**
- Create: `src/app/admin/(shell)/configuracoes/categorias-comunicacao/page.tsx`
- Create: `src/app/admin/(shell)/configuracoes/categorias-comunicacao/categorias-comunicacao-client.tsx`
- Modify: `src/app/admin/(shell)/configuracoes/configuracoes-client.tsx` (adicionar o card/link novo, mesmo padrão dos outros já existentes ali)

**Interfaces:**
- Consumes: `listarCategoriasComunicacao` (Task 10), `salvarCategoriaComunicacaoAction` (Task 10).

- [ ] **Step 1: `page.tsx`**

```tsx
import { listarCategoriasComunicacao } from "@/lib/comunicacao/categorias-repositorio";
import { CategoriasComunicacaoClient } from "./categorias-comunicacao-client";

export default async function CategoriasComunicacaoPage() {
  const categorias = await listarCategoriasComunicacao();
  return <CategoriasComunicacaoClient categoriasIniciais={categorias} />;
}
```

- [ ] **Step 2: `categorias-comunicacao-client.tsx`**

Adaptado de `src/app/admin/(shell)/objecoes/objecoes-client.tsx` (mesma estrutura de estado/handlers), só sem os campos `produtoId`/`comoLidar` (categoria só tem nome + ativo) e com exclusão física (mesmo padrão real de objeções, `excluirObjecaoAction`):

```tsx
"use client";

import { useState } from "react";
import type { CategoriaComunicacao } from "@/lib/comunicacao/categorias-repositorio";
import { excluirCategoriaComunicacaoAction, salvarCategoriaComunicacaoAction } from "./actions";

type Rascunho = { id: string | null; nome: string; ativo: boolean };

function paraRascunho(categoria: CategoriaComunicacao | null): Rascunho {
  return { id: categoria?.id ?? null, nome: categoria?.nome ?? "", ativo: categoria?.ativo ?? true };
}

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";

export function CategoriasComunicacaoClient({ categoriasIniciais }: { categoriasIniciais: CategoriaComunicacao[] }) {
  const [categorias, setCategorias] = useState(categoriasIniciais);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [novaCategoria, setNovaCategoria] = useState<Rascunho | null>(null);

  return (
    <div className="max-w-2xl space-y-3 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Categorias de Comunicação</h1>
        <button
          onClick={() => setNovaCategoria(paraRascunho(null))}
          disabled={novaCategoria !== null}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          + Nova categoria
        </button>
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Categorias usadas pelos módulos (Vendas, Financeiro, Marketing...) pra classificar mensagens automáticas enviadas ao cliente.
      </p>

      {novaCategoria && (
        <CardCategoria
          rascunhoInicial={novaCategoria}
          expandidaDeInicio
          onSalvo={(categoria) => {
            setCategorias((atual) => [categoria, ...atual]);
            setNovaCategoria(null);
          }}
          onCancelarNova={() => setNovaCategoria(null)}
          onExcluida={() => setNovaCategoria(null)}
        />
      )}

      {categorias.map((categoria) => (
        <CardCategoria
          key={categoria.id}
          rascunhoInicial={paraRascunho(categoria)}
          expandida={expandidoId === categoria.id}
          onExpandir={() => setExpandidoId(expandidoId === categoria.id ? null : categoria.id)}
          onSalvo={(atualizada) =>
            setCategorias((atual) => atual.map((c) => (c.id === atualizada.id ? atualizada : c)))
          }
          onExcluida={() => setCategorias((atual) => atual.filter((c) => c.id !== categoria.id))}
        />
      ))}

      {categorias.length === 0 && !novaCategoria && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma categoria cadastrada ainda.</p>
      )}
    </div>
  );
}

function CardCategoria({
  rascunhoInicial,
  expandida,
  expandidaDeInicio,
  onExpandir,
  onSalvo,
  onExcluida,
  onCancelarNova,
}: {
  rascunhoInicial: Rascunho;
  expandida?: boolean;
  expandidaDeInicio?: boolean;
  onExpandir?: () => void;
  onSalvo: (categoria: CategoriaComunicacao) => void;
  onExcluida: () => void;
  onCancelarNova?: () => void;
}) {
  const [r, setR] = useState(rascunhoInicial);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const aberta = expandidaDeInicio || expandida;

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const resultado = await salvarCategoriaComunicacaoAction(r.id, { nome: r.nome, ativo: r.ativo });
    setSalvando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onSalvo({ id: resultado.id, nome: r.nome, ativo: r.ativo });
  }

  async function confirmarEExcluir() {
    if (!r.id) return;
    setConfirmandoExclusao(false);
    setExcluindo(true);
    await excluirCategoriaComunicacaoAction(r.id);
    setExcluindo(false);
    onExcluida();
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <button type="button" onClick={onExpandir} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {r.nome || "(nova categoria)"}
        </span>
        {!r.ativo && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">inativa</span>
        )}
        {onExpandir && <span className="text-zinc-400">{aberta ? "▲" : "▼"}</span>}
      </button>

      {aberta && (
        <div className="space-y-3 border-t border-zinc-200 p-4 dark:border-zinc-700">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Nome</label>
            <input className={campo} value={r.nome} onChange={(e) => setR({ ...r, nome: e.target.value })} placeholder="ex.: Cobrança" />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={r.ativo} onChange={(e) => setR({ ...r, ativo: e.target.checked })} />
            Ativa
          </label>

          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

          <div className="flex items-center justify-between pt-1">
            {r.id ? (
              <button
                onClick={() => setConfirmandoExclusao(true)}
                disabled={excluindo}
                className="text-sm text-red-600 hover:underline disabled:opacity-40 dark:text-red-400"
              >
                {excluindo ? "Excluindo..." : "Excluir"}
              </button>
            ) : (
              <button onClick={onCancelarNova} className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
                Cancelar
              </button>
            )}
            <button
              onClick={salvar}
              disabled={salvando}
              className="rounded-full bg-zinc-900 px-5 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      )}

      {confirmandoExclusao && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-900">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Excluir esta categoria?</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Mensagens antigas que já usam essa categoria continuam existindo, só perdem a referência (categoria fica vazia nelas). Essa ação não pode ser desfeita.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmandoExclusao(false)}
                className="rounded-full px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button onClick={confirmarEExcluir} className="rounded-full bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Adicionar o link em `configuracoes-client.tsx`**

Encontre o array/lista de cards de seção (grep por `produtos` ou `templates-documentos` dentro do arquivo pra achar o padrão exato) e adicione uma entrada nova apontando pra `/admin/configuracoes/categorias-comunicacao`, com um título curto ("Categorias de Comunicação") e descrição ("Categorias usadas pelos módulos pra classificar mensagens automáticas enviadas ao cliente").

- [ ] **Step 4: Verificar visualmente no navegador**

1. `preview_start` com o dev server do projeto.
2. Navegar pra `/admin/configuracoes` — confirmar que o card novo aparece.
3. Clicar nele, confirmar que a lista carrega as 3 categorias seedadas (Cobrança, Lembrete, Institucional).
4. Criar uma categoria nova, confirmar que aparece na lista sem reload manual.
5. Desativar uma categoria (toggle `ativo`), confirmar que o estado persiste (reload da página, ainda desativada).

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(shell)/configuracoes/categorias-comunicacao" "src/app/admin/(shell)/configuracoes/configuracoes-client.tsx"
git commit -m "feat(comunicacao): tela admin de categorias de comunicacao"
```

---

## Task 12: Tela de Atendimento — aviso em conversas da instância secundária

**Files:**
- Modify: componente do cabeçalho da conversa aberta na Tela de Atendimento (localizar com `grep -rn "sob_supervisor\|favorita" "src/app/admin/(shell)/atendimento"` pra achar o componente certo — provavelmente o cabeçalho/header da conversa aberta).
- Modify: repositório que carrega os dados da conversa aberta (pra expor `instancia` no objeto retornado) — localizar com `grep -n "canal" src/lib/motor-fluxo/repositorio-atendimento.ts`.

**Interfaces:**
- Consumes: `conversas.instancia` (Task 1).

- [ ] **Step 1: Confirmar onde a conversa aberta é carregada e expor `instancia`**

Rode: `grep -n "select.*canal\|\.canal\b" src/lib/motor-fluxo/repositorio-atendimento.ts` — ache a query que carrega os detalhes da conversa aberta (provavelmente já seleciona `canal`) e adicione `instancia` na mesma lista de colunas do `.select(...)`, propagando pro tipo de retorno da função (adicionar `instancia: string | null` no tipo já existente).

- [ ] **Step 2: Adicionar o aviso visual no componente do cabeçalho**

No componente que renderiza o cabeçalho da conversa aberta, adicionar, condicionalmente quando `conversa.instancia === "secundaria"`:

```tsx
{conversa.instancia === "secundaria" && (
  <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-800">
    ⚠️ Canal secundário — este número é apenas para envio automático. Uma resposta manual aqui não
    é o padrão esperado pelo cliente.
  </div>
)}
```

(Ajustar classes Tailwind pro padrão de cor de aviso já usado em outro lugar da Tela de Atendimento, se houver um — grep por `bg-amber` ou `bg-yellow` no diretório antes de inventar uma cor nova.)

- [ ] **Step 3: Verificar visualmente no navegador**

1. Criar manualmente (via SQL local ou um pequeno script) uma conversa de teste com `canal='whatsapp', instancia='secundaria'` ligada a uma pessoa de teste.
2. Abrir essa conversa na Tela de Atendimento, confirmar que o aviso aparece.
3. Abrir uma conversa normal (instancia null/'oficial'), confirmar que o aviso NÃO aparece.
4. Confirmar que ainda dá pra digitar e mandar mensagem normalmente nessa conversa (Luiz permitiu resposta manual, só quis o aviso).

- [ ] **Step 4: Commit**

```bash
git add -A -- src/lib/motor-fluxo/repositorio-atendimento.ts "src/app/admin/(shell)/atendimento"
git commit -m "feat(comunicacao): aviso visual em conversas da instancia secundaria na Tela de Atendimento"
```

---

## Task 13: Ligar o Vendas ao novo mecanismo

**Files:**
- Modify: `src/lib/vendas/notificacoes.ts`

**Interfaces:**
- Consumes: `enviarComunicacao` (Task 8), `listarCategoriasComunicacaoAtivas` (Task 10, só pra achar o id da categoria "Cobrança" ou "Institucional" — ou hardcodar temporariamente com um comentário claro, ver Step 1).

- [ ] **Step 1: Decidir qual categoria usar (Cobrança vs Institucional) e como achar o id**

`enviarWhatsapp`/`enviarPorEmail` (Vendas) hoje são chamadas por `reenviarLinkAction` com `contexto: "assinatura" | "pagamento"` — as duas fazem sentido como categoria "Cobrança" (é sobre fechar/pagar, não institucional). Buscar o id da categoria "Cobrança" via `listarCategoriasComunicacaoAtivas()` e usar `.find(c => c.nome === "Cobrança")?.id` — se não achar (categoria renomeada/desativada), lançar erro claro em vez de mandar sem categoria.

- [ ] **Step 2: Reescrever `notificacoes.ts`**

```ts
import { enviarComunicacao } from "@/lib/comunicacao/enviar";
import { listarCategoriasComunicacaoAtivas } from "@/lib/comunicacao/categorias-repositorio";

// Reativado em 22/08/2026 — antes mandava direto pra Zapster/Resend sem gravar na ficha da Pessoa
// (ver histórico de git, commit 06e7a40 e docs/COORDENACAO_AGENTES_ARRUDACRED.md seção 4 item 7).
// Agora passa pelo mecanismo centralizado do CRM (src/lib/comunicacao), que grava tudo na timeline.

async function idCategoriaCobranca(): Promise<string> {
  const categorias = await listarCategoriasComunicacaoAtivas();
  const categoria = categorias.find((c) => c.nome === "Cobrança");
  if (!categoria) {
    throw new Error('Categoria "Cobrança" não encontrada ou desativada em categorias_comunicacao — configure em /admin/configuracoes/categorias-comunicacao.');
  }
  return categoria.id;
}

export async function enviarWhatsapp(pessoaId: string, texto: string): Promise<void> {
  const categoriaId = await idCategoriaCobranca();
  await enviarComunicacao({ pessoaId, categoriaId, canal: "whatsapp", conteudo: { texto } });
}

export async function enviarPorEmail(pessoaId: string, assunto: string, texto: string): Promise<void> {
  const categoriaId = await idCategoriaCobranca();
  await enviarComunicacao({ pessoaId, categoriaId, canal: "email", conteudo: { assunto, corpo: texto } });
}

/** Link de pagamento gerado automaticamente na criação da cobrança (Asaas) — silencioso, mesma decisão de antes (uma falha aqui não pode travar o fluxo de criação de cobrança). */
export async function enviarLinkPagamentoWhatsapp(pessoaId: string, link: string): Promise<void> {
  try {
    const categoriaId = await idCategoriaCobranca();
    await enviarComunicacao({
      pessoaId,
      categoriaId,
      canal: "whatsapp",
      conteudo: { texto: `Aqui está o link para pagamento: ${link}` },
    });
  } catch (e) {
    console.error("[vendas/notificacoes] falha ao enviar link de pagamento automático:", e);
  }
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Verificação manual no navegador**

1. Abrir uma Venda de teste em `/admin/vendas/[oportunidadeId]` com uma pessoa de teste que já tenha conversa de WhatsApp oficial.
2. Clicar em "Reenviar" (assinatura ou pagamento) por WhatsApp.
3. Confirmar (no banco ou na Tela de Atendimento) que a mensagem aparece na timeline dessa pessoa, com `remetente='sistema'` e a categoria certa.
4. Repetir com uma pessoa SEM conversa oficial nenhuma — confirmar que usa a instância secundária e o aviso aparece antes da mensagem de verdade.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vendas/notificacoes.ts
git commit -m "feat(vendas): liga reenvio de link ao mecanismo centralizado de comunicacao"
```

---

## Task 14: Verificação final + atualizar documentação

- [ ] **Step 1: Rodar a suíte completa**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: tsc e eslint sem erros; testes todos verdes (mais a 1 falha pré-existente conhecida, sem relação, em `engine.test.ts`).

- [ ] **Step 2: Atualizar `docs/COORDENACAO_AGENTES_ARRUDACRED.md` seção 4 item 7**

Marcar o item como implementado, com um resumo curto (módulo, categorias, instância secundária) e um link pra spec + este plano — mesmo padrão já usado nas outras entradas dessa seção.

- [ ] **Step 3: Atualizar `docs/status/crm.md`**

`tarefa`: resumo do que foi implementado e verificado. `proxima`: próximo item da fila (os 3 pedidos de melhoria do fluxo de Limpeza de Nome). `bloqueio`: nenhum, ou o que ficou pendente (ex.: Luiz ainda não configurou a instância secundária de verdade no Zapster).

- [ ] **Step 4: Commit final**

```bash
git add docs/COORDENACAO_AGENTES_ARRUDACRED.md docs/status/crm.md
git commit -m "docs(comunicacao): registra comunicacao centralizada implementada no quadro-branco"
```

- [ ] **Step 5: Fetch + merge + push seguindo a disciplina padrão do repo**

```bash
git fetch origin
git status --short  # descartar drift de docs/status/*.md de outros agentes com: git checkout HEAD -- docs/status/marketing.md docs/status/vendas.md (se houver)
git merge origin/main --no-edit
npx tsc --noEmit && npx eslint . && npx vitest run   # re-verificar pós-merge
git push origin main
```
