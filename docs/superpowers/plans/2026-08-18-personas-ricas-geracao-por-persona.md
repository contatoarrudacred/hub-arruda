# Personas Ricas + Geração de Pauta por Persona — Fase 3 — Plano de Implementação

**Spec de referência:** `docs/superpowers/specs/2026-08-18-personas-ricas-geracao-por-persona-design.md` — todas as decisões de arquitetura (schema, algoritmo de seleção, fallback de IA) já fechadas lá. Este plano só quebra em tasks executáveis.

**Coordenação entre agentes:** `docs/COORDENACAO_AGENTES_ARRUDACRED.md` — registrar a intenção desta plan lá (seção 3) antes de despachar a Task 1, mesma prática da Fase 2.

---

## Architecture

Extensão do núcleo já em produção — não muda nenhum estágio depois da seleção de pauta (revisão, publicação, log, gating). Só o "de onde vem a pauta" muda: de fila pré-populada para sorteio de persona.

## Tech Stack

Igual ao resto do módulo — `createAdminClient()`, cliente Anthropic singleton por agente (mesmo padrão de `escritor.ts`/`revisor.ts`), TDD com mock do Supabase (`vi.mock`), TypeScript/Portuguese naming.

## Global Constraints

- **Regra dura de migration:** a Task 1 (única com migration) escreve o `.sql`, reserva o timestamp em `COORDENACAO_AGENTES_ARRUDACRED.md` seção 2, deixa recado na seção 3, e para — não aplica nada. As demais tasks são 100% testáveis com mock, não dependem da migration estar aplicada pra rodar seus testes.
- **Os dois caminhos existentes do Estrategista (pendente / reclaim) não podem mudar de comportamento.** O caminho novo (sorteio de persona) só roda quando os dois primeiros não encontram nada — é aditivo, nunca substitui.
- **Sem chamada de IA no caminho "ângulo pronto"** — só o fallback (Gerador de Ângulo) chama a API da Anthropic. Qualquer implementação que chame IA no caminho principal está errada.
- **`select distinct angulo from pautas where persona_id = :id`** é a única fonte de verdade de "ângulo já usado" — não criar tabela/coluna nova só pra isso (a spec já decidiu).
- **Nomenclatura em português**, mesmo padrão do resto do módulo.
- **A importação das 75 personas (Task 6) não é uma task de subagente como as outras** — é o controller quem roda, depois que a migration estiver aplicada de verdade em produção, lendo o arquivo local que o Luiz forneceu (fora do repositório). Não despachar isso pra um implementador.

---

### Task 1: Migração — tabela `personas` + `pautas.persona_id`

**Files:**
- Create: `supabase/migrations/<timestamp>_personas_ricas.sql` (timestamp a reservar em `COORDENACAO_AGENTES_ARRUDACRED.md` seção 2 antes de escrever o arquivo)

**Interfaces:**
- Produces: tabela `personas`, coluna `pautas.persona_id` — nomes de coluna usados por todas as tasks seguintes.

- [ ] **Step 1:** Reservar o timestamp no doc de coordenação (status `Aguardando envio ao Luiz`) antes de escrever o arquivo.
- [ ] **Step 2:** Escrever a migração exatamente como especificado na spec seção 3 (tabela `personas` completa com `COMMENT ON TABLE`/`COMMENT ON COLUMN`, RLS, trigger de auditoria, índice; `alter table pautas add column persona_id` com seu `COMMENT ON COLUMN`; índice em `pautas.persona_id`). Nenhum `drop`/`truncate`/`delete` — só `create table` e `alter table add column`.
- [ ] **Step 3:** Deixar recado na seção 3 do doc de coordenação (o que a migration faz, não-destrutiva, sem dependência de outro módulo).
- [ ] **Step 4:** Não rodar nada contra o banco. Não regenerar `database.types.ts`.

---

### Task 2: Tipos + Repositório — personas e criação de pauta a partir de persona

**Files:**
- Modify: `src/lib/marketing/tipos.ts` (novos tipos: `PersonaAtiva` — id, nome, angulosProntos: string[], usadaPelaUltimaVezEm: string | null; `PersonaCarregada` — PersonaAtiva + conteudoCompleto: string; `AnguloGerado` — anguloTexto, palavraChavePrincipal, palavrasSecundarias, funil, tipoConteudo)
- Modify: `src/lib/marketing/repositorio.ts`
- Modify: `src/lib/marketing/repositorio.test.ts`

**Interfaces:**
- Produces (consumidas pela Task 4, Estrategista):
  - `listarPersonasAtivasComAngulosDisponiveis(propriedadeId): Promise<PersonaAtiva[]>` — personas ativas da propriedade, cada uma já com `angulosProntos` filtrado (subtraindo os já usados, via `select distinct angulo from pautas where persona_id = :id`) e `usadaPelaUltimaVezEm` (max `created_at` de pautas dessa persona, ou `null` se nunca usada) — usado pro sorteio ponderado da Task 4.
  - `carregarPersona(personaId): Promise<PersonaCarregada>` — persona completa (com `conteudoCompleto`), usada pelo Gerador de Ângulo (Task 3) e pelo Escritor (Task 5).
  - `carregarAngulosUsadosPorPersona(personaId): Promise<string[]>` — todos os ângulos já registrados em `pautas` pra essa persona (prontos + gerados por IA), usado no fallback (Task 3) pra não repetir.
  - `criarPautaDePersona(params: { matrizConteudoId, personaId, angulo, palavraChavePrincipal, palavrasSecundarias, funil, tipoConteudo }): Promise<PautaCarregada>` — cria a pauta já em `em_producao` (evita duas escritas — criar pendente e marcar em produção em seguida é desnecessário aqui, já que não existe "esperar na fila" nesse caminho).

- [ ] **Step 1: TDD por função**, mesmo padrão do resto do arquivo (mock + `vi.spyOn`, caminho feliz + erro).
- [ ] **Step 2: `listarPersonasAtivasComAngulosDisponiveis` — teste específico de subtração de conjunto:** persona com `angulos_prontos: ["A", "B", "C"]` e uma pauta já registrada com `angulo: "B"` deve retornar `angulosProntos: ["A", "C"]` pra essa persona (case exato do algoritmo da spec seção 5).
- [ ] **Step 3: teste de persona com todos os ângulos esgotados** — retorna `angulosProntos: []` (não é erro, é o sinal que a Task 4 usa pra decidir ir pro fallback).
- [ ] **Step 4: `criarPautaDePersona` — teste de status inicial:** a pauta criada já nasce `em_producao`, não `pendente` (documentar essa decisão no código com um comentário, já que difere do caminho antigo).

---

### Task 3: Gerador de Ângulo — novo agente (fallback de IA)

**Files:**
- Create: `src/lib/marketing/gerador-angulo.ts`
- Create: `src/lib/marketing/gerador-angulo.test.ts`

**Interfaces:**
- Produces: `gerarAngulo(persona: PersonaCarregada, angulosUsados: string[]): Promise<{ resultado: AnguloGerado; usage: UsageTokens }>` — consumido pela Task 4.

- [ ] **Step 1:** Ler `src/lib/marketing/revisor.ts` e `escritor.ts` primeiro — mesmo padrão exato de cliente Anthropic singleton (`obterCliente()`, checagem de `ANTHROPIC_API_KEY`), modelo Sonnet (é geração criativa, não classificação), `tool_choice` forçado numa ferramenta de registro estruturado, checagem de `stop_reason === "max_tokens"`, validação de campos obrigatórios não-vazios.
- [ ] **Step 2: TDD.** Prompt inclui `persona.conteudoCompleto` (os 11 blocos) inteiro + a lista `angulosUsados`, pedindo um ângulo novo, coerente com a persona, que não repita nenhum da lista — e os campos derivados (`palavraChavePrincipal`, `palavrasSecundarias`, `funil`, `tipoConteudo`). Teste do prompt monta corretamente com uma persona + lista de ângulos mockadas; teste de `stop_reason === "max_tokens"` lança erro (mesmo padrão do Escritor); teste de campo obrigatório vazio lança erro nomeando o campo.
- [ ] **Step 3:** Não é necessário (nem esperado) que este agente verifique sozinho se o ângulo retornado colide com `angulosUsados` — a instrução no prompt é a defesa principal; se um teste quiser cobrir esse caso extra, é bônus, não requisito.

---

### Task 4: Estrategista reescrito — terceiro caminho (sorteio de persona)

**Files:**
- Modify: `src/lib/marketing/estrategista.ts`
- Modify: `src/lib/marketing/estrategista.test.ts` (criar se não existir teste próprio ainda — confirmar antes)

**Interfaces:**
- `selecionarPauta(matrizConteudoId, propriedadeId): Promise<PautaCarregada | null>` — assinatura ganha `propriedadeId` (hoje só recebe `matrizConteudoId multiplayer` — conferir a assinatura atual antes de mudar; `processar-pauta.ts`, que chama esta função, precisa ser ajustado no mesmo commit se a assinatura mudar).

- [ ] **Step 1:** Ler `src/lib/marketing/estrategista.ts` e `src/lib/marketing/processar-pauta.ts` atuais por completo antes de mexer — confirmar a assinatura exata de `selecionarPauta` hoje e onde/como é chamada.
- [ ] **Step 2: TDD, três cenários, nesta ordem exata (do algoritmo da spec seção 5):**
  1. Existe pauta `pendente` → comportamento atual, inalterado (regressão — não deve chamar nada relacionado a persona).
  2. Não existe pendente, mas existe travada pra reclaim → comportamento atual, inalterado (regressão).
  3. **Novo:** nem pendente nem reclaim → `listarPersonasAtivasComAngulosDisponiveis` é chamada; se alguma persona tem ângulo disponível, sorteia (persona, ângulo) sem chamar `gerarAngulo`; se nenhuma tem, sorteia persona entre todas as ativas (ponderado por menos usada recentemente) e chama `gerarAngulo` com os ângulos usados dela.
- [ ] **Step 3:** Depois de criar a pauta (via `criarPautaDePersona`, Task 2), o retorno de `selecionarPauta` precisa ser idêntico em formato ao dos outros dois caminhos (`PautaCarregada`) — quem chama (`processar-pauta.ts`) não deve precisar saber qual dos três caminhos foi usado.
- [ ] **Step 4:** Ajustar `processar-pauta.ts` se a assinatura de `selecionarPauta` mudou (passar `propriedadeId`, que a função já recebe de `carregarPropriedade` antes de chamar o Estrategista).
- [ ] **Step 5:** Rodar a suíte completa do núcleo (`processar-pauta.test.ts` incluído) — os testes de publicação/reprovação/reclaim já existentes não podem quebrar.

---

### Task 5: Escritor — prompt recebe a persona

**Files:**
- Modify: `src/lib/marketing/escritor.ts`
- Modify: `src/lib/marketing/escritor.test.ts`
- Modify: `src/lib/marketing/processar-pauta.ts` (passar a persona pro Escritor)

**Interfaces:**
- `gerarConteudo(pauta: PautaCarregada, checklist: ItemChecklistCarregado[], persona: PersonaCarregada | null): Promise<{ resultado: ConteudoGerado; usage: UsageTokens }>` — parâmetro novo, `null` aceito pra não quebrar se um dia existir pauta sem persona (pauta manual, por exemplo).

- [ ] **Step 1: TDD.** `montarPrompt` ganha o bloco de persona (spec seção 7 tem o texto exato de referência) só quando `persona` não é `null` — teste confirma que o prompt inclui `persona.conteudoCompleto` quando fornecida, e que omite esse bloco quando `persona` é `null` (sem quebrar).
- [ ] **Step 2:** Em `processar-pauta.ts`, carregar a persona (`carregarPersona(pauta.personaId)`, Task 2) quando `pauta.personaId` existir, passar pro Escritor. Se `pauta.personaId` for `null` (pauta antiga/manual), passa `null`.
- [ ] **Step 3:** Rodar a suíte completa — o teste de regressão do Escritor com uma pauta que não tem persona precisa continuar passando (prompt sem o bloco novo, mesmo texto de antes).

---

### Task 6 (controller, não subagente): Importação das 75 personas

**Não despachar como task de implementador.** Executado pelo controller depois de:
1. Task 1 aplicada de verdade em produção (Luiz rodou no SQL Editor).
2. Uma propriedade `arrudacred.com.br` existir em `propriedades_digitais` (criar via tela ou script, se ainda não existir).

Passos:
- Ler o arquivo `.md` fornecido pelo Luiz (fora do repositório).
- Parsear conforme a spec seção 4 (delimitadores HTML, 11 blocos fixos, ângulos do Bloco 11 excluindo a linha "Evitar:").
- Inserir as 75 personas via `createAdminClient()` (escrita de dado de aplicação, não de schema — não esbarra na regra dura de migration).
- Confirmar por leitura direta: contagem = 75, uma amostra batendo com o arquivo original.
- Registrar no doc de coordenação e no status do Marketing.

---

## Pendências desta plan (fora do escopo deliberadamente)

- Tela de Personas da Fase 2 — decidir separadamente o que substitui o formulário de 8 campos (visualização/importação das 75, ou descontinuar a tela).
- Heurística de derivar `palavra_chave_principal`/`tipo_conteudo`/`funil` no caminho "ângulo pronto" sem IA — a Task 4 implementa isso com uma heurística simples (ex.: `palavra_chave_principal` derivada da `dor_entrada` da persona, `tipo_conteudo`/`funil` default configurável da propriedade); refinar depois com dados reais se necessário.
- Geografia continua null nas pautas geradas por persona (spec já registra isso como aceito).
