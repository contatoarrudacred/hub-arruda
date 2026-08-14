# Módulo Marketing — Pipeline de Conteúdo Multi-Site
**Status:** Primeira versão, 12/08/2026 — absorve o escopo que estava sob responsabilidade da QMARKA (empresa que não vai conseguir entregar o projeto, conforme Luiz).
**Fontes:** `ArrudaCred_Plano_Estrategico_2026-2031-Crescimento-Organico.pdf` e `Plano_Estrategico_Marketing_ArrudaCred.pdf` (ambos de Luiz), adaptados e generalizados para caber neste sistema.

> ⚠️ **Regra de precedência entre documentos:** onde este documento (ou qualquer outro já registrado) conflitar com os PDFs originais da QMARKA, **este documento prevalece** — os PDFs viraram material de referência histórica, não fonte de verdade viva. Exemplo já resolvido: tabela de preços do PDF está desatualizada, a válida é a de `SCRIPT_LIMPANOME_SERASA_SPC.md`.

---

## 1. Contexto e decisão estratégica de posicionamento

A ArrudaCred está em transição de posicionamento: de "empresa de limpa-nome que também oferece crédito" para **"empresa de produtos financeiros e investimentos (crédito, consórcio, alavancagem patrimonial, cartas contempladas) que também limpa nome"**. Essa transição precisa acontecer **sem perder o tráfego orgânico que já funciona bem para limpa-nome** — que hoje é o motor de receita que sustenta a operação durante a transição (decisão de Luiz, seção 5 do plano mestre: prioridade de construção continua sendo Comercial/Limpa Nome).

**Decisão de conteúdo — DECIDIDO em 12/08/2026:** as duas frentes de conteúdo crescem **em paralelo**, não sequencialmente — continuar investindo forte em limpa-nome (mantém a receita) enquanto se constrói a nova frente de crédito/consórcio/investimento (constrói o futuro posicionamento). Isso significa que o sistema precisa suportar **duas matrizes de conteúdo simultâneas** para o mesmo site institucional (arrudacred.com.br), não uma migração de uma pra outra.

**Pendência real, não posso resolver sozinho:** a matriz de conteúdo do documento original (13 temas × 15 ângulos × 27 geografias) é **inteiramente construída em torno de limpa-nome/score/BACEN** — nenhum tema cobre consórcio, crédito, investimento ou alavancagem patrimonial. Uma nova matriz de temas para a frente de produtos financeiros/investimento precisa ser levantada com Luiz (quais produtos, quais palavras-chave, qual funil) — não é algo que eu deva inventar sem pesquisa de palavra-chave real (a estratégia original usa Ahrefs/Search Console para isso).

---

## 2. Arquitetura de dados — generalizada para multi-site desde o início

Em vez de desenhar o pipeline só para arrudacred.com.br e depois generalizar (como fizemos deliberadamente no Comercial — um produto primeiro, depois generalizar), aqui vale desenhar multi-site **desde já**, porque Luiz já confirmou a intenção comercial: começa ajudando a mãe (decoração) e o irmão (clínica odontológica), com potencial real de virar produto comercializável como nova unidade de negócio depois de validado internamente.

### Entidades principais

- **PROPRIEDADES_DIGITAIS** — cada site atendido (arrudacred.com.br, vozdocredito.com.br, autoridadefinanceira.com.br, site da Aetria, clínica do irmão, decoração da mãe, e outros que vierem). Campos: `id`, `pessoa_id` (FK — o "dono" da propriedade: uma unidade de negócio do próprio grupo, **ou** uma Pessoa/Cliente externa contratando o serviço — reaproveita o núcleo Pessoa/Papel), `unidade_negocio_id` (FK, nullable — preenchido só quando a propriedade é do próprio grupo), `nome`, `url_base`, `tipo_cms` (`wordpress`, outros no futuro), `ativo`, `created_at`, `updated_at`.
  - `COMMENT`: *"Cada site/blog atendido pelo pipeline de conteúdo — do próprio grupo (ArrudaCred, Aetria) ou de clientes externos contratando o serviço como produto."*
- **MATRIZES_CONTEUDO** — os eixos de conteúdo por propriedade. Diferente do modelo original (fixo em temas/ângulos/geografia, que só faz sentido pra um negócio nacional multi-localização como a ArrudaCred), aqui os eixos ficam **configuráveis por propriedade** — a clínica odontológica do irmão não precisa de eixo "geografia" com 27 cidades, por exemplo. Campos: `id`, `propriedade_id` (FK), `nome` (ex.: "Matriz Limpa Nome", "Matriz Crédito e Investimento"), `eixos` (`jsonb` — estrutura livre de eixos e valores possíveis, ex.: `{"temas": [...], "angulos": [...], "geografias": [...]}`).
  - **Uma propriedade pode ter mais de uma matriz ativa ao mesmo tempo** — é exatamente o caso da ArrudaCred agora, com a matriz de Limpa Nome e a futura matriz de Crédito/Investimento coexistindo.
- **PAUTAS** — a fila gerada pelo Agente Estrategista (ver seção 3). Campos: `id`, `matriz_conteudo_id` (FK), `palavra_chave_principal`, `palavras_secundarias` (jsonb), `angulo`, `geografia` (nullable), `tipo_post` (`padrao`, `storytelling`, ou outros configuráveis), `funil` (topo/meio/fundo), `status` (`pendente`, `em_producao`, `publicado`, `rejeitado`), `prioridade_score`, `created_at`.
- **POSTS** — rascunhos e publicados. Campos: `id`, `pauta_id` (FK), `propriedade_id` (FK), `titulo`, `conteudo_html`, `meta_title`, `meta_description`, `slug`, `imagem_destaque_url`, `score_qa`, `status`, `url_publicada`, `publicado_em`, `atualizado_em`.
- **CHECKLIST_QA_ITENS** — o "padrão de qualidade obrigatório" (seção 5 do documento original), mas **configurável por propriedade** em vez de fixo — cada site pode ter critérios diferentes (a clínica não precisa de "densidade de palavra-chave BACEN"). Campos: `id`, `propriedade_id` (FK), `item`, `peso`, `ativo`.
- **PROSPECTS_BACKLINK** — pipeline do Agente de Backlinks (ver seção 3, A8). Campos: `id`, `propriedade_id` (FK), `dominio`, `da_estimado`, `status` (`prospectado`, `email_enviado`, `respondido`, `link_conquistado`), `email_enviado_texto`, `created_at`.

---

## 3. Pipeline de agentes — adaptado do plano original da QMARKA

Fluxo sequencial: **Estrategista → Escritor → Imagem → Links → QA → Postador → Distribuidor**, com Backlinks e Retrofit/Atualização rodando em ciclos independentes. Mantém a essência do desenho original, adaptado para rodar dentro deste sistema (não mais como produto separado da QMARKA) e para ser multi-site desde o início.

| Agente | Função | Motor de IA (aplicando a estratégia de custo já definida, seção 2.1) | Adaptação em relação ao original |
|---|---|---|---|
| **Estrategista** | Decide o que publicar — gera fila semanal de pautas por propriedade | Sonnet (decisão estratégica, não é classificação simples) | Roda por `matriz_conteudo_id`, não fixo em uma propriedade só |
| **Escritor** | Gera o rascunho completo (H1, introdução, 1.800+ palavras, FAQ com Schema, CTA, meta title/description) | Sonnet (qualidade de escrita é crítica) | Segue o checklist configurável da propriedade (`checklist_qa_itens`), não um checklist fixo |
| **Imagem** | Gera imagem de destaque 1200×628px com ALT otimizado | API de imagem (DALL-E/Ideogram, a definir) | Sem alteração de fundo |
| **Links** | Insere links internos (arquitetura hub and spoke), verifica vídeo relacionado no YouTube | — (lógica determinística + consulta à API do CMS) | Consulta só posts da mesma `propriedade_id` |
| **QA/Revisor** | Valida qualidade antes de publicar — aprova/reprova com score mínimo | Sonnet (julgamento de qualidade, incluindo checagem de alucinação factual) | Score mínimo e itens do checklist configuráveis por propriedade |
| **Postador** | Publica no CMS via API (WordPress hoje) | — (determinístico, chamada de API) | Abstrai o CMS — hoje só WordPress, mas a interface fica pronta para outros CMS no futuro (mesmo princípio do "contrato de adaptador" que já usamos para canais de atendimento) |
| **Distribuidor** | Distribui o post publicado para GMB, LinkedIn e outros canais | — (determinístico, chamadas de API) | Lista de canais de distribuição configurável por propriedade, não fixa em GMB+LinkedIn |
| **Backlinks** | Prospecta parceiros de backlink, redige contato editorial (aguarda aprovação humana antes de enviar) | Sonnet (redação personalizada) | Sem alteração de fundo — aprovação humana continua obrigatória |
| **Retrofit** (execução única) | Corrige posts antigos publicados sem FAQ/CTA/imagem/título otimizado | Sonnet | Roda por propriedade, sob demanda |
| **Atualização Semestral** (cíclico) | Atualiza conteúdo publicado a cada 6 meses (dados desatualizados, títulos com CTR baixo) | Sonnet | Prioriza posts com queda de posição, mesma lógica original |

**Nota de custo:** este pipeline gera muito mais tokens por execução do que o atendimento comercial (artigos de 1.800+ palavras várias vezes ao dia) — vale instrumentar o custo real desde o primeiro mês de uso (seção 9 do plano mestre, Controle de Custos) para não ter surpresa, diferente do atendimento comercial onde já temos boa margem de segurança.

---

## 4. Fábrica de conteúdo multi-canal (redes sociais) — pendente de detalhamento

Luiz também pediu suporte para redes sociais: stories, reels, posts estáticos de imagem, carrosséis — além do blog. **Isso ainda não foi desenhado em detalhe** (o material da QMARKA cobre blog/SEO a fundo, mas redes sociais só superficialmente no plano de marketing, seção "Motor 3"). Fica como próxima frente dentro do módulo Marketing, depois de fechar o pipeline de blog.

---

## 5. Outras frentes do plano de marketing original (a desenvolver)

O `Plano_Estrategico_Marketing_ArrudaCred.pdf` traz mais 6 "motores de aquisição" além do SEO (Google Maps/GMB, Redes Sociais Orgânicas, Remarketing, Parcerias B2B, Influenciadores, Native Ads/Taboola — este último já mencionado por Luiz anteriormente como preferência), programa de indicação de clientes (com script já validado e testado), infoprodutos/lançamentos, e podcast/YouTube. Nenhum desses foi transformado em especificação de sistema ainda — ficam como pauta para as próximas conversas sobre o módulo Marketing.

---

## Pendências deste documento
- Nova matriz de conteúdo (temas/ângulos) para a frente de Crédito/Consórcio/Investimento — precisa de pesquisa de palavra-chave real com Luiz, não posso inventar
- Detalhamento da fábrica de redes sociais (stories/reels/carrosséis)
- Os demais motores de aquisição (GMB, remarketing, parcerias B2B, influenciadores, Taboola, indicação, infoprodutos, podcast/YouTube) — ainda não viraram especificação de sistema
- Definir se/como o modelo de negócio "ArrudaCred Mídia" (produto comercializável de gestão de conteúdo para terceiros) recebe billing e isolamento de dados próprios, quando sair da fase "ajudar a família" para fase comercial
