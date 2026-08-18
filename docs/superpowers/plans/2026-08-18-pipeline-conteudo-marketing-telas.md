# Pipeline de Conteúdo Marketing — Fase 2 (Telas de Admin) — Plano de Implementação

**Spec de referência:** `docs/superpowers/specs/2026-08-18-pipeline-conteudo-marketing-telas-design.md` — todas as decisões de arquitetura (schema, criptografia, gating, log de execução, Realtime) já fechadas lá. Este plano só quebra em tasks executáveis.

**Documento de negócio:** `docs/MODULO_MARKETING_CONTEUDO_ARRUDACRED.md` seções 6.2, 7, 7.1, 7.2, 8.

**Coordenação entre agentes:** `docs/COORDENACAO_AGENTES_ARRUDACRED.md` — leia antes de começar. Intenção desta plan já registrada lá (seção 3, 18/08/2026).

---

## Architecture

Extensão do núcleo já construído (Tasks 1-10 da plan anterior, em `main`) — sem mudar nada do pipeline de geração/revisão/publicação em si, só instrumentá-lo (log de execução) e adicionar as telas de admin + as duas peças de configuração que faltavam (credenciais por propriedade, cota/janela de publicação).

## Tech Stack

Igual ao resto do admin — Next.js App Router (Server Components + Server Actions), Tailwind direto (sem lib de tabela/formulário nova), Supabase (`createClient()` de `@/lib/supabase/server` nas telas, `createAdminClient()` no repositório/pipeline), `@supabase/ssr` `createClient()` de `@/lib/supabase/client` no único componente que precisa de Realtime (Monitor). Criptografia via `node:crypto` (sem dependência nova).

## Global Constraints

- **Regra dura de migration (18/08/2026, `COORDENACAO_AGENTES_ARRUDACRED.md` seção 2):** nenhuma task roda `supabase db push`, `migration repair`, `psql` ou qualquer execução direta no banco. A Task 1 (única com migration) **escreve o arquivo `.sql`, reserva o timestamp na tabela da seção 2 do doc de coordenação, deixa um recado na seção 3, e para por aí** — status fica `Aguardando envio ao Luiz`. Nenhuma task depende de a migration já estar aplicada pra rodar seus testes (repositório/UI são testados com mock, não contra o banco real).
- **Credenciais nunca em texto plano** — nem no banco (sempre cifradas, seção 4 da spec), nem na UI (campo de senha é sempre write-only, nunca reexibe valor salvo).
- **Nomenclatura em português**, mesmo padrão do núcleo e do restante do admin.
- **Sem biblioteca de UI nova** — Tailwind direto, mesmo padrão visual de `src/app/admin/(shell)/faqs/` (cards expansíveis, não grid denso).
- **Tooltip/`<Ajuda>` em cada tela** (pedido explícito de Luiz) — componente novo e reaproveitável, ver Task 6.
- **Sidebar (`src/app/admin/(shell)/sidebar.tsx`) é arquivo compartilhado** — só adicionar itens dentro do módulo `marketing` já existente e um subgrupo novo `"Marketing"` dentro de `configuracoes`; não alterar a estrutura de árvore em si nem itens de outros módulos.
- **Cliente Supabase:** `createAdminClient()` (service_role) no repositório e no pipeline (mesmo padrão do núcleo); `createClient()` de `@/lib/supabase/server` nas Server Components das telas (contexto de usuário logado, é admin autenticado); `createClient()` de `@/lib/supabase/client` só no componente Realtime do Monitor.
- **Ao final de cada task, não mesclar em `main` sozinho** — registrar no doc de coordenação que a frente está pronta; o Coordenador executa o merge (fluxo "sincroniza → testa → fast-forward").

---

### Task 1: Migração — credenciais cifradas + log de execução

**Files:**
- Create: `supabase/migrations/<timestamp>_marketing_credenciais_e_log.sql` (timestamp a reservar em `COORDENACAO_AGENTES_ARRUDACRED.md` seção 2 antes de escrever o arquivo — próximo livre depois de `20260818080000`)

**Interfaces:**
- Produces: coluna `propriedades_digitais.credenciais_canais` (jsonb), tabela `pautas_execucao_log` — nomes de coluna usados pelas Tasks 2-5.

- [ ] **Step 1: Reservar o timestamp**

Abrir `docs/COORDENACAO_AGENTES_ARRUDACRED.md`, conferir a tabela da seção 2, adicionar uma linha com o timestamp escolhido, arquivo, agente `Marketing`, status `Aguardando envio ao Luiz` — **antes** de criar o arquivo `.sql`.

- [ ] **Step 2: Escrever a migração**

```sql
-- Fase 2 do módulo Marketing (18/08/2026) — credenciais de canal cifradas + log de execução do
-- pipeline. Ver docs/superpowers/specs/2026-08-18-pipeline-conteudo-marketing-telas-design.md
-- seções 3.1 e 3.3. REGRA DURA: este arquivo não é aplicado por nenhum agente — reservado em
-- COORDENACAO_AGENTES_ARRUDACRED.md, entregue ao Luiz pelo Coordenador, aplicado por ele no SQL
-- Editor.

alter table propriedades_digitais add column credenciais_canais jsonb not null default '{}'::jsonb;
comment on column propriedades_digitais.credenciais_canais is
  'Credenciais de canal por propriedade, cifradas — nunca texto plano. Formato: {"wordpress": {"usuario": "...", "senha_cifrada": "<base64 iv+authTag+ciphertext>"}}. Cifrado/decifrado por src/lib/marketing/criptografia.ts usando MARKETING_CREDENCIAIS_CHAVE (env). Fallback: propriedade sem entrada aqui continua usando WORDPRESS_USUARIO/WORDPRESS_SENHA_APP (env genérico).';

create table pautas_execucao_log (
  id uuid primary key default gen_random_uuid(),
  pauta_id uuid not null references pautas(id) on delete cascade,
  etapa text not null check (etapa in (
    'buscar_checklist', 'gerar_conteudo', 'revisar', 'inserir_links', 'sanitizar', 'publicar', 'registrar_resultado'
  )),
  iniciado_em timestamptz not null default now(),
  concluido_em timestamptz,
  sucesso boolean,
  detalhes text,
  tokens_entrada int,
  tokens_saida int,
  created_at timestamptz not null default now()
);
comment on table pautas_execucao_log is
  'Log append-only de cada etapa do pipeline por pauta — alimenta o Monitor de execução (tela ao vivo, MODULO_MARKETING_CONTEUDO_ARRUDACRED.md seção 7.2) via Supabase Realtime, e o Painel de Custo (soma de tokens). Uma linha por etapa por tentativa — reprovações geram novas linhas pra mesma pauta, dando histórico de retrabalho visível.';
comment on column pautas_execucao_log.tokens_entrada is
  'Preenchido só nas etapas gerar_conteudo/revisar (chamadas à Anthropic) — vem de resposta.usage.input_tokens.';
comment on column pautas_execucao_log.tokens_saida is
  'Preenchido só nas etapas gerar_conteudo/revisar — vem de resposta.usage.output_tokens.';

alter table pautas_execucao_log enable row level security;
create policy admin_acesso_total on pautas_execucao_log for all to authenticated using (true) with check (true);
create trigger trg_auditoria_pautas_execucao_log
  after insert or update or delete on pautas_execucao_log
  for each row execute function fn_auditoria_log();

create index idx_execucao_log_pauta on pautas_execucao_log (pauta_id, iniciado_em desc);

-- Habilita Realtime nesta tabela (primeira do projeto a usar — ver spec seção 3.3 pra justificativa).
alter publication supabase_realtime add table pautas_execucao_log;
```

- [ ] **Step 3: Registrar o recado na seção 3 do doc de coordenação**

O que a migration faz (2-3 linhas), que não é destrutiva (só `alter table add column` e `create table`, sem `drop`/`truncate`/`delete`), e do que ela depende (nada — não referencia tabela de outro módulo).

- [ ] **Step 4: Regenerar tipos localmente pra desenvolvimento (não aplica no banco)**

`database.types.ts` só reflete o banco real — como a migration ainda não foi aplicada, as Tasks 2-13 tipam `credenciais_canais`/`pautas_execucao_log` manualmente (via os tipos em `tipos.ts`, não via `database.types.ts`) até o Luiz rodar a migration e alguém regenerar. Documentar isso no relatório da task pra não gerar confusão depois.

---

### Task 2: Criptografia de credenciais

**Files:**
- Create: `src/lib/marketing/criptografia.ts`
- Create: `src/lib/marketing/criptografia.test.ts`

**Interfaces:**
- Produces: `cifrar(textoPlano: string): string`, `decifrar(valorCifrado: string): string` — consumidos pela Task 3 (repositório) e pela Task 7 (tela de Propriedades Digitais, via server action).

- [ ] **Step 1: Escrever o teste primeiro**

```typescript
// src/lib/marketing/criptografia.test.ts
import { describe, expect, it, beforeAll } from "vitest";
import { cifrar, decifrar } from "./criptografia";

describe("criptografia", () => {
  beforeAll(() => {
    process.env.MARKETING_CREDENCIAIS_CHAVE = "chave-de-teste-nao-usar-em-producao";
  });

  it("cifra e decifra de volta pro texto original", () => {
    const original = "senha-de-aplicativo-do-wordpress-123";
    const cifrado = cifrar(original);
    expect(cifrado).not.toBe(original);
    expect(decifrar(cifrado)).toBe(original);
  });

  it("gera cifrados diferentes pro mesmo texto (IV aleatório)", () => {
    expect(cifrar("mesma-senha")).not.toBe(cifrar("mesma-senha"));
  });

  it("lança erro se MARKETING_CREDENCIAIS_CHAVE não estiver configurada", () => {
    const original = process.env.MARKETING_CREDENCIAIS_CHAVE;
    delete process.env.MARKETING_CREDENCIAIS_CHAVE;
    expect(() => cifrar("x")).toThrow();
    process.env.MARKETING_CREDENCIAIS_CHAVE = original;
  });

  it("decifrar com valor corrompido lança erro (authTag do GCM detecta adulteração)", () => {
    const cifrado = cifrar("senha-original");
    const corrompido = cifrado.slice(0, -4) + "abcd";
    expect(() => decifrar(corrompido)).toThrow();
  });
});
```

- [ ] **Step 2: Implementar** (ver spec seção 4 pro código completo de referência — `aes-256-gcm`, `scryptSync` pra derivar chave de 32 bytes, IV de 12 bytes + authTag de 16 bytes concatenados antes do texto cifrado, tudo em base64)
- [ ] **Step 3: Comentário de segurança obrigatório** (pedido do Coordenador, `COORDENACAO_AGENTES_ARRUDACRED.md` seção 3, 18/08/2026) — `scryptSync` com salt fixo é aceitável **só porque** `MARKETING_CREDENCIAIS_CHAVE` já é, ela mesma, uma env secreta de alta entropia (o Luiz gera com `openssl rand -base64 32`, não digita uma frase). Deixar isso explícito num comentário acima de `obterChave()` — se um dia essa env virar algo digitado à mão, o salt fixo deixa de ser seguro, e quem for mexer precisa saber disso antes de "simplificar".

---

### Task 3: Repositório — CRUD de configuração + leitura pras telas de operação

**Files:**
- Modify: `src/lib/marketing/repositorio.ts`
- Modify: `src/lib/marketing/repositorio.test.ts`
- Modify: `src/lib/marketing/tipos.ts` (novos tipos: `PropriedadeAdmin`, `MatrizAdmin`, `PersonaFormulario`, `ItemChecklistAdmin`, `EntradaLogExecucao` etc. — nomes exatos a critério do implementador, seguindo o padrão já usado em `tipos.ts`)

**Interfaces:**
- Produces (consumidas pelas Tasks 6-13, cada uma só usa o subconjunto da sua tela):
  - `listarPropriedades(): Promise<PropriedadeAdmin[]>`, `salvarPropriedade(dados): Promise<PropriedadeAdmin>`, `salvarCredencialCanal(propriedadeId, canal, usuario, senhaPlana): Promise<void>` (chama `cifrar` da Task 2 antes de gravar; `senhaPlana` vazia = mantém a credencial já salva)
  - `listarMatrizes(propriedadeId): Promise<MatrizAdmin[]>`, `salvarMatriz(dados): Promise<MatrizAdmin>`
  - `carregarPersona(matrizId): Promise<PersonaFormulario | null>`, `salvarPersona(matrizId, persona): Promise<void>` (lê/escreve `matrizes_conteudo.eixos.persona`, mesclando com o resto do jsonb `eixos` sem apagar temas/ângulos/geografias já existentes)
  - `listarChecklistPorPropriedade(propriedadeId): Promise<ItemChecklistAdmin[]>`, `salvarItemChecklist`, `excluirItemChecklist`
  - `listarPautasPorStatus(status?, propriedadeId?): Promise<PautaCarregada[]>` (pra tela Fila de Pautas — reaproveita o tipo já existente), `reabrirPauta(pautaId): Promise<void>` (volta status pra `pendente`, zera `motivo_ultima_reprovacao`, não mexe em `tentativas`)
  - `listarPostsPublicados(propriedadeId?): Promise<PostAdmin[]>` (título, url, score_qa, publicado_em, tentativas — pra tela Posts Publicados)
  - `registrarEtapa<T>(pautaId, etapa, fn: () => Promise<T>): Promise<T>` (ver spec seção 6 — usada pela Task 5, não pelas telas)
  - `carregarResumoVisaoGeral(): Promise<ResumoVisaoGeral>` (contagens por status/propriedade + soma de tokens do período — pra tela Visão Geral)

- [ ] **Step 1: TDD por função** — mesmo padrão de `repositorio.test.ts` já existente (mock do `createAdminClient`, `vi.spyOn`). Cada função nova ganha teste cobrindo o caminho feliz + pelo menos um erro (query falha → lança erro com mensagem clara, mesmo padrão das funções do núcleo).
- [ ] **Step 2: `salvarCredencialCanal` — teste específico de não regressão de credencial:** salvar com `senhaPlana: ""` não deve sobrescrever `credenciais_canais.wordpress.senha_cifrada` já existente (só atualiza `usuario` se enviado) — este é o comportamento que faz o campo write-only da Task 7 funcionar sem forçar o Luiz a redigitar a senha toda vez que editar o nome da propriedade.
- [ ] **Step 3: `salvarPersona` — teste de merge, não substituição:** matriz com `eixos: {"temas": [...], "angulos": [...]}` já preenchido, chamar `salvarPersona` só grava `eixos.persona`, preserva o resto.

---

### Task 4: Gating de cota diária e janela de publicação

**Files:**
- Modify: `src/lib/marketing/processar-pauta.ts`
- Modify: `src/lib/marketing/processar-pauta.test.ts`

**Interfaces:**
- Produces: `processarProximaPauta` pode retornar `{ status: "fora_da_janela" }` como novo caso — a rota de cron (Task 9 do núcleo, `src/app/api/cron/marketing-pipeline/route.ts`) já trata `resultado.status` genericamente (grava no objeto de resultados), então **não deveria** precisar de mudança — confirmar isso, não presumir.

- [ ] **Step 1: Testes primeiro** — `processarProximaPauta` com `config_pipeline.janela_publicacao` fora do horário atual retorna `fora_da_janela` sem chamar `selecionarPauta` (spy não chamado); com `posts_por_dia` já atingido (mock da contagem de posts publicados hoje) idem; sem nenhum dos dois campos configurados, comportamento idêntico ao de hoje (regressão).
- [ ] **Step 2: Implementar** `dentroDaJanela`/`cotaDiariaAtingida` (ver spec seção 5 pro esqueleto) + a checagem no topo de `processarProximaPauta`, antes de `carregarPropriedade`/`selecionarPauta`.
- [ ] **Step 3: Resolver a pendência de fuso horário da spec (seção "Pendências")** — decisão default proposta: `janela_publicacao` é sempre em horário de Brasília (`America/Sao_Paulo`), convertido internamente pro cálculo (`Intl.DateTimeFormat` com `timeZone`, sem lib nova) — documentar a escolha no relatório da task; se o implementador achar mais simples pedir a decisão ao controller antes de codar, é uma dúvida legítima de pausar e perguntar, não de adivinhar.

---

### Task 5: Instrumentação do log de execução

**Files:**
- Modify: `src/lib/marketing/processar-pauta.ts`
- Modify: `src/lib/marketing/processar-pauta.test.ts`
- Modify: `src/lib/marketing/escritor.ts` (retorno passa a incluir `usage`)
- Modify: `src/lib/marketing/escritor.test.ts`
- Modify: `src/lib/marketing/revisor.ts` (idem)
- Modify: `src/lib/marketing/revisor.test.ts`

**Interfaces:**
- Produces: `gerarConteudo`/`revisarConteudo` retornam `{ resultado: ConteudoGerado | ResultadoRevisao, usage: { inputTokens: number; outputTokens: number } }` em vez do tipo puro — **breaking change de assinatura**, `processar-pauta.ts` (Tasks 4 e núcleo) precisa ser ajustado no mesmo commit.

- [ ] **Step 1: Ajustar Escritor/Revisor primeiro** (TDD — teste existente de cada um passa a checar `.resultado.titulo` etc. em vez de acesso direto; novo assert de `.usage.inputTokens > 0` a partir do mock da resposta Anthropic, que já inclui `usage` na estrutura mockada segundo o padrão de `escritor.test.ts`/`revisor.test.ts` existentes).
- [ ] **Step 2: `registrarEtapa` já implementada na Task 3** — usar aqui, não reimplementar.
- [ ] **Step 3: Envolver cada etapa existente de `processarProximaPauta`** com `registrarEtapa(pauta.id, "<etapa>", () => ...)`, passando os tokens pro `update` quando a etapa for `gerar_conteudo`/`revisar`.
- [ ] **Step 4: Teste de regressão do pipeline completo** — `processarProximaPauta` ainda publica corretamente de ponta a ponta com o log instrumentado (reaproveita os cenários já cobertos em `processar-pauta.test.ts`, só adiciona assert de que `pautas_execucao_log` foi chamado pra cada etapa esperada, via spy no `createAdminClient` mockado).
- [ ] **Step 5: Confirmar que o comportamento do reclaim (Task 10 do núcleo) não muda** — uma etapa que nunca fecha (`concluido_em` nulo) por timeout da função continua sendo simplesmente uma linha órfã no log, sem lógica nova pra "limpar" isso (documentado na spec seção 6) — não implementar nada além do que já existe pro reclaim em si.

---

### Task 6: Componente `<Ajuda>` + sidebar

**Files:**
- Create: `src/components/marketing/ajuda.tsx` (ou local equivalente já usado por outros componentes puramente visuais do admin — confirmar convenção de pasta antes de criar `src/components/marketing/` do zero, pode já existir um `src/components/admin/` genérico)
- Modify: `src/app/admin/(shell)/sidebar.tsx`

**Interfaces:**
- Produces: `<Ajuda texto="..." />` — ícone `?`/`ℹ️`, tooltip ao hover, sem estado de servidor, reaproveitado por todas as Tasks 7-13.

- [ ] **Step 1:** Implementar `<Ajuda>` — componente puramente client-side, CSS/Tailwind (`group-hover`, sem lib de tooltip nova).
- [ ] **Step 2:** No array `MODULOS` de `sidebar.tsx`, dentro do módulo `chave: "marketing"`: trocar `{ tipo: "em_breve", rotulo: "Dashboard", icone: "📊" }` por `{ tipo: "link", rotulo: "Visão Geral", href: "/admin/marketing", icone: "📊" }` e adicionar depois `Monitor` (`/admin/marketing/monitor`), `Fila de Pautas` (`/admin/marketing/pautas`), `Posts Publicados` (`/admin/marketing/posts`).
- [ ] **Step 3:** Dentro do módulo `chave: "configuracoes"`, adicionar um novo `{ tipo: "grupo", rotulo: "Marketing", itens: [...] }` (mesmo formato do grupo `"CRM"` já existente) com os 4 links: Propriedades Digitais, Matrizes de Conteúdo, Personas, Checklist de QA.
- [ ] **Step 4:** Não alterar nenhum outro módulo/grupo existente — diff deve tocar só as linhas do array `MODULOS` relativas a `marketing`/`configuracoes`.

---

### Task 7: Tela Propriedades Digitais

**Files:**
- Create: `src/app/admin/configuracoes/marketing/propriedades/page.tsx`
- Create: `src/app/admin/configuracoes/marketing/propriedades/propriedades-client.tsx`
- Create: `src/app/admin/configuracoes/marketing/propriedades/actions.ts`

**Interfaces:**
- Consumes: `listarPropriedades`, `salvarPropriedade`, `salvarCredencialCanal` (Task 3).

- [ ] **Step 1:** `page.tsx` (Server Component) — `createClient()` de `@/lib/supabase/server`, chama `listarPropriedades()`, passa como prop inicial pro client.
- [ ] **Step 2:** `propriedades-client.tsx` — mesmo padrão de `faqs-client.tsx` (cards expansíveis, `useState` local, "+ Nova Propriedade"). Campos: nome, URL base, tipo CMS (só `wordpress` por enquanto), max_tentativas, posts_por_dia, janela de publicação (início/fim), e uma seção "Credenciais" com usuário + senha (`type="password"`, sempre vazio ao carregar) + indicador "✓ configurada"/"✗ não configurada" por canal.
- [ ] **Step 3:** `actions.ts` — `salvarPropriedadeAction` valida (nome/URL obrigatórios, `max_tentativas`/`posts_por_dia` inteiros positivos, `janela_publicacao.inicio < fim`), chama o repositório, `revalidatePath`. `salvarCredencialAction` separado (só roda quando o campo de senha não está vazio).
- [ ] **Step 4:** `<Ajuda>` explicando o que é cada campo — em especial `posts_por_dia`/janela (que isso limita o quanto o cron publica, não afeta geração) e a seção de credenciais (nunca reexibe senha salva).

---

### Task 8: Telas Matrizes de Conteúdo + Personas

**Files:**
- Create: `src/app/admin/configuracoes/marketing/matrizes/page.tsx`, `matrizes-client.tsx`, `actions.ts`
- Create: `src/app/admin/configuracoes/marketing/personas/page.tsx`, `personas-client.tsx`, `actions.ts`

**Interfaces:**
- Consumes: `listarMatrizes`, `salvarMatriz`, `carregarPersona`, `salvarPersona` (Task 3).

- [ ] **Step 1:** Tela Matrizes — CRUD simples (nome, propriedade dona, ativo/inativo); campos de `eixos.temas`/`angulos`/`geografias` ficam **só leitura** nesta fase (populados pelo Construtor de Matriz, ainda não construído, ou inseridos direto no banco) — mostrar como texto/lista, sem formulário de edição desses três campos (evita a tela prometer uma funcionalidade que não existe).
- [ ] **Step 2:** Tela Personas — formulário por matriz com os 8 campos da seção 6.2 do `MODULO_MARKETING_CONTEUDO_ARRUDACRED.md` (nome da persona, perfil demográfico/comportamental, tom de voz, nível de conhecimento assumido, dores/necessidades, objeções típicas, vocabulário preferido, vocabulário a evitar — os 3 últimos são listas, um campo de texto por linha ou tags simples, decisão de UI do implementador).
- [ ] **Step 3:** `<Ajuda>` na tela de Matrizes explicando por que temas/ângulos são só leitura (aponta pra seção 6 do doc de negócio).

---

### Task 9: Tela Checklist de QA

**Files:**
- Create: `src/app/admin/configuracoes/marketing/checklist/page.tsx`, `checklist-client.tsx`, `actions.ts`

**Interfaces:**
- Consumes: `listarChecklistPorPropriedade`, `salvarItemChecklist`, `excluirItemChecklist` (Task 3).

- [ ] **Step 1:** CRUD simples por propriedade (seletor de propriedade no topo, lista de itens com item/peso/ativo, "+ Novo item"). Mesmo padrão visual das demais telas CRUD desta plan.
- [ ] **Step 2:** `<Ajuda>` explicando que o peso influencia o score do Revisor (score mínimo 80/100) e que desativar um item (em vez de excluir) preserva o histórico de por que posts antigos foram avaliados daquele jeito.

---

### Task 10: Tela Fila de Pautas

**Files:**
- Create: `src/app/admin/marketing/pautas/page.tsx`, `pautas-client.tsx`, `actions.ts`

**Interfaces:**
- Consumes: `listarPautasPorStatus`, `reabrirPauta` (Task 3).

- [ ] **Step 1:** Tabela/lista filtrável por propriedade e status, com badge colorido por status e `<Ajuda>` em cada badge explicando o significado (`bloqueada` — esgotou tentativas, revisar `motivo_ultima_reprovacao`; `em_producao` — cron está processando ou pode estar travada, ver Monitor).
- [ ] **Step 2:** Ação "Reabrir" visível só em pautas `bloqueada`, com confirmação (é uma ação que reintroduz custo — Revisor/Escritor vão rodar de novo).
- [ ] **Step 3:** `reabrirPautaAction` em `actions.ts`, chama `reabrirPauta` do repositório, `revalidatePath`.

---

### Task 11: Tela Posts Publicados

**Files:**
- Create: `src/app/admin/marketing/posts/page.tsx`, `posts-client.tsx`

**Interfaces:**
- Consumes: `listarPostsPublicados` (Task 3).

- [ ] **Step 1:** Lista por propriedade, com link pro post no WordPress (`canais.wordpress.url`), score de QA, data de publicação, tentativas. Sem ações de escrita nesta tela (é só consulta) — sem `actions.ts`.
- [ ] **Step 2:** `<Ajuda>` explicando o score de QA (mínimo 80/100 pra aprovar).

---

### Task 12: Tela Visão Geral

**Files:**
- Create: `src/app/admin/marketing/page.tsx`, `visao-geral-client.tsx`

**Interfaces:**
- Consumes: `carregarResumoVisaoGeral` (Task 3).

- [ ] **Step 1:** Dashboard com cards: pautas pendentes/em produção/bloqueadas por propriedade, publicados na semana, taxa de aprovação do Revisor (aprovados / total de revisões, a partir de `pautas_execucao_log` etapa `revisar`), custo acumulado (soma de `tokens_entrada`/`tokens_saida` do período, com uma nota de que o valor em R$ depende do preço vigente da API — não hardcodear preço, só mostrar tokens brutos nesta fase, ou um cálculo com constante claramente marcada como "verificar preço atual" — decisão do implementador, mas não pode ficar silenciosamente errado se o preço da Anthropic mudar).
- [ ] **Step 2:** `<Ajuda>` em cada card.

---

### Task 13: Tela Monitor de execução (Realtime)

**Files:**
- Create: `src/app/admin/marketing/monitor/page.tsx`
- Create: `src/app/admin/marketing/monitor/monitor-client.tsx`

**Interfaces:**
- Consumes: leitura inicial via Server Component (query direta em `pautas_execucao_log`/`pautas`), depois assinatura Realtime no client (`@/lib/supabase/client`).

- [ ] **Step 1:** `page.tsx` — carga inicial dos 3 blocos (Na fila / Em andamento agora / Concluídos recentes), mesma query que o client vai manter atualizada depois.
- [ ] **Step 2:** `monitor-client.tsx` — `"use client"`, recebe a carga inicial como prop, assina `pautas_execucao_log` via `supabase.channel(...).on("postgres_changes", ...)` (ver spec seção 7 pro esqueleto), faz merge por `id` no estado local (nunca refetch completo a cada evento), remove o canal no cleanup do `useEffect`.
- [ ] **Step 3:** "Em andamento agora" — pauta com etapa sem `concluido_em`; se `iniciado_em` tem mais de 10 minutos (mesmo limiar do reclaim, `RECLAIM_MINUTOS` em `repositorio.ts`), mostrar como "possivelmente travada" em vez de "em andamento" (ver spec seção 6, nota sobre reclaim).
- [ ] **Step 4:** Progresso (%) e estimativa de tempo — média de `concluido_em - iniciado_em` por `etapa` nas últimas N execuções (query de agregação simples, sem view nova).
- [ ] **Step 5: Verificação manual (não dá pra automatizar em `vitest`)** — documentar no relatório da task: abrir duas abas do navegador, disparar o cron manualmente (ou aguardar), confirmar que a segunda aba atualiza sozinha sem F5. Se não for possível testar isso no ambiente da task (sem cron rodando local), documentar como pendência explícita pro controller decidir se aceita sem essa verificação ou pede confirmação ao Luiz depois do merge.

---

## Pendências desta plan (fora do escopo deliberadamente)

- Construtor de Matriz de Conteúdo (agente conversacional) — Task 8 trata `eixos.temas/angulos/geografias` como só leitura, não constrói formulário de criação.
- Distribuição multi-canal — nenhuma tela desta plan lida com GMB/Instagram/Facebook/LinkedIn/Pinterest/Medium.
- Preço real da API da Anthropic no cálculo de custo (Task 12) — tokens brutos ou constante marcada como "verificar", não um valor de R$ garantidamente atualizado.
