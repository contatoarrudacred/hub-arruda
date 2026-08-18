# Tela de Atendimento — CRM (WhatsApp)
**Status:** Desenho fechado com Luiz em 16/08/2026, após pesquisa de mercado (Chatwoot, Umbler Talk, Digisac, Octadesk) e várias rodadas de "fala comigo". **Bloco A construído e em produção (16/08/2026)** — lista de contatos, conversa, Assumir Chat/Atribuir pra Malala e composer básico. **Bloco B construído e em produção (17/08/2026)** — colaboração entre atendentes (cores por controlador, atribuição a atendente específico, notas internas + @menção + sino, respostas prontas, atalho de script, follow-up manual, composer em 2 linhas, avatar do usuário); desenho detalhado e decisões desse bloco (inclusive itens que vieram DEPOIS desta spec original, como o sistema de cores) ficam em `docs/superpowers/specs/2026-08-16-bloco-b-tela-atendimento-design.md` — esta spec aqui é o desenho ORIGINAL (pré-Bloco B) e pode estar desatualizada em detalhes que o Bloco B mudou. **Bloco B2 + extensões construídos e em produção (17/08/2026)** — composer estilo WhatsApp Web (emoji-picker-react em pt-BR, anexo com preview+legenda antes de enviar, áudio com gravação ao vivo), card de contato redesenhado (badges numa linha só), painel de Oportunidade com "Conversa iniciada em"/etapa/serviço/documento do lead/valor, e timeline renderizando mídia por tipo (áudio/vídeo/documento/imagem, com modal de tela cheia) tanto enviada quanto recebida do lead — spec completo em `docs/superpowers/specs/2026-08-17-bloco-b2-composer-card-contato-design.md`, detalhe das extensões (não previstas na spec original) em `PLANO_MESTRE_SISTEMA_ARRUDACRED.md` seção 11. **Bloco C (Fase 5 IA) em andamento (17/08/2026)** — provedor decidido (Anthropic Claude) e o primeiro pedaço construído (interpretação de checkpoint por IA, ligada no `triagem_menu`); os demais itens (resumo de conversa, detector de objeção, composer-assist, transcrição de áudio, detecção de troca de assunto) ainda não. Bloco D (refinamentos) ainda não construído. Detalhe completo em `PLANO_MESTRE_SISTEMA_ARRUDACRED.md` seção 11.
**Objetivo:** tela onde o admin (ou qualquer atendente humano) acompanha em tempo real o que a Malala está fazendo, assume qualquer conversa quando precisar, e atende diretamente quando a conversa está com humano. É a tela mais importante do CRM na visão de Luiz.
**Referências:** `MODELAGEM_DADOS_ARRUDACRED.md` (schema de pessoas/conversas/oportunidades), `PLANO_MESTRE_SISTEMA_ARRUDACRED.md` seção 8.4 (escalonamento pra supervisor, já parcialmente implementado — `conversas.sob_supervisor`), `SEGURANCA_E_AUDITORIA_ARRUDACRED.md` (trilha de auditoria que alimenta a trilha de atividade da seção 3), Fase 7 (WhatsApp real, Zapster) já em produção.

---

## 1. Contexto e paridade

- **Desktop e mobile com paridade total de funcionalidades** — não é uma versão "desktop primeiro, mobile depois" nem uma versão mobile reduzida. Decisão de Luiz (16/08/2026): os dois atendentes humanos precisam conseguir atender de qualquer lugar.
- **Já existem 2 atendentes humanos** (não é mais "só Luiz") — isso muda o desenho em vários pontos: fila de atribuição, colisão de dois atendentes na mesma conversa, menção entre pessoas, etc. (ver seção 5).
- Reaproveita a mesma persistência real já construída na Fase 7 (`conversas`, `mensagens`, `pessoas`, `oportunidades`) — esta tela é a primeira a **ler e escrever de verdade** nesses dados fora do fluxo automatizado; hoje só existe o simulador (`/simulador`) e o motor de disparo.

---

## 2. Lista de contatos (painel esquerdo)

**Escopo padrão:** só leads ativos no Kanban, ainda não perdidos. Quando uma oportunidade "Perdida" recebe resposta do lead de novo, ela **reabre automaticamente na última etapa do Kanban em que estava** (não volta pro início) — o lead reaparece na lista padrão sozinho, sem precisar ir a um filtro escondido pra achá-lo.

**Busca** (topo da lista): nome, telefone e conteúdo das mensagens trocadas — busca em tudo, um campo só.

**Filtros rápidos em botão** — desenho revisado com Luiz em 16/08/2026, já construído no Bloco A:
- Tudo
- Malala (bot no controle)
- **Humano** — abre um submenu com Minhas / Não atribuídas / Todas (substitui o desenho anterior de um botão por atendente nomeado; atribuição a um atendente específico por nome volta no Bloco B — seção 6)
- Não lidas
- **+Filtros** — reservado o espaço (botão desabilitado, "em breve"); o painel avançado ainda não foi desenhado

Cada botão (e cada item do submenu Humano) mostra um **badge vermelho com a contagem de conversas não lidas** naquele escopo.

**Cada card da lista mostra:**
- Foto do contato (a mais recente — ver seção 4 sobre histórico de fotos)
- Nome (se já capturado) — antes disso, mostra como "Novo Lead"
- Número de telefone
- Prévia do início da última mensagem trocada (enviada ou recebida)
- Sinalização de lida/não lida
- Badge(s) de etapa do Kanban
- Badge(s) de produto de interesse — **uma linha por pessoa**; se o lead tem interesse em mais de um produto ao mesmo tempo (ex.: Limpa Nome + Bacen), aparecem múltiplos badges de produto no mesmo card, não uma linha por produto
- **Selo de risco de esfriar** (🔴🟡🟢, sugestão original incorporada) — calculado a partir de sinais que o sistema já registra: tempo sem resposta comparado à média histórica daquele produto/faixa, quantidade de vezes que a Malala não reconheceu a resposta do lead nesse atendimento, e se existe objeção detectada sem resposta

---

## 3. Conversa (painel direito)

**Cabeçalho:**
- Foto, nome, telefone do contato
- **Aviso "já é cliente"** (sugestão original incorporada) — cruza o telefone/CPF com `pessoa_papeis`; se a pessoa já fechou algum produto antes, mostra "Cliente desde [data] — [produto]" — evita tratar como lead novo quem já é cliente, e é gancho natural de cross-sell
- **Assumir Chat** — funciona tanto pra assumir de Malala quanto pra assumir de **outro atendente humano** (habilitado por padrão, mas é uma configuração de sistema que pode ser desligada — ver seção 8)
- **Atribuir pra Malala** — com opção de escolher pra qual fluxo/etapa a conversa deve retomar (não necessariamente do zero)
- Botão que abre o painel lateral com todos os dados do contato e da Oportunidade no CRM
- **Indicador de colisão** — se outro atendente também está com essa conversa aberta no momento, mostra algo como "Fulano também está vendo esta conversa agora", pra evitar os dois responderem a mesma coisa sem saber
- **Resetar conversa** (16/08/2026) — mesma função do utilitário de teste `/admin/reset-conversa`, agora também disponível direto na tela de atendimento (a página separada `/admin/reset-conversa` continua existindo também — as duas entradas convivem de propósito, a página separada é útil pra quando não há uma conversa aberta pra resetar). Clicar abre uma modal de alerta avisando que **a ação é irreversível** e vai apagar tudo daquele número de telefone (pessoa, oportunidade, conversa, mensagens) — precisa confirmar antes de executar. Pensado pra continuar sendo uso de teste/exceção, não parte do fluxo normal de atendimento — por isso o alerta forte.

**Timeline da conversa — unificada, tudo intercalado por horário:**
- Mensagens de WhatsApp normais (lead ↔ Malala/humano)
- Fundo muda de cor conforme quem está no controle no momento daquele trecho: automático (Malala) vs. humano
- **E-mails enviados aparecem como anotação interna na timeline** (ex.: "📧 E-mail de boas-vindas enviado às 14:32") — nunca é mensagem de WhatsApp de verdade, visível só pra equipe
- **Trilha de atividade do sistema** aparece como mensagem de sistema na própria timeline (ex.: "Fulano assumiu o chat às 14:32", "Devolvido pra Malala às 15:10") — reaproveita o que a auditoria (`auditoria_log`) já registra, só precisa ser exibido aqui
- **Áudio recebido do lead é transcrito automaticamente** e mostrado como "Áudio Transcrito" (mais o áudio original, pra ouvir se quiser) — liga/desliga é configuração de sistema (seção 8). **Nota (17/08/2026):** a transcrição em si continua pendente (depende da Fase 5/IA) — mas o "mais o áudio original, pra ouvir se quiser" já está construído: qualquer mídia (imagem/áudio/vídeo/documento), enviada ou recebida, já renderiza corretamente na timeline (player de áudio, thumbnail de vídeo com modal, link de documento, imagem com modal) — ver Bloco B2 + extensões no cabeçalho desta spec.
- **Áudio enviado (pela Malala ou por humano) também é transcrito e salvo** — mas só como registro interno na conversa; o lead nunca recebe o texto, só o áudio normal
- **Resumo automático por IA** ao assumir uma conversa em andamento (sugestão original incorporada, depende da Fase 5) — 3-4 linhas fixas no topo: o que o lead já disse, em que etapa está, se já levantou objeção
- **Badge de objeção detectada + resposta sugerida** (sugestão original incorporada, depende da Fase 5) — cruza com o banco de objeções (`banco_objecoes`) já existente; um clique usa a resposta cadastrada
- **Destaque do que a Malala não entendeu** (sugestão original incorporada) — quando a escalada pro humano foi por resposta não reconhecida repetidas vezes, mostra especificamente quais respostas do lead o parser não conseguiu interpretar

---

## 4. Foto do contato — captura e histórico

- Assim que um número novo manda a primeira mensagem, o sistema já cria o card ("Novo Lead"), salva o telefone e a foto de perfil do WhatsApp daquele contato.
- Toda vez que a conversa é aberta, o sistema confere se a foto do contato mudou em relação à que está salva. Se mudou: **não apaga a anterior** — salva a nova como principal e mantém a anterior no histórico.
- No card e no cabeçalho da conversa, mostra sempre a foto mais recente, com um ícone que abre uma modal com as fotos anteriores (histórico completo, não só a última).

---

## 5. Composer (rodapé) — envio de mensagem

- **Desabilitado enquanto a Malala está no controle**; habilita pra digitação assim que um humano assume.
- **Botão de assist de IA** ("Malala-assist") — aciona a IA pra gerar uma resposta no mesmo tom/voz da Malala e **preenche o campo**, mas **nunca envia sozinha** — o humano revisa/edita e manda. Depende da Fase 5.
- **Atalho "usar próxima etapa do script"** (sugestão original incorporada) — diferente do assist de IA: puxa a mensagem real da próxima etapa do fluxo (`etapas_fluxo`), não é gerada, é o script de verdade, mantendo consistência total com o que já foi validado.
- **Respostas prontas** (atalho tipo "/", encontrado em todo concorrente pesquisado — Chatwoot, Digisac, Octadesk) — templates salvos, buscáveis, pra perguntas repetidas.
- Botão de anexo, botão de gravar áudio, botão de agendamento (mensagem, lembrete, ou acionar um fluxo — mesma ação de "Atribuir pra Malala com escolha de fluxo/etapa" do cabeçalho, só que reaproveitada aqui embaixo por conveniência). **Posição visual final fechada no Bloco B2 (17/08/2026):** "📎 Anexo" (Documento/Fotos e vídeos/Câmera) e "🎤 Áudio" (Gravar agora/Enviar arquivo) — qualquer arquivo escolhido (ou áudio gravado) abre um modal de preview + campo de legenda antes de enviar de fato (estilo WhatsApp), em vez de subir na hora. Botão de agendamento continua "em breve".

**Modal ao tentar sair de uma conversa com mensagem enviada sem resposta:**
"Deseja ativar follow-up automático nesta mensagem?" com:
- Checkbox pra deixar a Malala continuar o atendimento automaticamente, ou manter com humano
- **Escolha de qual régua de follow-up usar**, entre as réguas já cadastradas (`agendas_followup`) — pré-selecionada por padrão a régua "Padrão", a mesma que a maioria das mensagens da Malala já usa

---

## 5-B. Roteamento automático — qual fluxo atende cada mensagem (registrado 16/08/2026)

Hoje o comportamento é fixo no código: toda mensagem nova aciona o mesmo fluxo (`saudacao_inicial`). Passa a ser configurável, com **3 modos, mutuamente exclusivos** — só um deles é o padrão do sistema por vez (decisão de Luiz: não são camadas combináveis, é sempre um dos três):

1. **Sempre acionar um fluxo fixo** — toda mensagem nova de um número desconhecido aciona o mesmo fluxo escolhido (é o comportamento de hoje, só que configurável em vez de fixo no código).
2. **Regras de palavra-chave** — lista de regras cadastráveis, cada uma com um conjunto de termos (array de strings) apontando pra um fluxo. Várias regras podem existir ao mesmo tempo, cada uma disparando um fluxo diferente (N termos → 1 fluxo, por regra). Se a primeira mensagem do lead contém algum dos termos de uma regra, aciona o fluxo daquela regra.
3. **Não fazer nada automaticamente** — só cria o card "Novo Lead", posiciona na subetapa de novo lead, e a conversa fica sem resposta automática até um atendente humano assumir ou acionar um fluxo manualmente.

### Troca de assunto em conversa já em andamento

Problema relacionado, mas diferente: uma pessoa pode ter mais de uma oportunidade ativa ao mesmo tempo (ex.: Limpa Nome já concluído + Bacen ainda em negociação), mas só existe **uma** conversa de WhatsApp com aquele número — uma conversa nunca está em mais de um fluxo ao mesmo tempo.

- **Enquanto existe uma pergunta pendente** (`aguarda_resposta: true` na etapa atual), a resposta do lead é sempre tratada como resposta a ela — mesma regra de desvio que já existe hoje (responde pergunta lateral, retoma o que estava perguntando). Sem ambiguidade nesse caso.
- **Quando o lead manda uma mensagem espontânea** (sem pergunta pendente) que parece ser sobre um produto/fluxo **diferente** do que está ativo na conversa no momento, a Malala não troca de assunto sozinha nem ignora — ela **pergunta**, de forma sutil e educada: algo como *"Consigo te ajudar com uma coisa de cada vez — quer finalizar o assunto de [produto atual] antes, ou prefere que eu já mude pra [novo assunto]?"*
  - Se o lead escolhe mudar: a conversa passa a ser guiada pela outra oportunidade, retomando no ponto exato em que aquele fluxo tinha parado (mesma regra que já vale pra oportunidade Perdida que volta a responder).
  - Se escolhe continuar no assunto atual (ou simplesmente responde algo relacionado): nada muda.
- **Detecção de troca de assunto:** sem IA real ainda, usa o **mesmo mecanismo de palavras-chave** das regras de roteamento acima — se a mensagem espontânea bate com os termos de um produto diferente do fluxo ativo, dispara a pergunta de troca. Quando a Fase 5 existir, essa detecção evolui pra algo mais inteligente sem mudar o resto do desenho (mesmo padrão dos outros recursos que dependem de IA, seção 10).

---

## 6. Colaboração entre atendentes (2 humanos hoje, desenho já pensado pra crescer)

- **Nota interna** — mensagem visível só pra equipe, nunca pro lead, nunca notifica o lead, nunca sai do sistema. Recurso universal em todo concorrente pesquisado (Chatwoot, Digisac, Octadesk) — faltava no desenho original, incorporado.
- **@Menção** — digitar @ e o nome de um colega numa nota interna notifica ele.
- **Notificação in-app** quando uma conversa é atribuída a você (pela Malala ao escalar, ou por outro atendente).
- **Atribuição a atendente específico** — além de "Assumir" (pra mim) e "Atribuir pra Malala", agora também dá pra atribuir explicitamente pro outro atendente humano.
- **Sem regra automática de roteamento/fila** — decisão de Luiz (16/08/2026): fica simples, quem estiver livre assume, sem round-robin nem regra fixa de distribuição.

---

## 7. Confirmação de leitura

Vamos ligar a confirmação de leitura da Zapster (`read_confirmation`, hoje desligada na configuração da instância — ver `PLANO_MESTRE` seção Fase 7) e mostrar os dois check azuis na conversa. Trade-off aceito: como confirmação de leitura funciona nos dois sentidos, o lead também vai ver que a mensagem dele foi lida (tira a opção de "ler sem parecer que leu").

---

## 8. Chamada de voz/vídeo — limitação técnica confirmada (16/08/2026)

Investigado e confirmado: **não existe suporte a chamada de voz/vídeo embutida no CRM, nem no modo atual (não oficial) nem tão cedo no oficial.**
- A API da Zapster não tem nenhum endpoint pra iniciar/atender chamada — só uma configuração pra rejeitar (`call_rejection`: todas / só áudio / só vídeo / nenhuma).
- **Não existe evento de webhook pra chamada** — a lista completa de eventos que a Zapster dispara (mensagens, grupos, enquetes, status da instância) não inclui nada de chamada. Ou seja, mesmo configurando rejeição automática, o sistema não fica sabendo que uma chamada aconteceu — não tem gancho pra reagir a isso.
- A própria Meta lançou uma "WhatsApp Business Calling API" (voz) em 2026, mas em rollout fechado, só pra empresas selecionadas via BSPs enterprise (não a Zapster) — e vídeo continua "em desenvolvimento" em toda a indústria, não existe em lugar nenhum ainda.

**Decisão de Luiz:** deixar chamadas desabilitadas (rejeitar automaticamente), com mensagem de rejeição padrão. Duas configurações de sistema, prontas pra usar quando a Zapster (ou outro BSP) liberar o evento de chamada:
- Habilitado/desabilitado (e granular: todas / só áudio / só vídeo)
- Texto da mensagem de rejeição

**O que dá pra fazer hoje:** um ícone no cabeçalho da conversa que abre uma chamada de voz/vídeo **nativa** do WhatsApp (deep link `wa.me`) — abre o WhatsApp de verdade (app/desktop), fora do nosso CRM. Simples de implementar, incluído no desenho.

---

## 9. Implicações de dados (não são decisões de schema fechadas — só o que já dá pra prever)

Levantamento do que provavelmente precisa de tabela/coluna nova quando for construir — não é a modelagem final, é registro pra não esquecer nada na hora de desenhar o schema de verdade:

- **Histórico de fotos do contato** — tabela nova (`pessoa_fotos` ou similar), não só sobrescrever `pessoas`.
- **Notas internas** — tabela nova, ligada à conversa, com quem escreveu.
- **Respostas prontas (templates)** — tabela nova, com CRUD próprio no admin (mesmo padrão de FAQs/Objeções já construído).
- **Atribuição de conversa a atendente específico** — `conversas` precisa de um campo de "atribuído a" (referência a `usuarios_sistema`), hoje só existe o boolean `sob_supervisor`.
- **Timeline unificada** (mensagens + e-mails + trilha de atividade) — `mensagens.remetente` hoje só aceita `malala`/`lead`/`supervisor`; precisa de um jeito de representar anotação de e-mail e evento de sistema na mesma timeline (novo tipo/discriminador, ou union de fontes no client — decisão de implementação, não de produto).
- **Confirmação de leitura por mensagem** — `mensagens` não tem campo de "lida"/`lido_em` hoje.
- **Configurações novas** (encaixam no padrão já existente de `configuracoes`, sem tabela nova): régua padrão de follow-up pro modal de saída, permitir/não permitir assumir de outro humano, habilitado/desabilitado de chamada (+ granularidade áudio/vídeo), texto da mensagem de rejeição de chamada, liga/desliga de transcrição automática de áudio, **modo de roteamento de lead novo** (um dos 3, seção 5-B) + suas regras de palavra-chave.
- **Regras de palavra-chave → fluxo** (roteamento de lead novo e detecção de troca de assunto, seção 5-B) — tabela nova, cada linha com um array de termos e o fluxo de destino.
- **Objeção detectada por mensagem** — depende da Fase 5 (IA real) pra existir de verdade; quando existir, precisa ligar a mensagem/turno ao registro de `objecoes` correspondente.

---

## 10. Dependências

- **Fase 5 (IA real) — decisão de Luiz (16/08/2026): construir junto com esta tela, não depois.** Metade do valor diferenciado da tela (resumo automático ao assumir, detector de objeção + sugestão, assist de IA no composer) só existe com IA de verdade — e a transcrição de áudio (seção 3) depende de IA de qualquer forma, então já é pré-requisito nessa entrada, com ou sem o nome "Fase 5". Desenho: **módulo de IA único e compartilhado**, chamado por qualquer parte do sistema que precisar (interpretação de checkpoint no fluxo automatizado — encaixe `InterpretadorIA` já existe em `engine.ts` — resumo de conversa, detector de objeção, assist do composer, transcrição de áudio, detecção de troca de assunto). Não é preciso todo recurso de IA estar pronto/polido antes da tela ir pro ar — alguns (transcrição) são diretos e podem sair já funcionando; outros (resumo, detector de objeção) podem entrar como "ligados depois", uma vez o resto da tela estável. **Provedor de IA ainda não decidido** — Claude direto (Anthropic API) ou via um gateway unificado (ex.: Vercel AI Gateway, que dá fallback entre modelos e observabilidade de custo) — decisão a fechar no início da construção.
- **Fase 7 (WhatsApp real, já em produção):** toda a base de mensagens/conversas reais que essa tela vai ler e escrever.
- **Painel de status de integrações externas** (registrado, ainda não construído): não é dependência bloqueante, mas reforça a necessidade — essa tela também vai depender de a Zapster estar de pé.

### Ordem de construção acordada com Luiz (16/08/2026)
1. **Esta tela + Fase 5 (IA), juntas** — próximo passo.
2. **Kanban** com movimentação automática dos cards conforme a Malala avança o atendimento.
3. **Dashboard de KPIs** — dois blocos: status/uso dos recursos de terceiros (o "Painel de status de integrações externas" já registrado) e KPIs de oportunidades/conversas (métricas de negócio: quantas abertas, taxa de conversão por etapa, tempo médio de resposta, etc. — a detalhar quando chegar a vez).

---

## Pendências deste documento
- Modelagem de dados final (seção 9 é levantamento, não schema fechado) — fazer na hora de construir.
- Onde exatamente o botão de agendamento (rodapé) fica posicionado visualmente — a definir no design.
- Layout mobile detalhado (paridade de funcionalidade confirmada, mas o arranjo visual pra tela pequena ainda não foi desenhado).
