# Fase 4 — Precisão Editorial, Imagens e Distribuição — Design de Implementação

**Data:** 19/08/2026
**Status:** Spec para revisão com Luiz antes de virar plano de implementação.
**Documentos irmãos:**
- `docs/insumos-externos/auditoria_seo_aeo_geo_llm_post.md` — auditoria real de uma amostra do pipeline, base da seção 3 (4a).
- `docs/insumos-externos/especificacao_automacao_capa_post_persona.md` e `especificacao_automacao_imagens_secundarias_post.md` — specs prontas, base da seção 4 (4b).
- `docs/MODULO_MARKETING_CONTEUDO_ARRUDACRED.md` seção 3.3 — desenho original da distribuição multi-canal (estágio 4, nunca construído), base da seção 5 (4c).
- Fluxo visual completo, validado pelo Luiz: [claude.ai/code/artifact/48dcf7b3-1b5c-45c9-96b5-28ac4bc8aef0](https://claude.ai/code/artifact/48dcf7b3-1b5c-45c9-96b5-28ac4bc8aef0)

---

## 1. Objetivo

Fechar as três lacunas encontradas ao validar o pipeline de personas ricas (Fase 3) com publicação real em 19/08/2026:

- **4a — o Revisor aprova conteúdo com risco real** (afirmação jurídica confusa, fonte genérica) porque hoje só pontua contra o checklist estrutural (H1, palavras, FAQ), sem dimensão de precisão factual/confiança. Quando reprova, não dá direção de correção.
- **4b — nenhuma imagem é gerada.** `posts.imagem_destaque_url` existe desde o núcleo, mas nunca foi preenchido — o campo ficou reservado, esperando esta fase.
- **4c — nada é distribuído além do WordPress.** `posts.canais` é `jsonb` desde o núcleo, comentado como "só wordpress é escrito nesta fase; as demais chaves são da fase de distribuição multi-canal" — esta é essa fase.

**Fora de escopo desta spec:** geração de vídeo/avatares (Motor 3, seção 4 do doc mestre), Construtor de Matriz de Conteúdo, canais que exigem curadoria humana (Quora, Reddit, HARO Brasil).

---

## 2. O que muda e o que não muda

**Não muda:** Estrategista, Escritor (ganha só a leitura de `propriedade.autoria` no momento de montar o schema, não no prompt de geração), Agente de Links, sanitização, circuit breaker de tentativas — tudo que já roda continua rodando exatamente como está.

**Muda:**
- **Revisor** (`src/lib/marketing/revisor.ts`) — ganha três novas dimensões de julgamento na mesma chamada/decisão que já existe (não é uma etapa nova), e passa a incluir uma sugestão de correção no motivo de reprovação.
- **`propriedades_digitais`** — ganha coluna de autoria (migration).
- **`posts`** — ganha colunas de metadados de imagem e alimenta de verdade `imagem_destaque_url`/`canais` que já existiam vazios (migration).
- **Pipeline** (`processar-pauta.ts`) — ganha um passo novo entre "sanitizar" e "publicar" (geração de imagens, 4b) e um schema `Article`/`Organization` injetado antes de publicar (4a).
- **Adaptador WordPress** — ganha upload de mídia (não existe nenhuma linha de código pra isso hoje).
- **Novo: estágio de distribuição** — roda separado do pipeline de geração, disparado por um segundo cron, sobre posts já publicados (4c).

---

## 3. Fase 4a — Revisor estendido

### 3.1 Três dimensões novas, mesma decisão

`FERRAMENTA_REVISOR` (`revisor.ts`) ganha três campos booleanos obrigatórios, além de `score`/`motivo` que já existem:

```typescript
precisao_factual_adequada: boolean;  // false se alguma afirmação jurídica/financeira sensível carece de sustentação ou está tecnicamente incorreta
fontes_especificas: boolean;         // false se alguma fonte citada aponta pra homepage genérica em vez de página/documento específico
originalidade_adequada: boolean;     // false se, removendo persona e palavra-chave, o post for essencialmente igual a outro já publicado
```

**Regra de aprovação (multiplicativa, não média):**

```
aprovado = (score >= 80) E precisao_factual_adequada E fontes_especificas E originalidade_adequada
```

Qualquer um `false` reprova sozinho, mesmo com score 95 — implementa direto a fórmula da auditoria (seção 24: "SEO BOM + ... + INFORMAÇÃO FACTUALMENTE SEGURA + FONTES ADEQUADAS + ... = PUBLICÁVEL", qualquer ausência vira "REVISÃO NECESSÁRIA").

**Contexto novo no prompt do Revisor:** pra julgar `originalidade_adequada`, precisa ver do que os outros posts já publicados da propriedade tratam — títulos e ângulos dos últimos ~10 posts publicados (`listarPostsPublicados`, já existe, Fase 2 Task 11), não o conteúdo inteiro. Rigor proporcional ao nicho: pesado em financeiro/saúde (YMYL), leve em decoração — como isso se calibra por propriedade fica pro plano detalhar (ex.: flag `ativo`/peso por dimensão no checklist, mesmo padrão de `checklist_qa_itens.peso`).

### 3.2 Sugestão de correção

`motivo` (campo que já existe, já é lido pelo Escritor na próxima tentativa — Fase 3) passa a, quando reprovado, conter **diagnóstico + sugestão concreta de correção** numa string só — sem coluna nova, sem mudança de mapeamento. Instrução no prompt do Revisor: "aponte especificamente o que corrigir, não só o que está errado — o texto vai ser usado tanto por um Escritor automático quanto por um humano revisando manualmente."

Nenhuma mudança em `processar-pauta.ts` nem em `escritor.ts` — o mecanismo de reprovação → `motivo_ultima_reprovacao` → retry com rascunho anterior já existe (Fase 3, 19/08/2026) e passa a receber um texto mais útil, de graça.

### 3.3 Autoria via cadastro de Propriedade

**Migration nova:** `propriedades_digitais` ganha `autoria jsonb` — `{nome, foto_url, bio, especialidade, empresa, credenciais: string[], perfis_profissionais: string[]}`, nullable (propriedade sem autoria configurada não bloqueia publicação, só fica sem os dados de E-E-A-T no schema). Mesma convenção de `config_pipeline`/`credenciais_canais` (jsonb livre, não tabela própria — não há necessidade de múltiplos autores por propriedade nesta fase).

**Tela Propriedades Digitais** (Fase 2, já existe) ganha os campos de autoria no formulário — trabalho de UI, não de pipeline.

**Sem mudança no Escritor** — autoria não influencia o texto gerado, só é usada no momento de montar o schema estruturado (seção 3.4).

### 3.4 Dados estruturados `Article`/`Organization`

Novo passo entre "sanitizar" e "publicar" (`processar-pauta.ts`): monta o JSON-LD `Article` (headline, image, datePublished, dateModified, author vindo de `propriedade.autoria`, publisher) e injeta no HTML antes do envio ao WordPress — mesmo mecanismo que o Escritor já usa pra `FAQPage` (script `application/ld+json` embutido no corpo), só que montado pelo controller do pipeline, não pelo Escritor, porque author/datas só existem neste ponto. `Organization` (dados da propriedade/ArrudaCred) pode ser um bloco fixo por propriedade, montado uma vez, reaproveitado em todo post dela.

---

## 4. Fase 4b — Geração de imagens

Roda **depois** de "sanitizar" e **antes** de "publicar" — só com o texto final fechado (link, HTML sanitizado, tudo definido), nunca antes.

### 4.1 Modelo de dados

**Migration nova**, `posts` ganha:

```sql
alter table posts add column imagem_destaque_alt text;
alter table posts add column imagem_destaque_slug text;
alter table posts add column imagens_secundarias jsonb not null default '[]'::jsonb;
```

`imagem_destaque_url` **já existe** desde o núcleo (17/08/2026), nunca foi escrito — esta fase é quem passa a preenchê-lo. `imagens_secundarias`: array de `{url, alt, slug, titulo, legenda, posicao_apos_secao}`.

### 4.2 Capa — 5 etapas (spec pronta, seguir como está)

`src/lib/marketing/imagens/capa.ts`, orquestrando:
1. Resumo estratégico do post (Claude) — assunto, promessa, conflito, emoções de entrada/saída, situações visualizáveis, gancho de curiosidade.
2. Resumo psicológico-visual da persona (Claude) — reaproveita `persona.conteudoCompleto`, já carregada pra pauta.
3. Cruzamento — título + resumo 1 + resumo 2 → uma cena só (Claude).
4. Prompt final da imagem (Claude, segue a "Regra final" da spec: 1 emoção, 1 conflito, 1 momento, 1 ambiente).
5. Geração (OpenAI GPT Image 2, 16:9, ver seção 4.8) + revisor de imagem (seção 4.4).

### 4.3 Imagens secundárias — 0 a 3 (spec pronta, seguir como está)

`src/lib/marketing/imagens/secundarias.ts`:
1. Identificação de oportunidades (Claude, sobre o post inteiro — não a persona) — nota ≥ 30/40 e ganho de compreensão ≥ 8/10, zero é resposta válida e esperada.
2. Por oportunidade aprovada: geração (OpenAI, trecho-fonte como "banco fechado" — só o que está literalmente no texto) + revisor de imagem.

### 4.4 Revisor de imagem (novo, pedido do Luiz 19/08/2026)

`src/lib/marketing/imagens/revisor-imagem.ts`, compartilhado por capa e secundárias — Claude com visão (`gerarConteudo`/`revisarConteudo` já são o padrão de agente deste módulo, mesma estrutura, `tool_choice` forçado). Recebe a imagem gerada + o trecho-fonte (post inteiro pra capa, trecho específico pra secundária) e valida:

- **Foco principal (pedido explícito do Luiz):** alucinação — a imagem contém número, prazo, afirmação ou relação que o texto não sustenta?
- Fidelidade ao trecho-fonte (nada fora do "banco fechado" das duas specs).
- Qualidade/design básica (texto em português correto, sem elemento deformado).

Reprovada → regenera com o motivo específico (mesmo padrão de revisão do texto, seção 3.2) — até um limite de tentativas a definir no plano (sugestão: 2, menor que o do texto, pra não estourar custo).

### 4.5 Metadados de imagem (gap achado pelo Luiz, nenhuma das specs cobria)

Pra cada imagem aprovada (capa e secundárias):
- **ALT text** — derivado do mesmo trecho-fonte usado pra gerar a imagem, nunca inventado à parte (mesmo princípio de banco fechado).
- **Slug de arquivo** — kebab-case, com palavra-chave, não hash aleatório.
- **Title attribute.**
- **Legenda visível** (`<figcaption>`) — só nas secundárias, inserida no HTML na `posicao_apos_secao` indicada.

Gerados na mesma chamada do revisor de imagem (seção 4.4) ou numa chamada de texto simples logo depois — decisão de implementação, sem custo relevante de qualquer jeito (é texto curto).

### 4.6 Upload de mídia no Adaptador WordPress

`src/lib/marketing/canais/wordpress.ts` ganha `enviarMidia(imagemBuffer, nomeArquivo, altText): Promise<{ idRemoto, url }>` — `POST /wp/v2/media` (REST API, mesma autenticação já usada). `criarRascunho` ganha parâmetro opcional `imagemDestacadaId` (seta como `featured_media`). Imagens secundárias entram como `<img>` com `<figure>`/`<figcaption>` diretamente no HTML sanitizado, mesma mecânica de link já usada pelo Agente de Links.

### 4.7 Sequenciamento no pipeline

```
Revisor aprova → Agente de Links → Sanitiza → [4b: capa + secundárias] → [4a: schema Article/Organization] → WordPress (upload mídia → cria rascunho com featured_media → verifica → publica)
```

### 4.8 Fornecedor e custo (decidido 19/08/2026)

Claude Sonnet 5 pra todo raciocínio em texto/visão (resumos, cruzamento, revisor de imagem — mesmo modelo do resto do pipeline). OpenAI GPT Image 2 só pra gerar os pixels (Anthropic não tem modelo de imagem). Estimativa: ~R$3,85/post em qualidade alta ou ~R$1,27/post em qualidade média pra capa + 3 secundárias (teto — a maioria deve sair com 0-1 secundária aprovada dado o filtro rígido). Câmbio e preços de API mudam — reconferir antes de orçar de verdade. Nova env var: `OPENAI_API_KEY`.

---

## 5. Fase 4c — Distribuição multi-canal

Retoma o "estágio 4" do desenho original (17/08/2026) — nunca construído na Fase 1. Roda **separado** do pipeline de geração (`processarProximaPauta`), como um segundo cron, sobre posts com `status = 'publicado'` cuja entrada em `canais` pro canal ainda não existe — falha de distribuição não deve contar tentativa nem afetar o circuit breaker do texto, são preocupações independentes.

### 5.1 Dois padrões de conteúdo (já mapeados, seção 3.3 do doc mestre)

**Resumo + CTA + imagem recortada** (não gera imagem nova — redimensiona a capa já aprovada):

| Canal | Formato de imagem |
|---|---|
| Google Meu Negócio | 1200×900 (4:3) |
| Instagram (feed) | 1080×1080 ou 1080×1350 |
| Facebook | 1200×630 |
| LinkedIn (post) | 1200×627 |
| Pinterest | 1000×1500 |
| YouTube | — (só sincroniza descrição quando existe vídeo relacionado, sem imagem) |

**Republicação integral com `canonical`** (artigo inteiro, não resumo): Medium, LinkedIn Articles.

**Fora do pipeline automático** (decisão de escopo já registrada): Quora, Reddit, HARO Brasil.

### 5.2 Adaptadores por canal

`src/lib/marketing/canais/`, mesmo padrão do WordPress (camada fina traduzindo formato canal-agnóstico pra API do provedor): `gmb.ts`, `meta.ts` (Facebook + Instagram, mesma Graph API), `linkedin.ts`, `pinterest.ts`, `medium.ts`. Recorte de imagem: processamento determinístico (biblioteca de imagem server-side, não geração nova) a partir da capa já aprovada em 4b.

### 5.3 Sequenciamento e gating de credenciais

**Bloqueado por canal, não pela fase inteira** — a maioria das credenciais (seção 8 do doc mestre) ainda não foi provisionada. O plano de implementação deve sequenciar pela credencial que existir primeiro, não tentar os 6+ canais de uma vez. Um canal sem credencial simplesmente não roda (log, sem erro fatal) — não bloqueia os outros nem o pipeline de geração.

---

## 6. Segurança / RLS

Mesmo padrão do resto do módulo — `admin_acesso_total` + `fn_auditoria_log()` nas colunas/tabelas novas. Credenciais de canal novo (GMB, Meta, LinkedIn, Pinterest, Medium) seguem o mesmo mecanismo cifrado já usado pro WordPress (`credenciais_canais`, `criptografia.ts`) — sem invenção de mecanismo novo.

---

## 7. Plano de testes

- **Revisor (4a):** unitário — score alto + `precisao_factual_adequada: false` reprova mesmo assim; `motivo` contém sugestão, não só diagnóstico (assert de conteúdo, não só presença); regressão dos testes já existentes do Revisor (score/motivo simples).
- **Autoria (4a):** unitário — `propriedade.autoria` null não quebra a montagem do schema (propriedade sem autor configurado ainda publica, só sem o campo `author`).
- **Geração de imagem (4b):** mockar a chamada OpenAI nos testes (mesmo padrão de mockar Anthropic já usado no resto do módulo) — sem gastar de verdade em CI. Teste de integração real (1 chamada de verdade) fica pro controller rodar manualmente, mesmo padrão do teste end-to-end da Fase 3.
- **Revisor de imagem:** unitário — imagem reprovada por alucinação regenera com motivo específico; limite de tentativas de imagem respeitado.
- **Upload de mídia WordPress:** unitário — `enviarMidia` mockado, `criarRascunho` recebe `featured_media` correto.
- **Distribuição (4c):** unitário por adaptador, mockando a API do canal. Sem teste de integração real até a primeira credencial ser provisionada.

---

## 8. Pendências desta spec

- **Peso do rigor YMYL por propriedade** — como calibrar "pesado em financeiro/saúde, leve em decoração" fica pro plano detalhar (sugestão: reaproveitar o padrão de peso do `checklist_qa_itens`, seção 3.1).
- **Limite de tentativas de imagem** — sugerido 2 (menor que o do texto), decisão final fica pro plano.
- **Onde a distribuição roda** — proposto como cron separado (seção 5); alternativa seria disparar no mesmo tick logo após publicar. Fica pro plano decidir com base em como o Vercel/cron-job.org já está configurado hoje.
- **Sequenciamento de execução** — dado o tamanho (3 sub-fases bem diferentes tecnicamente), o plano de implementação deve considerar se executa 4a → 4b → 4c em sequência ou se paraleliza 4a (mais contido, resolve risco real hoje) enquanto 4c aguarda credenciais.
