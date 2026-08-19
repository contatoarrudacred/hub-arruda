# Módulo Marketing — Pipeline de Conteúdo Multi-Site
**Status:** Terceira versão, 18/08/2026 — Fase 1 (núcleo do pipeline: 4 agentes + Agente de Links) construída, testada e revisada (ver `docs/superpowers/plans/2026-08-17-pipeline-conteudo-marketing-nucleo.md`). Sessão de 18/08/2026 fecha o escopo da Fase 2 (telas de admin): inventário de telas (seção 7), cadastro de personas via formulário em vez de esperar o Construtor de Matriz (seção 6.2), cota diária/janela de publicação (seção 7.1), monitor de execução ao vivo via Supabase Realtime (seção 7.2), e credenciais de canal cifradas no banco (seção 8). Segunda versão (17/08/2026): generaliza os catálogos de conteúdo (ângulos/checklist/formatos) pra funcionar em qualquer propriedade, fecha a divisão de sites por persona (resolvendo risco de doorway/duplicidade), detalha canais de distribuição. Primeira versão (12/08/2026) absorvia o escopo que estava sob responsabilidade da QMARKA (empresa que não vai conseguir entregar o projeto, conforme Luiz).
**Fontes:** `ArrudaCred_Plano_Estrategico_2026-2031-Crescimento-Organico.pdf` e `Plano_Estrategico_Marketing_ArrudaCred.pdf` (ambos de Luiz, lidos por completo em 17/08/2026), adaptados e generalizados para caber neste sistema.

> ⚠️ **Regra de precedência entre documentos:** onde este documento (ou qualquer outro já registrado) conflitar com os PDFs originais da QMARKA, **este documento prevalece** — os PDFs viraram material de referência histórica, não fonte de verdade viva. Exemplo já resolvido: tabela de preços do PDF está desatualizada, a válida é a de `SCRIPT_LIMPANOME_SERASA_SPC.md`.

> 🔴 **Achado de segurança (17/08/2026):** a seção 18 do PDF `ArrudaCred_Plano_Estrategico_2026-2031-Crescimento-Organico.pdf` contém credenciais reais em texto plano (URL do painel WordPress, e-mail da conta de serviço Google, nome do arquivo de credenciais JSON, IDs de GA4/GTM/Pixel). O próprio PDF já se rotula confidencial. **Pendente de ação manual de Luiz:** trocar a senha do usuário `claude-auditoria` do WordPress.

---

## 1. Contexto e decisão estratégica de posicionamento

A ArrudaCred está em transição de posicionamento: de "empresa de limpa-nome que também oferece crédito" para **"empresa de produtos financeiros e investimentos (crédito, consórcio, alavancagem patrimonial, cartas contempladas) que também limpa nome"**. Essa transição precisa acontecer **sem perder o tráfego orgânico que já funciona bem para limpa-nome** — que hoje é o motor de receita que sustenta a operação durante a transição (decisão de Luiz, seção 5 do plano mestre: prioridade de construção continua sendo Comercial/Limpa Nome).

**Decisão de conteúdo — DECIDIDO em 17/08/2026 (substitui a decisão de 12/08/2026):** em vez de a própria arrudacred.com.br passar a cobrir consórcio/investimento, essa frente nasce em **dois sites satélite dedicados, cada um com uma persona própria**:

- **vozdocredito.com.br** — persona **consumidor**: quer fazer consórcio para consumir/usufruir do bem (ex.: comprar um carro ou imóvel para uso próprio).
- **autoridadefinanceira.com.br** — persona **investidor**: busca alavancagem patrimonial — comprar imóvel via consórcio e deixar o investimento se pagar sozinho com a locação.
- **arrudacred.com.br** fica **só com Limpa Nome por enquanto** — sem conteúdo de consórcio/investimento, decisão explícita de Luiz (17/08/2026) para evitar sobreposição de intenção de busca entre os três sites.

### 1.1 Por que essa divisão importa — risco de doorway pages / scaled content abuse

Multiplicar sites sobre o mesmo assunto guarda-chuva, mesmo com texto reescrito de formas diferentes, esbarra em duas políticas do Google:
- **Doorway pages** — o critério não é "o texto é idêntico", é "o usuário ficaria igualmente satisfeito em qualquer um dos sites, e todos levam pro mesmo lugar". Variar ângulo/formato/linguagem não resolve isso sozinho se o propósito de fundo for o mesmo.
- **Scaled content abuse** (política de spam atualizada em 2024) — mira produção em massa de conteúdo com o propósito primário de manipular ranking, especialmente em rede de sites com propriedade comum.

**O que resolve de verdade:** persona genuinamente diferente por site (consumidor vs. investidor vs. recuperação de crédito) — intenção de busca, profundidade e jornada realmente distintas, não just conteúdo reescrito. Com arrudacred.com.br fora do consórcio, os três sites não competem entre si. Ter propriedade comum entre eles **não é**, sozinho, contra as políticas do Google — só é risco quando combinado com conteúdo/propósito interchangeável.

**Infraestrutura por site (decidido 17/08/2026):** cada site precisa de **Pixel do Meta próprio, propriedade GA4 própria e container GTM próprio** (evita expor um ID de rastreamento compartilhado publicamente, que é uma forma comum de descobrir rede de sites). Todos os GA4 podem — e devem — ficar sob a **mesma conta** GA4 (conveniência administrativa, sem risco: a conta é um agrupamento interno, não gera ID público compartilhado entre domínios). Search Console já é por domínio automaticamente, sem decisão a tomar.

> **Se, no futuro, a arrudacred.com.br voltar a cobrir consórcio/investimento** (ou qualquer propriedade nova entrar no mesmo nicho de outra já existente), reabrir o mecanismo de `GRUPO_TEMATICO` descrito na seção 2.1 — hoje não é necessário porque não há sobreposição de persona entre nenhuma propriedade conhecida.

**Sem sobreposição alguma (não precisam de nenhuma regra especial):** Aetria (mundo musical), decoração de festas (mãe de Luiz), consultório odontológico (irmão de Luiz) — nichos totalmente distintos entre si e dos três acima.

**Pendência real, não posso resolver sozinho:** vozdocredito.com.br e autoridadefinanceira.com.br ainda não têm matriz de conteúdo (temas/ângulos/geografias) — precisam de pesquisa de palavra-chave real, feita pelo **Construtor de Matriz de Conteúdo** (seção 6) junto com Luiz.

---

## 2. Arquitetura de dados — generalizada para multi-site desde o início

Desenhado multi-site **desde já** (não um produto único generalizado depois), porque Luiz já confirmou a intenção comercial: começa ajudando a mãe (decoração) e o irmão (clínica odontológica), com potencial real de virar produto comercializável como nova unidade de negócio depois de validado internamente.

### Entidades principais

- **PROPRIEDADES_DIGITAIS** — cada site atendido. Campos: `id`, `pessoa_id` (FK — o "dono": uma unidade de negócio do próprio grupo, **ou** uma Pessoa/Cliente externa contratando o serviço), `unidade_negocio_id` (FK, nullable — preenchido só quando a propriedade é do próprio grupo), `nome`, `url_base`, `tipo_cms` (`wordpress`, outros no futuro), `ativo`, `config_pipeline` (jsonb — `max_tentativas` de regeneração, lista de `canais_distribuicao` ativos), `created_at`, `updated_at`.
  - Propriedades conhecidas hoje: `arrudacred.com.br` (Limpa Nome), `vozdocredito.com.br` (consórcio/consumidor), `autoridadefinanceira.com.br` (consórcio/investidor), Aetria, decoração (mãe), clínica odontológica (irmão) — os três últimos sem conflito de conteúdo com qualquer outro.
- **MATRIZES_CONTEUDO** — os eixos de conteúdo por propriedade, **configuráveis** (a clínica odontológica não precisa de eixo "geografia" com 27 cidades, por exemplo). Campos: `id`, `propriedade_id` (FK), `nome` (ex.: "Matriz Limpa Nome"), `eixos` (`jsonb` — `{"temas": [...], "angulos": [...], "geografias": [...] | null, "sazonalidade": [...]}`).
  - Uma propriedade pode ter mais de uma matriz ativa (não é o caso hoje depois da divisão por site, mas a estrutura permanece — útil se um site crescer para múltiplas frentes distintas no futuro).
- **PAUTAS** — fila gerada pelo Agente Estrategista. Campos: `id`, `matriz_conteudo_id` (FK), `palavra_chave_principal`, `palavras_secundarias` (jsonb), `angulo`, `geografia` (nullable), `tipo_conteudo` (ver catálogo de formatos, seção 5.3), `funil` (topo/meio/fundo), `status` (`pendente`, `em_producao`, `publicado`, `rejeitado`), `tentativas`, `motivo_ultima_reprovacao`, `prioridade_score`, `created_at`.
- **POSTS** — rascunhos e publicados. Campos: `id`, `pauta_id` (FK), `propriedade_id` (FK), `titulo`, `conteudo_html`, `meta_title`, `meta_description`, `slug`, `imagem_destaque_url`, `score_qa`, `status`, `canais` (jsonb — estado por plataforma: `{"wordpress": {"rascunho_id", "status", "url"}, "gmb": {...}, "instagram": {...}, "facebook": {...}, "linkedin": {...}, "pinterest": {...}, "medium": {...}}`), `publicado_em`, `atualizado_em`.
- **CHECKLIST_QA_ITENS** — padrão de qualidade obrigatório, configurável por propriedade (catálogo padrão na seção 5.2, com 1 item ajustável por nicho). Campos: `id`, `propriedade_id` (FK), `item`, `peso`, `ativo`.
- **PROSPECTS_BACKLINK** — pipeline do Agente de Backlinks (fora do escopo dos 4 agentes de conteúdo — mantém aprovação humana obrigatória, sem mudança). Campos: `id`, `propriedade_id` (FK), `dominio`, `da_estimado`, `status` (`prospectado`, `email_enviado`, `respondido`, `link_conquistado`), `email_enviado_texto`, `created_at`.

### 2.1 Diferenciação cruzada entre propriedades (opção documentada, não ativa hoje)

Se no futuro duas propriedades passarem a competir pelo mesmo assunto/persona, reabrir esta seção: criar uma entidade `GRUPOS_TEMATICOS` ligando as propriedades que compartilham intenção de busca; o Estrategista passaria a consultar publicações de todas as propriedades do grupo antes de gerar uma pauta nova, nunca repetindo a combinação ângulo+formato já usada por outra propriedade do mesmo grupo, e cada propriedade do grupo receberia uma identidade editorial fixa e distinta (tom, profundidade, formato predominante). **Não implementar agora** — nenhuma propriedade conhecida precisa disso.

---

## 3. Pipeline de agentes — sem humano no loop

**Decisão de Luiz (17/08/2026): o pipeline roda sem depender de aprovação humana.** Isso é possível porque nada fica público até passar por dois gates de qualidade — o segundo acontecendo só depois do conteúdo já estar em formato de rascunho em cada plataforma.

> ✅ **Status (18/08/2026):** o núcleo (Geração → Revisão → Publicação no WordPress, abaixo) está **construído, testado e revisado** — ver `docs/superpowers/plans/2026-08-17-pipeline-conteudo-marketing-nucleo.md` (Tasks 1-10). A tabela abaixo foi corrigida pra descrever o que existe de fato; o desenho original (17/08) previa um 4º estágio de distribuição multi-canal completo, que **não faz parte do que foi construído** — fica registrado como escopo futuro (`Pendências deste documento`, abaixo).

### 3.1 Estágios construídos

| # | Estágio | O que faz | Papéis do plano original absorvidos |
|---|---|---|---|
| 1 | **Geração** | Escolhe a próxima pauta pendente da fila daquela matriz (seleção apenas — gerar pauta nova a partir dos eixos é escopo do Construtor de Matriz, seção 6, ainda não construído), escreve o conteúdo completo seguindo o checklist da propriedade (seção 5.2) e o formato indicado na pauta (seção 5.3) | Estrategista + Escritor |
| 2 | **Revisão** | Valida o rascunho contra o checklist da propriedade + checagem de alucinação factual, dá um score. Reprovado → volta pro estágio 1 com o motivo, incrementa `tentativas`, tenta de novo (nada foi publicado ainda) | QA/Revisor |
| 3 | **Links + sanitização** | Insere seção "Posts relacionados" (3-6 links pra outros posts publicados da mesma propriedade, ao final do artigo — v1 determinística, sem IA) e sanitiza o HTML antes de publicar (preserva o `<script type="application/ld+json">` do Schema FAQPage) | Links + (novo, sanitização não estava no plano original) |
| 4 | **Publicação** | Publica de verdade no WordPress — só neste estágio o conteúdo principal fica público e ganha URL final | Postador |

**Ainda não construído (escopo futuro, fora da Fase 1):** o estágio de **Distribuição multi-canal** do desenho original (resumo/CTA adaptado por canal, imagem recortada por plataforma, posts em GMB/Instagram/Facebook/LinkedIn/Pinterest/Medium) — ver `Pendências deste documento`.

**Freio de segurança (circuit breaker):** limite de tentativas por pauta — `config_pipeline.max_tentativas` da propriedade, padrão 3. Esgotado → `marcarPautaBloqueada` (status `bloqueada`, `motivo_ultima_reprovacao` preenchido), o Estrategista segue pra próxima da fila no ciclo seguinte. Reclaim automático (18/08/2026, Task 10) também conta como tentativa — uma pauta presa em `em_producao` por timeout da função é reaproveitada depois de 10 minutos, e isso incrementa `tentativas` do mesmo jeito, então o freio vale mesmo nesse caminho. Evita loop infinito de custo sem reintroduzir dependência de humano; fica visível no Monitor de execução (seção 7.2).

### 3.2 Orquestração e gatilho — corrigido 18/08/2026 (Vercel Workflow SDK abandonado)

**Motor:** função simples (`processarProximaPauta`, `src/lib/marketing/processar-pauta.ts`) chamada diretamente pela rota de cron — **sem SDK de orquestração**. O desenho original (17/08) previa Vercel Workflow SDK (step functions duráveis); revertido no mesmo dia após incompatibilidade real do SDK com o ambiente (Node 24 / esbuild, `ERR_IMPORT_ATTRIBUTE_MISSING` dentro do bundler de steps, sem solução encontrada). Reaproveita o mesmo padrão de fila por status já provado pelo motor de follow-up (`src/lib/motor-fluxo/motor-followup.ts`) — sem infra nova, terreno já conhecido do sistema.

- **Gatilho:** cron-job.org (não Vercel Cron — Hobby plan só libera 1x/dia) bate em `/api/cron/marketing-pipeline`, protegido por `CRON_SECRET` (mesmo padrão de `src/app/api/cron/followups/route.ts`). Lock **por `matriz_conteudo_id`** (não um lock global como o do followup) — cada matriz roda em paralelo sem travar as outras, reaproveitando `cron_locks`/`fn_tentar_lock_cron`/`fn_liberar_lock_cron`.
- **Adaptadores de canal:** `src/lib/marketing/canais/`, mesmo padrão de `src/lib/whatsapp/enviar.ts` (camada fina que traduz um formato canal-agnóstico pra API de cada provedor). **Só o adaptador WordPress existe hoje** (`canais/wordpress.ts`, REST API + Application Password). Google Business Profile API, Meta Graph API, LinkedIn API, Pinterest API — ainda não construídos, fazem parte do estágio de Distribuição multi-canal (não iniciado, ver acima).

### 3.3 Distribuição multi-canal — texto + imagem por formato

O estágio 4 gera dois tipos de derivado do post principal, dependendo do canal:

**Resumo + CTA (a maioria dos canais)** — texto curto de "curiosidade + convite pra ler o conteúdo completo", com o link real do post, adaptado ao tom de cada plataforma (GMB e LinkedIn mais institucionais, Instagram/Facebook mais diretos) + a imagem de capa **recortada/redimensionada** (processamento determinístico, não geração de imagem nova) pro formato de cada canal:

| Canal | Formato de imagem | Tipo de conteúdo |
|---|---|---|
| Google Meu Negócio | 1200×900 (4:3) | Resumo + CTA |
| Instagram (feed) | 1080×1080 ou 1080×1350 (4:5) | Resumo + CTA |
| Facebook | 1200×630 (1,91:1) | Resumo + CTA |
| LinkedIn (post de feed) | 1200×627 (1,91:1) | Resumo + CTA |
| Pinterest | 1000×1500 (2:3) | Resumo + CTA — pin é literalmente "imagem + link", encaixa direto no padrão |
| YouTube | — | Sincronização: quando existir vídeo relacionado no canal, atualiza a descrição com o link do post novo (sem gerar vídeo) |

**Republicação integral com canonical (formato diferente do resumo)** — o artigo inteiro, não um resumo, com tag `canonical` apontando pro post original:

| Canal | Observação |
|---|---|
| Medium | Republicação simples, mesma API de posts |
| LinkedIn Articles | Diferente do post de feed do LinkedIn — publicação longa própria da plataforma |

**Fora do escopo do pipeline automático (não cabem no padrão, precisam de curadoria humana):** Quora, Reddit, fontes de imprensa tipo HARO Brasil — ajudam autoridade/backlink/AEO de verdade, mas resposta rasa ou promocional é removida e pode manchar reputação de domínio. Ficam como frente separada, mais próxima do Agente de Backlinks (que já exige aprovação humana).

**Geração de criativos originais por IA (fase 2, fora de escopo agora):** imagens pensadas especificamente pra cada plataforma (não só recorte da mesma foto), vídeo/avatares — fica pra depois, junto com os agentes de imagem mencionados por Luiz como próxima fase.

---

## 4. Motor 3 (redes sociais orgânicas) — referência estratégica, não automatizada ainda

O `Plano_Estrategico_Marketing_ArrudaCred.pdf` detalha uma estratégia de vídeo pra redes sociais que **não faz parte do pipeline de texto+imagem** descrito acima — é conteúdo de vídeo nativo, uma frente bem maior:

- **3 personas:** Luiz Dória (autoridade principal, 2 vídeos/semana), avatar masculino e avatar feminino (conteúdo educativo rápido, 2+1 vídeos/semana)
- **4 pilares editoriais:** educação financeira, verdades do sistema, combate a golpes, prova social
- **Estrutura de vídeo viral:** gancho (seg. 1-3) → problema/curiosidade (4-15) → revelação (16-40) → CTA (41-60)
- **Plataformas prioritárias:** Instagram Reels > TikTok > YouTube Shorts

Fica documentado aqui como referência — não é gerado pelo pipeline de conteúdo automatizado. Entra em pauta quando a frente de geração de vídeo for desenhada (fora do escopo atual).

---

## 5. Catálogos generalizados — reutilizáveis por qualquer propriedade

Extraídos e generalizados do plano original da ArrudaCred (que era 100% específico de finanças) — revisados em 17/08/2026 para funcionar em qualquer nicho.

### 5.1 Catálogo de ângulos (15)

Informacional direto · Passo a passo/Tutorial · Mito ou Verdade · Storytelling/Virada de Jogo · Comparativo · Urgência/Temporal · Dúvida/Ceticismo · Consequência/Medo · Perfil/Segmento · Objeção/Confiança · Ranking/Lista · Antes e Depois · Geográfico/Local · Para empresas/Segmento B2B · Pergunta direta.

Nenhum é específico de finanças — aplicável a qualquer tema de qualquer propriedade.

### 5.2 Checklist de qualidade padrão (11 itens, revisado)

Baseado no checklist original (10 itens, score mínimo 80/100), com 2 ajustes decididos em 17/08/2026:

1. H1 com a palavra-chave principal
2. Introdução respondendo a dúvida principal nos primeiros 100 palavras
3. Mínimo 1.800 palavras
4. Seção FAQ com 5 perguntas + Schema FAQPage
5. CTA para o canal de contato antes do FAQ
6. Imagem de destaque 1200×628px com ALT otimizado
7. 3 a 6 links internos contextuais — **nota de 17/08/2026 (Task 10):** o que é de fato entregue hoje pelo Agente de Links é uma versão v1 simplificada — 3 a 6 links para posts relacionados da mesma propriedade, listados numa seção "Posts relacionados" ao final do artigo, não inserção contextual no meio do texto. Inserção contextual exigiria NLP mais sofisticado e fica pra uma versão futura. Ver `src/lib/marketing/links.ts`.
8. 2 a 3 links externos para **fontes oficiais do nicho** (campo configurável por propriedade — BACEN/Serasa/Procon para financeiro, outro órgão para outro nicho)
9. Meta title (50-60 chars) e meta description (130-155 chars) otimizados
10. **Cobertura semântica de entidades relacionadas ao tema** (substitui "densidade de palavra-chave 1,5-2,5%" — métrica datada, pode soar artificial; buscadores e IAs avaliam relevância por cobertura semântica, não contagem de repetição)
11. **Resposta direta e extraível (40-60 palavras) logo abaixo de cada H2** — item novo, é a técnica mais concreta pra aumentar chance de citação por IA (ChatGPT/Perplexity/Gemini), complementa o item 2 (que só cobre a introdução)

Checagem de alucinação factual (verificação de dados numéricos citados) roda junto com a validação do checklist, mesmo estágio.

### 5.3 Catálogo de formatos de conteúdo (5)

Ampliado pra cobrir páginas de site, não só posts de blog:

1. **Post de blog — padrão** (educacional/SEO)
2. **Post de blog — storytelling/Virada de Jogo** — 1x/semana, dia fixo. Estrutura narrativa de 9 blocos (crise → trajetória → processo → virada → depois → FAQ → CTA duplo). Disclaimer obrigatório no início: *"Esta história é baseada em situações que nossos clientes vivem todos os dias. Nomes, cidades e detalhes foram alterados para preservar a privacidade. Se você se reconhece aqui, fale com a gente."* Histórias reais exigem cláusula contratual de autorização (LGPD) e anonimização.
3. **Página de Serviço/Hub** — menos narrativa, mais transacional: proposta de valor, prova social, FAQ do serviço, CTA proeminente, Schema Service/LocalBusiness. Recebe links de todos os posts de blog relacionados (arquitetura hub and spoke).
4. **Página Geográfica** — variante da página de serviço, localizada, Schema LocalBusiness com área de atendimento. Só existe em propriedades com o eixo "geografia" ativo na matriz.
5. **Homepage** — formato único, gerada/atualizada sob demanda (não entra na fila semanal recorrente do Estrategista).

---

## 6. Construtor de Matriz de Conteúdo — componente necessário, ainda não construído

**O que é:** um agente conversacional que, ao invés de um formulário fixo, **elabora suas próprias perguntas** pra levantar de um negócio novo: os temas/serviços reais (produtos que a propriedade oferece — não generalizável, cada negócio tem os seus), se o eixo geografia faz sentido (nacional/multi-praça vs. local único), a sazonalidade do nicho (janelas do ano × gatilho emocional × temas prioritários), e **a(s) persona(s) detalhada(s) daquela propriedade** (seção 6.1, adicionado 17/08/2026). Usa os catálogos generalizados da seção 5 (ângulos, checklist, formatos) como ponto de partida — não precisa reinventar isso a cada propriedade nova.

**Quando roda:** uma vez por propriedade nova, ou quando uma matriz nova é criada dentro de uma propriedade existente. Semi-interativo com Luiz (só ele sabe os produtos/público de cada negócio) — não é parte do pipeline 100% automatizado dos 4 estágios.

**Como constrói o levantamento de temas:** usando os skills de SEO já instalados no projeto (`create-topic`, `keyword-clustering` do plugin `searchfit-seo`) como ferramentas de apoio, não reescrevendo pesquisa de palavra-chave do zero.

**Pendente:** ainda não construído. Primeiras propriedades que precisam dele: vozdocredito.com.br e autoridadefinanceira.com.br (matriz nova) e uma revisão da matriz de Limpa Nome já existente (13 temas × 15 ângulos × 27 geografias do plano original — precisa ser carregada no banco e revisada, não só copiada).

### 6.1 Personas por propriedade — requisito adicionado 17/08/2026, ainda não detalhado

**Gap identificado por Luiz:** o desenho original (seções 1-5) já usa persona como conceito de alto nível pra diferenciar propriedades inteiras entre si (ex.: vozdocredito = persona consumidor, autoridadefinanceira = persona investidor, seção 1). O que faltava: **persona detalhada por propriedade**, com profundidade suficiente pra influenciar *cada peça de conteúdo gerada* — não só a divisão entre sites, mas o tom, vocabulário, objeções, nível de conhecimento prévio assumido, etc. dentro de cada site.

**Decisão de escopo:** as personas serão definidas junto com Luiz em sessão própria (ele vai trazer prompts/material pra isso) — não é algo que o sistema deva inventar sozinho, mesmo espírito da seção 1 ("pendência real, não posso resolver sozinho").

**Onde a persona mora (arquitetura, sem mudar o que já foi construído):** `MATRIZES_CONTEUDO.eixos` (jsonb, seção 2) ganha uma chave nova `persona` — objeto livre com o que for definido na sessão com Luiz (perfil demográfico/comportamental, tom de voz, nível de conhecimento assumido, objeções típicas, vocabulário preferido/evitado, etc.). Não exige migração de schema — `eixos` já é jsonb sem estrutura fixa.

**Impacto no pipeline de geração (Fase 2 de implementação, ainda não construída):** o Agente Escritor (`src/lib/marketing/escritor.ts`, já implementado no núcleo do pipeline) hoje monta o prompt a partir da pauta + checklist, sem persona. Quando as personas forem definidas, `montarPrompt` (e possivelmente o checklist do Agente Revisor) precisa passar a carregar `matrizes_conteudo.eixos.persona` e cruzar com a pauta/ângulo/checklist ao gerar — isso é uma extensão pontual do Escritor já existente, não uma reescrita. Fica registrado aqui como próximo passo depois que as personas forem definidas, para não esquecer de cruzar.

### 6.2 Cadastro de personas via tela — decidido 18/08/2026 (substitui a espera pelo Construtor de Matriz)

**Mudança de plano:** em vez de esperar o Construtor de Matriz de Conteúdo (agente conversacional, seção 6, ainda não construído) para levantar a persona, Luiz vai cadastrar a persona diretamente por uma tela de formulário — uma das telas da Fase 2 (seção 7). Isso desbloqueia o cruzamento com o Escritor (seção 6.1) sem depender do Construtor de Matriz existir primeiro. O Construtor de Matriz continua no roadmap para o levantamento de temas/ângulos/geografias (que exige pesquisa, não é só preenchimento), mas persona deixa de ser bloqueador dele.

**Campos do formulário** (grava em `matrizes_conteudo.eixos.persona`, jsonb já existente, sem migração de schema), uma persona por matriz de conteúdo — na prática, por site quando o site tem uma matriz só:
- Nome da persona (livre, só identificação)
- Perfil demográfico/comportamental (texto livre)
- Tom de voz (texto livre)
- Nível de conhecimento assumido (iniciante / intermediário / avançado)
- Dores e necessidades principais (texto livre)
- Objeções típicas (lista)
- Vocabulário preferido (lista de termos)
- Vocabulário a evitar (lista de termos)

---

## 7. Navegação no sistema — telas Fase 2, fechado com Luiz em 18/08/2026

Estrutura combinada com Luiz (17/08, refinada 18/08/2026), seguindo o padrão já existente em `src/app/admin/(shell)/sidebar.tsx` (hoje só "Atendimento" como item de topo solto e "Configurações" como cabeçalho com sub-grupos — "Marketing" precisa do mesmo tratamento, um nível a mais de nested que não existe ainda). Convenção de UX pedida por Luiz: telas intuitivas e produtivas, com tooltips/dicas contextuais em cada uma (o que cada status significa, o que fazer a seguir) — não só formulário cru.

**Marketing → Produção de Conteúdo** (operação do dia a dia):
- **Visão Geral** — dashboard: pautas pendentes/em produção/bloqueadas por propriedade, publicados na semana, taxa de aprovação do Revisor, custo acumulado (tokens Anthropic).
- **Monitor de execução** — tela viva (seção 7.2), o que está na fila e o que está em andamento agora, atualizando em tempo real conforme cada etapa do pipeline conclui.
- **Fila de Pautas** — tabela filtrável por propriedade/status, tooltip explicando cada status, ação de reabrir pauta bloqueada.
- **Posts Publicados** — por propriedade, com link pra cada plataforma, score de QA, histórico de tentativas/retrabalho e custo por post.

**Configurações → Marketing → Geração de Conteúdo** (setup, mexe pouco):
- **Propriedades Digitais** — CRUD de `PROPRIEDADES_DIGITAIS` (nome, URL, tipo de CMS, limite de tentativas, cota diária e janela de publicação — seção 7.1) + credenciais de canal (seção 8, armazenamento cifrado).
- **Matrizes de Conteúdo** — temas/ângulos/geografias/sazonalidade por propriedade.
- **Personas** — formulário por matriz/propriedade (seção 6.2).
- **Checklist de QA** — itens e pesos por propriedade.

**Regra herdada do restante do sistema:** item de menu só entra quando a tela existir de verdade — nada de "em breve" especulativo. Se aparecer necessidade de página nova durante a construção, adiciona-se então.

### 7.1 Cota diária e janela de publicação por propriedade — decidido 18/08/2026

**Gap identificado por Luiz:** o pipeline hoje (núcleo, Fase 1) não tem noção de "quantos posts por dia" nem de horário permitido — processa uma tentativa por matriz a cada disparo do cron, sem limite. Configurar isso só no cron-job.org (ex.: registrar múltiplos horários) não resolve: o serviço externo não sabe quantos posts já saíram hoje nem aplica a regra por propriedade, e não haveria o que configurar na tela do sistema.

**Decisão:** a regra de negócio fica no backend, configurável por `PROPRIEDADES_DIGITAIS.config_pipeline` (jsonb já existente — sem tabela nova):
- `posts_por_dia` (inteiro) — cota diária por propriedade.
- `janela_publicacao` (ex.: `{ inicio: "08:00", fim: "20:00" }`) — horário permitido; fora da janela, o cron pula essa propriedade neste tick.

O cron continua único e simples (mesmo padrão do cron de follow-up já em produção) — ele só dispara; quem decide se processa uma pauta agora é `processarProximaPauta`, checando a cota já usada hoje (contando publicados com `publicado_em` na data corrente) e a janela antes de prosseguir.

### 7.2 Monitor de execução ao vivo — decidido 18/08/2026

**Pedido de Luiz:** visibilidade total de operação (não decisão — a regra de "sem humano no meio" continua valendo pra execução) — o que está sendo feito agora, o que foi feito, quanto de retrabalho e quanto custou, pra poder melhorar o pipeline com o tempo.

**Mecanismo:** nova tabela de log de execução (nome de trabalho `pautas_execucao_log`) — cada etapa do pipeline (`buscar checklist` → `gerar conteúdo` → `revisar` → `inserir links` → `sanitizar` → `publicar` → `registrar resultado`) grava uma linha com `pauta_id`, etapa, `iniciado_em`, `concluido_em`, sucesso/falha, e — nas etapas que chamam a Anthropic (Escritor/Revisor) — tokens de entrada/saída da resposta (`usage` já vem na resposta da API, só precisa persistir). Isso dá de graça: histórico de retrabalho (cada reprovação = nova passada visível), custo por pauta/post (alimenta o Painel de Custo da Visão Geral) e tempo por etapa.

**Tela viva:** o front assina a tabela via **Supabase Realtime** (Postgres changes por websocket, já disponível no projeto) — cada linha nova/atualizada chega na tela sem polling. Três blocos: **Na fila** (pendentes, ordem de prioridade) → **Em andamento agora** (etapa atual da pauta ativa + tempo decorrido, atualizando a cada evolução) → **Concluídos recentes** (resultado, tentativas, custo, link). Progresso (%) e estimativa de tempo por etapa vêm da média histórica das últimas execuções daquela etapa — sem modelo novo, só agregação simples sobre o log.

---

## 8. Credenciais e acessos necessários por canal

**Mudança de arquitetura — decidido 18/08/2026:** a Fase 1 (núcleo) lia credenciais do WordPress só de variável de ambiente por propriedade (`WORDPRESS_USUARIO_<id>`/`WORDPRESS_SENHA_APP_<id>`). A partir da Fase 2 (telas), a tela de Propriedades Digitais passa a permitir cadastrar essas credenciais direto pela UI — isso exige guardar a senha **cifrada no banco** (não em texto puro): uma chave de aplicação nova (`MARKETING_CREDENCIAIS_CHAVE`, só via `process.env`, nunca no banco) cifra/decifra; o campo na tela é só-escrita (nunca reexibe a senha salva, mostra apenas "configurada ✓"/"faltando"); só o server com `service_role` decifra, e só no momento de publicar. Variável de ambiente continua funcionando como fallback caso a propriedade não tenha credencial cadastrada no banco (não quebra o que já está em produção).

Checklist de provisionamento — o que falta em cada linha é o que fica registrado como pendência de ação manual de Luiz, não algo pra "lembrar depois". Nenhuma dessas credenciais deve trafegar por chat — só via `vercel env` ou, a partir da Fase 2, direto na tela cifrada.

| Canal | O que precisa existir | Status (17/08/2026) |
|---|---|---|
| WordPress (cada propriedade) | Usuário + Senha de Aplicativo (wp-admin → Usuários → Perfil → Senhas de Aplicativo) | ⚠️ Existe pra arrudacred.com.br (usuário `claude-auditoria`) — **senha precisa ser trocada** (exposta em PDF). vozdocredito.com.br e autoridadefinanceira.com.br: ⬜ site e WordPress ainda nem existem |
| Google Meu Negócio (cada propriedade) | Conta de serviço Google Cloud com Business Profile API habilitada + `location_id` do perfil | ✅ Conta de serviço já existe pra arrudacred.com.br (`claude-auditoria@claude-sitearruda.iam.gserviceaccount.com`, API já habilitada) — reaproveitável, só falta o convite de coproprietário ser aceito (pendente no próprio perfil GMB, per PDF). vozdocredito/autoridadefinanceira: ⬜ perfil GMB ainda não existe |
| Instagram + Facebook | App em developers.facebook.com + token de página de longa duração + IDs da página/conta IG Business | ⬜ Não provisionado ainda pra nenhuma propriedade |
| LinkedIn | App em LinkedIn Developers + OAuth2 da página da empresa | ⬜ Não provisionado — Luiz confirmou LinkedIn em escopo (17/08/2026) |
| Pinterest | Conta de negócio Pinterest + acesso à API | ⬜ Não provisionado |
| Medium | Integration token da conta Medium | ⬜ Não provisionado |
| Google Analytics 4, GTM, Pixel Meta | Propriedade GA4 + container GTM + Pixel **próprios por site** (mesma conta GA4, ver seção 1.1) | ✅ arrudacred.com.br já tem os três (GA4 property `330560595`, GTM `GTM-N35XJX3V`, mas hoje instalado duplicado — auditoria pendente per PDF seção 14). vozdocredito/autoridadefinanceira: ⬜ nenhum dos três existe ainda |
| `ANTHROPIC_API_KEY` | Chave de API da Anthropic | ✅ Já em uso pelo resto do sistema (interpretação de IA do atendimento) — mesma chave serve pro pipeline de conteúdo |
| `CRON_SECRET` | Header customizado que o cron-job.org envia | ✅ Já configurado pro cron de follow-up — reaproveitável, ou uma variável nova só pra este pipeline se preferir isolar |

**Regra prática:** nenhuma linha acima bloqueia o início da construção (Task list da plan de implementação já assume isso) — o pipeline roda com o que existir; canais sem credencial simplesmente não entram em `propriedades_digitais.config_pipeline.canais_distribuicao` até serem provisionados.

---

## 9. Programa de indicação de clientes ("Indicação Premiada") — mecânica real, extraída do script de Luiz (15/08/2026)

**Distinto do programa formal de Parceiros/Afiliados** (`PARCEIROS_AFILIADOS_ARRUDACRED.md` — comissão B2B, com contrato e portal próprio). Este é um mecanismo de fidelização conduzido por WhatsApp diretamente com o cliente, depois que a venda já fechou.

**Fonte:** `Script - Indicação Premiada ArrudaCred.pdf` (Luiz, 15/08/2026) + decisões tomadas em conversa no mesmo dia.

### 9.1 Gatilho de disparo

**Dia Zero**, 30 minutos após a assinatura do contrato (e do pagamento da 1ª parcela, se o plano for PRÉ-PAGO). **Decisão de Luiz: por enquanto só documentar essa necessidade — quando/como automatizar o gatilho será decidido junto quando for viável.** Hoje o sistema não tem nenhum evento de "contrato assinado" nem "pagamento confirmado" (Financeiro/Jurídico ainda não desenhados), então este gatilho **não tem como ser automatizado no MVP1 tal como está** — fica registrado como requisito, não como tarefa pronta pra construir.

**Repetição mensal:** o script original é de disparo único ("Dia Zero"); Luiz confirmou a expansão — a campanha deve rodar **todo mês, enquanto o cliente tiver parcelas em aberto**, sempre com o mesmo corte de 20 contatos novos (não repetidos vs. todo o histórico do cliente, não só o mês anterior).

### 9.2 Script de convite ao cliente (5 partes, texto literal do PDF)

1. **Convite:** "Olá, [Nome]! Nosso índice de satisfação cresce a cada dia, e hoje mais da metade dos nossos contratos vêm por indicação de clientes... Temos uma verba de marketing separada para isso e queremos te oferecer R$100 de desconto na primeira/próxima parcela. Quer aproveitar?" → aguarda resposta.
2. **Como funciona** (só depois de resposta positiva): pede (a) estar seguindo `@arrudacred.br` no Instagram e (b) enviar 20 contatos do WhatsApp de pessoas que poderiam se beneficiar dos serviços — "não importa se vão fechar conosco, você só precisa indicar".
3. **CTA:** pede pra anexar os contatos pelo clipe do WhatsApp (envio nativo de **cartão de contato/vCard**, não texto digitado) — com **janela de 30 minutos** a partir do início da conversa pra enviar. Assim que a IA confirmar os 20 contatos, os R$100 são lançados na próxima fatura.
4. **Autorização LGPD:** depois de confirmado o envio dos 20 contatos, pede autorização explícita pra ArrudaCred contatar essas pessoas informando quem indicou — cliente precisa responder literalmente **"EU AUTORIZO"**. Sem essa resposta, os indicados não podem ser contatados.
5. **Confirmação final:** agradece e confirma que o desconto será lançado na próxima fatura.

**Adição de Luiz (ainda não estava no script original, pendência marcada no próprio PDF pelo Luiz):** pedir também, junto com os 20 contatos, **uma foto do cliente com expressão feliz/sorrindo fazendo sinal de joinha com as mãos**. Papel exato dessa foto, confirmado por Luiz: **não é comprovação interna** — serve para ser enviada **junto com o script de abordagem para cada um dos 20 indicados** (prova social: "olha quem te indicou, sorrindo, recomendando a gente"). Ainda assim, **a foto precisa ser guardada** (não é descartável após o uso) porque o mesmo cliente pode indicar de novo no mês seguinte e a foto pode ser reaproveitada.

### 9.3 Validação dos 20 contatos — decidida por Luiz (15/08/2026)

A confirmação é **automática (IA), não manual**. Critérios, por enquanto — **"a princípio"**, ou seja, pode crescer depois:
1. Contato **não é duplicado** — nem dentro do mesmo mês, nem contra qualquer mês anterior indicado por aquele cliente (todo o histórico, não só o mês corrente).
2. Contato **ainda não é cliente nosso**.

**✅ Bloqueio técnico resolvido (16/08/2026):** confirmado na documentação do Zapster (`developer.zapsterapi.com/pt-BR/v1/webhooks/available-events`) que o webhook `message.received` já entrega cartão de contato/vCard de forma estruturada, sem precisar parsear o vCard bruto: `data.type = "vcard"`, `data.content.contacts` é um array (cobre o cliente anexando vários contatos de uma vez), cada contato tem `display_name`, `first_name`, `last_name` e um array `phones`, e cada telefone tem `waid` **só quando aquele número realmente tem WhatsApp ativo** — o próprio Zapster já ajuda a validar um dos critérios da seção 9.3 (contato precisa ser WhatsApp válido) antes mesmo de qualquer lógica nossa.

### 9.4 Abordagem aos indicados — decisão pendente, com uma restrição já fechada

Existe um segundo script no PDF ("Script Oficial — Contato com Indicados ArrudaCred"), pra abordar cada um dos 20 contatos indicados. No PDF original ele abre em nome de "Luiz Dória" — **Luiz confirmou que isso não vale**: quem vai abordar os indicados será **um nome/identidade diferente**, nem "Luiz Dória" nem "Malala" — a definir depois.

**Restrição não-negociável, confirmada por Luiz (15/08/2026) — regra geral de segurança do número oficial, não só desta campanha:** a ArrudaCred **nunca** aborda um lead frio a partir do número oficial da empresa, e **nunca** faz disparo em massa via WhatsApp usando o número oficial — risco de banimento pela Meta. Por isso, o disparo dessas mensagens de abordagem aos 20 indicados **precisa vir de um número secundário/descartável** (fácil de substituir se tiver problema), **nunca do número oficial da Malala**. A mensagem de abertura para o indicado já identifica que é uma indicação e traz o **link de contato oficial da Malala** para quem quiser continuar a conversa de verdade — ou seja, o número descartável só faz a primeira abordagem fria; a conversa real de atendimento sempre migra pro número oficial. **Esta regra geral foi adicionada também ao PLANO_MESTRE, seção 8.5** (é uma decisão de arquitetura da integração WhatsApp, não só desta campanha).

### 9.5 O que ainda falta decidir/investigar (lista viva)

1. **Automação do gatilho "Dia Zero"** (seção 9.1) — decisão adiada de propósito por Luiz.
2. ~~Se o Zapster lê cartão de contato/vCard~~ ✅ confirmado em 16/08/2026 (seção 9.3) — Zapster entrega os contatos já estruturados via webhook, sem precisar parsear vCard bruto.
3. **Quem/qual identidade aborda os 20 indicados** (seção 9.4) — nome a definir; número secundário a provisionar.
4. **Como o desconto de R$100 chega até a parcela** — o módulo Financeiro (parcelas, cobrança) **ainda não foi desenhado** (`MODELAGEM_DADOS_ARRUDACRED.md`); esta é a primeira necessidade concreta de "como um valor chega a uma fatura".
5. **O que conta como "cliente elegível"** — qualquer cliente com parcela em aberto, independente do produto contratado (Limpa Nome, Bacen etc.)? A confirmar com Luiz quando for desenhar de verdade.
6. Armazenamento: tabela de contatos indicados por cliente/mês (com histórico completo pra dedup) + local de guarda da foto do cliente (reaproveitável em meses seguintes) — nenhum dos dois existe ainda.

**Atravessa quatro áreas, nenhuma cobre o caso hoje:** Comercial (quem conduz a conversa com o cliente e a abordagem aos indicados), Marketing (motor de aquisição por indicação), Financeiro (desconto numa parcela — módulo inexistente) e a própria integração WhatsApp/Fase 7 (número secundário, leitura de vCard).

> Ver também `docs/AGENDA_POS_VENDA_ARRUDACRED.md` — a "Indicação Premiada" é só um dos itens dentro da agenda de comunicação pós-venda mais ampla que veio no mesmo documento-fonte; o restante da agenda (onboarding, dicas educativas, aviso de conclusão) está registrado lá, por ser um assunto diferente (relacionamento com o cliente, não aquisição de novos leads).

---

## Pendências deste documento

- **Construtor de Matriz de Conteúdo** (seção 6) — ainda não construído; é pré-requisito pra popular matrizes de vozdocredito.com.br e autoridadefinanceira.com.br, e pra revisar a matriz de Limpa Nome já existente. Já não é mais pré-requisito de persona (seção 6.2, 18/08/2026 — persona virou tela de cadastro direto, não depende mais do Construtor de Matriz existir).
- **Personas detalhadas por propriedade** (seção 6.2, atualizado 18/08/2026) — cadastro via tela (Fase 2, seção 7), não mais condicionado ao Construtor de Matriz; depois de cadastradas, precisa estender `montarPrompt` do Agente Escritor (`src/lib/marketing/escritor.ts`) pra cruzar persona com pauta/checklist ao gerar conteúdo — trabalho de código ainda não feito.
- **Distribuição multi-canal** (seção 3.1, atualizado 18/08/2026) — estágio do desenho original que não faz parte da Fase 1 construída: resumo/CTA adaptado por canal, imagem recortada por plataforma, adaptadores de GMB/Instagram/Facebook/LinkedIn/Pinterest/Medium (só WordPress existe hoje).
- **Telas de admin (Fase 2)** (seção 7, fechado 18/08/2026) — escopo definido (8 telas), spec técnica e plan de implementação ainda não escritas.
- **Motor 3 / vídeo nativo pra redes sociais** (seção 4) — estratégia documentada, não faz parte do pipeline automatizado ainda
- **Geração de criativos originais por IA** (imagem/vídeo específicos por plataforma, não só recorte) — fase 2, fora do escopo atual
- Os demais motores de aquisição do plano original (Remarketing, Parcerias B2B, Influenciadores, Native Ads/Taboola) — **fora do escopo deste módulo de conteúdo inteiramente** (não geram post nem publicam conteúdo — são campanhas pagas/parcerias/afiliados, sistemas diferentes)
- **Ação manual pendente de Luiz:** trocar a senha do usuário `claude-auditoria` do WordPress (exposta em PDF); criar Pixel Meta + propriedade GA4 + container GTM próprios para vozdocredito.com.br e autoridadefinanceira.com.br antes do pipeline poder rastrear/distribuir de verdade
- Programa de indicação de clientes / "Indicação Premiada" (seção 9): mecânica real já registrada a partir do script de Luiz, mas a lista viva de pendências (seção 9.5) — automação do gatilho, quem aborda os indicados, integração com Financeiro, critério de elegibilidade — ainda não tem resposta em nenhum item; vira especificação pronta pra construir só depois disso
- **Credenciais pendentes de provisionamento** (seção 8): a maioria dos canais novos (Instagram, Facebook, LinkedIn, Pinterest, Medium, WordPress/GMB/GA4/GTM/Pixel de vozdocredito.com.br e autoridadefinanceira.com.br) ainda não tem conta/token criado — não bloqueia o início da construção, só os canais específicos até serem provisionados
- Definir se/como o modelo de negócio "ArrudaCred Mídia" (produto comercializável de gestão de conteúdo para terceiros) recebe billing e isolamento de dados próprios, quando sair da fase "ajudar a família" para fase comercial
- **Fase 4a — YMYL/E-E-A-T/AEO-GEO, auditoria de 19/08/2026** (`docs/insumos-externos/auditoria_seo_aeo_geo_llm_post.md`, análise de uma amostra real gerada pelo pipeline de personas). Diagnóstico: SEO on-page/AEO já está forte (9/10 em várias dimensões — H2 em pergunta, resposta direta, FAQ), mas confiabilidade factual YMYL (5/10), E-E-A-T (6/10) e originalidade em escala (6/10) precisam de camada nova. O que **já existe** no checklist de 11 itens (seção 5.2) cobre a parte estrutural (H1, intro, FAQ+schema, links, meta tags, cobertura semântica). O que **não existe ainda**:
  - Gate de precisão factual YMYL no Revisor — hoje ele só pontua contra o checklist genérico; precisa de uma dimensão própria pra afirmações jurídicas/financeiras sensíveis (ex.: não confundir prescrição de dívida com prazo de negativação — achado confirmado na prática 2x no teste real de 19/08), com regra de que uma afirmação YMYL sem lastro reprova sozinha, independente do resto do score.
  - Especificidade de fonte — hoje o Escritor cita fontes (BACEN/Serasa/Procon) mas às vezes aponta pra homepage genérica em vez da página/documento específico que sustenta a afirmação.
  - Autoria/E-E-A-T — sem autor, revisor, data de publicação/atualização em lugar nenhum (nem campo no banco, nem exibição no WordPress).
  - Dados estruturados `Article`/`Organization` (schema.org) — o Adaptador WordPress não gera isso hoje, só o `FAQPage` embutido pelo próprio Escritor.
  - Verificação de originalidade em escala — checagem "se eu tirar a persona e trocar a keyword, esse post ainda é essencialmente igual a outro?" não existe.
  - Regras leves de precisão devem entrar no prompt do **Escritor** (não afirmar prazo jurídico sem fonte, não fundir conceitos distintos); a auditoria completa por dimensão (SEO/AEO-GEO/YMYL/E-E-A-T/Originalidade) vira gate pesado no **Revisor**. Aplica-se a qualquer propriedade, com rigor proporcional ao risco do nicho — pesado em financeiro e saúde (site do irmão do Luiz), leve em decoração (site da mãe dele, não é YMYL).
- **Fase 4b — Geração de imagens (capa + secundárias)**, specs prontas de 19/08/2026 (`docs/insumos-externos/especificacao_automacao_capa_post_persona.md` e `especificacao_automacao_imagens_secundarias_post.md`). Duas automações completas e detalhadas: capa foto-realista cruzando post + persona (5 etapas: resumo do post, resumo psicológico da persona, cruzamento, prompt, geração), e até 3 imagens secundárias informativas com filtro rígido de utilidade (nota ≥30/40, zero imagens sendo resposta válida) e protocolo anti-alucinação ("banco fechado" — a imagem só pode conter o que está literalmente no trecho-fonte do artigo). Ambas concordam com a auditoria (item acima) e com decisão do Luiz: imagem só é gerada **depois** do texto aprovado pelo Revisor, nunca antes. **Bloqueado em uma decisão de fornecedor de geração de imagem** (comparação de custo Anthropic/AI Gateway vs OpenAI em andamento, 19/08/2026) — nenhuma implementação começa antes disso. Escopo real: novos agentes de IA (resumo de post, resumo de persona, cruzamento, identificador de oportunidades visuais, gerador, revisor de imagem), upload de mídia no Adaptador WordPress (não existe hoje), e a lógica de sequenciamento pós-aprovação.
