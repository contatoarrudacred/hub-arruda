# Tela de Atendimento — CRM (WhatsApp)
**Status:** Desenho fechado com Luiz em 16/08/2026, após pesquisa de mercado (Chatwoot, Umbler Talk, Digisac, Octadesk) e várias rodadas de "fala comigo". **Nada construído ainda** — este documento é a especificação completa pra quando a construção começar.
**Objetivo:** tela onde o admin (ou qualquer atendente humano) acompanha em tempo real o que a Malala está fazendo, assume qualquer conversa quando precisar, e atende diretamente quando a conversa está com humano. É a tela mais importante do CRM na visão de Luiz.
**Referências:** `MODELAGEM_DADOS_ARRUDACRED.md` (schema de pessoas/conversas/oportunidades), `PLANO_MESTRE_SISTEMA_ARRUDACRED.md` seção 8.4 (escalonamento pra supervisor, já parcialmente implementado — `conversas.sob_supervisor`), Fase 7 (WhatsApp real, Zapster) já em produção.

---

## 1. Contexto e paridade

- **Desktop e mobile com paridade total de funcionalidades** — não é uma versão "desktop primeiro, mobile depois" nem uma versão mobile reduzida. Decisão de Luiz (16/08/2026): os dois atendentes humanos precisam conseguir atender de qualquer lugar.
- **Já existem 2 atendentes humanos** (não é mais "só Luiz") — isso muda o desenho em vários pontos: fila de atribuição, colisão de dois atendentes na mesma conversa, menção entre pessoas, etc. (ver seção 5).
- Reaproveita a mesma persistência real já construída na Fase 7 (`conversas`, `mensagens`, `pessoas`, `oportunidades`) — esta tela é a primeira a **ler e escrever de verdade** nesses dados fora do fluxo automatizado; hoje só existe o simulador (`/simulador`) e o motor de disparo.

---

## 2. Lista de contatos (painel esquerdo)

**Escopo padrão:** só leads ativos no Kanban, ainda não perdidos. Quando uma oportunidade "Perdida" recebe resposta do lead de novo, ela **reabre automaticamente na última etapa do Kanban em que estava** (não volta pro início) — o lead reaparece na lista padrão sozinho, sem precisar ir a um filtro escondido pra achá-lo.

**Busca** (topo da lista): nome, telefone e conteúdo das mensagens trocadas — busca em tudo, um campo só.

**Filtros rápidos em botão** (com "+Filtros" abrindo um painel flutuante para o resto):
- Tudo
- Malala (bot no controle)
- Minhas (atribuídas ao atendente logado)
- **[Nome do outro atendente]** (atribuídas a ele)
- Não atribuídas (escalada pra humano, ninguém assumiu ainda)
- Não lidas

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

**Timeline da conversa — unificada, tudo intercalado por horário:**
- Mensagens de WhatsApp normais (lead ↔ Malala/humano)
- Fundo muda de cor conforme quem está no controle no momento daquele trecho: automático (Malala) vs. humano
- **E-mails enviados aparecem como anotação interna na timeline** (ex.: "📧 E-mail de boas-vindas enviado às 14:32") — nunca é mensagem de WhatsApp de verdade, visível só pra equipe
- **Trilha de atividade do sistema** aparece como mensagem de sistema na própria timeline (ex.: "Fulano assumiu o chat às 14:32", "Devolvido pra Malala às 15:10") — reaproveita o que a auditoria (`auditoria_log`) já registra, só precisa ser exibido aqui
- **Áudio recebido do lead é transcrito automaticamente** e mostrado como "Áudio Transcrito" (mais o áudio original, pra ouvir se quiser) — liga/desliga é configuração de sistema (seção 8)
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
- Botão de anexo, botão de gravar áudio, botão de agendamento (mensagem, lembrete, ou acionar um fluxo — mesma ação de "Atribuir pra Malala com escolha de fluxo/etapa" do cabeçalho, só que reaproveitada aqui embaixo por conveniência, posição final a definir no design visual).

**Modal ao tentar sair de uma conversa com mensagem enviada sem resposta:**
"Deseja ativar follow-up automático nesta mensagem?" com:
- Checkbox pra deixar a Malala continuar o atendimento automaticamente, ou manter com humano
- **Escolha de qual régua de follow-up usar**, entre as réguas já cadastradas (`agendas_followup`) — pré-selecionada por padrão a régua "Padrão", a mesma que a maioria das mensagens da Malala já usa

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
- **Configurações novas** (encaixam no padrão já existente de `configuracoes`, sem tabela nova): régua padrão de follow-up pro modal de saída, permitir/não permitir assumir de outro humano, habilitado/desabilitado de chamada (+ granularidade áudio/vídeo), texto da mensagem de rejeição de chamada, liga/desliga de transcrição automática de áudio.
- **Objeção detectada por mensagem** — depende da Fase 5 (IA real) pra existir de verdade; quando existir, precisa ligar a mensagem/turno ao registro de `objecoes` correspondente.

---

## 10. Dependências

- **Fase 5 (IA real, ainda não implementada):** resumo automático ao assumir, badge de objeção detectada + sugestão, assist de IA no composer. O encaixe (`InterpretadorIA`) já existe no motor (`engine.ts`), só falta a chamada real.
- **Fase 7 (WhatsApp real, já em produção):** toda a base de mensagens/conversas reais que essa tela vai ler e escrever.
- **Painel de status de integrações externas** (registrado, ainda não construído): não é dependência bloqueante, mas reforça a necessidade — essa tela também vai depender de a Zapster estar de pé.

---

## Pendências deste documento
- Modelagem de dados final (seção 9 é levantamento, não schema fechado) — fazer na hora de construir.
- Onde exatamente o botão de agendamento (rodapé) fica posicionado visualmente — a definir no design.
- Layout mobile detalhado (paridade de funcionalidade confirmada, mas o arranjo visual pra tela pequena ainda não foi desenhado).
