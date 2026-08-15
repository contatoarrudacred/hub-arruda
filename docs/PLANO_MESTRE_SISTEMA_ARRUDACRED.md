# PLANO MESTRE — Sistema de Gestão ArrudaCred
**Status:** Documento vivo — atualizar a cada sessão de planejamento
**Última atualização:** 14/08/2026
**Responsável:** Luiz Humberto de Arruda Dória do Valle
**Entidade legal:** L.H. DE ARRUDA D. DO VALLE SERVIÇOS LTDA (CNPJ 40.342.851/0001-37)

> **Como usar este documento:** este é o índice-mestre do projeto. Toda decisão relevante tomada em qualquer conversa sobre o sistema deve ser resumida e adicionada aqui (ou em um dos documentos filhos referenciados abaixo). Isso existe justamente para que o contexto do projeto não se perca quando a conversa/memória local ficar longa demais — comece qualquer nova sessão de trabalho no projeto lendo este arquivo primeiro.
>
> **Convenção de progresso (12/08/2026):** progresso de qualquer módulo/documento se mede em **duas dimensões separadas, nunca uma só** — **Planejamento** (o quanto já foi discutido/documentado) e **Produção** (o quanto já foi de fato construído em código/infraestrutura). Um módulo com planejamento em 90% ainda está em **0% de produção** se nenhuma linha de código foi escrita — nunca resumir as duas coisas num único "% concluído". Ver `mindmap_projeto_arrudacred.html` para o mapa visual com as duas barras por item.

---

## 0. Visão e Lema do Projeto

Sistema único de gestão para a ArrudaCred, cobrindo **Marketing, Comercial, Jurídico e Financeiro** (incluindo a divisão ArrudaCred PaySmart) em uma só plataforma.

**Lema do projeto:**
- **Produtividade** — eliminar trabalho manual repetitivo (hoje feito por Luiz em Word/Excel/WhatsApp)
- **Segurança** — dados sensíveis (financeiros, de crédito, jurídicos) exigem tratamento rigoroso (LGPD)
- **Facilidade para o usuário** — Luiz é o usuário principal hoje, mas o sistema deve suportar equipe crescente
- **IA sempre que possível, com verificação sempre** — toda geração por IA (relatórios, respostas, análises) passa por checagem humana ou por validação automática antes de virar output oficial

---

## 1. Escopo Macro — Módulos do Sistema

> ⚠️ **Fato crítico do projeto (12/08/2026):** a empresa QMARKA, que estava contratada para desenvolver um pipeline de 9+ agentes de IA para geração/revisão/postagem de conteúdo (SEO do blog, redes sociais, distribuição) e mais 3 agentes de atendimento/cobrança via WhatsApp, **teve problemas internos e não vai conseguir entregar o projeto**. Todo o escopo que estava no planejamento da QMARKA (documentado em `ArrudaCred_Plano_Estrategico_2026-2031-Crescimento-Organico.pdf` e `Plano_Estrategico_Marketing_ArrudaCred.pdf`, ambos anexados por Luiz) **precisa ser absorvido dentro deste sistema**. É por isso que Luiz iniciou este projeto — não é um sistema "adicional" à automação de marketing, é **o lugar onde essa automação vai morar**.
> - Os agentes de atendimento/cobrança da QMARKA (A10 — Resgate de Legado, A11 — Gestão de Funil WhatsApp, A12 — Cobrança Financeira) já estão majoritariamente cobertos pelo que desenhamos no módulo Comercial (`SCRIPT_LIMPANOME_SERASA_SPC.md`, `KANBAN_COMERCIAL_LIMPANOME.md`, `REGUA_COBRANCA_ARRUDACRED.md`) — reconciliação e itens novos identificados na seção 1.1 abaixo.
> - Os agentes de conteúdo da QMARKA (A1-A9b — Estrategista, Escritor, Imagem, Links, QA, Postador, Distribuidor, Backlinks, Retrofit, Atualização Semestral) **ainda não têm equivalente no nosso levantamento** — viram o núcleo da especificação do módulo Marketing, próxima frente de trabalho.

### 1.1 Módulo Comercial (CRM + Vendas)
> ⚠️ Princípio de design que atravessa este módulo inteiro: **o sistema é multi-produto desde o início** (limpa nome é o principal hoje, mas não é o único — ver seção 8.8). Nada aqui deve ser modelado como se "limpa nome" fosse o único produto possível.
> ✅ **Reconciliação com o planejamento da QMARKA (12/08/2026):** os agentes A10 (Resgate de Legado), A11 (Gestão de Funil WhatsApp) e A12 (Cobrança Financeira) descritos no plano de crescimento orgânico já estão majoritariamente cobertos pelo que desenhamos:
> - **A11 ≈ nosso motor de follow-up + Kanban** — régua de follow-up, etiquetas de funil e encerramento automático em D+10 já batem com o que fechamos (`SCRIPT_LIMPANOME_SERASA_SPC.md`, premissas gerais)
> - **A12 ≈ nossa régua de cobrança** — já capturada integralmente em `REGUA_COBRANCA_ARRUDACRED.md`, D+1 a D+29
> - **A10 (Resgate de Legado) é peça nova, ainda não desenhada:** processa o histórico do WhatsApp Business comum (antes da migração pro número oficial), classifica cada conversa antiga (é lead? teve desfecho? qual perfil?) e gera mensagem de resgate personalizada pra quem sumiu sem resposta — usando o número secundário (QR Code) pra não arriscar o número principal. Reforça e detalha a mitigação de "corte de produção" já registrada na seção 8.11 — vale incorporar como parte dela.
> - **Peça nova de governança:** sistema de etiquetas com monitoramento — nenhuma conversa pode ficar sem etiqueta (`EM ATENDIMENTO` / `EM NUTRIÇÃO` / `NEGÓCIO FECHADO` / `OPORTUNIDADE PERDIDA`) por mais de 24h sem alerta automático para Luiz. `EM NUTRIÇÃO` é estado distinto do encerramento por silêncio — entrada manual/intencional quando o lead pede pra pensar ou informa data futura, com janela própria de 60 dias (diferente da nutrição pós-perda de 30/60/90 dias já registrada). Vale reconciliar os dois conceitos de "nutrição" quando revisarmos o Kanban.
> - **Peça nova de modelo comercial:** existe modelo **pós-pago** (cliente só paga após o êxito do serviço, parcelamento até 18x, maior risco de inadimplência, encaminhamento ao jurídico após 30 dias) — **decisão de Luiz: não entra no MVP1** (o script já fechado cobre só à vista/parcelado, correspondente ao pré-pago), mas é extensão futura conhecida a incorporar na forma de pagamento.
> - **Correção de preço:** a tabela de preços por faixa que consta nos documentos da QMARKA está **desatualizada** — a tabela válida é a que já preenchemos em `SCRIPT_LIMPANOME_SERASA_SPC.md`.
- Funil de leads (ArrudaCred limpa-nome + PaySmart, com origem rastreada por canal)
- Geração semi-automática de propostas comerciais e de **relatórios de restrição de crédito** (o fluxo que hoje você faz manualmente em Word, ex.: caso Residere Construtora)
- Consulta a bureaus (Serasa/Boa Vista/Quod) e SCR/Bacen integrada ao cadastro do lead
- Gestão de comissionamento de parceiros indicadores (contadores, CPAs, fintechs parceiras)
- Histórico de interação por cliente/lead (timeline)

### 1.2 Módulo Jurídico
- Gestão das ações coletivas (associação de consumidores → processo → cliente vinculado)
- Controle de prazos processuais e status de cada restrição sendo removida
- Repositório de modelos jurídicos (procurações, termos de adesão, contratos de cessão — como o de "Red Velvet" na Aetria)
- Trilha de auditoria (importante diante do episódio Fantástico/TV Globo sobre fraudes no setor — o sistema precisa provar processo idôneo)
- Compliance LGPD: consentimento, base legal de tratamento, direito de exclusão de dados

### 1.3 Módulo Financeiro (inclui ArrudaCred PaySmart)
- Faturamento e cobrança de clientes
- Conciliação com fintechs parceiras (Asaas, Inter Empresas, Celcoin, Cora, Neon PJ, BTG Empresas)
- Cálculo e pagamento de comissões a parceiros (accountants/CPAs)
- Fluxo de caixa e DRE simplificado
- Módulo específico PaySmart: monitoramento de split payment (EC 132/2023, LC 214/2025) como gatilho de oportunidade comercial

### 1.4 Módulo Marketing
> 📄 Detalhamento técnico (pipeline de conteúdo, absorvendo o escopo da QMARKA): `MODULO_MARKETING_CONTEUDO_ARRUDACRED.md`
> 📄 Parceiros (revenda) e Afiliados/Influencers (comissão por indicação): `PARCEIROS_AFILIADOS_ARRUDACRED.md`
- Calendário de conteúdo (cadência diária: história → emoção → conteúdo → CTA, adaptado do modelo já usado na Aetria)
- Painel de SEO/AEO — acompanhar posicionamento em buscadores tradicionais e em IA (ChatGPT, Gemini, Claude, Perplexity)
- Gestão de campanhas e captação de leads (landing pages, hotsites como o do PaySmart)
- Integração com WhatsApp/redes sociais para nutrição de leads
- **Gestão de tráfego pago** — via integração MCP com Meta Ads, Google Ads, Taboola e outras plataformas de mídia paga; objetivo é permitir gestão/otimização de campanha assistida por IA dentro do próprio sistema, sem trocar de ferramenta
- **Geração de conteúdo para o blog da ArrudaCred** — cadência constante, voltado para SEO tradicional e AEO/GEO (posicionamento em mecanismos de IA generativa), sempre com revisão antes de publicar
- **Rede de sites satélite (novo, 11/08/2026):** Luiz pretende montar outros sites de conteúdo gerado por IA, bem posicionados organicamente, mas usados como **mídia própria para divulgar os produtos da ArrudaCred** — em vez do modelo tradicional de vender espaço publicitário nesses sites, eles funcionam como funil de geração de leads. Cada site pode virar uma "propriedade" dentro do módulo Marketing, com métricas de tráfego/conversão próprias.

### 1.5 Módulo Operacional (novo, 12/08/2026)
> Mencionado anteriormente (seção de RBAC) como módulo futuro, ainda sem detalhamento próprio — registrado aqui para não se perder, escopo a definir.
- Execução de fato dos serviços contratados (ex.: acompanhamento do processo de limpeza de nome após a venda) — distinto do Comercial (venda) e do Jurídico (processo em si)
- Provável dono da entidade `ordens_servico` já criada em `PARCEIROS_AFILIADOS_ARRUDACRED.md` (desacopla execução de origem comercial)
- Relatórios gerenciais operacionais (produtividade, SLA de execução) — mencionado como motivo para RBAC mais granular no futuro

### 1.6 Camada Transversal (não é "módulo", é infraestrutura interna)
- Autenticação e permissões por papel (RBAC) — importante já pensar em multiusuário mesmo que hoje seja só você
- Log de auditoria em todas as ações sensíveis (quem viu/alterou dado de crédito de quem, quando)
- Dashboard executivo consolidado (visão única dos 4 módulos)
- **Camada de IA interna**: assistente para redigir relatórios de análise 360°, respostas a clientes, peças jurídicas-base — sempre com etapa de revisão humana antes de sair do sistema

---

## 2. Arquitetura e Infraestrutura (proposta inicial — a validar)

**Modelagem de dados do núcleo do sistema:** documentada separadamente em `MODELAGEM_DADOS_ARRUDACRED.md` — padrão Pessoa/Papel (Party Model), que unifica Lead/Cliente/Fornecedor/Parceiro-Afiliado numa única identidade com múltiplos papéis possíveis, suporta PF/PJ com representante legal, e já nasce multi-empresa (ArrudaCred/Aetria/futuras unidades sob a mesma Entidade Legal).

### 2.1 Estratégia de uso de IA — economia de tokens (DECIDIDO em 11/08/2026)

Premissa de Luiz, confirmada: a maioria dos checkpoints do script não exige interpretação por IA (respostas de menu numeradas, sim/não) — só uma minoria (desvios de conversa, FAQ, negociação) realmente precisa.

**Decisão — não fazer self-hosting de modelo próprio (pesquisado e descartado por ora):** avaliei rodar um modelo de IA na VPS da Hostinger para evitar custo de token. A VPS padrão da Hostinger (que Luiz já tem) não inclui GPU — a Hostinger tem uma linha separada de "GPU Server" para IA/ML, mas é produto à parte. Mesmo contratando GPU, não compensa no volume da ArrudaCred: custo de API hospedada (Claude) é da ordem de centavos por oportunidade completa, muito abaixo do custo de manter infraestrutura de GPU rodando, sem contar o trabalho operacional de manter modelo próprio no ar (atualização, monitoramento, uptime).

**Estratégia adotada — três camadas:**
1. **Parser determinístico primeiro** — regex/matching de texto antes de qualquer chamada de IA; só cai pra IA quando o parser não reconhece a resposta ou o passo é aberto por natureza (FAQ, negociação, regra de desvio)
2. **Roteamento por modelo** — modelo mais barato (Claude Haiku) para classificação/interpretação de resposta e roteamento do Agente Maestro; modelo intermediário (Claude Sonnet) reservado para geração de texto que exige nuance (FAQ, negociação, quebra de objeção)
3. **Cache de prompt** — a base de FAQ e as instruções de persona da Malala são reenviadas em toda chamada; usar cache de prompt da API da Anthropic (desconto de até 90% no conteúdo repetido) reduz esse custo fixo sem perder qualidade

**Nota:** valores de preço da API citados aqui foram verificados por busca em 11/08/2026 e podem mudar — reconfirmar direto na documentação oficial da Anthropic (docs.claude.com) antes de orçar/implementar.

**Estimativa de custo em escala (11/08/2026):** simulação para 1.000 leads/dia, considerando que a maioria das ~23 mensagens do script é estática (sem custo de IA) e que IA só entra em interpretação/desvio/negociação — estimativa entre ~$15-27/dia (~$450-800/mês), dependendo de quão bem o parser determinístico reduz a necessidade de chamadas. Mesmo no cenário mais caro, o custo é uma fração pequena da receita gerada por esse volume de leads — reforça a decisão de não investir em infraestrutura própria de IA nesta fase.

### 2.2 Transcrição de áudio — requisito de arquitetura (novo, 11/08/2026)

O lead pode responder ou perguntar por **áudio** no WhatsApp — o sistema precisa transcrever antes de processar. **Confirmado:** a API do Claude não faz transcrição de áudio nativamente dentro do fluxo de mensagens (é um recurso separado do chat de consumidor). Solução: usar um serviço de transcrição dedicado (Whisper da OpenAI, ~$0,006/minuto de áudio — custo irrelevante em qualquer volume realista) antes de o texto entrar no pipeline de interpretação (parser determinístico → IA se necessário, já definido na seção 2.1).

### 2.3 Custo de WhatsApp — fases de crescimento (novo, 11/08/2026; corrigido — ver nota abaixo)

Luiz definiu a estratégia de migração: começar com **API não oficial** durante testes iniciais (~10-15 leads/dia) e migrar para **API oficial da Meta** antes de gerar volume de leads.

**Correção importante (mesmo dia, pesquisa mais aprofundada):** a partir de **1º de outubro de 2026**, a Meta cobra **R$ 0,035 por mensagem de serviço enviada pela empresa** (não por conversa/janela de 24h — é por mensagem individual). Isso é mais granular e, para o nosso caso, mais caro do que a estimativa inicial por conversa, porque o script tem vários blocos de múltiplas mensagens em sequência (cada uma conta separadamente).

| Fase | WhatsApp | IA (Haiku+Sonnet) | Transcrição de áudio |
|---|---|---|---|
| Teste (~10-15 leads/dia, API não oficial) | ~R$60-200/mês fixo (Z-API/Wafly/Evolution — mensagens ilimitadas, sem custo por conversa) | ~R$5-15/mês | poucos reais/mês |
| Escala inicial (~100 leads/dia, API oficial, pós-out/2026) | ~15-20 mensagens/lead × R$0,035 × ~3.000 leads/mês ≈ **R$1.500-2.000/mês** + mensalidade BSP | dezenas de reais/mês | ainda pequeno |
| Volume alto (~1.000 leads/dia) | ~15.000-20.000 mensagens/dia × R$0,035 ≈ **R$16.000-21.000/mês** | ~R$2.500-5.000/mês | ~R$50-100/mês |

**Confirma o padrão:** em volume alto, o custo de WhatsApp oficial domina o orçamento — ainda mais que a estimativa inicial (que usava valor por conversa, não por mensagem).

**Implicação de design a considerar na fase de escala:** como a cobrança é por mensagem individual, os blocos do script com "várias mensagens em sequência sem esperar resposta" (ex.: bloco de credibilidade com 4 mensagens, bloco de proposta com 5) multiplicam o custo diretamente. Vale reavaliar, antes de escalar, se esses blocos podem ser consolidados em menos mensagens mais completas — é uma alavanca de custo sob nosso controle, diferente do preço que a Meta cobra.

**Estratégia de diversificação de canal — em discussão com Luiz:** se o custo de WhatsApp em escala se confirmar alto, a ideia é priorizar canais próprios/gratuitos (**widget no site como principal — sem custo de mensageria, só IA/hospedagem**), com Instagram Direct e Messenger como secundários, deixando o WhatsApp como canal de "sobra" para quem não usa os outros. **Pendente de pesquisa:** não está confirmado se Instagram/Messenger terão cobrança por mensagem equivalente à do WhatsApp — investigar quando essa decisão estiver mais próxima. Se o volume de WhatsApp não for expressivo nesse cenário, pode fazer sentido manter API não oficial mesmo em maior escala, já que ela não tem custo por mensagem.

⚠️ Nota de precisão: os valores desta seção foram checados em fontes de mercado (não a documentação oficial da Meta diretamente) — reconfirmar direto com o BSP escolhido e a documentação oficial antes de orçar de verdade, especialmente porque a cobrança de outubro/2026 ainda é recente e pode sofrer ajustes.

### Considerações que pesam na decisão
- Dados tratados incluem informação financeira e de crédito de terceiros → LGPD é o centro da decisão de arquitetura, não um detalhe posterior
- Você hoje opera sozinho/com equipe enxuta → complexidade de infraestrutura deve ser proporcional (evitar over-engineering de microsserviços logo de cara)
- Há intenção de expandir para PaySmart com parceiros fintech → o sistema deve nascer pensando em integrações via API, não em importação manual de planilha
- **Multi-empresa (novo, 11/08/2026):** o grupo de Luiz tem duas empresas sob a mesma entidade legal — ArrudaCred e Aetria — e existe intenção de trazer a gestão da Aetria para este mesmo sistema mais cedo ou mais tarde. Isso não significa construir os dois agora, mas o modelo de dados deveria já nascer pensando em "empresa/unidade de negócio" como conceito de primeira classe (em vez de assumir uma única empresa fixa) — retrofitting multi-empresa depois costuma ser bem mais caro do que prever isso desde o desenho inicial do banco de dados.

### Proposta de abordagem
- **Padrão de arquitetura:** monólito modular bem organizado por módulo (Comercial/Jurídico/Financeiro/Marketing como domínios internos) — migrar para serviços separados só se/quando o volume justificar
- **Hospedagem:** priorizar data center no Brasil (AWS sa-east-1 São Paulo, GCP southamerica-east1, ou provedores nacionais) — reduz latência, facilita conformidade e é um argumento de confiança comercial ("seus dados ficam no Brasil")
- **Banco de dados:** relacional (PostgreSQL) — o domínio é fortemente relacional (cliente → processo → restrição → cobrança)
- **Segurança mínima não-negociável:** criptografia em repouso e em trânsito, backup automatizado com teste de restauração, RBAC, log de auditoria imutável, MFA para acesso administrativo

*(Este tópico precisa de uma sessão dedicada — stack de backend/frontend, se será SaaS multi-tenant futuramente, etc. Vamos detalhar em documento filho `02_ARQUITETURA_INFRA.md` quando chegarmos nele.)*

---

## 3. Recursos Externos / APIs Necessárias (mapeamento inicial)

| Categoria | Opções | Para qual módulo |
|---|---|---|
| Dados de crédito / SCR-Bacen | Serasa Experian API, Boa Vista API, Quod API | Comercial |
| Pagamentos/fintech | **Asaas** (já em uso — DECIDIDO) | Financeiro |
| Assinatura eletrônica de contratos | **Assinafy** (já em uso — DECIDIDO) | Jurídico |
| Comunicação com cliente | WhatsApp — **DECIDIDO**, ver seção 8.5 (API oficial Meta via Zapster) | Comercial/Marketing |
| Consulta de CNPJ/empresas | ReceitaWS, CNPJá, Brasil API | Comercial (qualificação de lead) |
| E-mail marketing/automação | RD Station, Brevo, Mailchimp | Marketing |
| IA generativa (relatórios, respostas, análises) | API Anthropic (Claude) | Transversal |
| Monitoramento SEO/AEO | ferramenta a definir (AutoSEO já avaliado anteriormente) | Marketing |

> Nota sobre PaySmart: é uma frente estratégica paralela da ArrudaCred (split payment / reforma tributária), documentada em conversas anteriores, mas **não é pré-requisito do MVP deste sistema**. Fica registrada aqui só para não se perder, sem entrar no escopo imediato.

---

## 4. Agentes de IA disponíveis para apoiar o desenvolvimento (panorama 2026)

Ferramentas mais relevantes hoje para um projeto deste porte, tocado por um fundador não-desenvolvedor full-time trabalhando junto com IA:

- **Claude Code** — agente de terminal, forte em entender bases de código grandes e complexas, boa opção para construir e manter o sistema de forma supervisionada, com você aprovando cada mudança.
- **Cursor** — editor com IA embutida, ótimo para quem quer ver e ajustar o código visualmente enquanto a IA sugere; ponto forte é integração fina no dia a dia de edição.
- **Replit Agent 3** — monta aplicações full-stack já hospedadas, bom para prototipagem rápida de um MVP funcional sem se preocupar com infraestrutura no início.
- **GitHub Copilot (modo agente)** — se o fluxo de trabalho for centrado em issues/PRs do GitHub, tem a integração mais profunda com esse ecossistema.
- **Devin** — agente autônomo que pega uma tarefa bem definida e entrega sozinho (inclusive PR pronto); mais indicado para tarefas fechadas e bem especificadas do que para a fase de exploração inicial.

<cite index="7-1">A abordagem mais comum entre times produtivos em 2026 é combinar duas ou três dessas ferramentas em vez de escolher uma única</cite> — por exemplo, planejar e construir a espinha dorsal com Claude Code (aqui mesmo, nesta conversa e em sessões de Claude Code) e usar Replit Agent para prototipar telas rapidamente.

Para um fundador não-técnico tocando o projeto, uma combinação realista seria: **Claude (aqui, para planejamento/documentação) + Claude Code (para escrever e manter o sistema) + Replit ou Cursor conforme a necessidade prática de cada fase.**

*(Vale abrir um documento filho `04_AGENTES_IA.md` com decisão final e configuração de cada ferramenta quando começarmos a fase de código.)*

---

## 5. Priorização — histórico da decisão

> ⚠️ **Esta seção é a proposta inicial, hoje superada pela decisão final registrada na seção 7.3.** Mantida aqui só como histórico de raciocínio (mostra por que a ordem mudou). **A ordem vigente é: Comercial → Marketing → Financeiro → Jurídico** (seção 7.3).

Critério da proposta inicial: **começar pelo módulo que já gera receita hoje e mais sofre com trabalho manual.**

1. ~~Comercial~~ → 2. ~~Financeiro~~ → 3. ~~Jurídico~~ → 4. ~~Marketing~~ *(ordem descartada — ver seção 7.3 para a decisão final e o porquê da mudança)*

---

## 6. Estrutura de Documentação do Projeto (convenção real em uso — atualizado em 12/08/2026)

> ⚠️ A estrutura de pastas numeradas (`01_ESCOPO_MACRO.md`, `02_ARQUITETURA_INFRA.md` etc.) proposta na primeira versão deste documento **não é a que seguimos na prática** — na prática, criamos **um documento por assunto, com nome descritivo**, todos na mesma pasta, referenciados a partir deste plano mestre. Documentando a convenção real:

```
PLANO_MESTRE_SISTEMA_ARRUDACRED.md        ← este arquivo (índice + visão geral, sempre atualizado)
MODELAGEM_DADOS_ARRUDACRED.md             ← núcleo de dados (Pessoa/Papel, multi-canal, RBAC, config)
SCRIPT_LIMPANOME_SERASA_SPC.md            ← script de atendimento do produto Limpeza de Nome
FAQ_LIMPANOME_SERASA_SPC.md               ← base de conhecimento da Malala (mesmo produto)
KANBAN_COMERCIAL_LIMPANOME.md             ← funil/Kanban do Comercial (mesmo produto)
REGUA_COBRANCA_ARRUDACRED.md              ← régua de cobrança pós-contrato (uso futuro, Financeiro)
MODULO_MARKETING_CONTEUDO_ARRUDACRED.md   ← pipeline de conteúdo/blog multi-site
PARCEIROS_AFILIADOS_ARRUDACRED.md         ← parceiros (revenda) e afiliados (comissão)
```

**Regra prática (mantida):** ao final de cada sessão de planejamento, peça para eu atualizar o(s) arquivo(s) correspondente(s) antes de encerrar — assim nada se perde mesmo que a conversa fique longa. Quando um assunto novo começa a crescer dentro de um documento existente, ele ganha um documento próprio (foi o caso do Marketing e de Parceiros/Afiliados) — o plano mestre sempre aponta para onde cada assunto mora.

---

## 7. Decisões Registradas

### 7.1 Hospedagem/Infraestrutura — DECIDIDO em 11/08/2026
**Nome do sistema/aplicação — DECIDIDO em 12/08/2026: "Hub Arruda"** (reaproveita o nome institucional já usado — "ArrudaCred – HUB Arruda de Negócios e Serviços" — em vez de nomear o sistema só como "ArrudaCred", já que ele também vai gerir a Aetria e futuras unidades do grupo).

**Infraestrutura criada — 12/08/2026:**
- **Supabase:** projeto `hub-arruda`, Project ID `mzvaqjhalynaceecnayt`, região `sa-east-1` (São Paulo, confirma decisão da seção 2 do plano mestre), URL `https://mzvaqjhalynaceecnayt.supabase.co`.
- **Próximo passo técnico:** ✅ concluído — `001_nucleo.sql` e `002_comercial.sql` rodados com sucesso no Supabase (12/08/2026), com RLS ativado em todas as tabelas (bloqueio padrão até políticas serem definidas — o backend acessará via `service_role`, que ignora RLS).
- **GitHub:** repositório criado — `https://github.com/contatoarrudacred/hub-arruda`
- **Vercel:** projeto criado — `hub-arruda.vercel.app`, conectado ao repositório acima. Sem deployment de produção ainda (esperado — repositório vazio até o Claude Code começar a escrever a aplicação).

**✅ Trio de infraestrutura completo (12/08/2026):** Supabase (`hub-arruda`, sa-east-1, schema deployado) + GitHub (`contatoarrudacred/hub-arruda`) + Vercel (`hub-arruda.vercel.app`, conectado ao GitHub). Próximo passo: kickoff no Claude Code.

Stack escolhida por Luiz:
- **Supabase** — banco de dados (Postgres gerenciado), autenticação e storage. Supabase tem região **sa-east-1 (São Paulo)** disponível — usar essa região no projeto para manter os dados no Brasil (relevante para LGPD, dado que o sistema trata dados de crédito/financeiros).
- **Vercel** — hospedagem do frontend/aplicação e funções serverless.
- **GitHub** — versionamento de código e base para CI/CD.
- **Reserva:** plano de hospedagem + VPS já existentes na Hostinger, disponíveis caso surja necessidade de rodar algo fora do trio acima (ex.: automações via n8n, serviços que não cabem bem em serverless, backups adicionais).

Esse é um stack moderno e muito usado por times enxutos — combina bem com os agentes de IA de código (todos eles — Claude Code, Cursor, Replit — trabalham bem nesse conjunto GitHub+Vercel+Supabase).

### 7.2 Ferramenta de IA principal para código — RECOMENDAÇÃO (pendente de confirmação)
Ver seção 4 acima. Recomendação: **Claude Code** como parceiro principal, com possibilidade de usar Cursor como apoio visual pontual. Motivo detalhado na conversa: você já tem um jeito de trabalhar comigo (iterativo, revisando cada mudança) e o Claude Code mantém essa mesma dinâmica, só que dentro do código, além de se integrar bem com GitHub.

### 7.3 Ordem de prioridade dos módulos — DECIDIDO em 11/08/2026

Diagnóstico levantado com Luiz:
- Maior consumo de horas manuais hoje: **Financeiro** (cobrança/conciliação/comissionamento), **Marketing** (produção de conteúdo) e, acima de tudo, **atendimento manual de leads via WhatsApp**.
- Maior travamento do crescimento: **perder leads por demora na resposta** e **pouca visibilidade/geração de leads novos**.

O ponto em comum das duas respostas é o atendimento ao lead — é onde o tempo é gasto E é o que mais trava crescimento. Por isso a prioridade #1 muda de foco: não é só "gerar propostas mais rápido", é **automatizar a captação e a primeira resposta ao lead (WhatsApp)**, plugando a geração de proposta/relatório 360° na sequência.

**Ordem final:**
1. **Comercial** — com foco imediato em automação de atendimento ao lead via WhatsApp (resposta rápida, triagem, encaminhamento) + geração de proposta/relatório 360°
2. **Marketing** — visibilidade e geração de leads novos (alimenta o módulo Comercial)
3. **Financeiro** — cobrança, conciliação, comissionamento (PaySmart)
4. **Jurídico** — sem sinal de dor aguda no momento; entra por último, mas continua obrigatório por causa do compliance

---

## 8. Módulo Comercial — Detalhamento (MVP, em construção)

### 8.1 Diagnóstico do problema real
Hoje Luiz atende manualmente todo lead que chega no WhatsApp, usando um **script próprio já definido (início, meio e fim)**. Isso consome tempo demais e trava duas coisas:
- **Follow-up** — leads esfriam por falta de acompanhamento sistemático
- **Controle de oportunidades** — não existe funil visível, é tudo na cabeça/WhatsApp
- **Tempo para evoluir o próprio negócio** — captação de leads e melhoria do script ficam sempre em segundo plano porque o operacional consome o dia

O fato do script já ter início/meio/fim definidos é uma vantagem: dá pra transformar isso em um **fluxo automatizado determinístico** (mais seguro, menos risco de alucinação de IA) em vez de um chat livre de IA — a IA entra para personalizar detalhes e liberar o Luiz para os pontos de decisão real (proposta comercial, negociação, fechamento).

### 8.2 Requisitos levantados até agora
- Integração com WhatsApp (número comercial existente)
- Motor de fluxo que segue o script já validado (início → meio → fim), com follow-up automático programado quando o lead não responde
- Funil de oportunidades (Kanban): Novo lead → Primeiro contato → Proposta enviada → Negociação → Fechado/Perdido
- Handoff claro para Luiz nos pontos que exigem julgamento humano (negociação de valor, fechamento, exceções)
- Métricas básicas: tempo de resposta, taxa de conversão por etapa do funil

### 8.3 Arquitetura de atendimento — Agente Maestro + Agentes Especializados (novo, 11/08/2026)
Correção de escopo importante: o número de WhatsApp comercial é **único** e recebe leads interessados em produtos diferentes, além de contatos em estágios diferentes de relacionamento. Produtos/motivos de contato já identificados:
- Limpa Nome (nas variantes Serasa/SPC, Registrato/SCR, CCF, Jusbrasil/Escavador)
- Aumento de score/rating
- Consultas avulsas
- Interesse em virar parceiro/afiliado
- Crédito
- Consórcio
- (lista aberta — "e outros")

Estágios de relacionamento possíveis no mesmo canal:
- **Lead novo** (primeiro contato)
- **Cliente atual** precisando de atendimento pós-venda, suporte ou financeiro
- **Ex-cliente** buscando recontratar

**Padrão de arquitetura definido:** um **Agente Maestro (roteador)** recebe toda mensagem que chega, e é responsável por:
1. Verificar se o número já existe na base (cliente atual/ex-cliente) — isso deveria ser determinístico (consulta ao CRM), não depender de IA adivinhar
2. Identificar produto/intenção de interesse — quando não é óbvio, faz perguntas de esclarecimento antes de rotear (em vez de assumir)
3. Encaminhar para o **agente especializado** correspondente (um "especialista" por produto/situação: Limpa Nome, Score, Consultas, Parceiros/Afiliados, Crédito, Consórcio, Pós-venda/Suporte, Financeiro, Recontratação)
4. Ficar atento a sinais de que precisa escalar para humano (ver 8.4)

**Regra de sequenciamento entre produtos correlatos (novo, 11/08/2026):** quando um lead demonstra interesse em mais de um produto relacionado ao mesmo tempo (ex.: Serasa/SPC + BACEN/SCR/CCF, ou Aumento de Rating, ou Jusbrasil/Escavador), existe uma **ordem correta de venda** definida pelo negócio — hoje, sempre vender **Serasa/SPC primeiro**, porque a limpeza nesses órgãos é pré-requisito para a defesa usada no processo do BACEN. Essa regra deve ser configurável no roteamento do Agente Maestro (não só uma resposta isolada de FAQ), já que impacta a ordem em que os agentes especializados são acionados.

Esse padrão é conhecido em sistemas de atendimento com IA como **triagem + roteamento** (parecido com uma recepção de hospital: uma "enfermeira de triagem" identifica o caso e encaminha para o especialista certo, em vez de um único atendente tentar saber tudo). Faz sentido tecnicamente e evita dois problemas comuns: um agente genérico tentando cobrir produtos demais (mais chance de erro/alucinação) e um cliente/ex-cliente sendo tratado como lead novo (péssima experiência).

### 8.4 Escalonamento para supervisor humano — PREMISSA DEFINIDA
Sempre que a atendente virtual:
- **não souber responder** algo, ou
- **detectar o lead se exaltando / usando linguagem agressiva ou grosseira**

→ o atendimento é transferido para um **supervisor humano**, que tem duas opções:
- **Assumir o atendimento até o fim**, ou
- **Responder só a dúvida pontual e devolver a conversa para a atendente virtual continuar o fluxo normalmente**

Implicação técnica: precisa existir uma fila/painel de "conversas aguardando supervisor", um jeito do supervisor "assumir" e "devolver" o chat sem perder contexto (a IA precisa saber o que já foi dito enquanto o humano respondeu), e um registro de quantas vezes/por que motivo cada escalonamento aconteceu (isso também vira dado útil para melhorar o script com o tempo).

### 8.5 Integração com WhatsApp — DECIDIDO em 11/08/2026, com ajuste
**Provedor principal: API Oficial (Meta Cloud API via BSP)** — pela segurança do número comercial já estabelecido e previsibilidade de custo.

**Ajuste importante:** o sistema não deve ficar preso a um único provedor. Precisa de uma **camada de abstração** entre a lógica de atendimento e o provedor de baixo nível, para que dê pra usar API oficial Meta (principal) **e** APIs de terceiros (Z-API, Evolution API, WPPConnect etc.) quando fizer sentido (custo, redundância, testes), sem precisar reescrever a lógica de negócio ao trocar de provedor.

Trade-offs a ter em mente:
- API oficial: mais segura para o número principal, cobrança por mensagem/categoria (conversas iniciadas pelo lead são gratuitas até um limite mensal), exige mensalidade de um BSP por cima da API crua. Ponto de atenção: <cite index="23-1">a partir de outubro de 2026 a Meta passa a cobrar também pelas respostas da empresa ao cliente</cite> — isso muda o cálculo de custo (informação de fonte única, vale confirmar direto no painel da Meta antes de fechar o orçamento)
- API de terceiros: mais barata, sem burocracia de aprovação Meta, mas com risco real de banimento do número — por isso não deve ser usada no número comercial principal sem avaliação cuidadosa

**BSP escolhido — DECIDIDO em 11/08/2026: Zapster API.** Motivo principal: suporta a mesma rota de integração tanto no modo não-oficial (fase de teste) quanto oficial (fase de escala) — a migração planejada por Luiz (não-oficial → oficial, antes de gerar volume de leads) não exige reescrever a integração no sistema, só trocar configuração. Suporte em português, infraestrutura gerenciada (sem DevOps próprio), mensalidade a partir de ~R$47-59/mês por instância. Alternativa para reavaliar se o volume crescer muito e o markup pesar: **360dialog** (menor markup do mercado para quem já tem sistema próprio por cima, sem pagar por dashboard não utilizado).

### 8.6 Autonomia da IA no atendimento — DECIDIDO em 11/08/2026
**Regra geral:** a IA conduz o fluxo inteiro (início ao fim, seguindo o script validado), e só aciona Luiz para negociação/fechamento.

**Regra de exceção — leads de alto valor:** quando a IA identificar (pela qualificação inicial) que o lead é candidato a um orçamento de valor alto, ela **não envia a proposta direto**. Em vez disso:
1. Faz apenas a qualificação
2. Tenta agendar uma call/ligação com Luiz para ele apresentar a proposta pessoalmente
3. **Se o lead recusar a call e pedir para receber a proposta pelo WhatsApp mesmo:** a IA sinaliza internamente o lead como **"alto valor"** no funil e, a partir daí, segue o mesmo fluxo de envio de proposta usado para os leads de valor menor (ela mesma envia, usando as métricas/critérios já definidos)

### 8.7 Critério de qualificação e valor — DECIDIDO em 11/08/2026 (regra específica do produto Limpa Nome)
> ⚠️ Correção importante: o corte abaixo **não é uma regra geral do sistema** — é uma regra do produto **Limpa Nome** especificamente. Cada produto tem seu próprio script de vendas e suas próprias regras de corte/qualificação (ver 8.8).
- **Valor da restrição:** autodeclarado pelo próprio lead numa das etapas do atendimento (sem consulta paga Serasa/SPC neste momento, por causa do custo alto por consulta)
- **Consulta paga:** só entra em dois casos — (1) depois do contrato assinado, como parte do processo; (2) como produto vendido à parte, para o lead que não sabe ou não consegue consultar sozinho de forma gratuita
- **Corte de valor (só Limpa Nome):** restrição **acima de R$ 500 mil** → IA qualifica e tenta agendar call/ligação com Luiz (regra da seção 8.6). Restrição **até R$ 500 mil** → a "atendente virtual" (IA) tem métricas próprias para calcular e apresentar a proposta sozinha

### 8.8 Princípio de design — o sistema é multi-produto, não só "limpa nome"
Correção de escopo importante levantada por Luiz: **a plataforma não pode travar/engessar pensando só em limpa nome.** Limpa nome é o produto principal hoje, mas a ArrudaCred já pretende vender e controlar outros produtos, com dois modelos de receita diferentes:
- **Produto próprio** (ex.: limpa nome) — receita direta pela prestação do serviço
- **Produtos de terceiros ofertados pela ArrudaCred** (ex.: consórcio, linhas de crédito bancárias) — receita por **comissionamento de intermediação** (a ArrudaCred indica/vende, o banco/operadora de consórcio executa)

**Produtos já conhecidos hoje (atualizado em 11/08/2026, com base no menu de triagem real do WhatsApp):**
| Produto | Tipo | Status |
|---|---|---|
| Limpeza de Nome (CPF/CNPJ) — Serasa/SPC | Próprio | Ativo, principal produto hoje |
| Aumento de Score/Rating | Próprio | Ativo |
| BACEN/SCR/CCF | Próprio | Ativo — produto separado de Limpeza de Nome (não é variante) |
| Jusbrasil/Escavador | Próprio | Ativo |
| Conta Protegida (Bloqueio Judicial) | Próprio | Ativo |
| Consórcio | Terceiro (comissão) | Prestes a iniciar venda |
| Crédito diversos (financiamentos, empréstimos e outros) | Terceiro (comissão) | Prestes a iniciar venda |
| Assinatura de veículos | Terceiro (comissão) | Intenção de trabalhar, ainda não iniciado |
| Parceria/Afiliação | — | Mencionado como motivo de contato possível; ainda não tratado como "produto" formal |
| Outro assunto | — | Catch-all do menu de triagem, não é produto |

**Implicação de arquitetura (vale desde o desenho do banco de dados):** "Produto" precisa ser uma entidade configurável desde o início, não um valor fixo no código. Cada produto carrega, **de forma editável pelo admin do sistema (sem precisar de deploy/programador para atualizar)**:
- Nome, tipo (próprio / terceiro), parceiro executor (quando terceiro), fonte de receita (venda direta / comissão)
- **Script de vendas/qualificação próprio** — cada produto tem seu roteiro de atendimento, diferente do Limpa Nome
- **Regras de qualificação e corte próprias** (ex.: o corte de R$ 500 mil é regra do Limpa Nome; consórcio/crédito/assinatura de veículo vão ter os próprios critérios, ainda a definir quando entrarmos no detalhamento de cada um)

Isso afeta pelo menos três módulos:
- **Comercial:** o funil e o script de qualificação da IA precisam suportar produto variável, cada um com seu próprio fluxo de atendimento configurável
- **Financeiro:** comissionamento de terceiros (receita entrando por indicação) é uma fonte de receita distinta do comissionamento que a ArrudaCred paga aos seus parceiros indicadores (despesa) — os dois fluxos de comissão não podem ser confundidos no modelo de dados
- **Admin/Configuração (transversal):** precisa existir uma tela de gestão de produtos onde Luiz (ou quem ele autorizar) cadastra/edita produto, script e regras sem depender de alteração de código

### 8.9 Editor de fluxo de atendimento — requisito estrutural (novo, 11/08/2026)
Confirmado por Luiz durante o levantamento do script real: o fluxo de atendimento de cada produto **precisa ser editável por um admin autenticado**, sem depender de programador ou novo deploy. O editor precisa suportar, no mínimo:
- Adicionar/remover etapa do fluxo
- Editar texto de qualquer mensagem
- Trocar mídia associada a uma etapa (imagem, áudio)
- Reordenar passos

**Implicação de arquitetura:** o script de cada produto não pode ser hardcoded no código da aplicação — precisa existir uma representação de dados editável (passos configuráveis em banco de dados, com um editor visual por cima) que o motor de atendimento interpreta em tempo de execução. Isso é peça central do MVP do Comercial, não um "nice to have" de fase 2 — o levantamento do script real (documento `SCRIPT_LIMPANOME_SERASA_SPC.md`) está sendo feito justamente para alimentar o desenho desse editor. **Inclui também valores/variáveis de negócio referenciadas dentro das mensagens** (ex.: preço mínimo do serviço citado em uma orientação ao lead) — esses valores precisam ser campos configuráveis e reutilizáveis entre mensagens, não texto fixo duplicado em cada lugar onde aparecem. **E inclui também qual resposta do lead vira dado salvo na oportunidade** — o admin deve poder marcar, checkpoint a checkpoint, se a resposta é persistida como campo da oportunidade (e com qual nome), para uso posterior em relatórios, personalização de follow-up etc. **E inclui também a agenda de follow-up por checkpoint** — nem toda mensagem usa a mesma cadência de retomada (ex.: a mensagem de proposta tem agenda própria, diferente das mensagens comuns do fluxo); o mecanismo de follow-up precisa suportar agenda configurável por checkpoint desde o início, não só uma agenda global única. **E inclui também blocos de conteúdo compartilhados entre "script" e "base de conhecimento"** — um mesmo bloco de texto (ex.: dados institucionais da empresa) pode ser usado tanto como mensagem sequencial do fluxo quanto como conhecimento livre que a IA consulta fora do fluxo; precisa ter fonte única, referenciada nos dois lugares, para não exigir atualização duplicada quando um dado mudar.

**Valores monetários/parâmetros configuráveis já identificados (lista crescente, consolidada aqui para referência rápida — detalhe de cada um está nos documentos de origem):**
| Valor/parâmetro | Uso | Documento de origem |
|---|---|---|
| Investimento mínimo (R$ 899 à vista / 6x R$ 299) | Orientação a lead de baixo valor (Limpeza de Nome) | `SCRIPT_LIMPANOME_SERASA_SPC.md`, Passo 7 |
| Tabela de preço por faixa de restrição (à vista/parcelado/voucher) | Cálculo da proposta (Limpeza de Nome) | `SCRIPT_LIMPANOME_SERASA_SPC.md`, Passo 15 — **valores preenchidos em 11/08/2026**; faixas e preços ambos configuráveis pelo admin |
| Taxa de acionamento do seguro-garantia (R$ 250,00 por CPF/CNPJ) | Acionamento do seguro-garantia 12 meses | `FAQ_LIMPANOME_SERASA_SPC.md`, FAQ 4 |
| Fórmula de previsibilidade para alto valor (R$ 7.680 + 1,5% do valor da restrição) | Estimativa de receita nos cards do Kanban, oportunidades acima de R$ 500 mil | `KANBAN_COMERCIAL_LIMPANOME.md` |
| Corte de alto valor (R$ 500 mil) | Decide se qualifica-e-agenda call ou qualifica-e-propõe direto (Limpeza de Nome) | Seção 8.7 deste documento |
| Janela de horário comercial (09h-21h confirmado), dias não úteis/feriados | Motor de follow-up | `SCRIPT_LIMPANOME_SERASA_SPC.md`, premissas gerais |
| Agenda padrão de follow-up (10min/45min/4h/24h/3d/7d/10d + nutrição 30/60/90d) | Motor de follow-up — agenda padrão confirmada | `SCRIPT_LIMPANOME_SERASA_SPC.md`, premissas gerais — agenda da proposta ainda pendente |
| Limite de interações de FAQ antes de escalonamento por engajamento (5) | Subetapa Negociação/Dúvidas | `KANBAN_COMERCIAL_LIMPANOME.md` |
| Régua de cobrança (D+1 a D+29, multicanal) | Cobrança de parcela em atraso pós-contrato — uso futuro, módulo Financeiro | `REGUA_COBRANCA_ARRUDACRED.md` |

---

### 8.10 MVP1 — Primeira entrega do sistema (escopo fechado em 11/08/2026)

**Nota de arquitetura — reaproveitamento futuro em outros canais:** o MVP1 roda só via WhatsApp, onde o número do lead já é conhecido pelo próprio canal (não precisa ser perguntado). Se o mesmo script/fluxo for reaproveitado futuramente em outro canal sem identificação automática de telefone (ex.: Instagram, Messenger, widget no site), será necessário adicionar um checkpoint específico perguntando o WhatsApp do lead. Vale ter isso em mente ao desenhar o motor de atendimento — o canal de origem não deveria estar hardcoded nas premissas do fluxo.

**Definição:** o primeiro entregável funcional do sistema é o **Agente de Atendimento no WhatsApp**, ligado ao **CRM** e ao **módulo de Admin/Configuração** — não o sistema completo.

**Dentro do escopo do MVP1:**
- Atendimento via WhatsApp (API oficial Meta), com o Agente Maestro roteando e o fluxo automatizado completo **apenas para o produto Limpeza de Nome Serasa/SPC** (o script já detalhado neste levantamento)
- CRM/Kanban funcionando de ponta a ponta para esse produto, incluindo as etapas manuais finais (ver abaixo)
- Módulo de Admin/Configuração **completo e genérico desde o início** — editor de fluxo, valores configuráveis, agenda de follow-up, base de FAQ, tabela de preços — **não uma versão simplificada**. Decisão explícita de Luiz: construir já do jeito definitivo, para não precisar alterar depois algo que já estará em produção e funcionando (risco de regressão).

**Fora do escopo do MVP1 (manual por enquanto):**
- **Outros produtos do menu** (Score, BACEN/SCR/CCF, Jusbrasil/Escavador, Conta Protegida, Consórcio, Crédito, Outro assunto): se o lead optar por qualquer um desses na triagem, é **direcionado direto para atendimento humano** — sem fluxo automatizado próprio ainda
- **Elaboração do contrato:** feita manualmente por Luiz (fora do sistema, ou com apoio pontual), em vez de integração automática com a Assinafy
- **Cobrança/Asaas:** configurada manualmente por Luiz, em vez de sincronização automática

**Implicação para o CRM (requisito adicional):** como as etapas finais (Dados para Contrato → Assinatura → Pagamento → Ganha) não têm automação/webhook no MVP1, o Kanban precisa suportar **transição manual de estágio** nessas etapas — alguém move o card manualmente conforme o contrato é gerado e o pagamento confirmado fora do sistema. Isso é um requisito do CRM desde já, não uma limitação temporária a ignorar.

### 8.11 Corte de produção — problema do "dia zero" sem histórico (novo, 11/08/2026)

**Problema identificado por Luiz:** no dia em que a Malala entrar em operação, ela não terá nenhum histórico de atendimento — então qualquer pessoa que mandar mensagem a partir desse momento (incluindo clientes atuais e leads já em negociação por fora do sistema) seria tratada como lead novo e entraria no pipeline incorretamente.

**Solução em duas camadas — DECIDIDO em 11/08/2026:**

1. **Migração prévia de contatos conhecidos (mitigação primária):** antes do lançamento, importar para o CRM os números já reconhecidos como cliente atual ou em negociação (mesmo que manualmente). Isso aproveita a checagem determinística que o Agente Maestro já faz por número (seção 8.3) — quanto mais completa a migração, menos casos caem no plano B abaixo.

2. **Pergunta de segurança na identificação (plano B, para números não migrados):** logo após capturar o nome, se o número não for reconhecido, uma pergunta adicional de triagem:
   ```
   Não localizei histórico de conversa neste número...
   👉 Você já é cliente? Está em negociação ou este é o seu primeiro contato conosco?

   1️⃣ Já sou cliente
   2️⃣ Estou em negociação
   3️⃣ Primeira Vez
   ```
   - **Resposta 1 ou 2** → escalona para supervisor humano, usando o mesmo mecanismo de escalonamento já existente (seção 8.4), com motivo próprio: `CONTATO PRÉ-EXISTENTE NÃO MIGRADO`
   - **Resposta 3** → segue o fluxo normal como lead novo

**Desativação da pergunta:** monitorar o volume de respostas 1/2 ao longo do tempo; quando cair para um nível baixo, a pergunta deixa de ser necessária. **Fica como toggle configurável pelo admin** (liga/desliga manualmente), em vez de um critério de desativação 100% automático — consistente com o padrão de configurabilidade já usado em todo o resto do sistema.

---

## 9. Controle de Custos de Recursos Externos (transversal, novo — 11/08/2026)
Premissa definida por Luiz: **tudo que consome recurso externo (em geral, APIs pagas) precisa ter controle e acompanhamento de gasto** — não só o atendimento via WhatsApp, o app inteiro.

Requisito: um módulo de **"governança de custo"** (dentro do Financeiro, alimentado pelos outros módulos) que:
- Registra o custo estimado de cada chamada a recurso externo pago (WhatsApp/Meta, consultas Serasa/SPC/bureaus, API Anthropic/IA, tráfego pago, assinatura eletrônica, etc.), amarrado a que módulo/produto/cliente gerou aquele custo
- Mostra um painel de gasto por categoria e por período (dia/semana/mês)
- Permite configurar alertas de orçamento (ex.: avisar quando o gasto com WhatsApp ultrapassar X no mês)
- Serve de insumo para precificação (saber quanto custa atender um lead até o fechamento, por produto)

---

## 10. Segurança e Auditoria (detalhado, novo — 14/08/2026)
> 📄 Detalhamento técnico: `SEGURANCA_E_AUDITORIA_ARRUDACRED.md`

Aprofunda os bullets soltos da seção 2 ("segurança mínima não-negociável") em resposta a uma pergunta direta de Luiz sobre segurança externa (prompt injection na Malala, ataque na tela de login, abuso pra gastar crédito de IA) e auditoria interna (trilha de INSERT/UPDATE/DELETE). Resumo:
- **Segurança externa:** a arquitetura atual já bloqueia por desenho o cenário "IA manipulada pra agir no banco" — motor determinístico, zero SQL bruto no projeto, IA (quando ligada na Fase 5) só classifica texto, nunca executa comando. Login já usa `getUser()` revalidado no servidor (Supabase Auth). Faltam: MFA administrativo, e — só quando Fase 5/7 forem implementadas — limite de chamadas de IA por lead, verificação de assinatura do webhook do WhatsApp, circuit breaker de orçamento diário.
- **Auditoria interna:** ✅ implementada (14/08/2026), incluindo captura de "quem fez" — trigger genérico no Postgres (`20260814150000_auditoria_log.sql`), grava antes/depois em JSON em 6 tabelas (`etapas_fluxo`, `fluxos`, `usuarios_sistema`, `pessoas`, `conversas`, `oportunidades`). O painel admin passou a escrever com o cliente autenticado (RLS) em vez de service_role, e uma migration seguinte (`20260814160000_auditoria_quem_fez.sql`) liga `auth.uid()` no log — decisão de Luiz de não adiar essa parte, mesmo com um admin só hoje. **Pendente:** Luiz rodar as duas migrations, nessa ordem, no SQL Editor do Supabase — até lá, `/admin/fluxos` aparece vazio (RLS bloqueando por falta da política, não é perda de dado).

### 10.1 Prompt de sistema/persona da Malala — 🔶 v4, revisão cirúrgica de Luiz aplicada (14/08/2026)
> 📄 `PERSONA_MALALA_PROMPT_SISTEMA.md`

Luiz esclareceu o papel exato da FAQ (ver `FAQ_LIMPANOME_SERASA_SPC.md`): ela é a base de consulta que a IA usa quando uma pergunta **não** está coberta implicitamente pelo prompt de sistema da Malala. Escrito e refinado em várias rodadas com Luiz (14/08/2026) — identidade, **princípio central de venda consultiva**, tom de voz, técnicas comerciais reenquadradas como apoio ao princípio consultivo, regra de desvio, **regra travada de preço** (proposta sempre vem do mecanismo determinístico `ln_passo15_router`/`regras-limpeza-nome.ts`, IA nunca calcula), acesso ao histórico completo da conversa, banco de objeções, limites/guardrails, regras de escalonamento. Luiz leu o documento inteiro e deu nota ~9/10, "mais perto de produção do que de rascunho" — aplicados os ajustes que ele pediu: transparência sobre ser IA (nunca finge ser humana, mas também não fica lembrando disso toda hora), regra de "uma pergunta por vez" (não virar formulário), resposta proporcional à complexidade da dúvida, suavizar "responde exatamente" pra interpretação semântica (evita "Malala burra de formulário"), critério de "argumento novo" na persistência (objeção precisa comandar o argumento, não empilhar credenciais repetidas), regra geral de certeza contra suposição/alucinação, cuidado pra nunca verbalizar ao lead "a dor é sua", e correção de emoji (🙋‍♂️🙋‍♂️ não condiz com personagem mulher, limite de 0-2 emoji por mensagem).

**Duas pendências registradas nesta rodada:**
- O emoji 🙋‍♂️🙋‍♂️ errado está no **conteúdo real já seedado** (`etapas_fluxo`, etapa `saudacao_inicial`) e hardcoded em `regras-limpeza-nome.ts` — não é só ajuste de documento, precisa de correção pontual de conteúdo/código quando encaixar.
- Luiz sugeriu rodar uma bateria de ~20-30 conversas adversariais contra o prompt antes de considerar pronto pra produção — viável hoje mesmo (testar o prompt isolado, sem esperar a Fase 5 existir), ainda não feito.

**Nota técnica registrada para a implementação da Fase 5:** o encaixe `InterpretadorIA` (`src/lib/motor-fluxo/tipos.ts`) hoje só recebe a etapa atual e a resposta do lead — não recebe o histórico da conversa. Passar o histórico completo (tabela `mensagens`, já captura toda mensagem trocada independente da origem) é um ajuste necessário nessa implementação futura.

### 10.2 Banco de objeções — ✅ tabela + CRUD + 50 objeções reais (14-15/08/2026)

Luiz pediu explicitamente que objeções vivam no banco, não em arquivo de texto ("fica ruim para gestão e administração"). Tabela `objecoes` criada (`20260814170000_banco_objecoes.sql`, mesmo padrão de `faqs`: `produto_id`, `objecao`, `como_lidar`, `ativo`), CRUD construído no admin (`/admin/objecoes`, junto com `/admin/faqs`), e em 15/08/2026 Luiz trouxe um documento próprio ("Banco de Objeções — Malala/ArrudaCred V2") com 50 objeções reais organizadas em 7 categorias (medo/confiança, reputação, preço/concorrência, dinheiro/pagamento, adiamento, terceiros, desistência) — viraram dados via `20260815100000_banco_objecoes_v2_dados.sql`. O framework que veio junto (dúvida vs. objeção vs. objeção-cortina, princípio ACOLHER→DIAGNOSTICAR→..., 10 regras de ouro, limite de 15 dias pra negociar data de pagamento) foi pro prompt de sistema da Malala (`PERSONA_MALALA_PROMPT_SISTEMA.md` v5, seção 8), não pro banco de dados — é comportamento geral, não uma objeção específica. **Pendente:** Luiz rodar as duas migrations pendentes (`20260815090000_faqs_produtos_rls.sql` e `20260815100000_banco_objecoes_v2_dados.sql`, nessa ordem) no SQL Editor do Supabase.

**Requisito futuro registrado (dashboard, não construir agora):** Luiz quer visibilidade de quais objeções mais aparecem na prática. Isso depende da Fase 5 existir (só a IA consegue detectar qual objeção o lead expressou) — quando for desenhado, precisa de um registro de "esta objeção apareceu, nesta conversa, nesta hora" (provável tabela de eventos, ex. `objecoes_detectadas`) alimentando um painel de frequência por objeção/produto/período. Fica anotado aqui para não se perder até a Fase 5 chegar.

---

## 11. Progresso de Produção — MVP1 (a partir de 13/08/2026)

> ⚠️ **Esta seção é a "memória de backup" do desenvolvimento** — registrada pra que, se a conversa/sessão de trabalho se perder, dê pra reconstruir exatamente onde paramos, o que já funciona, e o que falta, só lendo este documento. Atualizar ao final de toda sessão de construção com o Claude Code, sempre com data. Ver seção 0 sobre a convenção de duas dimensões (Planejamento × Produção) — esta seção é sobre **Produção**.
>
> **Onde fica o código:** `github.com/contatoarrudacred/hub-arruda`, branch `main`. Histórico de commits no git é a fonte definitiva do que mudou passo a passo — esta seção é o resumo em prosa pra não precisar ler diff nenhum pra se situar.

### Stack técnica confirmada (13/08/2026)
- **Next.js 16** (App Router, TypeScript, Tailwind, pnpm) na Vercel
- **Supabase**: Postgres + **Supabase Auth** (login do admin — substituiu a ideia original de `senha_hash` próprio em `usuarios_sistema`) + Storage (mídia) — acesso via `service_role` no backend
- **React Flow** (`@xyflow/react`) pro editor visual do fluxo
- **Vitest** pros testes do motor de fluxo

### Fase 0 — Setup ✅ concluída (13/08/2026)
Projeto criado, conectado ao Supabase de ponta a ponta, migrations 001-004 organizadas em `supabase/migrations/` (as duas originais + duas novas: Supabase Auth em `usuarios_sistema`, e estado de conversa do motor — `fluxos.produto_id` virou opcional, `conversas` ganhou `dados`/`fluxo_id`/`etapa_fluxo_atual_id`).

### Fase 1 — Motor de Fluxo ✅ concluída (13-14/08/2026)
O "motor" que lê `etapas_fluxo` e decide o que a Malala faz a cada resposta — testado (22 testes automatizados), sem WhatsApp real ainda (testado via `/simulador`, chat de texto no navegador). Cobre:
- Todo o script da Limpeza de Nome Serasa/SPC (abertura → triagem → qualificação → faixa de valor/alto valor → proposta → coleta de dados), até onde o MVP1 vai (Malala para na solicitação de dados/documentos pro contrato — resto é manual, ver seção 8.10)
- Mensagens canal-agnósticas (texto/imagem/áudio/vídeo/documento/localização/contato/pix) — pensando na Camada de Adaptadores de Canal futura, não só WhatsApp
- Regra de "checkpoint já respondido": o lead pode se apresentar de cara ("Oi, sou Luiz e quero limpar meu nome") e o motor pula as perguntas correspondentes — extração determinística hoje, cai pra IA (quando ligada) nos casos que não reconhece
- Digitando + delay configurável por mensagem, subetapa do Kanban por etapa

### Fase 2 — Painel Admin 🔶 em andamento (13-14/08/2026)
- ✅ Login (Supabase Auth) + guard de `/admin`
- ✅ Editor visual do fluxo (React Flow): caixinhas editáveis em modal com abas (Mensagens/Fluxo/Avançado), prévia ao vivo, marcadores de Início/Fim/Perdida/referência externa, arestas mescladas por destino
- ✅ Auto-layout hierárquico do canvas (dagre) + arestas ortogonais (90°) — botão "Reorganizar"
- ✅ Upload de mídia (imagem/áudio/vídeo/documento) direto no editor — sobe pro Supabase Storage (bucket `midia-fluxo`), preenche a URL pública sozinho
- ✅ Barra superior do editor: Preview (dourado, abre o simulador como modal por cima do editor — não navega mais pra `/simulador` numa aba nova), Atualizar (recarrega), Ver tudo (fitView)
- ✅ Quadrinho mostra thumbnail de imagem de verdade e ícone grande pra áudio/vídeo/documento
- ✅ Reordenar mensagens dentro de uma etapa (setas ▲▼ no modal)
- ✅ Exclusão de etapa corrigida — o `window.confirm()` nativo era bloqueado silenciosamente pelo navegador (retornava "cancelado" sem mostrar nada), por isso parecia não funcionar; trocado por modal de confirmação próprio
- ✅ **Identidade visual + menu lateral (14/08/2026):** barra lateral fixa navy (`#141e33`)/dourado (`#c8a55d`) em todo `/admin/*` (`src/app/admin/(shell)/sidebar.tsx`), cores extraídas do site real da ArrudaCred. Hierarquia combinada com Luiz: "Configurações" é o único item de topo por enquanto (CRM/Kanban entra quando existir), sub-grupo "CRM" com Fluxos + FAQs/Objeções/Agendas de Follow-up ("em breve"), grupo "Geral" com Preços (inclui faixas de dívida) e Configurações gerais — Preços fica fora do sub-grupo CRM porque também vai alimentar a futura Vendas de Balcão. Simulador deixou de ser item de menu e virou botão "Preview" dentro do editor de fluxo. Login (`/admin/login`) fica fora do route group da sidebar de propósito, não herda o layout.
- ✅ **CRUD de FAQs e Objeções (15/08/2026):** telas simples (`/admin/faqs`, `/admin/objecoes`) — cards colapsáveis, mesmo padrão de confirmação de exclusão do editor de fluxo, já acendem no menu lateral
- ✅ **Delay automático por tamanho de mensagem (15/08/2026):** novo modo `{tipo: "automatico"}` em `ConfigDelay` — o motor calcula o delay a partir do tamanho de cada mensagem (mais texto = pausa um pouco maior) com uma margem aleatória por cima, sempre com "digitando..." ativo. Objetivo duplo de Luiz: dar um respiro proporcional ao lead pensar, e nunca repetir o mesmo tempo em conversas diferentes (evita "assinatura" de robô) — sem simular literalmente velocidade de digitação humana (teto de 4s). Virou o padrão em todas as etapas existentes (`20260815110000_delay_automatico.sql`); parâmetros da fórmula ainda fixos no código, migram pra `configuracoes` quando a tela existir.
- ✅ **Fundo do canvas do editor (15/08/2026):** trocado de cinza pra dourado clarinho (light `#F8F1E4`) / dourado bem escurecido (dark `#1f1912`) — reforça a identidade navy/dourado também dentro do canvas, mais contraste com os quadrinhos brancos/escuros.
- ✅ **CRUD de Preços por faixa, Configurações gerais e Agendas de Follow-up (15/08/2026):** telas `/admin/precos`, `/admin/configuracoes`, `/admin/agendas` — mesmo padrão de card colapsável + confirmação de exclusão. Agendas tem uma camada a mais (agenda → lista de tentativas/itens, cada uma com intervalo/canal/janela comercial/mensagem). Configurações usa um campo de valor em JSON livre (número, texto ou objeto) com aviso explícito de que mudar chave/formato usado em produção quebra cálculo. Item #9 do backlog fechado — menu lateral trocou os três de "em breve" pra links reais. Migration de RLS/auditoria (`20260815120000_precos_config_agendas_rls.sql`) já rodada por Luiz.
- ✅ **Preços por faixa populados + objeções de reputação com link real (15/08/2026):** `precos_por_faixa` carregado com as 5 faixas reais confirmadas por Luiz (`20260815130000_precos_por_faixa_dados.sql`) — "abaixo de R$3 mil" ficou de fora de propósito (já é o mesmo valor do voucher da faixa R$3-10 mil, não uma faixa separada), "acima de R$500 mil" também (é fórmula/regra pra Malala, não preço de tabela — reforçado na seção 6 do `PERSONA_MALALA_PROMPT_SISTEMA.md`). As duas objeções de reputação que citam Reclame Aqui como algo a verificar agora terminam com o link real do perfil da ArrudaCred (`20260815140000_objecoes_link_reclame_aqui.sql`) — não existe link de Google pra compartilhar, só o de Reclame Aqui. Nova regra geral no prompt de sistema: link sempre vai no final da mensagem, nunca no meio do texto.

### Fase 6 — Motor de disparo de follow-up ✅ motor pronto, envio real pendente (15/08/2026)
Luiz confirmou (15/08/2026): construir agora o motor de decisão do disparo (quando cada tentativa de retomada deve sair), mesmo sem o WhatsApp real (Zapster) conectado ainda — fica pronto pra plugar o envio de verdade quando a Fase 7 existir.

- ✅ **Simulador passou a persistir de verdade** — até aqui o `/simulador` vivia 100% na memória do navegador, então não existia nenhuma conversa real pro cron varrer. Agora cada conversa simulada cria pessoa/oportunidade/conversa e grava cada mensagem trocada (`src/lib/motor-fluxo/persistencia.ts`) — a mesma peça que o webhook do WhatsApp real vai reaproveitar na Fase 7 (o simulador é só mais uma "porta de entrada"). Isso também ativou os `EfeitoNegocio` (`marcar_perdida`, `escalar_supervisor`, `encerrar_fluxo_automatizado`) que o motor já calculava desde a Fase 1 mas nunca eram aplicados em lugar nenhum, por falta de persistência. `pessoas.nome_razao_social` agora fica sincronizado sempre que o nome do lead é capturado — necessário pra `[Primeiro_Nome]` funcionar nas mensagens de follow-up.
- ✅ **Motor de decisão puro** (`src/lib/motor-fluxo/motor-followup.ts`, testado) — dado o histórico da agenda já disparada e o instante em que a Malala ficou esperando resposta, decide qual o próximo item (se algum) já venceu. Intervalos contados sempre a partir da última mensagem que ficou sem resposta (não do item anterior disparado — confirmado por Luiz, é assim que os rótulos "7 dias" → "10 dias" da agenda Padrão fazem sentido).
- ✅ **Janela comercial confirmada:** 09h-21h, todo dia menos domingo (`SCRIPT_LIMPANOME_SERASA_SPC.md`). **Gap conhecido:** sem calendário de feriados ainda — fora de escopo por ora.
- ✅ **Cron de disparo** (`src/app/api/cron/followups/route.ts` + `vercel.json`, a cada 5 min) — varre conversas aguardando resposta e dispara o próximo item vencido, respeitando a janela comercial. O primeiro item (10 min) roda 24h por dia de propósito (`respeita_janela_comercial=false`), garantindo que a primeira retomada saia mesmo fora do horário comercial.
- ✅ **Encerramento (Perdida) e fim da régua são eventos diferentes:** o item de ordem 7 (10 dias sem resposta) marca a oportunidade como Perdida, motivo `LEAD PAROU DE RESPONDER` (texto exato confirmado em `SCRIPT_LIMPANOME_SERASA_SPC.md`) — mas o relógio da conversa **não para aí**. Luiz confirmou (15/08/2026) que a régua continua rastreando até os itens de nutrição por e-mail (30/60/90 dias) terminarem de verdade — só nesse ponto (último item da agenda) a conversa fecha e o relógio zera. Nova tabela `followup_emails` registra o disparo desses itens separado de `mensagens` (canal diferente, não é conversa de WhatsApp).
- ✅ **Resend conectado de verdade (15/08/2026):** API key configurada, domínio `arrudacred.com.br` verificado por Luiz. Módulo único (`src/lib/email/resend.ts`) que qualquer envio de e-mail do sistema usa. **Os 3 e-mails de nutrição (30/60/90 dias) continuam em "simulado"** — a integração técnica está pronta, mas o conteúdo deles hoje é só uma descrição interna (`agenda_itens.conteudo`), não a cópia real do e-mail; escrever essa cópia é tarefa separada, ainda não feita.
- ✅ **Quadrinho "Teste do follow-up"** no `/simulador` (`src/app/simulador/teste-followup.tsx`) — cronômetro progressivo (meses/semanas/dias/horas/min/seg desde que a Malala ficou aguardando resposta) + botão que avança manualmente pro próximo item da agenda, disparando pelo mesmo caminho do cron de produção (`dispararItemFollowup`), sem precisar esperar o tempo real passar. Serve pra validar a régua inteira (WhatsApp e e-mail) sem depender do cron nem mexer no banco na mão — e já deixa a base pronta pra uma futura tela de histórico de conversa (Kanban).
- ✅ **Vercel confirmado:** plano gratuito (Hobby) durante a fase de desenvolvimento — mas **Hobby só permite cron 1x/dia** (a cada 5 min, como configurado, falha o deploy). Decisão de Luiz: ativar o **Pro Trial** (14 dias grátis) quando for a hora de testar o cron de verdade no Vercel, avisando com antecedência; depois disso, ativar o plano pago sem problema.
- 🔶 **WhatsApp real ainda pendente** — aguarda a Fase 7 (Zapster). Até lá, todo disparo de WhatsApp só registra no banco como se tivesse sido enviado.
- ⬜ **Pendente de ação manual de Luiz:** rodar a migration [`20260815180000_configuracoes_contato_institucional.sql`](../supabase/migrations/20260815180000_configuracoes_contato_institucional.sql) (nova, ver seção do e-mail de boas-vindas abaixo) no SQL Editor do Supabase; configurar `CRON_SECRET` no Vercel quando for deployar. Migrations `150000`, `160000` e `170000` já rodadas.

### E-mail de boas-vindas ✅ construído e testado com envio real (15/08/2026)
Luiz pediu um e-mail automático assim que a Malala captura o e-mail do lead (checkpoint `abertura_email`) — primeira peça de uma base de mail marketing que vai crescer junto com a régua de nutrição. Objetivo: reforçar confiança logo no momento em que o lead ainda está decidindo se confia na ArrudaCred.

- ✅ **Conteúdo definido e revisado com Luiz em três rodadas:** voz da Malala (primeira pessoa, continuidade com o WhatsApp), curto e pessoal — saudação, bloco de confiança (nota Reclame Aqui/Google, 5.000+ clientes, contrato formal, certificado RA1000 + indicação ao Prêmio Reclame Aqui 2026 num item só), vídeo de apresentação institucional do YouTube e capa do post de blog lado a lado (cada um com título/legenda curta e link), CTA "CHAMAR NO WHATSAPP", bloco "fique por dentro" com ícones de site/WhatsApp/Instagram/Facebook/YouTube, rodapé com CNPJ + link de descadastro.
- ✅ **Template em React Email** (`src/lib/email/templates/boas-vindas.tsx`) — HTML de e-mail tem regras próprias (Outlook não entende CSS moderno), por isso não reaproveita Tailwind/componentes web; usa a biblioteca feita pelo próprio time da Resend, com estilos inline. Cabeçalho com fundo dourado claro (não navy) — o logo tem partes pretas que sumiam contra fundo escuro.
- ✅ **Número de WhatsApp e links de redes sociais são configuráveis** (não fixos no template) — Luiz pediu isso especificamente porque o número conectado à Malala pode mudar. Ficam em `configuracoes` (`whatsapp_numero_atendimento`, `redes_sociais`), editáveis pela tela `/admin/configuracoes` que já existe, sem precisar mexer em código. Valor semeado é o do site institucional — **provisório, trocar quando o WhatsApp real da Malala (Fase 7, Zapster) estiver definido** (migration `20260815180000_configuracoes_contato_institucional.sql`).
- ✅ **Imagens resolvidas:**
  - Logo: o site só tinha em `.webp` (Outlook não renderiza `.webp` de forma confiável) — convertido pra `.png` e hospedado no Storage do próprio projeto (bucket `midia-fluxo`, mesmo lugar que já guarda mídia do fluxo).
  - Capa do post de blog e miniatura do vídeo do YouTube: usadas direto das fontes oficiais (capa do post já existe no site; miniatura do YouTube vem de URL previsível a partir do id do vídeo, sem precisar de API).
  - **Ícones de redes sociais (revisão de Luiz):** a primeira versão usava círculo com iniciais (IG/FB/YT). Luiz pediu ícone de verdade e mandou uma imagem de referência — mas era um preview de banco de assets pago com marca d'água "Designi" visível, então não dava pra recortar dali (nem seria uso lícito). Solução: os 4 ícones de rede social vêm do [Simple Icons](https://simpleicons.org) (projeto open-source feito exatamente pra esse uso — vetor oficial de cada marca, servido via CDN deles), recoloridos dourado e montados sobre quadrado navy arredondado; o quinto (site) é uma seta desenhada à mão (não é ícone de marca de ninguém). Todos convertidos pra PNG e hospedados no Storage do projeto (`midia-fluxo/email/icones/`).
- ✅ **Disparo automático** — `persistencia.ts` aciona `enviarEmailBoasVindasSeNecessario` (via `after()` do Next.js, não trava a resposta da Malala no WhatsApp) assim que `dados.email` é capturado. Nunca manda duas vezes pro mesmo lead (`pessoas.email_boas_vindas_enviado`).
- ✅ **Descadastro funcional** (`/descadastro?p=<id-da-pessoa>`) — página de confirmação (não dispara só ao abrir o link, evita descadastro acidental por scanner de e-mail) + `pessoas.email_marketing_opt_out`, checado antes de qualquer envio de marketing (este e-mail e, no futuro, a nutrição pós-perda).
- ✅ **Testado com envio real** — e-mail de teste disparado de verdade via Resend pro próprio Luiz conferir na caixa de entrada (não só o preview renderizado).
- ⬜ **Aviso pra quando for testar pelo `/simulador`:** o envio é de verdade — digitar um e-mail real na etapa `abertura_email` do simulador manda um e-mail de verdade pra essa caixa.

### Decisões/correções registradas durante a construção (14/08/2026)
- A saudação personalizada ("Oi [Nome], bom dia!") vive uma vez na abertura, não repetida por produto — corrigido no script, ver `SCRIPT_LIMPANOME_SERASA_SPC.md`
- Checkpoint de telefone é condicional por canal (só pergunta se o canal não fornece nativamente)
- Placeholders de imagem já existem no fluxo (foto da Malala, selo Reclame Aqui) — upload de verdade já dá pra fazer pelo editor (ver Fase 2 acima)
- `public/` do Next.js não é gravável em runtime no Vercel (cada deploy é um pacote imutável) — por isso mídia enviada pelo admin vai pro Supabase Storage, não pra uma pasta local
- Prática de git adotada: commitar a cada chunk validado (testes + lint + build verdes), mensagem sempre com resumo do que mudou — histórico vira ponto de restauração

### Explicitamente fora do MVP1 ainda (não esquecer)
- Interpretação por IA de verdade (hoje só o encaixe existe, sem chamada real) — Fase 5
  - **Reforço registrado por Luiz (15/08/2026), com exemplo concreto:** na etapa `triagem_menu` (menu de 8 opções numeradas), se o lead responder em texto livre em vez do número — ex.: "preciso limpar meu nome" em vez de "1" — o parser determinístico não reconhece, e hoje a Malala só repete a pergunta ("Desculpe, não entendi sua resposta..."), sem tentar entender nem, se for o caso, tratar como desvio (responder e retomar — seção 5 do `PERSONA_MALALA_PROMPT_SISTEMA.md`). **Isto tem duas partes, não uma só:** (1) a chamada de IA de verdade não existe ainda (a causa óbvia); (2) **mesmo quando a Fase 5 existir, isso sozinho não resolve** — `interpretacao_ia.habilitado` é opt-in por etapa (`ConteudoEtapa.interpretacao_ia`), e hoje **nenhuma etapa do fluxo tem isso ligado**, nem `triagem_menu`. Checklist pra não esquecer quando a Fase 5 for implementada: (a) implementar a chamada real de IA (`InterpretadorIA`); (b) passar pelas etapas que esperam resposta digitada (`aguarda_resposta: true`) e ligar `interpretacao_ia.habilitado: true` com uma instrução adequada, começando por `triagem_menu` e outras etapas tipo `menu`/`texto_livre` onde o lead tem espaço pra responder com as próprias palavras.
- ~~Motor de disparo de follow-up~~ — construído em 15/08/2026, ver seção "Fase 6" acima. O que falta é só a Fase 7 (envio real) plugar nele.
- Integração real de WhatsApp — Fase 7
- Integração real Assinafy/Asaas (Malala para antes disso no MVP1, é manual)

---

## Próximos Passos
- [x] Confirmar preferência de hospedagem → Supabase + Vercel + GitHub (região São Paulo), VPS Hostinger como reserva
- [x] Fechar ordem de prioridade dos módulos → Comercial (WhatsApp/leads) → Marketing → Financeiro → Jurídico
- [x] Ferramenta de IA principal para código → Claude Code (recomendado, aceito por padrão — pode trocar a qualquer momento)
- [x] Detalhar módulo priorizado #1 (Comercial — Limpeza de Nome Serasa/SPC): script completo, FAQ, Kanban, MVP1 fechados
- [x] Modelagem de dados do núcleo do MVP1: Pessoa/Papel, Comercial/Atendimento, camada multi-canal, RBAC (nível único ADMIN/MASTER), valores configuráveis — ver `MODELAGEM_DADOS_ARRUDACRED.md`
- [x] Fechar a última pendência do produto e avançar pra construção → **em produção desde 13/08/2026, ver seção 10 "Progresso de Produção" acima**
- [x] Fase 2 (Painel Admin): CRUD de FAQs/preços/configurações/agendas de follow-up + auto-layout do editor visual

---

## Pendências Abertas (lista consolidada, 11/08/2026)

| # | Pendência | Onde impacta | Bloqueia o quê |
|---|---|---|---|
| 1 | **Agenda de follow-up específica da mensagem de proposta** (Passo 15) — ainda não enviada por Luiz | `SCRIPT_LIMPANOME_SERASA_SPC.md` | Não bloqueia início da construção — agenda padrão já cobre o caso até lá |
| 2 | FAQs 1-5 estão registradas em versão resumida/reescrita por Claude, não no texto literal enviado (diferente das FAQs 6-10, já literais) | `FAQ_LIMPANOME_SERASA_SPC.md` | Só relevante se Luiz quiser o texto exato para a base de conhecimento |
| 3 | Reset do contador de "estagnação com engajamento" (subetapa 2.3) ao primeiro sinal de avanço do lead — comportamento a testar na prática | `KANBAN_COMERCIAL_LIMPANOME.md` | Não bloqueia — pode ser ajustado depois de observar uso real |

*(Lista viva — atualizar conforme pendências forem fechadas ou novas surgirem.)*
