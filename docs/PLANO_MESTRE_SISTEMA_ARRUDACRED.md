# PLANO MESTRE — Sistema de Gestão ArrudaCred
**Status:** Documento vivo — atualizar a cada sessão de planejamento
**Última atualização:** 17/08/2026
**Responsável:** Luiz Humberto de Arruda Dória do Valle
**Entidade legal:** L.H. DE ARRUDA D. DO VALLE SERVIÇOS LTDA (CNPJ 40.342.851/0001-37)

> **Como usar este documento:** este é o índice-mestre do projeto. Toda decisão relevante tomada em qualquer conversa sobre o sistema deve ser resumida e adicionada aqui (ou em um dos documentos filhos referenciados abaixo). Isso existe justamente para que o contexto do projeto não se perca quando a conversa/memória local ficar longa demais — comece qualquer nova sessão de trabalho no projeto lendo este arquivo primeiro.
>
> **Convenção de progresso (12/08/2026):** progresso de qualquer módulo/documento se mede em **duas dimensões separadas, nunca uma só** — **Planejamento** (o quanto já foi discutido/documentado) e **Produção** (o quanto já foi de fato construído em código/infraestrutura). Um módulo com planejamento em 90% ainda está em **0% de produção** se nenhuma linha de código foi escrita — nunca resumir as duas coisas num único "% concluído". Ver `mindmap_projeto_arrudacred.html` para o mapa visual com as duas barras por item.
>
> ⚠️ **Trabalho em múltiplos agentes/worktrees (18/08/2026):** o projeto passou a ser tocado por vários agentes de IA em paralelo, cada um numa branch/worktree própria (CRM, Marketing, Vendas — e outros a caminho, ex.: Financeiro, Operações). **Antes de começar qualquer sessão de trabalho, leia também `COORDENACAO_AGENTES_ARRUDACRED.md`** — é o quadro-branco compartilhado entre todos os agentes (registro de quem está fazendo o quê, reserva de timestamp de migration pra evitar colisão, avisos de sinergia entre módulos, decisões cross-cutting pendentes do Luiz). Nasceu depois de um incidente real: dois agentes diferentes criaram migrations com timestamp idêntico, sem nenhum canal pra se avisar.

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
> 📄 Design do módulo Vendas (cadastro Cliente/Fornecedor/Serviço, contrato, assinatura digital, financeiro da venda, handoff pra Operação): `superpowers/specs/2026-08-17-modulo-vendas-design.md` — spec validada com Luiz em 17/08/2026, ainda não implementada.
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
> 📄 Estratégia de conteúdo/negócio (pipeline multi-site, catálogos generalizados, divisão por persona, telas Fase 2): `MODULO_MARKETING_CONTEUDO_ARRUDACRED.md`
> 📄 Arquitetura de engenharia do pipeline núcleo (função simples + cron, adaptadores de canal, modelo de dados — Workflow SDK avaliado e abandonado em 17/08 por incompatibilidade de ambiente): `superpowers/specs/2026-08-17-pipeline-conteudo-marketing-design.md`
> 📄 Plan de implementação do núcleo (Tasks 1-10, ✅ construído/testado/revisado em 18/08/2026): `superpowers/plans/2026-08-17-pipeline-conteudo-marketing-nucleo.md`
> 📄 Parceiros (revenda) e Afiliados/Influencers (comissão por indicação): `PARCEIROS_AFILIADOS_ARRUDACRED.md`
- Calendário de conteúdo (cadência diária: história → emoção → conteúdo → CTA, adaptado do modelo já usado na Aetria)
- Painel de SEO/AEO — acompanhar posicionamento em buscadores tradicionais e em IA (ChatGPT, Gemini, Claude, Perplexity)
- Gestão de campanhas e captação de leads (landing pages, hotsites como o do PaySmart)
- Integração com WhatsApp/redes sociais para nutrição de leads
- **Gestão de tráfego pago** — via integração MCP com Meta Ads, Google Ads, Taboola e outras plataformas de mídia paga; objetivo é permitir gestão/otimização de campanha assistida por IA dentro do próprio sistema, sem trocar de ferramenta
- **Geração de conteúdo para o blog e páginas do site** — pipeline geração → revisão → publicação no WordPress, **sem humano no loop** (decisão de Luiz, 17/08/2026) — nada fica público sem passar pelos dois gates de qualidade automatizados; **✅ núcleo construído/testado/revisado (18/08/2026)**, distribuição multi-canal ainda não construída — ver `MODULO_MARKETING_CONTEUDO_ARRUDACRED.md` seção 3
- **Rede de sites satélite (11/08/2026, resolvido em 17/08/2026):** cada site tem persona própria pra evitar risco de doorway pages/scaled content abuse do Google — arrudacred.com.br (Limpa Nome), vozdocredito.com.br (consórcio/consumidor), autoridadefinanceira.com.br (consórcio/investidor). Cada site funciona como funil de geração de leads pra ArrudaCred, com métricas de tráfego/conversão próprias. Detalhamento completo em `MODULO_MARKETING_CONTEUDO_ARRUDACRED.md`.
- ⬜ **Pendente de ação manual de Luiz:** trocar a senha do usuário `claude-auditoria` do WordPress (exposta em PDF fornecido em 17/08/2026, ver aviso de segurança no `MODULO_MARKETING_CONTEUDO_ARRUDACRED.md`); criar Pixel Meta + propriedade GA4 + container GTM próprios para vozdocredito.com.br e autoridadefinanceira.com.br antes do pipeline poder rastrear/distribuir de verdade.

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
PERSONA_MALALA_PROMPT_SISTEMA.md          ← persona/prompt de sistema da Malala (identidade, tom, técnicas comerciais)
KANBAN_COMERCIAL_LIMPANOME.md             ← funil/Kanban do Comercial (mesmo produto)
TELA_ATENDIMENTO_ARRUDACRED.md            ← tela de CRM pra acompanhar/assumir atendimento real (WhatsApp) — Blocos A+B+B2 (+ extensões) em produção (17/08/2026), Blocos C/D pendentes (ver seção 11)
RASTREIO_CLIQUES_WHATSAPP.md              ← página zap.arrudacred.com.br — rastreio de origem do lead antes do WhatsApp
REGUA_COBRANCA_ARRUDACRED.md              ← régua de cobrança pós-contrato, cliente em atraso (uso futuro, Financeiro)
AGENDA_POS_VENDA_ARRUDACRED.md            ← régua de relacionamento pós-contrato, cliente em dia (uso futuro)
MODULO_MARKETING_CONTEUDO_ARRUDACRED.md   ← pipeline de conteúdo/blog multi-site + campanha de indicação de clientes
PARCEIROS_AFILIADOS_ARRUDACRED.md         ← parceiros (revenda) e afiliados (comissão)
SEGURANCA_E_AUDITORIA_ARRUDACRED.md       ← segurança externa + trilha de auditoria interna
COORDENACAO_AGENTES_ARRUDACRED.md         ← quadro-branco entre agentes/worktrees (CRM/Marketing/Vendas/...) — ler antes de qualquer sessão
KICKOFF_CLAUDE_CODE.md                    ← notas históricas do kickoff do projeto (estável, raramente muda)
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

### 7.1.1 Login do Supabase CLI na máquina — resolvido em 17/08/2026

Este ambiente de desenvolvimento **não tem Docker** (então `supabase db reset`/local não funciona) **nem login do Supabase CLI persistido por padrão**. Migrations precisam ser aplicadas manualmente por Luiz via SQL Editor do Supabase (já era o padrão adotado — ver pendências de "rodar migration no SQL Editor" registradas ao longo deste documento), e comandos como `pnpm db:types` (que gera `src/lib/supabase/database.types.ts` a partir do projeto remoto) exigem o Supabase CLI autenticado.

**O agente (Claude, via Bash) não consegue fazer esse login sozinho** — `npx supabase login` roda um fluxo de autorização por navegador que exige um terminal interativo de verdade (TTY); rodado pelo agente, falha com `"Cannot use automatic login flow inside non-TTY environments"`.

**Método (Luiz precisa rodar, uma vez por máquina):**
1. Abrir um terminal (PowerShell) — não precisa estar em nenhuma pasta específica do projeto.
2. Rodar `npx supabase login`.
3. Confirmar a instalação do pacote se perguntado (`y`).
4. O terminal mostra um link (e tenta abrir o navegador sozinho) — na página, autorizar o acesso.
5. A página mostra um **código de verificação** (muda a cada tentativa) — esse código já é preenchido/confirmado automaticamente no fluxo, sem precisar ação extra além de autorizar.
6. Terminal confirma: `"You are now logged in. Happy coding!"`.

**Persistência confirmada (17/08/2026):** o Supabase CLI salva a credencial localmente na máquina — uma vez feito o login, o mesmo terminal/máquina usado pelo Claude Code via Bash já passa a enxergar o login automaticamente em comandos futuros (`supabase projects list`, `pnpm db:types` etc.), sem precisar repetir o processo a cada sessão. Só repetir se: o token expirar/for revogado, ou for uma máquina/ambiente novo.

**Nunca registrar o token em si em nenhum documento ou arquivo do repositório** — ele fica só localmente, gerenciado pelo próprio Supabase CLI (arquivo de config fora do projeto). O que este documento guarda é o método, não a credencial.

**Regra de quem pode rodar `supabase db push` direto em produção — decidido em 18/08/2026:** com o login persistido, subagentes (Subagent-Driven Development) passaram a conseguir aplicar migrations direto no banco remoto via CLI, o que gerou um incidente (Task 10 do módulo de Marketing: subagente rodou `supabase db push --yes` + `supabase migration repair` sem pedir autorização explícita antes). A regra, por raio de impacto:
- **Push automático permitido** (subagente pode rodar sem pedir autorização a cada vez) quando a migration é **puramente aditiva** (nova coluna/tabela/índice — nunca `DROP`, `ALTER ... TYPE`, rename, ou qualquer coisa destrutiva) **e** só toca tabelas que pertencem ao módulo em que o subagente está trabalhando.
- **Exige aplicação manual de Luiz via SQL Editor** (padrão anterior, continua valendo) quando a migration toca tabelas de **outros** módulos já em produção — mesmo que a mudança em si seja aditiva — porque o subagente de um módulo não tem visão do impacto em cascata sobre sistemas que já estão rodando fora do seu escopo.

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

**Regra não-negociável — número oficial nunca faz contato frio nem disparo em massa (confirmada por Luiz, 15/08/2026):** o número oficial da Malala **nunca** inicia contato com um lead que não a chamou primeiro, e **nunca** é usado para disparo em massa de mensagens via WhatsApp — risco real de banimento do número pela Meta, e o número oficial é ativo demais para arriscar. Qualquer necessidade de abordagem fria/proativa em volume (ex.: abordar os 20 contatos indicados na campanha "Indicação Premiada", ver `MODULO_MARKETING_CONTEUDO_ARRUDACRED.md` seção 6.4) precisa usar um **número secundário/descartável**, fácil de trocar se tiver problema — nunca o número principal. A mensagem de abertura desse número secundário deve levar o destinatário pro **número oficial da Malala** assim que ele quiser continuar a conversa de verdade — o número descartável só existe pra primeira abordagem fria, nunca conduz o atendimento em si.

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

### 8.12 E-mail no funil — justificativa de valor + regra de não-bloqueio ✅ concluído (17/08/2026)

**Problema identificado por Luiz:** o checkpoint `abertura_email` pergunta o e-mail do lead logo na abertura da conversa (ver 8.x acima), mas não existia uma resposta pronta pra quando o lead pergunta "pra quê?" ou diz que não tem e-mail — e o checkpoint, por padrão, ficava esperando uma resposta válida indefinidamente (nenhum checkpoint do motor tinha uma saída de "desistir e seguir em frente").

**Texto fechado com Luiz (17/08/2026):** a justificativa é "além da proposta por escrito, dicas sobre como manter nome limpo/score/rating altos, e às vezes vouchers de desconto em promoções — pode deixar de receber quando quiser". `abertura_email` (`fluxo-limpeza-nome.ts`, aplicado também na linha real de `etapas_fluxo` via PATCH direto — mesmo padrão de correção de conteúdo já usado antes, não é só a semente) agora abre com isso de cara, antes do lead precisar perguntar: "Pra eu te atender melhor, me confirma também seu e-mail:" + "É por ele que mando a *proposta por escrito*, dicas pra manter nome limpo e score alto, e às vezes cupons de desconto nos nossos produtos 😊 Pode deixar de receber quando quiser." `interpretacao_ia.instrucao` do checkpoint também foi ajustada pra reconhecer resistência ("pra quê", "não tenho") como não-interpretado em vez de tentar forçar um valor.

**Mecanismo genérico construído — `opcional_apos_tentativas` (`tipos.ts`/`engine.ts`):** decisão técnica (não pedida explicitamente por Luiz, mas o gap identificado já sugeria isso — "provavelmente reaproveitável por qualquer checkpoint opcional"): campo novo em `ConteudoEtapa`, não exclusivo do e-mail. Depois de N tentativas seguidas sem reconhecer a resposta (contador guardado em `dados` sob uma chave reservada `_tentativas:<código>`, nunca lido de novo depois que a etapa avança), a etapa desiste e segue em frente como se tivesse sido respondida com valor vazio — cai no mesmo caminho de quem respondeu de verdade (`proximo_codigo`/`dadosNovos`), só que sem nenhuma opção escolhida. `abertura_email` usa `opcional_apos_tentativas: 2`. 3 testes novos em `engine.test.ts` (1ª tentativa conta e repete, 2ª desiste e segue com e-mail vazio, checkpoint sem o campo nunca desiste).

**Limitação registrada:** a Malala ainda não "responde e volta pra pergunta" quando o lead questiona no meio da conversa (regra de desvio completa) — isso depende da IA conversacional completa (Fase 5 cheia, ainda não construída; hoje `interpretarComIA` só classifica/extrai, não gera resposta com nuance). Na prática o efeito prático é quase o mesmo: a mensagem já explica o motivo de antemão, e o limite de 2 tentativas garante que o funil nunca trava mesmo sem uma resposta customizada à objeção.

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

### ✅ Módulo Vendas — sub-frente Cadastro, construída, revisada e mesclada em `main` (17-18/08/2026), pendente de teste manual

Primeira sub-frente do módulo Vendas (spec: `superpowers/specs/2026-08-17-modulo-vendas-design.md`, plano: `superpowers/plans/2026-08-17-vendas-cadastro.md`) — cadastro de Fornecedor e Cliente com endereço (CEP-primeiro via ViaCEP), upload de documento com tipo identificado, leitura de documento por IA (Claude, visão, só pré-preenche) e foto da pessoa, além da criação de Oportunidade "sem funil prévio". Construída via subagent-driven-development num worktree isolado (19 tasks, cada uma com implementação + revisão de código independente; 3 tasks passaram por 1 rodada de correção após a revisão achar problema real — condição de corrida na busca de pessoa, tratamento de erro de rede, captura de exceção nas actions de upload).

**Duas rodadas de revisão adicionais, além das 19 por task (achado real: revisão só-por-task não pega convenção aprendida num fix round que não se propagou pro código irmão com a mesma forma):**
- **Revisão de branch inteira** (modelo mais capaz, olhando os 26 commits juntos): achou 6 problemas reais que nenhuma revisão por task tinha pego — exceção de repositório vazando sem tratamento nas duas telas, exclusão de documento não apagando o arquivo do Storage (LGPD), condição de corrida + fechamento obsoleto no campo de CEP (`CampoEndereco`, componente compartilhado pelas duas telas), papel `fornecedor` nunca gravado em `pessoa_papeis` (mecanismo que a spec depende para escopo por empresa), duplo-clique sem guard nos dois botões de salvar, e reforço defensivo de RLS em 6 tabelas núcleo adicionais (`pessoas`, `oportunidades`, `conversas`, `usuarios_sistema`, `fluxos`, `etapas_fluxo` — provavelmente já cobertas pelo RLS automático do Supabase em tabela nova, mas `enable row level security` é idempotente, então reforçar não custa nada). Corrigidos num fix wave único e re-revisados.
- **Revisão de follow-up** (2 resíduos que a rerevisão do fix wave achou e que não puderam entrar em mais uma rodada pela própria regra do processo): `resolverOuCriarPessoa` ainda lançava exceção fora do try/catch em um ponto de cada tela; `excluirDocumentoPessoa` apagava a linha do banco antes de confirmar a exclusão no Storage (ordem seguraria mais o dado). Luiz decidiu corrigir antes de mesclar — corrigido e revisado, aprovado.

**Construído (20 commits na branch `worktree-vendas-cadastro`, mesclada em `main` em 18/08/2026 via merge local — sem PR, seguindo o padrão já usado no projeto):**
- 3 migrations novas (033-035): núcleo de cadastro (`produtos.tipo` ganha `subcontratado`/`comissionado`, tabelas `fornecedores`/`fornecedor_produtos`), fecha lacuna de RLS+auditoria em 6 tabelas núcleo de Pessoa/Papel que nunca tiveram + reforço defensivo em mais 6 tabelas núcleo, `pessoa_documentos` + buckets de Storage (`pessoa-documentos` privado, `pessoa-fotos` público)
- Módulo novo `src/lib/vendas/` (documento, máscaras, pessoas, endereço, fornecedores, clientes, pessoa-documentos, pessoa-fotos, leitura-documento-ia) e `src/components/vendas/` (leitor de documento por IA, campo de endereço, uploads — componentes compartilhados entre as duas telas)
- Telas `/admin/fornecedores` e `/admin/vendas/nova`, completas (máscara, endereço, upload, IA, foto), com item de navegação "Vendas" no sidebar

**Pendente — ação manual de Luiz antes de considerar em produção:**
1. Rodar as 3 migrations novas, nessa ordem, no SQL Editor do Supabase: `20260817110000_vendas_cadastro_nucleo.sql`, `20260817120000_vendas_seguranca_nucleo_pessoa.sql`, `20260817130000_vendas_pessoa_documentos.sql`
2. Testar as duas telas de verdade no navegador (cadastro de fornecedor e de venda sem funil prévio, incluindo upload de documento/foto e leitura por IA) — **ainda não foi possível fazer esse teste**: a construção rodou num worktree isolado sem `.env.local` com credenciais reais, e o teste de verdade também depende das migrations acima já estarem rodadas. Ajustes encontrados nesse teste entram direto em `main` (sem worktree novo — só a construção grande usou isolamento, por segurança durante a automação multi-agente).

**Fora de escopo desta sub-frente** (registrado na spec, seção 7): módulo Operação, contas a pagar a fornecedor, régua de cobrança, agenda pós-venda, portal do cliente, split payment de afiliado — todos ficam pra frentes futuras.

### Stack técnica confirmada (13/08/2026)
- **Next.js 16** (App Router, TypeScript, Tailwind, pnpm) na Vercel
- **Supabase**: Postgres + **Supabase Auth** (login do admin — substituiu a ideia original de `senha_hash` próprio em `usuarios_sistema`) + Storage (mídia) — acesso via `service_role` no backend
- **React Flow** (`@xyflow/react`) pro editor visual do fluxo
- **Vitest** pros testes do motor de fluxo

### Fase 0 — Setup ✅ concluída (13/08/2026)
Projeto criado, conectado ao Supabase de ponta a ponta, migrations 001-004 organizadas em `supabase/migrations/` (as duas originais + duas novas: Supabase Auth em `usuarios_sistema`, e estado de conversa do motor — `fluxos.produto_id` virou opcional, `conversas` ganhou `dados`/`fluxo_id`/`etapa_fluxo_atual_id`).

### Fase 1 — Motor de Fluxo ✅ concluída (13-14/08/2026)
O "motor" que lê `etapas_fluxo` e decide o que a Malala faz a cada resposta — testado (46 testes automatizados em 16/08/2026, incluindo os de regressão da rodada de avaliação geral abaixo), sem WhatsApp real ainda (testado via `/simulador`, chat de texto no navegador). Cobre:
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

- ~~✅ Simulador passou a persistir de verdade~~ — **revertido em 16/08/2026, decisão de Luiz:** "o simulador só simula, não é real" — nunca deve gerar dado de teste no banco nem aparecer na Tela de Atendimento. `/simulador` voltou a viver 100% na memória do navegador (`src/app/simulador/actions.ts`); `criarConversaSimulador` foi removida. O `EfeitoNegocio`/persistência real de conversa continuam existindo — só passaram a ser exercitados pelo webhook real (Fase 7) e pela Tela de Atendimento, não mais pelo simulador.
- ✅ **Motor de decisão puro** (`src/lib/motor-fluxo/motor-followup.ts`, testado) — dado o histórico da agenda já disparada e o instante em que a Malala ficou esperando resposta, decide qual o próximo item (se algum) já venceu. Intervalos contados sempre a partir da última mensagem que ficou sem resposta (não do item anterior disparado — confirmado por Luiz, é assim que os rótulos "7 dias" → "10 dias" da agenda Padrão fazem sentido).
- ✅ **Janela comercial confirmada:** 09h-21h, todo dia menos domingo (`SCRIPT_LIMPANOME_SERASA_SPC.md`). **Gap conhecido:** sem calendário de feriados ainda — fora de escopo por ora.
- ✅ **Cron de disparo** (`src/app/api/cron/followups/route.ts`, a cada 5 min) — varre conversas aguardando resposta e dispara o próximo item vencido, respeitando a janela comercial. O primeiro item (10 min) roda 24h por dia de propósito (`respeita_janela_comercial=false`), garantindo que a primeira retomada saia mesmo fora do horário comercial. **Disparado por cron-job.org (16/08/2026), não pelo cron nativo da Vercel** — o plano Hobby só libera cron 1x/dia e rejeita o deploy inteiro se `vercel.json` declarar algo mais frequente; `vercel.json` foi removido do projeto por isso. Proteção continua sendo `CRON_SECRET` (header `Authorization: Bearer`), agora configurado como header customizado no job do cron-job.org.
- ✅ **Encerramento (Perdida) e fim da régua são eventos diferentes:** o item de ordem 7 (10 dias sem resposta) marca a oportunidade como Perdida, motivo `LEAD PAROU DE RESPONDER` (texto exato confirmado em `SCRIPT_LIMPANOME_SERASA_SPC.md`) — mas o relógio da conversa **não para aí**. Luiz confirmou (15/08/2026) que a régua continua rastreando até os itens de nutrição por e-mail (30/60/90 dias) terminarem de verdade — só nesse ponto (último item da agenda) a conversa fecha e o relógio zera. Nova tabela `followup_emails` registra o disparo desses itens separado de `mensagens` (canal diferente, não é conversa de WhatsApp).
- ✅ **Resend conectado de verdade (15/08/2026):** API key configurada, domínio `arrudacred.com.br` verificado por Luiz. Módulo único (`src/lib/email/resend.ts`) que qualquer envio de e-mail do sistema usa. **Os 3 e-mails de nutrição (30/60/90 dias) continuam em "simulado"** — a integração técnica está pronta, mas o conteúdo deles hoje é só uma descrição interna (`agenda_itens.conteudo`), não a cópia real do e-mail; escrever essa cópia é tarefa separada, ainda não feita.
- 🔶 **Quadrinho "Preview da régua de follow-up"** no `/simulador` (`src/app/simulador/teste-followup.tsx`, redesenhado 16/08/2026) — desde que o simulador parou de persistir, virou um stepper só de conteúdo: mostra o texto de cada item da agenda em sequência (com `[Primeiro_Nome]` resolvido), sem cronômetro real nem gravar nada. Testar a régua/cron de verdade (disparo real, `dispararItemFollowup`) passa a ser feito só com dado real — Tela de Atendimento ou o cron de produção.
- ✅ **Vercel confirmado:** plano gratuito (Hobby) durante a fase de desenvolvimento — mas **Hobby só permite cron 1x/dia** (a cada 5 min, como configurado, falha o deploy). Decisão de Luiz: ativar o **Pro Trial** (14 dias grátis) quando for a hora de testar o cron de verdade no Vercel, avisando com antecedência; depois disso, ativar o plano pago sem problema.
- ✅ **WhatsApp real ligado (16/08/2026)** — ver seção "Fase 7" abaixo, motor de disparo já entrega de verdade.
- ✅ **Detecção de bloqueio de WhatsApp pelo lead (17/08/2026, pedido de Luiz):** ao tentar disparar um item de follow-up por WhatsApp, o motor primeiro checa as últimas `LIMITE_FOLLOWUPS_WHATSAPP_SEM_ENTREGA` (3) mensagens de follow-up já disparadas pra aquela conversa — se **nenhuma** delas tiver `entregue_em` (confirmação de entrega da Zapster), conclui que o lead provavelmente bloqueou o número: marca a oportunidade Perdida com motivo `LEAD PROVÁVEL BLOQUEOU ENVIO DE MENSAGENS` (`motor-followup.ts`, `MOTIVO_PERDA_BLOQUEIO_WHATSAPP`) e liga `conversas.followup_whatsapp_bloqueado` — daí em diante `calcularProximoDisparo` pula os itens de canal `whatsapp` da agenda (itens 1-7) e só considera os de `email` (itens 8-10, nutrição 30/60/90 dias), que continuam normalmente. Sinal mais forte e mais rápido que o item 7 já existente (10 dias sem resposta, `MOTIVO_PERDA_SEM_RESPOSTA`) — aqui a mensagem nem chega a ser entregue, não é só "o lead viu e não respondeu".
  - **Pré-requisito descoberto ao construir, corrigido junto:** o disparo de follow-up por WhatsApp (`dispararItemFollowup`) até então só **gravava** a mensagem em `mensagens`, nunca mandava de verdade pela Zapster (`enviarSequenciaWhatsapp` não era chamado nesse ponto) — por isso nunca existia confirmação de entrega pra checar. Agora chama `enviarMensagemTexto` de verdade e grava `zapster_message_id` (mesmo padrão já usado pras mensagens enviadas por humano), além de marcar `mensagens.origem_followup=true` nessas linhas (pra distinguir de mensagens do script normal ao consultar "últimas N tentativas de follow-up").
  - ✅ **Migration [`20260817080000_followup_deteccao_bloqueio.sql`](../supabase/migrations/20260817080000_followup_deteccao_bloqueio.sql) rodada por Luiz (17/08/2026)** — `mensagens.origem_followup` e `conversas.followup_whatsapp_bloqueado` confirmadas no banco; cron testado (`GET /api/cron/followups`) rodando limpo contra o schema novo, sem erro.
  - **Ainda não testado de ponta a ponta com bloqueio de verdade acontecendo** — depende de esperar os intervalos reais da agenda (10min/45min/4h...) e de um número que realmente falhe a entrega; simular com número de teste falso não serve (a Zapster rejeita o envio na hora, nem chega a existir uma tentativa "enviada mas não entregue" pra testar). Testes unitários da lógica de decisão (`leadProvavelmenteBloqueouWhatsapp`, filtro de canal em `calcularProximoDisparo`) cobrem o comportamento isoladamente.
- ⬜ **Pendente de ação manual de Luiz:** rodar a migration [`20260815180000_configuracoes_contato_institucional.sql`](../supabase/migrations/20260815180000_configuracoes_contato_institucional.sql) (nova, ver seção do e-mail de boas-vindas abaixo) no SQL Editor do Supabase; configurar `CRON_SECRET` no Vercel quando for deployar. Migrations `150000`, `160000` e `170000` já rodadas.

### Fase 7 — Integração real de WhatsApp (Zapster) ✅ funcionando de ponta a ponta (16/08/2026)
Primeiro atendimento real de verdade (lead manda mensagem no WhatsApp → Malala responde de verdade) validado em produção no mesmo dia em que a integração começou.

- ✅ **Conta e instância Zapster criadas por Luiz** — plano Pro (trial 7 dias, 1 instância), modo **não oficial (QR)** pra começar (decisão registrada: migrar pro WABA oficial só quando for gerar volume de leads real, sem reescrever a integração — camada de abstração já prevista desde a seção 8.5). Número de dev/teste: `+55 13 99722-6002`.
- ✅ **Cliente de envio** (`src/lib/whatsapp/zapster.ts`) — texto, mídia por URL (reaproveita as mesmas URLs do Storage já usadas no editor/simulador) e indicador de "digitando..." via presence da Zapster. `src/lib/whatsapp/enviar.ts` traduz `MensagemEtapa` (formato canal-agnóstico do motor) pro formato da Zapster — localização/contato/Pix ainda sem tradução real (nenhuma etapa do script usa esses tipos hoje).
- ✅ **Webhook de recebimento** (`src/app/api/webhooks/zapster/route.ts`) — `message.received` (texto) roda o mesmo motor do `/simulador`, protegido por segredo próprio na URL (`ZAPSTER_WEBHOOK_SECRET`, a Zapster não assina webhook em modo não oficial). **Achado ao construir:** a posição da conversa (etapa atual, dados capturados) não estava sendo persistida — só existia no estado React do simulador. Corrigido em `persistencia.ts` (`registrarTurnoMalala` agora grava `etapa_fluxo_atual_id`/`fluxo_id`/`dados` a cada turno) + nova `carregarOuCriarConversaWhatsapp` reconstrói de onde a conversa parou a partir do banco, já que cada mensagem recebida é uma invocação serverless nova, sem memória entre uma e outra. Respeita `sob_supervisor` (não roda o motor automatizado numa conversa escalada pro humano).
- ✅ **Deploy Vercel** — projeto conectado ao GitHub, mas o domínio `hub-arruda.vercel.app` ficou preso num estado quebrado (erro `NOT_FOUND` na borda da Vercel mesmo com tudo configurado certo — build limpo, domínio "Valid Configuration", Deployment Protection desativada). Isolado como bug específico do projeto (um projeto novo com template funcionou de primeira) — resolvido **excluindo e recriando o projeto do zero** no mesmo repositório.
- ✅ **Cron trocado pro cron-job.org** — `vercel.json` removido (Hobby só libera cron nativo 1x/dia, rejeita o deploy inteiro com `*/5 * * * *`); `CRON_SECRET` agora vai como header `Authorization: Bearer` customizado no job externo.
- ✅ **Bug real: mensagens entregues fora de ordem.** Primeiro teste real mostrou "Me confirma seu whatsapp" chegando antes de "Oi [Nome], bom dia!" (a etapa anterior na cadeia). Confirmado via log de mensagens da própria API da Zapster que a ordem de *envio* estava certa (nosso código já manda uma de cada vez, aguardando cada chamada terminar) — o que invertia era a *entrega*. Duas causas somadas, ambas do lado da Zapster: (1) a instância tinha `message_delay` **ativado por padrão** (`min:0, max:10` segundos, aleatório *por mensagem*, nas configurações da própria instância) — uma segunda camada de atraso competindo com a nossa, agora **desativada** via API (`PATCH /wa/instances/{id}/settings`); (2) mesmo sem isso, o modo não oficial não garante ordem de entrega em mensagens muito próximas. Mitigação aceita por Luiz: piso do delay automático nosso subiu de 0,8s pra 3s (teto 4s→6s, `engine.ts`) — juntar mensagens num envio só foi cogitado e **descartado** (estragaria o ritmo do script de vendas). Resolve por si só ao migrar pro WABA oficial.
- ✅ **Bug real: mensagem do lead processada duas vezes (webhook reenviado pela Zapster).** O handler só respondia depois de rodar o motor inteiro e mandar todas as mensagens (com a pausa de 3-6s cada) — mais lento do que a Zapster espera antes de reenviar o mesmo evento. O reenvio chegava com a conversa já avançada pela 1ª tentativa, processando a mesma mensagem do lead como se fosse a resposta ao checkpoint seguinte (foi assim que "Olá!!" virou nome do lead — junto com o bug de cumprimento-vira-nome abaixo). Corrigido: o handler responde `200` imediatamente e processa via `after()` (mesmo padrão do e-mail de boas-vindas em `persistencia.ts`), eliminando o motivo do reenvio.
- ✅ **Bug real: "oi" virando nome.** Lead respondeu só "oi" pra "Com quem eu falo?" — o fallback do parser (sem IA, Fase 5 ainda não ligada) aceitava qualquer resposta como nome. `extrairNomeDeResposta` (`extracao.ts`) agora rejeita cumprimentos comuns (lista fixa: oi, olá, bom dia etc.) e o motor trata como não reconhecido, repetindo a pergunta.
- ✅ **RLS faltando em `mensagens`/`followup_emails`, achado por acaso** — nunca tiveram política (só funcionava porque toda escrita real usa `service_role`); apareceu ao construir o reset de conversa de teste (abaixo), que usa o cliente autenticado do admin. Migration [`20260816010000_mensagens_followup_emails_rls.sql`](../supabase/migrations/20260816010000_mensagens_followup_emails_rls.sql), mesmo padrão das demais tabelas.
- ✅ **Utilitário `/admin/reset-conversa`** — apaga pessoa/oportunidade/conversa/mensagens de um telefone de teste, pra recomeçar um teste real do zero sem mexer direto no Supabase. Não é uma tela pra uso diário (sem link visível fora do necessário) — só pra teste.
- 💡 **Dica de dev pra consultar a doc da Zapster (17/08/2026):** eles mantêm um índice pensado pra LLM em `https://developer.zapsterapi.com/llms.txt` — bem mais rápido do que navegar a doc completa manualmente, usar sempre primeiro. Na prática: `WebFetch` funciona bem pra achar a URL certa a partir do índice e pra páginas simples, mas as páginas de schema de payload (ex. `/webhooks/event-schemas/message`) usam abas colapsáveis ("Show child attributes") que só abrem com JS de verdade — pra essas, só abrindo com um browser de verdade (`mcp__Claude_Browser__*`, clicando nas abas/toggles) que dá pra extrair os campos aninhados; o `WebFetch` sozinho devolve um resumo truncado.
- ⬜ **Segunda instância (número de atendimento real, sem escala)** — Luiz mencionou ter um número separado pra isso; ainda não criado/conectado. Quando existir, `ZAPSTER_INSTANCE_ID` deixa de ser uma variável única (ver `src/lib/whatsapp/zapster.ts`) — não fazemos isso agora (YAGNI, só existe 1 instância hoje).
- ⬜ **Painel de status de integrações externas** (seção própria abaixo) — Zapster passou a ser a segunda integração de terceiro do projeto (depois da Resend), reforça a necessidade.

### E-mail de boas-vindas ✅ construído e testado com envio real (15/08/2026)
Luiz pediu um e-mail automático assim que a Malala captura o e-mail do lead (checkpoint `abertura_email`) — primeira peça de uma base de mail marketing que vai crescer junto com a régua de nutrição. Objetivo: reforçar confiança logo no momento em que o lead ainda está decidindo se confia na ArrudaCred.

- ✅ **Conteúdo definido e revisado com Luiz em cinco rodadas:** voz da Malala (primeira pessoa, continuidade com o WhatsApp), curto e pessoal — saudação, bloco de confiança (nota Reclame Aqui/Google, 5.000+ clientes, contrato formal, certificado RA1000 + indicação ao Prêmio Reclame Aqui 2026 num item só), vídeo de apresentação institucional do YouTube e capa do post de blog lado a lado (mesma altura, cada um com título/legenda curta e link), CTA "CHAMAR NO WHATSAPP", bloco "fique por dentro" centralizado com ícones + legenda (Site/Whatsapp/Instagram/Facebook/Youtube), rodapé centralizado (site, razão social, CNPJ, descadastro).
- ✅ **Deliverability confirmada:** o e-mail de teste da 1ª/2ª rodada não chegou — investigando o DNS, o SPF do domínio só autorizava o Hostinger, sem incluir a Resend (`resend._domainkey` — DKIM — estava OK). Achado registrado como ação manual de Luiz (ajustar o SPF); o e-mail da 3ª rodada em diante passou a chegar normalmente.
- ✅ **Layout virou base reutilizável** (Luiz, 15/08/2026: "podemos salvar este modelo... padrão para todos e-mails que formos enviar, assim só muda o miolo") — `src/lib/email/templates/layout-base.tsx` cuida de fundo (navy escuro fora do cartão branco), tipografia, cabeçalho (logo) e rodapé (ícones de rede social + dados legais + descadastro); `boas-vindas.tsx` ficou só com o conteúdo específico desse e-mail. Próximo e-mail (nutrição pós-perda, quando a cópia real existir) reaproveita o mesmo `EmailLayout`.
- ✅ **Miniaturas de vídeo e post recortadas pro mesmo tamanho** (380×220, `email/thumbs/` no Storage) — as fontes originais têm proporção diferente (vídeo 4:3, post 3:2), o que deixava as duas alturas visivelmente diferentes lado a lado; `object-fit` não é confiável em e-mail, por isso o recorte é feito de antemão, não via CSS.
- ✅ **Número de WhatsApp e links de redes sociais são configuráveis** (não fixos no template) — Luiz pediu isso especificamente porque o número conectado à Malala pode mudar. Ficam em `configuracoes` (`whatsapp_numero_atendimento`, `redes_sociais`), editáveis pela tela `/admin/configuracoes` que já existe, sem precisar mexer em código. Valor semeado é o do site institucional — **provisório, trocar quando o WhatsApp real da Malala (Fase 7, Zapster) estiver definido** (migration `20260815180000_configuracoes_contato_institucional.sql`).
- ✅ **Cabeçalho e rodapé escuros com o novo logo:** Luiz forneceu o caminho local do arquivo (`Logo ArrudaCred Horizontal-bg-escuro.png`, versão com texto branco pensada pra fundo escuro) — hospedado no Storage, cabeçalho voltou pro fundo navy, logo 70% maior e centralizado. Rodapé final (site/razão social/CNPJ/descadastro) também passou a navy com texto claro, igual ao cabeçalho. Fundo da página (fora do cartão branco) é dourado bem escuro (`#1f1912`, mesma cor já usada no canvas do editor em dark mode) — Luiz testou navy primeiro, preferiu dourado escuro.
- ✅ **Imagens resolvidas:**
  - Logo: o site só tinha em `.webp` (Outlook não renderiza `.webp` de forma confiável) — convertido pra `.png` e hospedado no Storage do próprio projeto (bucket `midia-fluxo`, mesmo lugar que já guarda mídia do fluxo).
  - Capa do post de blog e miniatura do vídeo do YouTube: usadas direto das fontes oficiais (capa do post já existe no site; miniatura do YouTube vem de URL previsível a partir do id do vídeo, sem precisar de API).
  - **Ícones de redes sociais (revisão de Luiz):** a primeira versão usava círculo com iniciais (IG/FB/YT). Luiz pediu ícone de verdade e mandou uma imagem de referência — mas era um preview de banco de assets pago com marca d'água "Designi" visível, então não dava pra recortar dali (nem seria uso lícito). Solução: os 4 ícones de rede social vêm do [Simple Icons](https://simpleicons.org) (projeto open-source feito exatamente pra esse uso — vetor oficial de cada marca, servido via CDN deles), recoloridos dourado e montados sobre quadrado navy arredondado; o quinto (site) é uma seta desenhada à mão (não é ícone de marca de ninguém). Todos convertidos pra PNG e hospedados no Storage do projeto (`midia-fluxo/email/icones/`).
- ✅ **Disparo automático** — `persistencia.ts` aciona `enviarEmailBoasVindasSeNecessario` (via `after()` do Next.js, não trava a resposta da Malala no WhatsApp) assim que `dados.email` é capturado. Nunca manda duas vezes pro mesmo lead (`pessoas.email_boas_vindas_enviado`).
- ✅ **Descadastro funcional** (`/descadastro?p=<id-da-pessoa>`) — página de confirmação (não dispara só ao abrir o link, evita descadastro acidental por scanner de e-mail) + `pessoas.email_marketing_opt_out`, checado antes de qualquer envio de marketing (este e-mail e, no futuro, a nutrição pós-perda).
- ✅ **Testado com envio real** — e-mail de teste disparado de verdade via Resend pro próprio Luiz conferir na caixa de entrada (não só o preview renderizado).
- ~~⬜ Aviso pra quando for testar pelo `/simulador`: o envio é de verdade~~ — **não é mais um risco a partir de 16/08/2026:** o simulador parou de persistir (ver seção Fase 6 acima), então `registrarTurnoMalala`/o disparo do e-mail de boas-vindas nunca são chamados a partir dele. Testar o e-mail de boas-vindas de verdade agora exige uma conversa real (webhook Zapster) ou a Tela de Atendimento.

### Tela de Atendimento (CRM) + Fase 5 (IA real) 🔶 em andamento — Bloco A construído (16/08/2026)
Luiz considera essa a tela mais importante do CRM — onde o admin/atendente acompanha o atendimento da Malala em tempo real e assume/atende conversas manualmente. Desenho completo fechado após pesquisa de mercado (Chatwoot, Umbler Talk, Digisac, Octadesk) — ver **`TELA_ATENDIMENTO_ARRUDACRED.md`** pra especificação inteira (lista de contatos, conversa, composer, colaboração entre os 2 atendentes humanos já existentes, confirmação de leitura, roteamento de lead novo por 3 modos configuráveis, troca de assunto em conversa ativa, e a limitação técnica confirmada de chamada de voz/vídeo — Zapster não expõe evento de chamada). Construção dividida em blocos combinados com Luiz — A → B → B2 → C/Fase 5 → D.

- ✅ **Bloco A — fundação (16/08/2026):** `/admin/atendimento` (`src/app/admin/(shell)/atendimento/`, lógica de dados em `src/lib/motor-fluxo/repositorio-atendimento.ts`). Lista de contatos (view `conversas_resumo`, `20260816030000_atendimento_bloco_a.sql`) com escopo padrão (esconde oportunidade `perdida`), busca por nome/telefone/conteúdo de mensagem, e barra de filtros **Tudo / Malala / Humano (submenu Minhas · Não atribuídas · Todas) / Não lidas / +Filtros** (desenho revisado com Luiz depois do primeiro teste — cada botão mostra badge vermelho com a contagem de não lidas naquele escopo, via `contarNaoLidas`). Conversa: histórico completo, **Assumir Chat** / **Atribuir pra Malala** (`conversas.atendente_id` novo + `sob_supervisor` já existente), composer habilitado só com humano no controle, envio real testado de ponta a ponta pela Zapster. `usuarios_sistema` nunca tinha sido populada desde a Fase 1 (login sempre foi só Supabase Auth) — `obterUsuarioSistemaAtual()` a auto-provisiona no primeiro acesso de cada admin, sem seed manual. Atualização por polling simples (4s), não Realtime ainda. Achados corrigidos durante o teste no navegador: escopo padrão não excluía `perdida` (bug); a regra "oportunidade reabre na última etapa quando o lead responde de novo" (já documentada) nunca tinha sido implementada no webhook — corrigida em `carregarOuCriarConversaWhatsapp` (`persistencia.ts`). Commits `cdd4121`, `37a136d`, `4f28132`.
- ✅ **Bloco B — colaboração, concluído (17/08/2026):** plano dividido em 10 fases pequenas, cada uma commitada isoladamente — ver `docs/superpowers/plans/`. **Fase 1** sistema de cores por controlador (Malala roxo / não atribuída verde estilo WhatsApp / atendente específico com cor própria — depois revisado: cor deixou de ser escolha do próprio atendente e virou config do admin em `/admin/atendentes`). **Fase 2** atribuição a atendente específico (dropdown "Atribuir a..." no cabeçalho; submenu "Humano" da barra de filtros lista cada atendente por nome+cor). **Fase 3** "⋮" de ações rápidas no card da lista. **Fase 4** busca dentro da conversa aberta (🔍), painel de dados do contato/oportunidade (👤, largura fixa por enquanto — vira a coluna de 25% redimensionável quando o layout de 3 colunas for construído, ver Pendências de UX), menu "⋮" do cabeçalho (copiar telefone, resetar conversa). **Fase 5** notas internas (`notas_internas`) — chip amarelo na timeline, nunca vai pro WhatsApp; @menção por primeiro nome cria notificação (`notificacoes`) pro colega, exceto auto-menção; atribuir a atendente específico também notifica; sino 🔔 com contador de não lidas. **Fase 6** respostas prontas (`respostas_prontas`, CRUD em `/admin/respostas-prontas`) — atalho "/" ou botão "💬 Respostas prontas" no composer busca e insere. **Fase 7** atalho "⚡ Próxima etapa" — preenche o composer com o texto literal da etapa em que a conversa está parada (`conversas.etapa_fluxo_atual_id` → `etapas_fluxo`), pro humano revisar/editar antes de enviar. **Fase 8** follow-up manual — modal aparece ao trocar de conversa quando a última mensagem é nossa e o lead não respondeu ainda, oferece ativar a régua de follow-up (`conversas.followup_manual_ativo`, migration `20260817030000`); sem isso o cron (`api/cron/followups`) só cuidava de conversas com a Malala no controle (`sob_supervisor=false`) — agora também cobre conversas de humano que ativou manualmente. Chip amarelo "🕐 Follow-up ativo" mostra o próximo envio estimado (`proximoDisparoPrevisto`, `motor-followup.ts`, com testes). **Limitação pré-existente, não introduzida aqui:** o disparo do cron (`dispararItemFollowup`) só registra a mensagem em `mensagens`/`followup_emails` — o envio de verdade pelo adaptador Zapster ainda não está plugado nesse ponto específico (diferente do fluxo normal da Malala, que envia de verdade). **Fase 9** composer reorganizado em 2 linhas (atalhos em cima: ⚡ Próxima etapa, 💬 Respostas prontas, 📎/🎤/📅 "em breve" — digitação embaixo). **Fase 10** avatar+nome do usuário logado no topo da tela, menu com Sair (sem "escolher minha cor", removido na revisão de cores). Migrations `20260817020000_respostas_prontas.sql` e `20260817030000_followup_manual.sql` já rodadas por Luiz e verificadas ao vivo no navegador (todas as 5 fases 6-10 testadas com conversas de teste via REST, limpas depois).
- ✅ **Bloco B2 — concluído (17/08/2026):** composer estilo WhatsApp Web + card de contato redesenhado, design fechado com Luiz em várias rodadas de preview visual (`docs/superpowers/specs/2026-08-17-bloco-b2-composer-card-contato-design.md`), construído em 5 fases. **Migration** `20260817040000_bloco_b2_card_contato.sql` (`produtos.nome_reduzido`, `conversas.favorita`, `mensagens.zapster_message_id`/`entregue_em`/`lido_em`, view `conversas_resumo` ampliada com contagem real de não lidas — não é mais booleano). **Rastreio de entrega/leitura**: `enviarMensagemTexto`/`enviarMensagemMidia` agora guardam o `messageId` da Zapster em `mensagens.zapster_message_id`; webhook (`api/webhooks/zapster/route.ts`) passa a tratar `message.delivered`/`message.read` além de `message.received` — confirmado com a doc real da Zapster (`developer.zapsterapi.com`) que esses eventos existem, mas o nome exato do campo de correlação no payload ainda não foi validado contra tráfego real (mesmo padrão de cautela já usado pra `message.received`: loga o payload bruto, ajusta rápido se divergir). **Card de contato**: avatar com cor de quem controla (inicial do nome, ou 📞 quando o nome do lead ainda não é conhecido — string placeholder "Lead (WhatsApp)"/"Novo Lead", frágil mas evita coluna nova agora), nome em negrito só quando não lida, mensagem nunca em negrito, hora/data ("DD/MM - HH:MM" quando não é hoje), badges de atribuição/etapa com ícone mantendo cor, produto (nome reduzido) + valor da oportunidade, check ✓/✓✓/✓✓azul de entrega/leitura, contador de não lidas com número branco maior, favoritar com estrela (sobe pro topo da lista, sem "fixar" separado — descartado). Etapa do Kanban mostra rótulo amigável (`rotuloCurtoDaSubetapa`/`rotuloDaSubetapa`, `src/lib/motor-fluxo/kanban.ts` — já existia pro editor de fluxo, só reaproveitado aqui) em vez do slug bruto (`novo_lead_triagem` → "Triagem") — não mexe no valor salvo no banco, só na exibição, pra não arriscar quebrar as comparações `.eq`/`.neq("etapa_kanban", ...)` espalhadas pelo código. **Composer**: emoji via `emoji-picker-react` (categorias + busca + recentes, built-in da biblioteca — troca do grid curado de 24 do primeiro rascunho), campo cresce 1→10 linhas depois vira scroll interno, "⚡ Ações" agrupa Próxima etapa/Respostas prontas/Agendar num menu só, "📎 Anexo" abre menu com Documento/Fotos e vídeos/Câmera (todos via `enviarMensagemMidia`, reaproveitando o mesmo upload pro Storage do editor de fluxo — `uploadMidiaAction`, bucket `midia-fluxo`), "🎤 Áudio" abre menu com **Gravar agora** (grava de verdade via `MediaRecorder`/`getUserMedia`, indicador vermelho pulsante + cronômetro, cancelar ou parar-e-enviar) ou **Enviar arquivo** (mesmo seletor de arquivo). Testado no navegador: upload real confirmado no Storage, envio via Zapster corretamente rejeitado por número de teste falso (mesmo padrão de verificação do texto), textarea crescendo até 10 linhas com scroll, emoji-picker inserindo na posição do cursor, gravação corretamente bloqueada pelo sandbox de teste (sem acesso a microfone real nesse ambiente — comportamento de erro tratado, não testável de ponta a ponta fora de um navegador de verdade). **Não migrado:** Enquete/Evento/Nova figurinha/Catálogo/Cobrar do menu nativo do WhatsApp Web (sem endpoint/modelagem hoje) e bloquear/desbloquear contato (endpoint da Zapster não confirmado) — ambos fora do escopo desta rodada.
- ✅ **Extensões do Bloco B2 — concluídas (17/08/2026, mesma rodada):** itens que não estavam no plano original, pedidos por Luiz depois de testar o Bloco B2 na prática. **Migration** `20260817050000_midia_tipo_e_painel_oportunidade.sql` (`mensagens.midia_tipo`, coluna nova). Todas testadas no navegador com dado real/simulado via REST, limpo depois; lint+tsc+vitest verdes a cada chunk.
  - **Emoji picker em pt-BR** — trocado `emojiData` da `emoji-picker-react` pro `emojis-pt.json` que a própria biblioteca já traz (`import ... from "emoji-picker-react/dist/data/emojis-pt.json"`), incluindo labels de busca/limpar em português. Tipo `EmojiData` não é exportado pela raiz do pacote, só por `emoji-picker-react/dist/types/exposedTypes`.
  - **Badges do card do lead numa linha só** — as 4 badges (atendente/etapa/produto/valor) + botão de ações, que antes quebravam linha, viraram retangulares com truncamento (`text-ellipsis` + `title=` com o texto completo em hover) pra caber tudo numa linha só, valor nunca trunca.
  - **Bug real corrigido — mídia não aparecia na Tela de Atendimento:** antes, qualquer `midia_url` tentava renderizar como `<img>` incondicional (áudio/vídeo enviados só mostravam o horário, sem nada visível) — e pior, **mídia recebida do lead nem era registrada**, o webhook (`api/webhooks/zapster/route.ts`) só tratava `data.type === "text"`. Corrigido nas duas pontas:
    - Nova coluna `mensagens.midia_tipo` (`imagem|audio|video|documento`, mesmo vocabulário de `MensagemEtapa`) preenchida nas 3 origens de mensagem (lead via webhook, humano via composer — deriva do mimetype do arquivo escolhido —, Malala via motor de fluxo). Nula em mensagens antigas anteriores à migration — o frontend cai pra "imagem" nesse caso, único tipo que já existia antes.
    - Webhook passa a tratar `data.type` ∈ `image|sticker|video|audio` também (mapeados pra `imagem|imagem|video|audio`), registrando a mídia recebida do lead na conversa (`registrarMensagemLead`) — **de propósito nunca roda o motor de fluxo em cima de mídia recebida**, mesmo com a Malala no controle, porque o parser determinístico só entende texto (tratar a URL como se fosse a resposta do lead corromperia a posição da conversa).
    - Timeline (`atendimento-client.tsx`) renderiza por tipo: áudio com player nativo inline, vídeo com thumbnail (▶) que abre modal de tela cheia com `<video controls autoPlay>`, documento como link "📄 Abrir documento" (abre em nova aba), imagem com modal de tela cheia ao clicar — funciona igual pra mídia enviada e recebida.
  - **Preview + legenda antes de enviar anexo/áudio (estilo WhatsApp)** — escolher um arquivo no menu "📎 Anexo" ou parar uma gravação de áudio não sobe mais direto: abre um modal com preview (imagem/vídeo/áudio tocável, ou nome do arquivo pra documento) + campo de legenda + Enviar/Cancelar, só envia de fato na confirmação. **Pesquisado antes de construir:** não existe biblioteca pronta equivalente ao `emoji-picker-react` pra isso — as opções achadas (`react-image-editor`, Pintura, `react-easy-crop`) são editores completos (crop/rotate/filtro), fora do escopo pedido; as mais simples (`upload-preview`) só fazem thumbnail, sem campo de legenda. Por isso o modal foi construído direto no componente.
  - **Painel "Oportunidade" (dados do contato/oportunidade, seção 3 do `TELA_ATENDIMENTO_ARRUDACRED.md`) ganhou 3 campos novos** — "Conversa iniciada em" (`conversas.created_at`), badge da etapa do Kanban (já existia) e "Serviço" (nome reduzido do produto, `produtos.nome_reduzido`) continuam; somam-se tipo de documento do lead (`conversas.dados.tipo_documento`, quando capturado) e valor da oportunidade (já existia, só ganhou o rótulo "Valor da oportunidade:"). **Gap identificado, não resolvido:** Luiz pediu também mostrar "Pacote escolhido pelo Lead", mas não existe campo `pacote` no modelo de dados hoje (`conversas.dados` não guarda isso) — fica registrado aqui até decidir se cria um campo novo ou se "pacote" já é sinônimo de outro dado existente.
- 🔶 **Bloco C / Fase 5 — IA real, 5 de 6 itens concluídos (17/08/2026):** módulo de IA único compartilhado por todo o sistema (interpretação de checkpoint, resumo de conversa ao assumir, detector de objeção + resposta sugerida, assist do composer, transcrição de áudio — todos ✅ — falta só detecção de troca de assunto).
  - **Provedor decidido: Anthropic Claude** — Haiku 4.5 pra tarefas de classificação/extração (interpretação de checkpoint, detector de objeção, detecção de troca de assunto, resumo de conversa), Sonnet 5 só pra tarefas que precisam da voz/nuance da Malala (composer-assist). Comparado preço por token com OpenAI (GPT-5.6) e Google (Gemini 3.7 Flash) — a diferença nominal existe (~5x mais barato no tier econômico da OpenAI), mas irrelevante em valor absoluto nesse volume (diferença de poucos dólares/mês mesmo em 1.000 leads/dia) frente ao custo de manter dois provedores — e a persona/FAQ da Malala já está calibrada em Claude. Transcrição de áudio continua sendo OpenAI (`gpt-4o-mini-transcribe`, $0,003/min — mais barato que o Whisper clássico), porque o Claude não transcreve áudio nativamente (seção 2.2).
  - **Estimativa de custo revisada (17/08/2026), substitui a da seção 2.3:** ~$0,004/lead em média (6 eventos de IA possíveis por lead, a maioria via Haiku com cache) — **30 leads/dia ≈ $3-5/mês**, **1.000 leads/dia ≈ $100-150/mês**. Bem abaixo da estimativa anterior (~R$2.500-5.000/mês pra 1000 leads/dia) porque agora o escopo exato dos 6 eventos existe de verdade (antes era um chute mais genérico) e o desconto de cache de 90% da Anthropic reduz bastante o custo "fixo" repetido. Continua sendo estimativa de planejamento — recalibrar com uso real de produção assim que o Bloco C estiver todo no ar.
  - ✅ **Interpretação de checkpoint — construído e ligado em todos os checkpoints que se beneficiam (17/08/2026):** `src/lib/motor-fluxo/interpretacao-ia.ts` implementa de verdade o encaixe `InterpretadorIA` que já existia tipado desde a Fase 1 (`tipos.ts`) mas nunca tinha sido ligado — chama Haiku via tool-use com output estruturado, valida a resposta do modelo contra as `opcoes` válidas do checkpoint quando existirem (nunca aceita um valor "alucinado" fora da lista — `interpretacao-ia-validacao.ts`, com testes). Ligado no webhook real da Zapster e no `/simulador`.
    - **Mapeamento de quais checkpoints se beneficiam (feito olhando `parser.ts`):** checkpoints `menu`/`sim_nao` com `opcoes` exigem match EXATO de um rótulo — qualquer resposta em frase livre falha no parser, então a IA entra de verdade. Checkpoints `texto_livre` **sempre** "reconhecem" qualquer texto não vazio (`parseTextoLivre`) — o fallback de IA nunca seria alcançado, então **não foram habilitados** (seria um campo morto): `abertura_telefone`, `ln_passo8`, `ln_passo12_explique`, `ln_passo16_1`, `ln_passo17a`, `ln_passo17b`, `ln_passo18`. Exceção: `pergunta_nome` (texto_livre) foi habilitado mesmo assim, porque o `engine.ts` tem uma regra específica (`extrairNomeDeResposta`) que pode rejeitar a resposta mesmo sendo texto livre (evita "Oi" virar nome) — esse caminho de IA é alcançável.
    - **14 checkpoints habilitados no total:** `pergunta_nome`, `abertura_email`, `triagem_menu`, `ln_passo2`, `ln_passo4`, `ln_passo6`, `ln_passo6_refino_baixo`, `ln_passo6_refino_alto`, `ln_passo7`, `ln_passo12`, `ln_passo14`, `ln_passo15_normal`, `ln_passo15_alto_valor`, `ln_passo15_selfservice` — cada um com `instrucao` específica pro contexto daquele checkpoint (ex.: `ln_passo7` avisa a IA que "nao" ali encerra o atendimento com perda, pra não forçar uma escolha em resposta ambígua). **Desatualizado pela Fase 2 do suporte a pacote (ver abaixo):** `ln_passo4` e `ln_passo6` trocaram de `menu`/`interpretacao_ia` genérica pra interpretadores especializados (`lista_documentos`/`faixas_documentos`); `ln_passo6_refino_baixo`/`ln_passo6_refino_alto` foram removidos do banco (substituídos pela pergunta única de faixa).
    - Testado de ponta a ponta no simulador com 3 tipos diferentes (`ln_passo4` com 3 opções, `ln_passo6` com 5, `triagem_menu` com 8) respondendo em frase livre — todos escolheram a opção certa.
  - **Achado importante pra quem for habilitar `interpretacao_ia` em mais checkpoints:** o motor lê o conteúdo das etapas do banco (`etapas_fluxo`, via `carregarEtapasPorCodigo`), **não** do arquivo `fluxo-limpeza-nome.ts` — esse arquivo é só a fonte original usada pra semear o banco uma vez, já diverge do banco em pontos (ex.: `proximo_codigo` de `triagem_menu` no banco é `ln_passo1`, no TS é `ln_passo2`). Editar o TS não muda nada em produção — precisa editar a linha real em `etapas_fluxo` (pelo editor visual em `/admin/fluxos`, ou via SQL/REST direto).
  - **Chave de API:** `ANTHROPIC_API_KEY` já configurada por Luiz em `.env.local` (17/08/2026) — validade de ~180 dias a partir da criação (renovar por volta de meados de fevereiro/2027) e ~$4,5 de crédito no momento (dá pra milhares de chamadas de teste, sem risco de esgotar no MVP1). **Pendente:** configurar a mesma variável na Vercel quando o deploy de produção existir.
  - ✅ **Resumo de conversa ao assumir (17/08/2026):** ao clicar "Assumir Chat"/"Atribuir a... > Mim", gera (Haiku, texto livre — não tool-use, a saída é um parágrafo pra leitura humana) um resumo de até 4 linhas (o que o lead já disse, em que etapa está, se há objeção/hesitação) num banner fixo no topo da conversa. Não persistido — regenerado sob demanda a cada "assumir" (custo irrelevante). `src/lib/motor-fluxo/resumo-conversa.ts`. Testado no navegador com lead real via webhook.
  - ✅ **Detector de objeção + orientação sugerida (17/08/2026):** botão "🚩 Detectar objeção" no menu de Ações (acionado sob demanda pelo atendente, não a cada poll de 4s — evitaria gerar chamada de IA contínua) cruza a última mensagem do lead com o banco de objeções ativas (`objecoes`, Haiku tool-use) e mostra a objeção encontrada + a orientação de "como lidar". **Cuidado de design:** `como_lidar` é mostrado só como orientação pro atendente ler — nunca inserido direto no composer como mensagem pronta, porque o comentário da migration `20260814170000_banco_objecoes.sql` deixa claro que o campo é "diretriz de como reverter a objeção", não uma resposta pronta pra mandar ao lead. `src/lib/motor-fluxo/detector-objecao.ts`. Testado no navegador com objeção real de "medo de golpe", identificou a objeção certa do banco de 50 de Luiz.
  - ✅ **Assist do composer — Sonnet (17/08/2026):** botão "✨ Sugerir resposta" no menu de Ações gera um rascunho de mensagem na voz da Malala (persona completa + FAQ como contexto) e preenche o composer pro atendente revisar/editar — nunca envia sozinho. Usa Sonnet (não Haiku) porque aqui a tarefa é gerar texto com nuance, não classificar. **Decisão de arquitetura:** a persona (`PERSONA_MALALA_PROMPT_SISTEMA.md`, escrita desde 14/08 pra ser "o texto real usado como system prompt") nunca tinha sido lida por nenhum código — ler via `fs.readFileSync` em `docs/` quebraria no bundle serverless da Vercel (arquivos fora de `src`/`public` não são incluídos por padrão). Por isso o texto entra na tabela genérica `configuracoes` (mesmo padrão já usado pro número de WhatsApp/redes sociais, migration 018) sob a chave `malala_persona_prompt_sistema`, editável em `/admin/configuracoes` sem deploy — migration [`20260817070001_persona_malala_config.sql`](../supabase/migrations/20260817070001_persona_malala_config.sql) documenta/semeia o valor (linha já inserida via REST, não depende de Luiz rodar SQL — **renomeada de `070000` pra `070001` em 18/08/2026** pra não colidir com o timestamp de `20260817070000_modulo_marketing_nucleo.sql`, do módulo de Marketing, já aplicada e rastreada via `supabase db push`; a minha nunca passou pelo tracking do CLI, então a troca de nome não tem efeito colateral em produção). `src/lib/motor-fluxo/composer-assist.ts`. Testado no navegador: sugestão respondeu corretamente uma pergunta sobre CNPJ e retomou a pergunta pendente, seguindo as regras de tom da persona (limite de emoji, 👉 antes de pergunta).
  - ✅ **Transcrição de áudio (17/08/2026):** `OPENAI_API_KEY` configurada por Luiz (~$5 de saldo) — único uso de IA do sistema que não é Anthropic (Claude não transcreve áudio nativamente). `src/lib/motor-fluxo/transcricao-audio.ts` chama `gpt-4o-mini-transcribe` (`POST /v1/audio/transcriptions`, multipart). Áudio recebido do lead no WhatsApp passa a rodar o motor de fluxo normalmente (como se fosse texto digitado) em vez de só ser registrado pro humano ouvir — `processarAudioRecebido` (`route.ts`) transcreve primeiro, e só cai no comportamento antigo (registra sem rodar o motor) se a transcrição falhar. A mensagem do lead grava o áudio (toca na timeline) **e** o texto transcrito como legenda (`mensagens.conteudo`), então fica auditável o que a Malala "ouviu". **Bug real corrigido durante o teste:** a chamada mandava todo áudio pra OpenAI como `audio.ogg` fixo (formato real do WhatsApp/Opus) — a API rejeita ("corrupted or unsupported") quando o arquivo de verdade é outro formato; corrigido pra detectar a extensão certa pelo `Content-Type` da resposta do download. Testado de ponta a ponta via webhook real: áudio de teste (gerado por TTS, subido pro Storage) → transcrito corretamente → motor rodou e a Malala respondeu à abertura normalmente.
  - ⬜ **Detecção de troca de assunto — desbloqueada, ainda não construída (atualizado 17/08/2026):** o desenho (`TELA_ATENDIMENTO_ARRUDACRED.md` seção 5-B) usa "o mesmo mecanismo de palavras-chave das regras de roteamento" como base a evoluir pra IA — esse mecanismo **agora existe** (Bloco D concluiu o roteamento de lead novo por palavra-chave, `regras_roteamento`/`resolverEtapaInicialLeadNovo` em `roteamento-lead-novo.ts`), mas foi construído especificamente pra decidir o fluxo de um **lead novo**, ainda não foi reaproveitado pra detectar troca de assunto **numa conversa já em andamento** (o caso descrito na seção 5-B). Deixa de estar bloqueado por falta de base — falta ainda o trabalho de ligar isso ao meio da conversa.
- ✅ **Suporte a "pacote" (N CPF/CNPJ por Oportunidade) — Fases 1-3 construídas e testadas de ponta a ponta (17/08/2026):** achado real testando a interpretação por IA — o lead "João" mencionou "devo 10 mil" na abertura (corrigido, ver mais abaixo) e depois, ao ser perguntado CPF/CNPJ, a possibilidade de pacote (2+ documentos) veio à tona. O script original (`SCRIPT_LIMPANOME_SERASA_SPC.md`, Passo 4) já previa isso ("é uma lista de itens, não valor único") mas nunca virou engenharia — ficou esquecido.
  - **Decisões de Luiz (17/08/2026):**
    - **Precificação:** soma simples das faixas de cada documento (nunca uma tabela de desconto combinada) — mas se a Malala perceber oportunidade de fechamento, pode oferecer conversa com um gerente comercial que negocie desconto de pacote manualmente.
    - **Kanban/contrato:** **1 Oportunidade só** por pacote (1 card, 1 contrato, 1 responsável financeiro assina/paga) — nunca N oportunidades separadas. Só vira oportunidade separada se o lead quiser um **serviço diferente** (produto diferente, não mais documentos do mesmo serviço) — reforça a regra já registrada na seção 5-B do `TELA_ATENDIMENTO_ARRUDACRED.md`.
    - **Captura:** texto livre + IA, mas a IA **não pode dar checkpoint como reconhecido até ter informação completa** (tipo + quantidade de cada documento) — se faltar algo, precisa gerar uma pergunta de esclarecimento específica, não só falhar e repetir a pergunta genérica (diferente do padrão binário reconheceu/não-reconheceu já usado nos outros 14 checkpoints).
    - **Pivô de UX durante a Fase 2 (17/08/2026):** o plano original previa perguntar a faixa de valor documento por documento, em loop ("qual a faixa do 1º CPF?", "e do 2º?"...). Luiz avaliou como ruim ("acho ruim ficar repetindo a pergunta para cada documento") e pediu **uma pergunta só**, explicando que precisamos da faixa de cada documento pra montar o preço, oferecendo a consulta paga (R$39/documento, 4 órgãos: Serasa/SPC Brasil/SCPC Boa Vista/CENPROT) ou os apps oficiais gratuitos como alternativa pra quem não sabe — e só dar checkpoint depois de ter a faixa de **todos** os documentos. Isso eliminou a necessidade de um loop no motor (ver Fase 2 abaixo).
  - ✅ **Fase 1 — dados (17/08/2026):** migration [`20260817060000_oportunidade_documentos.sql`](../supabase/migrations/20260817060000_oportunidade_documentos.sql) — tabela `oportunidade_documentos` (tipo_documento, documento, faixa_valor/faixa_valor_detalhe/valor_aproximado/valor_restricao_estimado/alto_valor por item, FK cascade pra oportunidades) + repositório `src/lib/motor-fluxo/oportunidade-documentos.ts` (CRUD + `recalcularValorEstimadoOportunidade` que soma os itens em `oportunidades.valor_estimado`). Migration rodada por Luiz.
  - ✅ **Fase 2 — motor + IA + persistência (17/08/2026), testada de ponta a ponta via webhook real (lead fictício "Renata", pacote de 2 CPFs):**
    - **2 `tipo_resposta` novos** (`tipos.ts`): `lista_documentos` (ln_passo4 — "quantos e quais documentos") e `faixas_documentos` (ln_passo6 — pergunta única e consolidada da faixa de cada documento, listando-os quando são mais de um). Nenhum primitivo novo de loop foi necessário no `engine.ts` — a passagem `ln_passo6 → ln_passo7` (valor baixo) ou `→ ln_passo8` continua usando `proximo_por_dado`, avaliado sobre um campo derivado (`documentos_valor_baixo`) calculado a partir da **soma** das faixas do pacote.
    - **2 interpretadores de IA especializados** (Haiku, tool-use), cada um com 3 saídas — `completo | incompleto | nao_entendi` — diferente do padrão binário dos outros 14 checkpoints: `incompleto` carrega uma `perguntaEsclarecimento` customizada, pra IA só liberar o checkpoint quando tiver informação completa (`interpretar-lista-documentos.ts`, `interpretar-faixas-documentos.ts`, com validação pura testável em `*-validacao.ts` e 13 testes novos no total).
    - **Estado em `DadosConversa`** continua flat (nenhuma mudança estrutural no motor): `documentos_tipos` e `documentos_valores` são strings CSV posicionalmente pareadas (ex.: `"cpf,cpf"` + `"15000,nao_sei"`).
    - **`oportunidade_documentos` é populada automaticamente** assim que a faixa do pacote inteiro é capturada — `criarDocumentosOportunidadeSeNecessario` (`oportunidade-documentos.ts`), disparada via `after()` em `persistencia.ts` (mesmo padrão do e-mail de boas-vindas), idempotente contra retry de webhook.
    - **2 bugs reais corrigidos durante o teste de ponta a ponta:** (1) `mensagemRetomada` (`engine.ts`) usava o texto estático da etapa em vez do dinâmico resolvido por `resolverMensagensDinamicas` — o fallback "não entendi" mostrava o placeholder cru gravado no banco em checkpoints com texto dinâmico (ln_passo6/12/14/15\_\*); (2) `oportunidades.valor_estimado` divergia de `dados.valor_restricao_estimado` quando havia "não sei" no pacote — a soma em `criarDocumentosOportunidadeSeNecessario` tratava "não sei" como `null`/0, enquanto o cálculo em `dados` (`somarValoresDocumentos`) usa um valor-padrão de R$75mil (`VALOR_PADRAO_DOCUMENTO_NAO_SEI`, agora exportado e reaproveitado nos dois lugares).
    - **Achado de processo (recorrente):** o motor lê `etapas_fluxo` do Supabase em runtime, não o `fluxo-limpeza-nome.ts` — que é só a semente original. Restructurar `ln_passo4`/`ln_passo6` no TS (incluindo a coluna `campo_salvo`, que é separada do jsonb `conteudo`) exigiu um PATCH via REST na tabela real pra ter efeito; as etapas órfãs `ln_passo6_refino_baixo`/`ln_passo6_refino_alto` (substituídas pela pergunta única) foram removidas do banco depois de confirmar que nada mais referenciava elas.
  - ✅ **Fase 4 concluída (17/08/2026) — precificação por documento de verdade:** antes o preço vinha de uma faixa única sobre o valor total combinado (`somarValoresDocumentos` + `buscarFaixaPreco`); agora cada documento é precificado pela SUA PRÓPRIA faixa e as faixas são somadas (`combinarFaixasPacote`, `regras-limpeza-nome.ts`). Preço cheio/à vista/voucher à vista somam direto; cartão usa o maior `parcelasCartaoMax` entre os documentos. **Parcelamento boleto/voucher usa uma régua mês a mês** (`combinarParcelas`) — regra de Luiz (17/08/2026): o total de parcelas é o maior entre os documentos, e em cada mês soma quem ainda tem parcela devida (documento com menos parcelas "sai" da soma quando termina) — ex.: CPF 6x R$100 + CNPJ 3x R$200 vira 3x R$300 (meses 1-3) + 3x R$100 (meses 4-6), 6 parcelas no total, não 9. Com 1 documento só (caso mais comum) o resultado é idêntico ao de antes — sem mudança de comportamento, 335 testes passando incluindo 9 novos em `regras-limpeza-nome.test.ts` (cobrem o exemplo de Luiz, 3+ documentos encadeados, e o caso de 1 documento inalterado).
  - ⬜ **Fase 5 (não iniciada):** oferta de conversa com gerente comercial quando a Malala perceber oportunidade de desconto de pacote.
  - ⬜ **Fase 6 (não iniciada, registrado por Luiz 17/08/2026) — mensagens de dados para o contrato ainda não são pacote-aware:** `ln_passo17a` (`fluxo-limpeza-nome.ts`) pede só "CPF: / Nome Completo:" (um documento só, texto fixo hardcoded) — se o lead fechou um pacote de N documentos, precisa pedir os dados de cada um. Luiz: "depois precisamos olhar isso" — não é pra construir agora, só não esquecer. Mesmo padrão de solução das Fases 2 (mensagem dinâmica via `resolverMensagensDinamicas`, olhando `dados.documentos_tipos`) provavelmente se aplica aqui também.
- ✅ **Bloco D — refinamentos, concluído (17/08/2026):** histórico de fotos do contato, selo de risco de esfriar (3 sinais, decisão de Luiz — construído completo, não simplificado), confirmação de leitura, roteamento de lead novo (3 modos configuráveis), configuração de rejeição de chamada.
  - ✅ **Confirmação de leitura + rejeição de chamada ligadas na instância real (17/08/2026):** `atualizarConfiguracoesInstancia` (`src/lib/whatsapp/zapster.ts`, `PATCH /wa/instances/{id}/settings`) aplicada de verdade na instância "ARRUDACRED 6002" — `read_confirmation: {chats: true}` (trade-off aceito: o lead também vê que lemos a mensagem dele) e `call_rejection: "none"` (decisão de Luiz, 17/08/2026: **não** rejeitar chamada por enquanto, pra ele conseguir ver pelo WhatsApp oficial quando um lead tenta ligar — configurável depois).
  - 🐛 **Bug real crítico encontrado e corrigido no processo:** o webhook de produção (`hub-arruda.vercel.app`) só estava inscrito no evento `message.received` — **nunca esteve inscrito em `message.delivered`/`message.read`**, apesar do código (`marcarStatusMensagem`, Bloco B2) já tratar esses eventos há dias. Ou seja: nenhuma confirmação de entrega/leitura real chegou até agora — os checks ✓✓azul da timeline nunca avançavam de "enviado" de verdade, e a detecção de bloqueio de WhatsApp no follow-up (seção Fase 6 acima) nunca teria dado certo (`entregue_em` sempre null, pra qualquer mensagem, bloqueada ou não). Corrigido via `PATCH /wa/instances/{id}/webhooks/{webhook_id}` adicionando os dois eventos que faltavam. **Efeito colateral positivo:** agora sim dá pra confiar no sinal de entrega usado pela detecção de bloqueio.
  - ✅ **Rejeição de chamada — config armazenada + botão de chamada nativa (17/08/2026):** `configuracoes` ganhou `chamada_rejeicao_modo` (valor atual: `"none"` — Luiz decidiu **não** rejeitar chamada por enquanto, pra conseguir ver pelo WhatsApp oficial quando um lead tenta ligar) e `chamada_mensagem_rejeicao` (texto pronto, mas **sem como ser enviado automaticamente hoje** — a Zapster não expõe webhook de chamada, então o sistema nunca fica sabendo que uma chamada aconteceu pra reagir a ela; fica guardado pra quando esse gancho existir). **Limitação registrada:** mudar o valor em `/admin/configuracoes` não reaplica sozinho na Zapster — precisa rodar `atualizarConfiguracoesInstancia` de novo manualmente até existir uma sincronização automática (não construída agora, YAGNI — muda raramente). Menu "⋮" do cabeçalho da conversa ganhou "📞 Ligar pelo WhatsApp" (deep link `wa.me/<telefone>`) — abre o chat de verdade no WhatsApp, de onde o atendente inicia a chamada (não existe deep link específico pra "iniciar chamada", confirmado ao pesquisar — só o de abrir conversa).
  - ✅ **Histórico de fotos do contato (17/08/2026):** nova tabela `pessoa_fotos` (migration 031, `20260817090000_pessoa_fotos.sql` — **ainda não rodada por Luiz**) guarda cada foto de perfil já vista pra uma pessoa, nunca sobrescreve. Captura acontece a cada `message.received` do webhook (`capturarFotoPerfilSeNecessario`, `persistencia.ts`) — a Zapster manda `sender.profile_picture` em todo evento, então não precisa de lógica especial só pra "primeira mensagem"; só insere linha nova quando a URL muda em relação à mais recente salva. `conversas_resumo` (view) ganhou `pessoa_foto_url` (foto mais recente, mesmo padrão de LATERAL join já usado pra última mensagem/contagem de não lidas) — usada no avatar do card da lista e no cabeçalho da conversa (fallback pras iniciais quando não há foto ainda). Cabeçalho ganhou um botão (clique no avatar) que abre modal com o histórico completo via nova Server Action `listarFotosPessoaAction`.
  - ✅ **Roteamento de lead novo — 3 modos (17/08/2026):** o webhook antes iniciava sempre `saudacao_inicial` no código; agora lê `configuracoes.roteamento_lead_novo_modo` (migration 032, `20260817100000_roteamento_lead_novo.sql`) e decide via `resolverEtapaInicialLeadNovo` (`roteamento-lead-novo.ts`, puro/testado — 6 testes): **"fluxo_fixo"** (padrão, preserva o comportamento anterior — sempre `roteamento_lead_novo_etapa_fixa`, editável em `/admin/configuracoes`), **"palavra_chave"** (cruza a 1ª mensagem com a nova tabela `regras_roteamento`, CRUD em `/admin/roteamento` — primeira regra ativa, em ordem, cujo termo aparecer na mensagem vence) e **"manual"** (nunca responde sozinho). Decisão registrada não coberta explicitamente pelo desenho original (seção 5-B): "palavra_chave" sem nenhuma regra batendo cai pro mesmo comportamento de "manual" — não adivinha. A mensagem do lead é sempre registrada na conversa, mesmo quando o sistema não responde (o card existe pro atendente assumir manualmente). Rollout não quebra nada — os valores padrão da migration reproduzem exatamente o comportamento fixo anterior.
  - ✅ **Selo de risco de esfriar 🔴/🟡 — 3 sinais combinados (17/08/2026):** migration 033 (`20260817120000_selo_risco_esfriar.sql`, **ainda não rodada por Luiz**) — `conversas` ganha `contador_nao_reconhecimento` e `estagnado_desde`. Lógica pura/testada em `selo-risco.ts` (15 testes) combina os 3 sinais pelo pior (qualquer "alto" já vermelho): **sinal 1** — tempo sem resposta (`aguardando_resposta_desde`) vs limiares **configuráveis** (`selo_risco_esfriar_horas_amarelo`/`_vermelho`, `/admin/configuracoes`, valores iniciais 4h/24h escolhidos por mim); **sinal 2** — `contador_nao_reconhecimento` (zera quando a Malala reconhece uma resposta de novo, `registrarTurnoMalala`), limiares fixos no código (2=médio, 3=alto — YAGNI, promove pra configurável só se virar pedido de verdade); **sinal 3** — `estagnado_desde`, aceso por dois gatilhos (decisão de Luiz sobre "identificar uma objeção ou o lead não fechar", 17/08/2026, e escolha entre 3 leituras possíveis pra "não fechar"): detector automático de objeção rodando a cada mensagem de texto do lead (`detectarEMarcarObjecaoPendente`, reaproveita `detectarObjecao` do Bloco C, antes só sob demanda) OU o fluxo automatizado termina (`encerrar_fluxo_automatizado`) sem chegar na subetapa "ganha" — fica pendente até um atendente resolver manualmente (botão "✅ Marcar negociação como retomada" no cabeçalho da conversa), nunca some sozinho. Badge aparece no avatar do card da lista e ao lado do nome no cabeçalho (só 🔴/🟡, "baixo" não mostra nada — mesmo critério do painel de status de integrações).

**Ordem de construção acordada:** Tela de Atendimento (blocos A-D) + Fase 5 → Kanban (cards se movendo sozinhos conforme a Malala avança o atendimento) → Dashboard de KPIs (recursos de terceiros + métricas de oportunidades/conversas).

### Pendências de UX registradas por Luiz (16/08/2026) — ainda não construídas
- ✅ **Menu lateral do admin — reestruturado em árvore por módulo (17/08/2026):** 4 módulos de topo (CRM/Vendas/Marketing/Configurações, `sidebar.tsx`), cada um começando por "Dashboard" (nenhum construído ainda, aparece "em breve") e depois as páginas do módulo — accordion, só um módulo aberto por vez, com auto-expand pela rota atual (F5/link direto não perde o usuário na árvore). Dentro de Configurações, dois subgrupos colapsáveis ("Geral": Preços/Atendentes/Configurações gerais; "CRM": Fluxos/FAQs/Objeções/Agendas/Respostas prontas/Roteamento) — decisão de Luiz: parametrização de sistema mora em Configurações mesmo quando usada só por um módulo específico (ex.: Preços é cadastro, não uso diário, mesmo sendo usado pelo CRM). Caixa de busca no topo filtra por qualquer item em qualquer módulo (accent/case-insensitive), com breadcrumb do caminho. **Modo contraído/expandido resolvido:** contraído mostra só ícones (rail estreito) e expande em flyout por cima do conteúdo ao passar o mouse sobre um módulo; expandido ocupa espaço fixo, igual antes. Preferência é por navegador (localStorage), não por usuário/sistema — resolve a dúvida em aberto registrada abaixo (é conforto de tela, não dado de negócio). Mobile (sem hover) ainda não tratado — dúvida que segue em aberto pra quando a tela mobile entrar em pauta.
- **Layout de 3 colunas da Tela de Atendimento (desktop):** contatos 25% (redimensionável arrastando) / conversa 50% / painel CRM à direita 25% (o "👤 dados do contato/oportunidade" já previsto na Fase 4 do Bloco B) — o painel direito é retrátil, reaberto pelo mesmo botão. Mídia (foto/vídeo) na timeline nunca ocupa 100% da largura disponível — 40% por padrão. **Isso muda o desenho da Fase 4** (painel de verdade sempre presente, não um popup) — ajustar quando chegar nela.

### Pendências de UX — composer estilo WhatsApp Web + card de contato (17/08/2026)
Luiz mandou prints do composer real do WhatsApp Web + rodadas de iteração visual em cima do card de contato. Design fechado e validado por ele ("ficou perfeito") — ver **Bloco B2** acima e o spec completo em `docs/superpowers/specs/2026-08-17-bloco-b2-composer-card-contato-design.md`. Confirmação de leitura e foto do contato já estavam no Bloco D; os demais itens (composer estilo WhatsApp, card redesenhado, favoritar) são o escopo novo do Bloco B2.

### Avaliação geral do projeto ✅ concluída, ganhos rápidos aplicados (16/08/2026)
A pedido de Luiz, antes de iniciar o Bloco B: revisão estruturada de tudo que já foi construído até aqui (banco/segurança, arquitetura frontend, cobertura de testes + code review, teste real das telas no navegador, conteúdo externo), usando 5 agentes em paralelo. Achados e decisões completos ficam só na conversa (não vale duplicar aqui) — resumo do que foi **corrigido nesta rodada**:

- ✅ **Bug real de fuso horário:** `saudacaoPorHorario` (`engine.ts`) lia a hora do processo (UTC na Vercel) em vez de `America/Sao_Paulo` — a saudação da Malala batia errado boa parte do dia em produção. Corrigido com o mesmo padrão já usado em `motor-followup.ts`, com teste de regressão.
- ✅ **Teste de regressão faltando:** rejeição de cumprimento ("oi"/"olá") como nome (bug já corrigido antes, mas sem trava contra regressão) — adicionado.
- ✅ **Bug real de performance:** busca no editor de fluxo recalculava o layout `dagre` inteiro a cada tecla digitada (quadrinhos "pulavam" de posição). Corrigido separando recálculo de posição (só quando as etapas mudam) da opacidade do filtro.
- ✅ **Bug real de dado:** `precos_por_faixa` estava com as 5 faixas duplicadas (10 linhas) — a migration 013 tinha sido rodada duas vezes. Migration de limpeza + índice único pra não repetir.
- ✅ **Bug/segurança real:** busca da Tela de Atendimento interpolava o texto digitado direto na sintaxe de filtro do PostgREST (`.or()`) sem escapar — corrigido.
- ✅ **Fail-open real no webhook:** se `ZAPSTER_WEBHOOK_SECRET` não estivesse configurada, a checagem de segredo era pulada (não bloqueada) — agora falha fechado em produção (mesmo padrão já usado no `CRON_SECRET` do cron), e a comparação passou a ser em tempo constante.
- ✅ **Cron de follow-up ganhou lock** (`cron_locks` + `fn_tentar_lock_cron`/`fn_liberar_lock_cron`) — evita disparo duplicado se duas execuções se sobrepuserem.
- ✅ **`ON DELETE CASCADE` formalizado** nas tabelas que `/admin/reset-conversa` já apagava manualmente (mensagens, followup_emails, conversas, oportunidades, pessoa_papeis) + 3 que ele deveria cobrir e não cobria (identidades_canal, enderecos, cliques_rastreio) — a ferramenta de teste ficou muito mais simples (um delete só na pessoa) e mais completa. `pessoa_representantes`/`usuarios_sistema.pessoa_id` continuam bloqueando de propósito.
- ✅ **Gap de auditoria fechado:** trigger em `produtos` (RLS já tinha, faltava o trigger — mesmo achado já registrado em `SEGURANCA_E_AUDITORIA_ARRUDACRED.md`).
- ✅ **Índices faltando:** `pessoas.whatsapp` (ponto de entrada de toda mensagem de WhatsApp) e um índice parcial em `conversas` cobrindo o filtro que o cron de follow-up já roda a cada execução.
- ✅ **Fonte Geist não estava sendo aplicada** (`globals.css` tinha um `font-family: Arial...` hardcoded, sobrando do template do `create-next-app`, sobrepondo a variável já carregada) — corrigido; título da aba trocado de "Create Next App" pra "Hub Arruda" de propósito, mesmo achado.
- ✅ **Higiene de git:** branch órfã `worktree-agent-*` (resquício do incidente de worktree commitado por engano, já mesclada) apagada.
- 🔶 **Pendente de ação manual de Luiz:** rodar a migration [`20260816040000_avaliacao_quick_wins.sql`](../supabase/migrations/20260816040000_avaliacao_quick_wins.sql) no SQL Editor do Supabase (junta a limpeza de preços duplicados, os dois índices, o trigger de `produtos`, o `cron_locks` e os `ON DELETE CASCADE` — tudo numa idas só).

**Registrado pra decidir depois, não bloqueia nada agora (achados da mesma rodada, não corrigidos ainda):** condição de corrida em mensagens concorrentes do mesmo lead (read-modify-write sem lock otimista em `persistencia.ts`), falha de envio parcial no webhook sem compensação, `registrarTurnoMalala` sem transação — os três pedem desenho de solução, não são "ganho rápido". Recomendação de **não migrar pra shadcn/ui agora** (custo/risco maior que o ganho no estágio atual) também ficou registrada, a reavaliar só se/quando o **Kanban** (próximo marco depois do Bloco D, que já concluiu — ver "Ordem de construção acordada" acima) virar tela nova grande.

### Painel de status de integrações externas ⬜ requisito registrado, ainda não construído (15/08/2026)
Luiz pediu (15/08/2026), ao conectar a Resend — a primeira API de terceiro que o projeto passou a usar de verdade: sempre que ele (ou outro admin do sistema) acessar o painel, precisa existir um lugar com visão clara e objetiva do estado de **todo recurso externo** de que o sistema depende pra funcionar. Ainda não desenhado em detalhe — registrado aqui pra não esquecer antes de crescer o número de integrações (Zapster/WhatsApp na Fase 7, e o que mais vier depois).

Requisitos que Luiz descreveu explicitamente:
- **Status "está de pé" de cada integração** — visual, rápido de entender (bom/ruim numa olhada, não precisa ler texto).
- **Consumo x limite**, principalmente pra APIs com plano limitado ou que dependem de saldo pré-pago — quanto já foi usado, quanto resta.
- **Alerta destacado (cor + ícone)** especificamente para as integrações em risco de parar de funcionar (perto do limite do plano, ou saldo pré-pago acabando) — não pode ser um alerta igual pra tudo, só quem está em risco de verdade precisa se destacar.
- Começa pela **Resend** (primeira conectada); pensado pra crescer — Zapster/WhatsApp (Fase 7), Supabase, Vercel, e qualquer outra API de terceiro que o sistema passar a depender.

Perguntas em aberto pra quando for desenhar de verdade: cada provedor tem API própria de uso/billing (a Resend tem endpoint de uso, por exemplo) — precisa investigar o que cada uma expõe; decidir se o painel consulta ao vivo ou guarda um snapshot periódico (cron).

**Onde mora, resposta parcial (17/08/2026):** ver requisito de Dashboards por seção logo abaixo — este painel provavelmente vive dentro do Dashboard de Configurações, não como tela solta.

### Dashboards por seção + Dashboard Geral — requisito registrado, ainda não desenhado (17/08/2026)

Luiz pediu: cada seção do sistema (**CRM, Vendas, Marketing, Configurações**) ter seu próprio Dashboard com KPIs/indicadores principais, mais um **Dashboard Geral do Sistema** que resume os dashboards de seção. Ainda não desenhado em detalhe — registrado aqui pra não esquecer, e pra dar uma casa futura ao "Painel de status de integrações externas" (acima), que naturalmente cabe dentro do Dashboard de Configurações.

Perguntas em aberto pra quando for desenhar de verdade: quais KPIs entram em cada seção (Marketing já tem um começo — "Painel de Custo" em `MODULO_MARKETING_CONTEUDO_ARRUDACRED.md` seção 7 — mas os outros três dashboards ainda não têm nada definido); o que exatamente o Dashboard Geral resume (todos os KPIs de seção, ou só os mais críticos de cada um). **Resolvido (17/08/2026):** a fronteira CRM/Vendas na navegação já existe — o menu lateral foi reestruturado em 4 módulos de topo (CRM/Vendas/Marketing/Configurações, ver Pendências de UX acima), cada um com seu próprio "Dashboard" como primeiro subitem (todos "em breve" ainda, incluindo os 4 mencionados aqui).

### Decisões/correções registradas durante a construção (14/08/2026)
- A saudação personalizada ("Oi [Nome], bom dia!") vive uma vez na abertura, não repetida por produto — corrigido no script, ver `SCRIPT_LIMPANOME_SERASA_SPC.md`
- Checkpoint de telefone é condicional por canal (só pergunta se o canal não fornece nativamente)
- Placeholders de imagem já existem no fluxo (foto da Malala, selo Reclame Aqui) — upload de verdade já dá pra fazer pelo editor (ver Fase 2 acima)
- `public/` do Next.js não é gravável em runtime no Vercel (cada deploy é um pacote imutável) — por isso mídia enviada pelo admin vai pro Supabase Storage, não pra uma pasta local
- Prática de git adotada: commitar a cada chunk validado (testes + lint + build verdes), mensagem sempre com resumo do que mudou — histórico vira ponto de restauração

### Explicitamente fora do MVP1 ainda (não esquecer)
- ~~Interpretação por IA de verdade~~ — ✅ construída e ligada (17/08/2026, Bloco C/Fase 5, ver seção 11 acima) — os 2 itens do checklist abaixo (chamada real de IA + `interpretacao_ia.habilitado` nas etapas certas, incluindo `triagem_menu`) foram feitos; mantido riscado aqui só como registro histórico do pedido original de Luiz (15/08/2026).
  - ~~**Reforço registrado por Luiz (15/08/2026), com exemplo concreto:** na etapa `triagem_menu` (menu de 8 opções numeradas), se o lead responder em texto livre em vez do número...~~ resolvido — `triagem_menu` está entre os 14 checkpoints habilitados (seção 11, Bloco C/Fase 5 acima).
- ~~Motor de disparo de follow-up~~ — construído em 15/08/2026, ver seção "Fase 6" acima.
- ~~Integração real de WhatsApp~~ — Fase 7, funcionando em produção desde 16/08/2026, ver seção acima.
- Integração real Assinafy/Asaas (Malala para antes disso no MVP1, é manual)

---

## 12. Módulo Vendas — Detalhamento (planejamento fechado da sub-frente Cadastro, construção em andamento)

> 📄 Spec completa: `superpowers/specs/2026-08-17-modulo-vendas-design.md`. Plano de implementação da sub-frente Cadastro: `superpowers/plans/2026-08-17-vendas-cadastro.md`. Status de produção: seção 11 acima.
> Esta seção é sobre **Planejamento** (ver convenção de duas dimensões, seção 0) — o que foi decidido e por quê. O que já foi de fato construído fica em seção 11.

### 12.1 Fronteiras do módulo (por que Vendas é separado de CRM/Operação)

Vendas cobre o processo comercial do **fechamento** (a partir de "Dados para Contrato" no Kanban do CRM, seção 8) até a **entrega pro módulo Operação** (execução do serviço vendido, seção 1.5 — ainda não desenhado). Não é um sistema paralelo ao CRM: reaproveita o núcleo Pessoa/Papel (`MODELAGEM_DADOS_ARRUDACRED.md`) e a entidade `oportunidades` já existentes — **sem entidade nova de "venda"**, a própria Oportunidade carrega o processo do início ao fim, virando handoff pra Operação no final.

**Duas formas de uma venda começar:**
1. Avançando pelo funil normal do CRM (lead → triagem → qualificação → negociação → fechamento).
2. Direto no fechamento, sem funil prévio (venda fechada por telefone/presencial) — cria a Oportunidade já na subetapa `dados_contrato`, pulando as etapas que não existiram.

### 12.2 Os 3 modelos de receita de um Serviço (Produto) — decidido 17/08/2026

Descoberta durante o levantamento: "produto próprio vs. terceiro" (seção 8.8) não é granular o suficiente pro módulo Vendas — existem 3 modelos de negócio reais, cada um com fluxo de dinheiro e de handoff diferente. `produtos.tipo` passou a ter 3 valores:

| Tipo | Quem fatura o cliente | Passa por Contrato/Assinatura/Pagamento? | Handoff pra Operação? | Financeiro |
|---|---|---|---|---|
| `proprio` | ArrudaCred | Sim, completo | Sim | Só receita |
| `subcontratado` | ArrudaCred | Sim, completo | Sim | Receita agora; despesa ao fornecedor só quando a OS for enviada a ele (Operação, futuro) |
| `comissionado` | Fornecedor/administradora (fora do sistema) | Não | Não | Comissão a receber do fornecedor, com agenda de vencimento configurável |

Exemplos: Limpeza de Nome/Score/Bacen = `proprio`. Consórcio, crédito/empréstimo/financiamento = `comissionado`. Um serviço vendido pela ArrudaCred mas executado por terceiro = `subcontratado`.

### 12.3 Sub-frentes planejadas (ordem de construção)

1. **Cadastro** (Cliente/Fornecedor/Serviço, endereço, upload de documento, foto, leitura por IA) — ✅ construída, ver seção 11.
2. **Contrato** (geração automática de PDF com template editável, valor por extenso, tabela de vencimentos, 2 assinantes via Assinafy) — planejada na spec, ainda não iniciada.
3. **Assinatura digital** (integração real Assinafy, webhook) — planejada, ainda não iniciada.
4. **Financeiro da venda** (cobrança real via Asaas, comissão a receber pro modelo `comissionado`, handoff pra Operação) — planejada, ainda não iniciada.

### 12.4 Convenções de cadastro de Pessoa — decidido 17/08/2026 (vale pra qualquer tela que cadastra Pessoa, não só Vendas)

- **Texto sempre em caixa alta, exceto e-mail** — nome/endereço salvos em maiúsculo; documento/whatsapp (só dígitos) e campos de `check constraint` (ex.: categoria de fornecedor) ficam de fora.
- **Máscaras de input padrão** — CPF/CNPJ, CEP, telefone formatados na tela, dado salvo sempre normalizado.
- **Endereço sempre CEP-primeiro** — autopreenche logradouro/bairro/cidade/UF via ViaCEP (API pública, sem custo); campos autopreenchidos continuam editáveis; UF é select fechado (27 estados + DF), não texto livre.
- **CPF/CNPJ sempre validados** (dígito verificador) antes de aceitar o cadastro.
- **Upload de documento com tipo identificado** — cliente/fornecedor podem anexar documentos (RG, CNH, comprovante de residência, contrato social, etc.), cada upload exige escolher o tipo. Bucket privado (`pessoa-documentos`, LGPD), URL assinada só na leitura.
- **Leitura de documento por IA, sempre opcional e nunca automática** — upload/colagem de imagem(ns) ou PDF → Claude (visão, Haiku) extrai nome/documento/endereço → só pré-preenche o formulário, nunca salva sozinho (mesmo princípio do lema do projeto, seção 0).
- **Foto da pessoa** — reaproveita `pessoa_fotos` (tabela já existente pra foto de perfil do WhatsApp na Tela de Atendimento, seção 8) — mesmo formato, bucket público (`pessoa-fotos`).

### 12.5 O que fica fora desta sub-frente (registrado pra não esquecer)

Módulo Operação inteiro (inclusive o schema de `ordens_servico`), contas a pagar a fornecedor, régua de cobrança de parcelas em atraso (`REGUA_COBRANCA_ARRUDACRED.md`, Financeiro), agenda de comunicação pós-venda (`AGENDA_POS_VENDA_ARRUDACRED.md`), portal do cliente, split payment de afiliado via Asaas — todos ficam pra frentes futuras, com o modelo de dados desta sub-frente já pensado pra não exigir redesenho quando chegar a vez (detalhe completo na spec, seção 7).

### 12.6 Achados cruzados durante a construção (fora do escopo estrito de Vendas, registrados pra decisão futura)

- **Migração de dado existente:** `produtos.tipo = 'terceiro'` foi migrado para `'comissionado'` por padrão (única correspondência conhecida até 17/08/2026 — Consórcio, Crédito). Se algum produto "terceiro" for na real `subcontratado`, precisa ser corrigido manualmente depois de rodar a migration.
- **Lacuna de segurança fechada, não específica de Vendas:** `pessoa_papeis`, `pessoa_representantes`, `enderecos`, `entidades_legais`, `identidades_canal`, `unidades_negocio` nunca tinham RLS nem trigger de auditoria (`SEGURANCA_E_AUDITORIA_ARRUDACRED.md` seção 2.6, gap conhecido) — Vendas foi a primeira frente a escrever nessas tabelas via cliente autenticado, então a migration desta sub-frente fechou a lacuna. Reforço defensivo adicional (idempotente, não é um gap confirmado) também foi aplicado a `pessoas`/`oportunidades`/`conversas`/`usuarios_sistema`/`fluxos`/`etapas_fluxo`.

---

## Próximos Passos

> ⚠️ Este checklist é o histórico das decisões iniciais do projeto (parou na Fase 2) — **para o status atual e completo, ver a seção 11 "Progresso de Produção" acima**, que é atualizada a cada avanço. Próximo passo combinado com Luiz (16/08/2026): Tela de Atendimento + Fase 5 (IA) → Kanban → Dashboard de KPIs.

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
| 4 | **Campanha "Indicação Premiada"** — script real registrado (20 contatos novos/mês via cartão de contato do WhatsApp, R$100 de desconto na fatura do mês, foto do cliente usada na abordagem aos indicados); leitura de vCard pelo Zapster já confirmada (16/08/2026), resta: automação do gatilho "Dia Zero" (adiada de propósito), quem/qual número aborda os indicados, integração com Financeiro, critério de elegibilidade | `MODULO_MARKETING_CONTEUDO_ARRUDACRED.md` seção 9 | Não bloqueia Fase 7 — atravessa Comercial/Marketing/Financeiro/integração WhatsApp |
| 5 | **Agenda de comunicação pós-venda** (cliente em dia, durante a execução do serviço) — onboarding por e-mail, dicas educativas a cada 7 dias, aviso de conclusão do processo ("Dia Êxito") pedindo avaliação no Google — registrada pela primeira vez em 15/08/2026, nada construído | `AGENDA_POS_VENDA_ARRUDACRED.md` | Depende de eventos que não existem ainda (contrato assinado, processo concluído) — Jurídico/Financeiro |
| 6 | **SPF do domínio `arrudacred.com.br` não autoriza o Resend/AWS SES** — só autoriza o Hostinger hoje; provável causa dos primeiros e-mails de teste não chegarem | DNS do domínio (fora do código) | Deliverability do e-mail de boas-vindas e da futura nutrição por e-mail — ação exclusiva de Luiz (painel de DNS do registrador/Hostinger) |
| 7 | **Rastreio de cliques (`zap.arrudacred.com.br`)** — código pronto (`hostinger-zap/index.php`, migration `20260816020000_cliques_rastreio.sql`, correlação no webhook), falta Luiz criar o subdomínio na Hostinger, subir o arquivo e rodar a migration | `RASTREIO_CLIQUES_WHATSAPP.md` | Não bloqueia nada — captação de origem do lead só começa a funcionar quando publicado |

*(Lista viva — atualizar conforme pendências forem fechadas ou novas surgirem. Revisão completa de toda a documentação feita em 15/08/2026, a pedido de Luiz, antes de iniciar a Fase 7 — achados: prompt da Malala estava referenciado como "não escrito" em `FAQ_LIMPANOME_SERASA_SPC.md`, corrigido; escopo do trigger de auditoria em `SEGURANCA_E_AUDITORIA_ARRUDACRED.md` estava referenciado como bloqueado por falta de tela CRUD, corrigido; campanha de indicação de clientes confirmada como ausente da documentação, agora registrada acima.)*
