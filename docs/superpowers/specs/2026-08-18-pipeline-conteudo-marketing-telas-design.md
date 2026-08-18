# Pipeline de Conteúdo Marketing — Fase 2: Telas de Admin — Design de Implementação

**Data:** 18/08/2026
**Status:** Spec para revisão com Luiz antes de virar plano de implementação.
**Documentos irmãos:**
- `docs/MODULO_MARKETING_CONTEUDO_ARRUDACRED.md` — estratégia de conteúdo/negócio e o escopo desta fase (seções 6.2, 7, 7.1, 7.2, 8) já fechado com Luiz em 18/08/2026. Este documento aprofunda a implementação.
- `docs/superpowers/specs/2026-08-17-pipeline-conteudo-marketing-design.md` — arquitetura de engenharia do núcleo (Fase 1, já construído/testado/revisado, Tasks 1-10).
- `docs/COORDENACAO_AGENTES_ARRUDACRED.md` — convenção de coordenação entre agentes/worktrees; toda migration nova desta fase precisa reservar timestamp lá antes de o plano de implementação criar o arquivo.

---

## 1. Objetivo

Dar visibilidade e controle operacional sobre o pipeline de conteúdo (Fase 1, já rodando) sem reintroduzir aprovação humana na execução — "sem humano no meio" continua valendo pra decisão de publicar, não pra visibilidade do que está sendo feito, quanto custou, e quanto de retrabalho houve. Fecha também duas lacunas de configuração que a Fase 1 deixou implícitas (cota/horário de publicação, credenciais por propriedade).

Fora de escopo desta spec: Construtor de Matriz de Conteúdo (agente conversacional, ver `MODULO_MARKETING_CONTEUDO_ARRUDACRED.md` seção 6 — persona não depende mais dele, seção 6.2, mas temas/ângulos/geografias ainda dependem), distribuição multi-canal (GMB/Instagram/Facebook/LinkedIn/Pinterest/Medium), geração de criativos por IA.

---

## 2. Inventário de telas

Ver `MODULO_MARKETING_CONTEUDO_ARRUDACRED.md` seção 7 para a decisão de escopo; aqui vai o mapeamento pra rotas/arquivos.

| Tela | Rota | Tipo |
|---|---|---|
| Visão Geral | `/admin/marketing` | Dashboard (leitura) |
| Monitor de execução | `/admin/marketing/monitor` | Leitura, ao vivo (Realtime) |
| Fila de Pautas | `/admin/marketing/pautas` | Leitura + ação pontual (reabrir bloqueada) |
| Posts Publicados | `/admin/marketing/posts` | Leitura |
| Propriedades Digitais | `/admin/configuracoes/marketing/propriedades` | CRUD |
| Matrizes de Conteúdo | `/admin/configuracoes/marketing/matrizes` | CRUD |
| Personas | `/admin/configuracoes/marketing/personas` | CRUD (por matriz) |
| Checklist de QA | `/admin/configuracoes/marketing/checklist` | CRUD |

**Convenção de arquivos** (mesmo padrão de `src/app/admin/(shell)/faqs/`): cada rota tem `page.tsx` (Server Component, busca dados via `createClient()` de `@/lib/supabase/server` e repositório), `<nome>-client.tsx` (`"use client"`, estado local + chama as actions) e `actions.ts` (`"use server"`, valida input, chama o repositório, `revalidatePath`). Sem biblioteca de tabela/formulário nova — Tailwind direto, mesmo padrão visual das telas existentes (cards expansíveis, não grid denso).

**Sidebar (`src/app/admin/(shell)/sidebar.tsx`):** o módulo `marketing` já existe na árvore (adicionado pelo CRM em 17/08, hoje só com "Dashboard" em breve) — esta fase adiciona os 3 itens de operação diária dentro dele (Visão Geral vira o próprio link de "Dashboard", que sai de `em_breve`; Monitor; Fila de Pautas; Posts) e um novo subgrupo `"Marketing"` dentro do módulo `configuracoes` (mesmo padrão do subgrupo `"CRM"` já existente) com os 4 itens de configuração.

**Tooltips/dicas (pedido explícito de Luiz):** cada tela ganha um componente `<Ajuda texto="..."/>` reaproveitável (ícone `?`/`ℹ️` com texto ao hover/clique) — não existe ainda no projeto, é novo desta fase, mas é puramente de apresentação (sem estado de servidor). Cada status de pauta/post (badge colorido) tem tooltip explicando o que significa e, quando aplicável, o que fazer (ex.: "bloqueada — esgotou tentativas, revise `motivo_ultima_reprovacao` e decida se reabre ou ajusta a matriz/checklist").

---

## 3. Modelo de dados — deltas sobre a Fase 1

Nenhum destes exige mudança nas tabelas já existentes (`pautas`, `posts`, `matrizes_conteudo`, `checklist_qa_itens` ficam como estão) — só em `propriedades_digitais` e uma tabela nova.

### 3.1 Credenciais de canal — nova coluna em `propriedades_digitais` (texto plano, decisão do Luiz — ver seção 4)

```sql
alter table propriedades_digitais add column credenciais_canais jsonb not null default '{}'::jsonb;
comment on column propriedades_digitais.credenciais_canais is
  'Credenciais de canal por propriedade, em texto plano (decisão do Luiz, 18/08/2026 — não é precedente pra outros segredos). Formato: {"wordpress": {"usuario": "...", "senha": "..."}}. Fallback: se a propriedade não tiver entrada aqui, credenciaisWordPressDaPropriedade (processar-pauta.ts) continua caindo pra WORDPRESS_USUARIO/WORDPRESS_SENHA_APP (env genérico) — não quebra o que já está em produção.';
```

### 3.2 Cota diária e janela de publicação — dentro de `config_pipeline` (sem migração)

`config_pipeline` já é jsonb livre (`{"max_tentativas": 3, "canais_distribuicao": []}`, seção 4 da spec do núcleo). Esta fase acrescenta duas chaves, sem migração de schema — só a tela grava campos novos no mesmo jsonb:

```json
{ "max_tentativas": 3, "canais_distribuicao": [], "posts_por_dia": 3, "janela_publicacao": { "inicio": "08:00", "fim": "20:00" } }
```

`posts_por_dia` e `janela_publicacao` ausentes/null = sem limite (comportamento atual da Fase 1, não quebra propriedades já configuradas).

### 3.3 Log de execução — tabela nova

```sql
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
  'Preenchido só nas etapas gerar_conteudo/revisar (chamadas à Anthropic) — vem de resposta.usage.input_tokens, já disponível na resposta da API, só precisa ser persistido.';

alter table pautas_execucao_log enable row level security;
create policy admin_acesso_total on pautas_execucao_log for all to authenticated using (true) with check (true);
create trigger trg_auditoria_pautas_execucao_log
  after insert or update or delete on pautas_execucao_log
  for each row execute function fn_auditoria_log();

create index idx_execucao_log_pauta on pautas_execucao_log (pauta_id, iniciado_em desc);

-- Habilita Realtime nesta tabela (Postgres changes via websocket) — primeira tabela do projeto a usar
-- Realtime; Atendimento (src/app/admin/(shell)/atendimento/atendimento-client.tsx) usa polling de 4s
-- por decisão própria, não por limitação — Realtime é justificado aqui porque o Monitor precisa
-- refletir cada etapa concluída, não só um snapshot periódico.
alter publication supabase_realtime add table pautas_execucao_log;
```

**Nota de coordenação:** esta migração (junto com a de 3.1) precisa reservar timestamp em `docs/COORDENACAO_AGENTES_ARRUDACRED.md` seção 2 antes de o plano de implementação criar os arquivos — não reservado nesta spec porque o número exato de migrations/o corte entre elas pode mudar ao detalhar o plano.

---

## 4. Credenciais de canal — decisão final: texto plano, sem criptografia (revisado 18/08/2026)

**Mudança de decisão:** esta seção originalmente especificava um módulo de criptografia (AES-256-GCM via `node:crypto`, chave em `MARKETING_CREDENCIAIS_CHAVE`). O Luiz revisou e decidiu não exigir esse nível de segurança para este caso específico — palavras dele: *"esse nível de segurança não é necessário NESTE CASO em especial (não serve como base para outros casos). pode manter a senha sem cifra no banco de dados"*. **Isto não é precedente** — vale só para a senha de WordPress de site satélite (pior caso: alguém publica indevidamente num blog), nunca para API keys de terceiro (Asaas/Assinafy), tokens de WhatsApp, chave de IA ou dado de cliente, que continuam em variável de ambiente.

`propriedades_digitais.credenciais_canais` guarda a senha em texto plano: `{"wordpress": {"usuario": "...", "senha": "..."}}`. Não existe `src/lib/marketing/criptografia.ts`, não existe `MARKETING_CREDENCIAIS_CHAVE`, não existe `scryptSync`.

**Duas proteções continuam valendo, e não são criptografia:**
1. **Fluxo na tela de Propriedades Digitais:** o campo de senha é sempre um `<input type="password">` vazio (nunca pré-preenchido com o valor salvo). Salvar com o campo vazio mantém a credencial já existente inalterada; preencher substitui. A tela mostra só um indicador "✓ configurada" / "✗ não configurada" ao lado de cada canal, nunca o valor em si.
2. **RLS em `propriedades_digitais`** — já ativa desde a migration do núcleo (`admin_acesso_total ... to authenticated`), é o que impede a senha de sair do banco à toa agora que não está cifrada.

**No pipeline (`processar-pauta.ts`):** `credenciaisWordPressDaPropriedade` passa a, antes de cair no fallback de env genérico, checar `propriedade.credenciaisCanais?.wordpress` e usar `usuario`/`senha` diretamente — decisão de ordem: banco primeiro, env var genérico como fallback (mantém propriedades já configuradas por env funcionando sem migração de dado).

---

## 5. Cota diária e janela de publicação — gating

Lógica nova em `processarProximaPauta` (ou numa função extraída, ex. `podeProcessarAgora(propriedade)`), chamada **antes** de `selecionarPauta` — se a propriedade estourou a cota do dia ou está fora da janela, retorna `{ status: "fora_da_janela" }` (novo status de retorno da função — não é um status de pauta, é só o resultado do tick) sem tocar em nenhuma pauta:

```typescript
function dentroDaJanela(janela: { inicio: string; fim: string } | undefined): boolean {
  if (!janela) return true;
  const agora = new Date().toTimeString().slice(0, 5); // "HH:MM" em horário local do servidor
  return agora >= janela.inicio && agora <= janela.fim;
}

async function cotaDiariaAtingida(propriedadeId: string, limite: number | undefined): Promise<boolean> {
  if (!limite) return false;
  const inicioDoDia = new Date(); inicioDoDia.setHours(0, 0, 0, 0);
  const { count } = await supabase.from("posts")
    .select("id", { count: "exact", head: true })
    .eq("propriedade_id", propriedadeId)
    .eq("status", "publicado")
    .gte("publicado_em", inicioDoDia.toISOString());
  return (count ?? 0) >= limite;
}
```

**Nota de fuso horário:** `new Date().toTimeString()` usa o horário do servidor (Vercel roda em UTC por padrão) — pendência a resolver no plano: ou a janela é configurada já em UTC (com a tela deixando isso explícito, ex. "horário de Brasília -3h já aplicado por você") ou o código converte pra um fuso fixo (`America/Sao_Paulo`, único fuso relevante hoje). Fica registrado em Pendências desta spec.

---

## 6. Log de execução — instrumentação

`processar-pauta.ts` ganha uma função auxiliar `registrarEtapa(pautaId, etapa, fn)` que envolve cada etapa existente, sem mudar a lógica de negócio:

```typescript
async function registrarEtapa<T>(pautaId: string, etapa: EtapaLog, fn: () => Promise<T>): Promise<T> {
  const { data: log } = await supabase.from("pautas_execucao_log")
    .insert({ pauta_id: pautaId, etapa }).select("id").single();
  try {
    const resultado = await fn();
    await supabase.from("pautas_execucao_log").update({ concluido_em: new Date().toISOString(), sucesso: true }).eq("id", log.id);
    return resultado;
  } catch (erro) {
    await supabase.from("pautas_execucao_log").update({
      concluido_em: new Date().toISOString(), sucesso: false,
      detalhes: erro instanceof Error ? erro.message : "Erro desconhecido",
    }).eq("id", log.id);
    throw erro;
  }
}
```

Cada chamada existente (`gerarConteudo`, `revisarConteudo`, `inserirLinksInternos`, `sanitizarConteudoHtml`, publicação) passa a rodar dentro de `registrarEtapa(pauta.id, "...", () => ...)`. Tokens: `gerarConteudo`/`revisarConteudo` (Escritor/Revisor) precisam passar a retornar `resposta.usage` junto com o resultado de negócio (mudança pequena de tipo de retorno) pra `registrarEtapa` conseguir persistir `tokens_entrada`/`tokens_saida` na mesma linha.

**Reclaim (Task 10):** quando uma pauta é reclamada (presa em `em_producao` por timeout), a etapa que estava em andamento fica com `concluido_em` nulo pra sempre (a função morreu, não teve chance de fechar a linha) — isso já é, por si só, um sinal útil no Monitor ("etapa travada, sem conclusão registrada há mais de N minutos" é literalmente o mesmo critério do reclaim em `repositorio.ts`). Não precisa de lógica nova pra fechar essas linhas órfãs — só documentar que "sem `concluido_em`" pode significar "em andamento" ou "travado por timeout", e o Monitor distingue pelo tempo decorrido (mesmo limiar de 10 minutos do reclaim).

---

## 7. Monitor de execução — front-end ao vivo

Client component assina a tabela via Realtime, usando o client browser já existente (`src/lib/supabase/client.ts`):

```typescript
"use client";
import { createClient } from "@/lib/supabase/client";

useEffect(() => {
  const supabase = createClient();
  const canal = supabase
    .channel("pautas-execucao-log")
    .on("postgres_changes", { event: "*", schema: "public", table: "pautas_execucao_log" }, (payload) => {
      // atualiza o estado local (linha nova ou atualizada) — merge por id, sem refetch completo
    })
    .subscribe();
  return () => { supabase.removeChannel(canal); };
}, []);
```

Carga inicial (antes da assinatura pegar eventos novos) vem do `page.tsx` (Server Component, query normal) — o client component recebe isso como prop inicial e só aplica os deltas do Realtime por cima.

**Três blocos** (ver `MODULO_MARKETING_CONTEUDO_ARRUDACRED.md` seção 7.2): Na fila (`pautas` status `pendente`, ordenadas), Em andamento agora (última etapa de cada pauta com `status = em_producao`, sem `concluido_em`, com tempo decorrido desde `iniciado_em`), Concluídos recentes (`pautas_execucao_log` com `concluido_em` preenchido, agrupado por `pauta_id`, últimos N). Progresso (%) e estimativa: média de `concluido_em - iniciado_em` por `etapa`, calculada com uma query de agregação simples (`avg`) sobre o log — sem view/materialização nova por enquanto, revisitar se ficar lento.

---

## 8. Segurança

- Credenciais em texto plano no banco, por decisão explícita do Luiz não-precedente (seção 4) — campo de senha na UI é sempre write-only e nunca retorna o valor salvo pro caller/client; RLS em `propriedades_digitais` é a proteção real de acesso agora que não há cifra.
- RLS/auditoria em `pautas_execucao_log` seguem o mesmo padrão (`admin_acesso_total` + `fn_auditoria_log`) das demais tabelas do módulo — sem política nova a desenhar.
- Realtime do Supabase respeita RLS por padrão (subscrição só entrega linhas que a policy permitiria ler) — como a policy já é `using (true)` pra usuário autenticado, não há ajuste extra necessário além de a rota já exigir login (mesma proteção do resto do `/admin`).

---

## 9. Plano de testes

- **Credenciais de canal:** unitário — `salvarCredencialCanal` grava texto plano; senha/usuario vazios preservam o valor já salvo; caller nunca recebe a senha de volta, só `usuario` + `senhaConfigurada`.
- **Gating de cota/janela:** unitário — `dentroDaJanela`/`cotaDiariaAtingida` com mocks de horário/contagem; `processarProximaPauta` retorna `fora_da_janela` sem chamar `selecionarPauta` quando aplicável.
- **`registrarEtapa`:** unitário — sucesso grava `sucesso: true` + `concluido_em`; exceção grava `sucesso: false` + `detalhes` e repropaga o erro (não engole silenciosamente).
- **Telas (CRUD):** mesmo padrão das telas existentes — sem teste de integração de UI nesta fase (o projeto não tem Playwright configurado pro admin ainda), validação server-side nas actions é o que garante corretude.
- **Realtime:** fora do alcance de `vitest` (precisa de browser real) — verificação manual no navegador faz parte do plano de implementação (abrir duas abas, disparar o cron, confirmar que a segunda atualiza sozinha).

---

## Pendências desta spec

- **Fuso horário da janela de publicação** (seção 5) — decidir se a tela pede o horário já em UTC ou se o código converte um fuso fixo. Não bloqueia o resto do desenho.
- **Exato corte de migrations** (uma ou duas — credenciais de canal e log de execução podem ir juntas ou separadas) — decidir no plano de implementação, junto com a reserva de timestamp em `COORDENACAO_AGENTES_ARRUDACRED.md`.
- **Tooltip/`<Ajuda>` — nível de detalhe do texto por status/tela:** esta spec define o mecanismo (componente reaproveitável), não o texto de cada tooltip — fica pro plano de implementação, revisado com Luiz junto com o mockup de cada tela.
- **Nenhuma tela nova de "criar pauta manualmente"** — decisão já fechada com Luiz (conversa de 18/08): pauta continua entrando só via inserção direta no banco até o Construtor de Matriz existir.
