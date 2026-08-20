# Personas Ricas + Geração de Pauta por Persona — Fase 3 — Design de Implementação

**Data:** 18/08/2026
**Status:** Spec para revisão com Luiz antes de virar plano de implementação.
**Documentos irmãos:**
- `docs/MODULO_MARKETING_CONTEUDO_ARRUDACRED.md` — seções 6/6.1/6.2 (personas, Construtor de Matriz) ficam superadas por este documento para arrudacred.com.br: a persona deixa de ser "1 por matriz, definida por formulário" e passa a ser "N por propriedade, ricas, importadas de arquivo, sorteadas a cada pauta".
- `docs/superpowers/specs/2026-08-17-pipeline-conteudo-marketing-design.md` — arquitetura do núcleo (Estrategista/Escritor/Revisor), alterada por esta spec nos pontos indicados.
- `docs/superpowers/specs/2026-08-18-pipeline-conteudo-marketing-telas-design.md` — Fase 2 (telas), cuja tela de Personas (seção baseada em `matrizes_conteudo.eixos.persona`) fica obsoleta por este documento.

---

## 1. Objetivo

Substituir a seleção de pauta por fila pré-populada (que dependia do não-construído Construtor de Matriz de Conteúdo) por um modelo onde **a persona inicia tudo**: cada propriedade tem um conjunto de personas ricas (perfis profundos, no padrão de 11 blocos fixos que o Luiz já escreve), e cada tentativa do pipeline sorteia uma persona, deriva a pauta específica daquele post a partir dela, e só então gera o conteúdo.

**Motivação (palavras do Luiz):** *"a pauta tem que ser definida com base na persona. a persona é que inicia tudo."*

**Fora de escopo desta spec:** distribuição multi-canal, geração de imagem, o Construtor de Matriz de Conteúdo genérico (esta spec resolve o mesmo problema — de onde vem a pauta — mas por um caminho diferente e mais concreto: personas prontas, não pesquisa de palavra-chave assistida por IA).

---

## 2. O que muda e o que não muda

**Não muda:** Revisor, adaptador WordPress, sanitização, Agente de Links, log de execução, gating de cota/janela, publicação — tudo que roda **depois** de existir uma pauta continua igual.

**Muda:**
- **Estrategista** (`src/lib/marketing/estrategista.ts`) — hoje só lê a fila de pautas `pendente`. Ganha um novo caminho: quando não há pauta pendente nem travada pra reclaim, sorteia uma persona e **cria** a pauta a partir dela (com ou sem IA, seção 5).
- **Escritor** (`src/lib/marketing/escritor.ts`) — o prompt passa a incluir o conteúdo da persona (voz, vocabulário, medos, o que evitar), não só palavra-chave/ângulo/checklist como hoje.
- **Modelo de dados** — tabela nova `personas`; coluna nova `pautas.persona_id`.
- **Tela de Personas da Fase 2** (`src/app/admin/(shell)/configuracoes/marketing/personas/`) — o formulário de 8 campos (peguei do documento de negócio original, seção 6.2) não serve mais para este volume/riqueza de conteúdo. Fica pendente decidir o que substitui essa tela (seção 9, Pendências) — não é parte desta spec construir a tela nova, só não quebrar o sistema por causa da tela velha.

---

## 3. Modelo de dados

### 3.1 Tabela `personas`

```sql
create table personas (
  id uuid primary key default gen_random_uuid(),
  propriedade_id uuid not null references propriedades_digitais(id) on delete cascade,
  numero int not null,
  nome text not null,
  produto text not null,
  publico text not null check (publico in ('PF', 'PJ')),
  dor_entrada text not null,
  conteudo_completo text not null,
  angulos_prontos jsonb not null default '[]'::jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint uq_personas_propriedade_numero unique (propriedade_id, numero)
);
comment on table personas is
  'Perfis de persona ricos (formato de 11 blocos fixos: ficha rápida, motivação, retrato psicográfico, medos, impacto nos relacionamentos, tentativas anteriores, causa surpreendente, restrições, resultado esperado, vocabulário, ângulos de ataque) — origem: material escrito pelo Luiz, importado de arquivo .md. Cada pauta nasce de uma persona sorteada (ver Estrategista) — substitui o modelo de "1 persona por matriz" da Fase 2.';
comment on column personas.numero is
  'Número de referência da persona no arquivo-fonte (1-75 no lote atual) — não é chave técnica, só rastreabilidade até a origem.';
comment on column personas.conteudo_completo is
  'Os 11 blocos em markdown, texto corrido — alimenta o prompt do Escritor (seção 6) pra manter voz/vocabulário/tom consistentes com o que o Luiz escreveu.';
comment on column personas.angulos_prontos is
  'jsonb: string[] — os ângulos de ataque para anúncio (Bloco 11) já escritos pelo Luiz, prontos pra virar pauta sem custo de IA. Ver seção 5 (lógica de seleção) — esvaziam com o uso, e o Estrategista passa a gerar ângulo novo via IA quando acabam.';

alter table personas enable row level security;
create policy admin_acesso_total on personas for all to authenticated using (true) with check (true);
create trigger trg_auditoria_personas
  after insert or update or delete on personas
  for each row execute function fn_auditoria_log();

create index idx_personas_propriedade on personas (propriedade_id) where ativo;
```

### 3.2 Coluna nova em `pautas`

```sql
alter table pautas add column persona_id uuid references personas(id);
comment on column pautas.persona_id is
  'Persona que originou esta pauta (Fase 3, 18/08/2026) — nulo em pautas antigas/manuais. O campo pautas.angulo continua sendo o texto do ângulo em si (pronto da persona ou gerado por IA quando os prontos esgotam); persona_id é só a referência de origem, usada pra saber quais ângulos de uma persona já foram usados (seção 5).';

create index idx_pautas_persona on pautas (persona_id);
```

Nenhuma mudança nas tabelas `matrizes_conteudo`/`checklist_qa_itens`/`posts` — o resto do pipeline consome `pautas` do mesmo jeito de sempre, só a origem da linha muda.

---

## 4. Importação das 75 personas

**Não é migration** (é dado, não schema) — script one-off, rodado pelo controller (não é uma execução recorrente do sistema), lendo o arquivo `.md` que o Luiz forneceu.

**Formato de origem** (confirmado no arquivo real): cada persona delimitada por `<!-- ===================== INÍCIO PERSONA NN ===================== -->` / `FIM`, com um cabeçalho (`# PERSONA NN — Nome`, `**Produto:**`, `**Público:**`, `**Dor de entrada:**`) seguido de exatamente 11 blocos `## Bloco N — Título`, sempre na mesma ordem, sem variação de estrutura entre produtos.

**Parsing:**
- `numero`/`nome` — do H1 (`# PERSONA 01 — Marcelo Andrade`).
- `produto`/`publico`/`dor_entrada` — das linhas `**Campo:** valor` logo abaixo do H1.
- `conteudo_completo` — o texto entre o cabeçalho e o delimitador FIM, blocos 1-11 inteiros (markdown preservado, é isso que vai pro prompt do Escritor).
- `angulos_prontos` — parseado do Bloco 11: cada item de lista no formato `- **"citação"** (explicação)` vira uma entrada; a única exceção é a linha `- Evitar: ...` (sem aspas em negrito no início), que **não** é um ângulo — é instrução do que não fazer, e fica descartada do array (mas continua presente em `conteudo_completo`, então o Escritor ainda vê essa instrução).

**Execução:** script lê o arquivo, monta as linhas, insere via `createAdminClient()` — é escrita de dado de aplicação, não de schema, então não esbarra na regra dura de migration (que é especificamente sobre `supabase/migrations/`). Ainda assim, como é produção, o controller roda isso só depois de a migration da seção 3 estar aplicada e confirma o resultado por leitura antes de prosseguir.

---

## 5. Seleção de persona e derivação de pauta — novo `selecionarPauta`

Substitui o corpo de `src/lib/marketing/estrategista.ts`. Mantém o reclaim (Task 10 do núcleo) e a checagem de pauta `pendente` já na fila **intactos** — a lógica de persona é um novo terceiro caminho, não uma substituição dos outros dois:

```
selecionarPauta(matrizConteudoId, propriedadeId):
  1. pauta = selecionarProximaPautaPendente(matrizConteudoId)   # já existe: pendente OU reclaim
     se achou, marca em_producao, retorna (comportamento atual, inalterado)

  2. # NOVO — nenhuma pauta pendente nem travada: gera uma a partir de persona
     personas = personas ativas da propriedade
     para cada persona: angulosDisponiveis = persona.angulos_prontos − {angulo já usado por essa persona em pautas}

     se existe alguma persona com angulosDisponiveis não vazio:
        persona = sorteio ponderado (menos usada recentemente tem mais peso) entre essas personas
        angulo = sorteio simples entre os angulosDisponiveis dela
        cria pauta { persona_id, angulo, palavra_chave_principal: <derivada do ângulo/dor_entrada>, funil/tipo_conteudo: default da propriedade }
        # sem chamada de IA — zero custo nesta etapa
     senão:
        persona = sorteio ponderado (menos usada recentemente) entre TODAS as personas ativas
        angulosUsados = todos os ângulos já registrados em pautas pra essa persona (prontos + gerados por IA antes)
        chama o novo agente "Gerador de Ângulo" (seção 6) com conteudo_completo da persona + angulosUsados
        cria pauta com o resultado

     marca em_producao, retorna
```

**"Ângulo já usado por essa persona"** — não precisa de tabela nova: é `select distinct angulo from pautas where persona_id = :id`. Cobre tanto os ângulos prontos quanto os gerados por IA em ciclos anteriores, então o fallback de IA nunca repete nada, nem do Bloco 11 nem do que a própria IA já inventou antes.

**Sorteio ponderado por "menos usada recentemente":** usa `pautas.created_at` mais recente por persona (ou `nunca usada` = prioridade máxima) — não precisa de coluna nova em `personas`, é uma agregação sobre `pautas`.

---

## 6. Novo agente: Gerador de Ângulo (fallback de IA)

Só roda quando uma persona esgota os ângulos prontos do Bloco 11 — na prática, não roda nos primeiros ciclos de vida do sistema (75 personas × ~4-5 ângulos cada = 300-375 posts de fôlego antes de qualquer chamada de IA aqui).

```typescript
// src/lib/marketing/gerador-angulo.ts
export async function gerarAngulo(
  persona: PersonaCarregada,       // conteudo_completo + nome + produto
  angulosUsados: string[],
): Promise<{ resultado: AnguloGerado; usage: UsageTokens }>
```

Mesmo padrão de cliente Anthropic dos demais agentes (`obterCliente()`, Sonnet, tool use). Prompt: conteúdo completo da persona (os 11 blocos) + lista de ângulos já usados, pedindo um ângulo **novo**, coerente com a persona, que não repita nenhum dos usados — e os campos derivados da pauta (`palavra_chave_principal`, `palavras_secundarias`, `funil`, `tipo_conteudo`). Registrado no log de execução (`registrarEtapa`, mesma etapa `gerar_conteudo` reaproveitada, ou uma etapa nova — decisão do plano de implementação) para aparecer no Monitor e no Painel de Custo.

---

## 7. Impacto no Escritor

`montarPrompt` (`escritor.ts`) ganha o conteúdo da persona como contexto — não é opcional, é o ponto principal desta mudança (manter a voz que o Luiz escreveu). Adição mínima e aditiva, sem mudar o resto do prompt:

```
Persona deste post — escreva na voz/vocabulário dela, respeitando o que ela não quer ouvir:
${persona.conteudoCompleto}
```

`gerarConteudo` ganha um parâmetro novo `persona: PersonaCarregada` (ou `PersonaCarregada | null`, pra não quebrar se algum dia existir pauta sem persona) — mudança de assinatura, igual à que a Task 5 da Fase 2 já fez para `usage`.

---

## 8. Segurança / RLS

Mesmo padrão do resto do módulo — `admin_acesso_total` + `fn_auditoria_log()`. Nenhum dado sensível novo (personas são material de copy, não dado de cliente real — são personas fictícias representando segmentos, não CPFs/nomes reais de leads).

---

## 9. Plano de testes

- **Importação:** conferida por leitura direta (contagem = 75, campos batendo com o índice do arquivo) — não é código do sistema, não tem teste automatizado formal, é validação do controller no momento da importação.
- **Seleção com ângulo pronto:** unitário — persona com `angulos_prontos` não esgotados é escolhida, pauta nasce com um desses ângulos, nenhuma chamada de IA.
- **Seleção com esgotamento:** unitário — todas as personas ativas com ângulos esgotados aciona o Gerador de Ângulo; o ângulo retornado nunca coincide com os já usados (mock retornando um ângulo já usado deve ser tratado como erro do próprio Gerador, não silenciosamente aceito — a decisão de re-tentar ou falhar fica para o plano de implementação).
- **Sorteio ponderado:** unitário — persona nunca usada tem prioridade sobre persona usada há pouco tempo.
- **Escritor:** teste existente adaptado pra nova assinatura com `persona`, confirma que o prompt inclui o conteúdo dela.
- **Regressão:** os testes que cobrem o caminho "pauta pendente já na fila" e "reclaim" continuam passando sem alteração — esses dois caminhos não mudam.

---

## Pendências desta spec

- **Tela de Personas da Fase 2** (`configuracoes/marketing/personas/`) fica com o formulário de 8 campos incompatível com este modelo — decidir separadamente se vira uma tela de importação/listagem (visualizar as 75, ativar/desativar) ou é descontinuada. Não bloqueia esta spec: a tela não escreve na tabela `personas` nova, só na antiga (`matrizes_conteudo.eixos.persona`), que fica órfã mas inofensiva.
- **`palavra_chave_principal`/`tipo_conteudo`/`funil` no caminho "ângulo pronto" (sem IA)** — a spec não detalha a heurística exata de derivar esses campos do ângulo/dor de entrada sem chamar IA (ex.: usar a `dor_entrada` como base da palavra-chave, `tipo_conteudo` default da propriedade). Fica para o plano de implementação detalhar, com exemplos reais do arquivo de personas.
- **Rótulo de "produto" x propriedade** — hoje uma persona pertence a 1 propriedade (`propriedade_id`); o arquivo já separa por "Produto" (Limpa Nome Serasa/SPC, Registrato/BACEN, etc.) dentro do mesmo público PF/PJ. Se cada produto virar conteúdo em sites diferentes no futuro, a tabela já suporta (basta popular `propriedade_id` diferente por produto) — não é decisão a tomar agora, só registrado que o modelo aguenta.
- **Geografia** — personas não têm campo estruturado de geografia (aparece só em texto livre na Ficha Rápida). `pautas.geografia` fica null nas pautas geradas por persona, a menos que o plano de implementação decida extrair isso do texto (não recomendado — baixa confiabilidade).
