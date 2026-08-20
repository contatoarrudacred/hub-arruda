# Fase 4a+4b — Precisão Editorial e Imagens — Plano de Implementação

**Spec de referência:** `docs/superpowers/specs/2026-08-19-fase4-precisao-imagens-distribuicao-design.md` — todas as decisões de arquitetura já fechadas lá (schema, calibração, fornecedor, sequenciamento). Este plano só quebra em tasks executáveis.

**Coordenação entre agentes:** `docs/COORDENACAO_AGENTES_ARRUDACRED.md` — registrar a intenção deste plano lá (seção 3) antes de despachar a Task 1, mesma prática das fases anteriores.

**Escopo deste plano: só 4a (Revisor estendido + autoria + schema) e 4b (imagens).** 4c (distribuição multi-canal) fica de fora — bloqueada em credenciais de canal que ainda não existem (spec seção 5.3), sem valor em escrever código que não roda de verdade nem pode ser testado de ponta a ponta. Vira plano próprio quando a primeira credencial (GMB, provavelmente) for provisionada. 4d (atualizar posts existentes) nem é decisão tomada ainda — fica fora por completo.

---

## Architecture

Estende o núcleo já em produção sem tocar Estrategista, Agente de Links ou sanitização. Dois pontos de extensão: (1) o Revisor ganha três gates novos na mesma decisão que já existe, calibráveis por propriedade; (2) um passo novo entre "sanitizar" e "publicar" gera capa + imagens secundárias + schema estruturado antes do envio ao WordPress.

## Tech Stack

Mesmo padrão do resto do módulo pra tudo que é texto/visão — cliente Anthropic singleton por agente, TDD com mock do Supabase e do SDK da Anthropic. **Novo:** cliente OpenAI (`openai` npm package, a instalar) só pra geração de imagem (`gerador-imagem.ts`) — `OPENAI_API_KEY` já está configurada em `.env.local`, confirmado nesta sessão.

## Global Constraints

- **Regra dura de migration:** a Task 1 (única com migration) escreve o `.sql`, reserva o timestamp em `COORDENACAO_AGENTES_ARRUDACRED.md` seção 2, deixa recado na seção 3, e para — não aplica nada. As demais tasks são testáveis com mock, não dependem da migration estar aplicada.
- **A regra multiplicativa de aprovação não pode virar média.** `aprovado = (score >= 80) E precisao_factual_adequada E fontes_especificas E originalidade_adequada` (cada `checar*` desligado remove aquele fator da equação, nunca dilui o peso dos outros). Um score 95 com `precisao_factual_adequada: false` tem que reprovar — teste isso explicitamente.
- **Calibração é parâmetro fechado, não texto livre.** `scoreMinimoAprovacao`/`rigorYmyl`/`checar*`/`instrucoesAdicionais` vêm de `config_pipeline` (jsonb já existente, sem migration nova) — não criar mecanismo de edição de prompt.
- **Nenhuma mudança de comportamento nos caminhos que já existem** quando os campos de calibração/autoria/imagem estão ausentes (propriedades já em produção, criadas antes desta fase). Default de cada campo novo precisa preservar o comportamento atual — mesmo cuidado de regressão que a Fase 2/3 já tiveram com `config_pipeline`.
- **Imagem só é gerada depois do texto sanitizado e antes de publicar** — nunca antes da aprovação do Revisor (regra do Luiz, já confirmada 2x nesta sessão).
- **`OPENAI_API_KEY` ausente não pode derrubar o pipeline de texto.** Se a geração de imagem falhar (erro de API, chave ausente em algum ambiente), o post publica sem capa/secundárias — não bloqueia nem reprova o texto já aprovado. Log do erro, segue sem imagem.
- **Nomenclatura em português**, mesmo padrão do resto do módulo.

---

### Task 1: Migração — autoria de propriedade + colunas de imagem em `posts`

**Files:**
- Create: `supabase/migrations/<timestamp>_marketing_autoria_e_imagens.sql` (timestamp a reservar em `COORDENACAO_AGENTES_ARRUDACRED.md` seção 2 antes de escrever o arquivo)

**Interfaces:**
- Produces: `propriedades_digitais.autoria` (jsonb), `posts.imagem_destaque_alt`, `posts.imagem_destaque_slug`, `posts.imagens_secundarias` (jsonb) — nomes de coluna usados por todas as tasks seguintes.

- [ ] **Step 1:** Reservar o timestamp no doc de coordenação (status `Aguardando envio ao Luiz`) antes de escrever o arquivo.
- [ ] **Step 2:** Escrever a migração — `alter table propriedades_digitais add column autoria jsonb` (nullable, sem default — propriedade sem autoria configurada continua publicando) e as três colunas de `posts` (spec seção 4.1). `COMMENT ON COLUMN` em todas, seguindo o padrão de comentário já usado no resto do arquivo de núcleo (explicar o shape esperado do jsonb). Nenhum `drop`/`truncate`/`delete`.
- [ ] **Step 3:** Deixar recado na seção 3 do doc de coordenação (o que a migration faz, não-destrutiva, quais tasks dependem dela).
- [ ] **Step 4:** Não rodar nada contra o banco. Não regenerar `database.types.ts`.

---

### Task 2: Revisor estendido — gates de precisão + calibração + sugestão de correção

**Files:**
- Modify: `src/lib/marketing/revisor.ts`, `src/lib/marketing/revisor.test.ts`
- Modify: `src/lib/marketing/tipos.ts` (novos campos em `ResultadoRevisao`, `PropriedadeCarregada` ganha os campos de calibração)

**Interfaces:**
- `revisarConteudo(conteudo, checklist, propriedade: PropriedadeCarregada, postsRecentes: { titulo: string; angulo: string }[]): Promise<{ resultado: ResultadoRevisao; usage: UsageTokens }>` — ganha dois parâmetros novos. `ResultadoRevisao` ganha `precisaoFactualAdequada`, `fontesEspecificas`, `originalidadeAdequada` (todos `boolean`).
- `PropriedadeCarregada` ganha (todos opcionais, spec seção 3.1.1): `scoreMinimoAprovacao?: number`, `rigorYmyl?: "alto" | "medio" | "baixo" | "desativado"`, `checarPrecisaoFactual?: boolean`, `checarFontesEspecificas?: boolean`, `checarOriginalidade?: boolean`.

- [ ] **Step 1:** Ler `revisor.ts` inteiro primeiro — confirmar a assinatura exata atual e como `SCORE_MINIMO_APROVACAO` é usado hoje antes de qualquer mudança.
- [ ] **Step 2: TDD, nesta ordem:**
  1. Regressão — `propriedade` sem nenhum campo de calibração se comporta exatamente como hoje (score >= 80 aprova, sem os três gates novos bloqueando nada — porque não fazem parte do teste de regressão, e sim porque `checar*` ausente deve ser tratado como default `true`... **decisão explícita**: default de cada `checar*` é `true` (gate ativo por padrão, propriedade explicitamente desliga o que não quer) — o teste de regressão precisa então mockar o modelo retornando os três booleans como `true` também, senão reprovaria por padrão. Deixe claro no teste qual comportamento está sendo travado.
  2. `precisao_factual_adequada: false` reprova mesmo com `score: 95` (regra multiplicativa, não média).
  3. `checarOriginalidade: false` faz `originalidade_adequada: false` retornado pelo modelo **não** bloquear a aprovação — o gate simplesmente não entra na conta.
  4. `scoreMinimoAprovacao: 90` custom é respeitado (score 85 reprova, que aprovaria no default 80).
  5. `rigorYmyl` muda o texto do prompt enviado ao modelo (assert no prompt, não no resultado — os três valores "alto"/"baixo"/"desativado" produzem textos de instrução diferentes).
  6. Reprovado → `motivo` contém diagnóstico E sugestão de correção (teste de conteúdo específico no mock retornado, não só presença de string).
- [ ] **Step 3:** Implementar. `FERRAMENTA_REVISOR` (tool schema) ganha os três campos booleanos como `required`. Prompt interpola o texto de rigor a partir de `propriedade.rigorYmyl` (default `"medio"` se ausente) e inclui `postsRecentes` (títulos+ângulos) pro julgamento de originalidade. Instrução explícita pedindo sugestão de correção, não só diagnóstico, no `motivo`.
- [ ] **Step 4:** Lógica de aprovação: `aprovado = score >= scoreMinimoAprovacao && (!checarPrecisaoFactual || precisaoFactualAdequada) && (!checarFontesEspecificas || fontesEspecificas) && (!checarOriginalidade || originalidadeAdequada)` — cada `checar*` ausente trata como `true` (default).
- [ ] **Step 5:** Rodar a suíte completa — `processar-pauta.test.ts` precisa continuar passando (mocka `revisor.revisarConteudo` diretamente, então a mudança de assinatura deve ser invisível a esses testes — confirmar, não assumir).

---

### Task 3: Repositório — autoria de propriedade + calibração no `config_pipeline`

**Files:**
- Modify: `src/lib/marketing/repositorio.ts`, `src/lib/marketing/repositorio.test.ts`
- Modify: `src/lib/marketing/tipos.ts` (`PropriedadeAdmin` ganha `autoria`, `DadosPropriedade` ganha os campos de calibração pra tela salvar)

**Interfaces:**
- `carregarPropriedade` (usado pelo pipeline) passa a selecionar/mapear `autoria` e os campos de calibração do `config_pipeline` — mesmo padrão de `mapearConfigPipeline` já existente.
- Nova função: `carregarPostsRecentes(propriedadeId: string, limite: number): Promise<{ titulo: string; angulo: string }[]>` — ou reaproveitar `listarPostsPublicados` já existente (Fase 2 Task 11) se os campos já bastarem; **ler a função atual primeiro** antes de decidir se cria nova ou estende a existente.
- `salvarPropriedade` (Fase 2) ganha os campos de calibração no merge de `config_pipeline` (mesmo padrão de `max_tentativas`/`posts_por_dia` já implementado — merge, não substituição, pra não apagar `credenciais_canais` nem outras chaves).

- [ ] **Step 1:** Ler `carregarPropriedade`, `mapearConfigPipeline`, `salvarPropriedade` e `listarPostsPublicados` inteiros primeiro.
- [ ] **Step 2: TDD** — mapeamento de `autoria` (null quando ausente, objeto completo quando presente); mapeamento dos 5 campos de calibração com os defaults corretos quando ausentes (regressão: propriedade sem esses campos no `config_pipeline` continua funcionando); `salvarPropriedade` faz merge dos campos de calibração sem apagar `credenciais_canais`/`canais_distribuicao` (mesmo teste de não-regressão que já existe pra `max_tentativas`, estendido).
- [ ] **Step 3:** Implementar. Reaproveitar `listarPostsPublicados` se der (adicionar campo de retorno em vez de criar função nova, se o formato já for próximo do necessário).
- [ ] **Step 4:** Rodar a suíte completa.

---

### Task 4: Escritor — instruções adicionais por propriedade

**Files:**
- Modify: `src/lib/marketing/escritor.ts`, `src/lib/marketing/escritor.test.ts`

**Interfaces:**
- `gerarConteudo(pauta, checklist, persona, propriedade: PropriedadeCarregada)` — ganha o parâmetro `propriedade` (hoje não recebe nenhum). `montarPrompt` lê `propriedade.instrucoesAdicionais` (Task 3).

- [ ] **Step 1:** Ler `escritor.ts` e o call site em `processar-pauta.ts` (já tem `propriedade` carregada em escopo) antes de mudar a assinatura.
- [ ] **Step 2: TDD** — regressão: `propriedade.instrucoesAdicionais` ausente/vazio não adiciona bloco nenhum (prompt idêntico ao de antes desta task, mesmo padrão de teste exato já usado pros blocos de persona/motivo). Novo: `instrucoesAdicionais` presente aparece como bloco aditivo, sem reordenar o resto do prompt.
- [ ] **Step 3:** Implementar — mesmo padrão aditivo dos blocos de persona/motivo já existentes (`""`  quando ausente, filtrado por `.filter(Boolean)` já existente).
- [ ] **Step 4:** Atualizar o call site em `processar-pauta.ts` pra passar `propriedade`. Rodar a suíte completa.

---

### Task 5: Schema `Article`/`Organization`

**Files:**
- Create: `src/lib/marketing/schema-estruturado.ts`, `src/lib/marketing/schema-estruturado.test.ts`
- Modify: `src/lib/marketing/processar-pauta.ts`

**Interfaces:**
- `montarSchemaArticle(post: { titulo, slug, urlBase, imagemDestaqueUrl }, propriedade: { autoria, nome, urlBase }, datas: { publicadoEm, atualizadoEm }): string` — retorna o `<script type="application/ld+json">` pronto pra injetar no HTML, mesmo formato do `FAQPage` que o Escritor já embute.
- `montarSchemaOrganization(propriedade): string` — bloco fixo por propriedade.

- [ ] **Step 1:** Ler como o Escritor monta o `FAQPage` hoje (mesmo arquivo ou onde estiver) pra replicar o padrão de JSON-LD.
- [ ] **Step 2: TDD** — `propriedade.autoria` null produz schema válido sem o campo `author` (não quebra, só omite); presente produz o campo `author` com os dados corretos; datas formatadas em ISO 8601.
- [ ] **Step 3:** Implementar. Injeção no `processar-pauta.ts` acontece depois de sanitizar e antes de enviar ao WordPress (pode ser no mesmo passo da Task 11, decisão de sequenciamento final).
- [ ] **Step 4:** Rodar a suíte completa.

---

### Task 6: Revisor de imagem (módulo base, compartilhado)

**Files:**
- Create: `src/lib/marketing/imagens/revisor-imagem.ts`, `src/lib/marketing/imagens/revisor-imagem.test.ts`

**Interfaces:**
- `revisarImagem(imagemUrl: string, trechoFonte: string): Promise<{ resultado: { aprovada: boolean; motivo: string | null }; usage: UsageTokens }>` — Claude com visão, mesmo padrão de agente do resto do módulo (`obterCliente()`, `tool_choice` forçado).

- [ ] **Step 1:** Ler `revisor.ts` e `escritor.ts` como referência de padrão (cliente singleton, ferramenta forçada, validação de campo obrigatório) — este é o primeiro agente do módulo com input de imagem (`content` multimodal na chamada da Anthropic), confirmar a sintaxe exata do SDK pra imagem antes de escrever.
- [ ] **Step 2: TDD** — imagem aprovada retorna `motivo: null`; imagem reprovada por alucinação retorna motivo específico mencionando o que não está sustentado pelo `trechoFonte`; erro de rede/API lança, não engole silenciosamente (mesmo padrão dos outros agentes).
- [ ] **Step 3:** Implementar. Prompt foca explicitamente em alucinação (número/prazo/afirmação/relação que o `trechoFonte` não sustenta) como critério principal — spec seção 4.4.
- [ ] **Step 4:** Rodar a suíte completa.

---

### Task 7: Capa — 5 etapas + metadados

**Files:**
- Create: `src/lib/marketing/imagens/capa.ts`, `src/lib/marketing/imagens/capa.test.ts`
- Create: `src/lib/marketing/imagens/gerador-imagem-openai.ts` (cliente OpenAI, thin wrapper — usado também pela Task 8)
- Modify: `package.json` (dependência `openai`)

**Interfaces:**
- `gerarCapa(pauta: PautaCarregada, conteudo: ConteudoGerado, persona: PersonaCarregada | null): Promise<{ resultado: { url, alt, slug, titulo } | null; usage: UsageTokens }>` — `null` quando a geração falha (Global Constraints: não derruba o pipeline).
- `gerarImagemOpenAI(prompt: string, formato: "16:9"): Promise<{ url: string; usage: { custoUsd: number } }>` — wrapper isolado, testável com mock, reaproveitado pela Task 8.

- [ ] **Step 1:** Ler as duas specs de imagem (`docs/insumos-externos/especificacao_automacao_capa_post_persona.md`) e o padrão de agente do módulo antes de escrever.
- [ ] **Step 2: TDD** — cada uma das 5 etapas testável isoladamente (resumo do post, resumo da persona, cruzamento+prompt, geração mockada, revisor de imagem — Task 6 — reprovando e disparando nova geração até o limite de tentativas, spec seção 4.4/8, sugestão: 2). Falha da API OpenAI retorna `null` em vez de lançar (Global Constraint).
- [ ] **Step 3:** Implementar seguindo a spec como está — sem se afastar do "Regra final" (1 emoção, 1 conflito, 1 momento, 1 ambiente) nem dos clichês visuais a evitar (spec seção 7 do documento de capa).
- [ ] **Step 4:** Metadados (ALT/slug/title) derivados do mesmo material usado pra gerar a imagem (spec seção 4.5) — mesma chamada do revisor de imagem ou uma chamada de texto simples logo depois, decisão de implementação.
- [ ] **Step 5:** Rodar a suíte completa. `npx tsc --noEmit`/`eslint` limpos (dependência nova instalada corretamente).

---

### Task 8: Imagens secundárias — 0 a 3 + metadados

**Files:**
- Create: `src/lib/marketing/imagens/secundarias.ts`, `src/lib/marketing/imagens/secundarias.test.ts`

**Interfaces:**
- `gerarImagensSecundarias(conteudo: ConteudoGerado): Promise<{ resultado: Array<{ url, alt, slug, titulo, legenda, posicaoAposSecao }>; usage: UsageTokens }>` — array vazio é resultado válido e esperado (spec seção 4.3).

- [ ] **Step 1:** Ler `docs/insumos-externos/especificacao_automacao_imagens_secundarias_post.md` inteira antes de escrever — filtro de aprovação é rígido (nota ≥ 30/40 E ganho de compreensão ≥ 8/10), não afrouxar pra "conseguir gerar alguma imagem".
- [ ] **Step 2: TDD** — zero oportunidades aprovadas retorna array vazio sem chamar geração de imagem nenhuma vez; até 3 aprovadas geram uma imagem cada, cada uma passando pelo revisor de imagem (Task 6) com o `trechoFonte` específico daquela oportunidade (banco fechado); nota abaixo do limiar é descartada mesmo que o modelo tenha proposto.
- [ ] **Step 3:** Implementar. Reaproveita `gerarImagemOpenAI` (Task 7) e `revisarImagem` (Task 6).
- [ ] **Step 4:** Legenda (`<figcaption>`) e posição de inserção fazem parte do retorno — a inserção real no HTML é responsabilidade da Task 11 (sequenciamento), esta task só produz os dados.
- [ ] **Step 5:** Rodar a suíte completa.

---

### Task 9: Adaptador WordPress — upload de mídia

**Files:**
- Modify: `src/lib/marketing/canais/wordpress.ts`, `src/lib/marketing/canais/wordpress.test.ts`

**Interfaces:**
- `enviarMidia(imagemUrl: string, nomeArquivo: string, altText: string): Promise<{ idRemoto: string; url: string }>` — baixa a imagem gerada (URL da OpenAI) e sobe pro WordPress via `POST /wp/v2/media`, mesma autenticação já usada.
- `criarRascunho` ganha parâmetro opcional `imagemDestacadaId?: string` — seta `featured_media` no payload existente.

- [ ] **Step 1:** Ler `wordpress.ts` inteiro — confirmar exatamente como a autenticação/REST call de `criarRascunho` funciona hoje antes de replicar o padrão pro endpoint de mídia.
- [ ] **Step 2: TDD** — `enviarMidia` mockado (fetch/REST), retorna `idRemoto`/`url` corretos; `criarRascunho` sem `imagemDestacadaId` continua funcionando exatamente como hoje (regressão); com o parâmetro, `featured_media` aparece no payload enviado.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar a suíte completa.

---

### Task 10: Sequenciamento — junta tudo em `processar-pauta.ts`

**Files:**
- Modify: `src/lib/marketing/processar-pauta.ts`, `src/lib/marketing/processar-pauta.test.ts`

**Interfaces:**
- Nenhuma interface nova — este task só conecta as peças já construídas (Tasks 5, 7, 8, 9) na ordem certa.

- [ ] **Step 1:** Ler o estado atual de `processar-pauta.ts` (já modificado por todas as tasks anteriores que tocaram nele — 3, 4, 5) antes de adicionar o passo de imagens.
- [ ] **Step 2: TDD** — ordem exata: sanitizar → gerarCapa (Task 7) → gerarImagensSecundarias (Task 8) → montarSchemaArticle (Task 5, usando `post.imagemDestaqueUrl` já definido) → enviarMidia (Task 9) → criarRascunho com `imagemDestacadaId` e HTML com secundárias+schema embutidos → publica. Falha em qualquer etapa de imagem (Task 7/8 retornando `null`/vazio, ou Task 9 falhando) **não** reprova nem bloqueia o post — publica sem a imagem que falhou, log do que faltou.
- [ ] **Step 3:** Regressão — todos os cenários já testados de `processarProximaPauta` (publicação com sucesso, reprovação, WordPress rejeitando, reclaim, bloqueio por tentativas) continuam passando. Mock de `gerarCapa`/`gerarImagensSecundarias`/`enviarMidia` nos testes existentes que chegam até "publicar", mesmo padrão de `beforeEach` já usado pra `salvarRascunho` (Fase 3).
- [ ] **Step 4:** Implementar. `registrarEtapa` novo (`gerar_imagens` ou similar) instrumentando o passo — mesmo padrão do resto do pipeline, alimenta Monitor/Painel de Custo.
- [ ] **Step 5:** Rodar a suíte completa. `npx tsc --noEmit`, `eslint`, `next build` limpos.

---

## Fora deste plano

**Fase 4c (distribuição multi-canal):** vira plano próprio quando a primeira credencial de canal (GMB, Meta, LinkedIn, Pinterest ou Medium) for provisionada pelo Luiz — spec seção 5.3 já desenhada, só falta o gatilho real pra tornar as tasks testáveis de ponta a ponta.

**Fase 4d (atualizar posts existentes):** nem é decisão tomada — fica registrada só como pendência em `MODULO_MARKETING_CONTEUDO_ARRUDACRED.md`, sem plano.
