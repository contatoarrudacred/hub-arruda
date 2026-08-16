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

O `Plano_Estrategico_Marketing_ArrudaCred.pdf` traz mais 6 "motores de aquisição" além do SEO (Google Maps/GMB, Redes Sociais Orgânicas, Remarketing, Parcerias B2B, Influenciadores, Native Ads/Taboola — este último já mencionado por Luiz anteriormente como preferência), programa de indicação de clientes (com script já validado e testado — **mecânica detalhada na seção 6 abaixo**), infoprodutos/lançamentos, e podcast/YouTube. Os demais (fora indicação) não foram transformados em especificação de sistema ainda — ficam como pauta para as próximas conversas sobre o módulo Marketing.

---

## 6. Programa de indicação de clientes ("Indicação Premiada") — mecânica real, extraída do script de Luiz (15/08/2026)

**Distinto do programa formal de Parceiros/Afiliados** (`PARCEIROS_AFILIADOS_ARRUDACRED.md` — comissão B2B, com contrato e portal próprio). Este é um mecanismo de fidelização conduzido por WhatsApp diretamente com o cliente, depois que a venda já fechou. Até 15/08/2026 só existia uma menção de uma linha a esse programa (seção 5), sem nenhuma mecânica — Luiz então enviou o documento-fonte `Script - Indicação Premiada ArrudaCred.pdf` (39 páginas, majoritariamente mockups visuais em Canva; o texto literal do script está nas 3 primeiras páginas) com o script real, e revisou o desenho em conversa. **Esta seção substitui a versão anterior**, registrada com informação incompleta.

**Fonte:** `Script - Indicação Premiada ArrudaCred.pdf` (Luiz, 15/08/2026) + decisões tomadas em conversa no mesmo dia.

### 6.1 Gatilho de disparo

**Dia Zero**, 30 minutos após a assinatura do contrato (e do pagamento da 1ª parcela, se o plano for PRÉ-PAGO). **Decisão de Luiz: por enquanto só documentar essa necessidade — quando/como automatizar o gatilho será decidido junto quando for viável.** Hoje o sistema não tem nenhum evento de "contrato assinado" nem "pagamento confirmado" (Financeiro/Jurídico ainda não desenhados), então este gatilho **não tem como ser automatizado no MVP1 tal como está** — fica registrado como requisito, não como tarefa pronta pra construir.

**Repetição mensal:** o script original é de disparo único ("Dia Zero"); Luiz confirmou a expansão — a campanha deve rodar **todo mês, enquanto o cliente tiver parcelas em aberto**, sempre com o mesmo corte de 20 contatos novos (não repetidos vs. todo o histórico do cliente, não só o mês anterior).

### 6.2 Script de convite ao cliente (5 partes, texto literal do PDF)

1. **Convite:** "Olá, [Nome]! Nosso índice de satisfação cresce a cada dia, e hoje mais da metade dos nossos contratos vêm por indicação de clientes... Temos uma verba de marketing separada para isso e queremos te oferecer R$100 de desconto na primeira/próxima parcela. Quer aproveitar?" → aguarda resposta.
2. **Como funciona** (só depois de resposta positiva): pede (a) estar seguindo `@arrudacred.br` no Instagram e (b) enviar 20 contatos do WhatsApp de pessoas que poderiam se beneficiar dos serviços — "não importa se vão fechar conosco, você só precisa indicar".
3. **CTA:** pede pra anexar os contatos pelo clipe do WhatsApp (envio nativo de **cartão de contato/vCard**, não texto digitado) — com **janela de 30 minutos** a partir do início da conversa pra enviar. Assim que a IA confirmar os 20 contatos, os R$100 são lançados na próxima fatura.
4. **Autorização LGPD:** depois de confirmado o envio dos 20 contatos, pede autorização explícita pra ArrudaCred contatar essas pessoas informando quem indicou — cliente precisa responder literalmente **"EU AUTORIZO"**. Sem essa resposta, os indicados não podem ser contatados.
5. **Confirmação final:** agradece e confirma que o desconto será lançado na próxima fatura.

**Adição de Luiz (ainda não estava no script original, pendência marcada no próprio PDF pelo Luiz):** pedir também, junto com os 20 contatos, **uma foto do cliente com expressão feliz/sorrindo fazendo sinal de joinha com as mãos**. Papel exato dessa foto, confirmado por Luiz: **não é comprovação interna** — serve para ser enviada **junto com o script de abordagem para cada um dos 20 indicados** (prova social: "olha quem te indicou, sorrindo, recomendando a gente"). Ainda assim, **a foto precisa ser guardada** (não é descartável após o uso) porque o mesmo cliente pode indicar de novo no mês seguinte e a foto pode ser reaproveitada.

### 6.3 Validação dos 20 contatos — decidida por Luiz (15/08/2026)

A confirmação é **automática (IA), não manual**. Critérios, por enquanto — **"a princípio"**, ou seja, pode crescer depois:
1. Contato **não é duplicado** — nem dentro do mesmo mês, nem contra qualquer mês anterior indicado por aquele cliente (todo o histórico, não só o mês corrente).
2. Contato **ainda não é cliente nosso**.

**✅ Bloqueio técnico resolvido (16/08/2026):** confirmado na documentação do Zapster (`developer.zapsterapi.com/pt-BR/v1/webhooks/available-events`) que o webhook `message.received` já entrega cartão de contato/vCard de forma estruturada, sem precisar parsear o vCard bruto: `data.type = "vcard"`, `data.content.contacts` é um array (cobre o cliente anexando vários contatos de uma vez), cada contato tem `display_name`, `first_name`, `last_name` e um array `phones`, e cada telefone tem `waid` **só quando aquele número realmente tem WhatsApp ativo** — o próprio Zapster já ajuda a validar um dos critérios da seção 6.3 (contato precisa ser WhatsApp válido) antes mesmo de qualquer lógica nossa.

### 6.4 Abordagem aos indicados — decisão pendente, com uma restrição já fechada

Existe um segundo script no PDF ("Script Oficial — Contato com Indicados ArrudaCred"), pra abordar cada um dos 20 contatos indicados. No PDF original ele abre em nome de "Luiz Dória" — **Luiz confirmou que isso não vale**: quem vai abordar os indicados será **um nome/identidade diferente**, nem "Luiz Dória" nem "Malala" — a definir depois.

**Restrição não-negociável, confirmada por Luiz (15/08/2026) — regra geral de segurança do número oficial, não só desta campanha:** a ArrudaCred **nunca** aborda um lead frio a partir do número oficial da empresa, e **nunca** faz disparo em massa via WhatsApp usando o número oficial — risco de banimento pela Meta. Por isso, o disparo dessas mensagens de abordagem aos 20 indicados **precisa vir de um número secundário/descartável** (fácil de substituir se tiver problema), **nunca do número oficial da Malala**. A mensagem de abertura para o indicado já identifica que é uma indicação e traz o **link de contato oficial da Malala** para quem quiser continuar a conversa de verdade — ou seja, o número descartável só faz a primeira abordagem fria; a conversa real de atendimento sempre migra pro número oficial. **Esta regra geral foi adicionada também ao PLANO_MESTRE, seção 8.5** (é uma decisão de arquitetura da integração WhatsApp, não só desta campanha).

### 6.5 O que ainda falta decidir/investigar (lista viva)

1. **Automação do gatilho "Dia Zero"** (seção 6.1) — decisão adiada de propósito por Luiz.
2. ~~Se o Zapster lê cartão de contato/vCard~~ ✅ confirmado em 16/08/2026 (seção 6.3) — Zapster entrega os contatos já estruturados via webhook, sem precisar parsear vCard bruto.
3. **Quem/qual identidade aborda os 20 indicados** (seção 6.4) — nome a definir; número secundário a provisionar.
4. **Como o desconto de R$100 chega até a parcela** — o módulo Financeiro (parcelas, cobrança) **ainda não foi desenhado** (`MODELAGEM_DADOS_ARRUDACRED.md`); esta é a primeira necessidade concreta de "como um valor chega a uma fatura".
5. **O que conta como "cliente elegível"** — qualquer cliente com parcela em aberto, independente do produto contratado (Limpa Nome, Bacen etc.)? A confirmar com Luiz quando for desenhar de verdade.
6. Armazenamento: tabela de contatos indicados por cliente/mês (com histórico completo pra dedup) + local de guarda da foto do cliente (reaproveitável em meses seguintes) — nenhum dos dois existe ainda.

**Atravessa quatro áreas, nenhuma cobre o caso hoje:** Comercial (quem conduz a conversa com o cliente e a abordagem aos indicados), Marketing (motor de aquisição por indicação), Financeiro (desconto numa parcela — módulo inexistente) e a própria integração WhatsApp/Fase 7 (número secundário, leitura de vCard).

> Ver também `docs/AGENDA_POS_VENDA_ARRUDACRED.md` — a "Indicação Premiada" é só um dos itens dentro da agenda de comunicação pós-venda mais ampla que veio no mesmo documento-fonte; o restante da agenda (onboarding, dicas educativas, aviso de conclusão) está registrado lá, por ser um assunto diferente (relacionamento com o cliente, não aquisição de novos leads).

---

## Pendências deste documento
- Nova matriz de conteúdo (temas/ângulos) para a frente de Crédito/Consórcio/Investimento — precisa de pesquisa de palavra-chave real com Luiz, não posso inventar
- Detalhamento da fábrica de redes sociais (stories/reels/carrosséis)
- Os demais motores de aquisição (GMB, remarketing, parcerias B2B, influenciadores, Taboola, infoprodutos, podcast/YouTube) — ainda não viraram especificação de sistema
- Programa de indicação de clientes / "Indicação Premiada" (seção 6): mecânica real já registrada a partir do script de Luiz, mas a lista viva de pendências (seção 6.5) — automação do gatilho, se o Zapster lê cartão de contato, quem aborda os indicados, integração com Financeiro, critério de elegibilidade — ainda não tem resposta em nenhum item; vira especificação pronta pra construir só depois disso
- Definir se/como o modelo de negócio "ArrudaCred Mídia" (produto comercializável de gestão de conteúdo para terceiros) recebe billing e isolamento de dados próprios, quando sair da fase "ajudar a família" para fase comercial
