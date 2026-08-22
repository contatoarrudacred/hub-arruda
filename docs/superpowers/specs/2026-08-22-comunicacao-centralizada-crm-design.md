# Comunicação centralizada via CRM — design

Como chegou aqui: Luiz decidiu (21/08/2026, registrado em
`docs/COORDENACAO_AGENTES_ARRUDACRED.md` seção 4 item 7) que **só o CRM pode mandar comunicação pro
cliente daqui pra frente** — nenhum outro módulo fala direto com Zapster/Resend. Motivo: o Vendas
mandava WhatsApp/e-mail direto (`src/lib/vendas/notificacoes.ts`, links de assinatura/pagamento) sem
gravar nada na ficha da Pessoa, então essas mensagens nunca apareciam na timeline que o CRM monta
(`mensagens`/`conversas`). `enviarWhatsapp`/`enviarPorEmail` do Vendas já foram desativadas (lançam
erro) esperando este desenho. Discutido em conversa com Luiz em 22/08/2026 — cada decisão abaixo já
foi validada com ele antes de virar spec.

## Escopo

Genérico desde já — Luiz confirmou que várias áreas vão usar isto (Financeiro/cobrança, Marketing,
Vendas, Operações...), não só o caso de hoje (Vendas). O design abaixo não conhece nenhum vocabulário
específico do Vendas — "categoria" é um conceito de dados administrável, não um enum fixo no código.

## Decisão arquitetural: chamada de função direta, não API interna

Um módulo novo, `src/lib/comunicacao/`, de propriedade do CRM, expõe uma função que outros módulos
importam e chamam diretamente — mesmo processo, mesmo deploy (é um monólito Next.js só). Uma rota de
API interna (`/api/internal/...`) foi considerada e descartada: adicionaria autenticação e um hop de
rede sem nenhum benefício real, já que tudo roda no mesmo processo. Só faria sentido se um dia isso
virasse um serviço separado, o que não é o caso.

## Regra de negócio central: nunca iniciar conversa pelo número oficial

A ArrudaCred nunca inicia uma conversa pelo WhatsApp oficial (Zapster roda em modo não-oficial —
número que manda mensagem pra quem nunca conversou é o padrão clássico de banimento). E-mail não tem
esse problema (Resend é um serviço transacional, não uma automação de número pessoal).

Pra resolver isso sem travar o envio: Luiz vai configurar uma **segunda instância no Zapster** (número
secundário), de uso exclusivo pra disparar mensagens quando não existe conversa aberta no oficial. Toda
mensagem enviada pelo secundário leva, **sempre, em toda mensagem** (decisão explícita de Luiz — mesmo
sabendo que fica repetitivo), um aviso amigável + cartão de contato (`MensagemEtapa` tipo `"contato"`,
já existe no motor de fluxo) apontando pro número oficial, pedindo que o cliente responda por lá.

**"Já existe conversa"** = qualquer conversa que já existiu alguma vez com aquela pessoa no oficial,
não importa há quanto tempo (decisão de Luiz — o risco é sobre *iniciar do zero*, não sobre reengajar
um contato antigo).

**Se o lead responder pelo secundário mesmo assim**: o sistema manda uma resposta automática simples e
amigável explicando que aquele número só envia mensagens automáticas e não consegue responder,
reforçando o pedido de migrar pro oficial (decisão de Luiz — não é a Malala/motor de fluxo completo,
é uma resposta fixa/leve).

**Um atendente humano PODE responder manualmente pelo secundário** (Luiz permitiu), mas a Tela de
Atendimento mostra um lembrete visível acima do composer nessas conversas: "Este número é apenas para
envio automático" — pra não confundir com uma conversa normal do oficial.

Só 1 número secundário, compartilhado por todos os módulos, por enquanto — desenhado pra dar pra
adicionar mais instâncias depois (por área) sem quebrar nada, mas só constrói 1 agora.

## Modelo de dados

Duas colunas novas em `conversas` (migration, Luiz roda como sempre):

- `canal`: texto, `'whatsapp'` (default) | `'email'` — pensando já no pedido futuro do Luiz de abrir
  conversa em outros canais (Instagram Direct, Messenger, Telegram...), esse campo é o que distingue
  qual canal aquela conversa representa. Cada Pessoa pode ter uma conversa por canal.
- `instancia`: texto nullable, só relevante quando `canal = 'whatsapp'` — `'oficial'` | `'secundaria'`.

Uma pessoa ganha, sob demanda (nunca de antemão), uma conversa por combinação (canal, instância) que
precisar: a conversa "oficial" só existe se o lead já iniciou contato por lá de verdade (nunca é criada
pelo mecanismo); a "secundária" e a de "email" são criadas na primeira vez que o mecanismo precisar
delas pra aquela pessoa.

Em `mensagens`:

- `remetente` ganha um 4º valor válido: `'sistema'` — mensagem automática originada por um módulo via
  este mecanismo, distinta de `'supervisor'` (humano digitando na Tela de Atendimento), `'malala'`
  (motor de fluxo conversacional) e `'lead'`.
- `categoria_id`: FK nullable pra uma tabela nova `categorias_comunicacao` (ver abaixo) — nullable
  porque mensagens de lead/malala/supervisor não têm categoria, só as de `remetente = 'sistema'`.
- `chave_idempotencia`: texto nullable, **UNIQUE**. Quem chama pode passar uma chave própria (ex.:
  `"cobranca_12345_lembrete"`); se já existe uma mensagem com essa chave, o mecanismo não manda de
  novo — retorna o resultado do envio anterior. Sem chave, envia normalmente sem checagem. Como é
  UNIQUE na tabela inteira, cabe a quem chama escolher uma chave prefixada o suficiente pro seu caso
  (ex.: incluir o módulo + entidade + motivo) pra nunca colidir por acaso com a de outro módulo.
- `provedor_message_id`: texto nullable — ID genérico devolvido pelo Zapster OU pela Resend, usado
  só pelo mecanismo novo. `zapster_message_id` (coluna já existente) continua exatamente como está,
  sem migração de dados — motor de fluxo automatizado e atendente humano na Tela de Atendimento
  seguem gravando nela normalmente; é só o `enviarComunicacao` novo que usa a coluna genérica.

Tabela nova `categorias_comunicacao` (mesmo padrão de `faqs`/`objecoes`):

```
id uuid pk
nome text not null
ativo boolean not null default true
criado_em timestamptz not null default now()
```

Categoria é uma lista controlada, gerenciada numa tela nova (ver "Tela de Configurações" abaixo) — não
um `CHECK` fixo no código, porque o Luiz quer poder adicionar/desativar categorias sem depender de uma
migration a cada mudança.

## Interface do mecanismo

```ts
// src/lib/comunicacao/tipos.ts
export type ConteudoWhatsapp = { texto: string };
export type ConteudoEmail = { assunto: string; corpo: string }; // corpo = texto/parágrafos simples; o layout padrão cuida do resto

export type ParametrosComunicacao = {
  pessoaId: string;
  categoriaId: string;
  chaveIdempotencia?: string;
} & (
  | { canal: "whatsapp"; conteudo: ConteudoWhatsapp }
  | { canal: "email"; conteudo: ConteudoEmail }
);

export type ResultadoComunicacao =
  | { status: "enviado"; mensagemId: string; instancia?: "oficial" | "secundaria" }
  | { status: "idempotente_repetido"; mensagemId: string }; // já tinha sido enviado com esta chave antes

export async function enviarComunicacao(params: ParametrosComunicacao): Promise<ResultadoComunicacao>;
```

"Enviar por ambos" (WhatsApp + e-mail) não é uma ação atômica — é só o módulo chamador invocando a
função 2 vezes (uma por canal). São entregas fundamentalmente diferentes (conteúdo, formato, sucesso
independente), não faz sentido forçar como uma coisa só.

### Fluxo interno (canal=whatsapp)

1. Se `chaveIdempotencia` veio preenchida e já existe uma `mensagens` com essa chave → retorna
   `idempotente_repetido` sem mandar nada de novo.
2. Busca se já existe `conversas` (canal=whatsapp, instancia=oficial) pra essa pessoa.
   - Existe → usa o oficial, manda só o `conteudo.texto`.
   - Não existe → usa/cria `conversas` (canal=whatsapp, instancia=secundaria), e SEMPRE prepend o
     aviso + cartão de contato do oficial antes do `conteudo.texto` (2 mensagens seguidas).
3. Envia de verdade via `zapster.ts` (`enviarMensagemTexto`, na instância certa).
4. Grava em `mensagens` (`remetente: "sistema"`, `categoria_id`, `chave_idempotencia`,
   `provedor_message_id` = o `messageId` devolvido pelo Zapster).
5. Retorna `enviado`.

### Fluxo interno (canal=email)

1. Mesma checagem de idempotência do passo 1 acima.
2. Busca/cria `conversas` (canal=email) pra essa pessoa — sem decisão de instância (e-mail não tem
   esse problema).
3. Monta o e-mail com o layout padrão já existente (`EmailLayout`, `src/lib/email/templates/`) —
   quem chama só fornece `assunto` + `corpo` (texto/parágrafos), nunca HTML cru; o miolo entra dentro
   do mesmo cabeçalho/rodapé/identidade visual usados em todo e-mail da ArrudaCred.
4. Envia via `enviarEmail` (Resend).
5. Grava em `mensagens` (mesmo padrão do WhatsApp, `provedor_message_id` = id da Resend).
6. Retorna `enviado`.

### Resposta automática quando o lead responde pelo secundário

No processamento de mensagem recebida (mesmo webhook Zapster, agora também escutando a instância
secundária): se a conversa é `instancia=secundaria`, NÃO roda o motor de fluxo normal — só manda a
resposta fixa/amigável explicando que aquele número não responde, e grava a mensagem recebida
normalmente na ficha (pra um humano ver depois, se precisar).

### Tela de Atendimento — indicação visual

Conversas com `instancia=secundaria` mostram uma tag/aviso persistente (ex.: "Canal secundário — só
envio automático") acima do composer. O envio manual continua permitido (Luiz confirmou), só o aviso
muda.

## Tela de Configurações — Categorias de Comunicação

Nova tela em `/admin/configuracoes` (ou seção equivalente), seguindo o MESMO padrão de UX/layout já
usado em `/admin/faqs` e `/admin/objecoes` (lista simples, toggle `ativo`, edição inline/modal) —
nada de componente novo, reaproveita os mesmos padrões visuais já validados. CRUD: nome da categoria +
ativo/inativo. Sem exclusão física (mesmo padrão de FAQs/objeções — desativa, não apaga, preserva
histórico de mensagens antigas que referenciam a categoria).

## Erros

- Nunca falha silenciosamente: se o envio de verdade falhar (Zapster ou Resend fora do ar, etc.), a
  função lança — quem chama decide como mostrar isso (mesmo padrão de `enviarEmail`/`enviarWhatsapp`
  antes de serem desativadas).
- `pessoaId` inexistente → lança erro claro.
- Resultado idempotente NÃO é erro — é um retorno normal (`status: "idempotente_repetido"`), quem
  chama não precisa tratar como exceção.

## Testes

- Lógica pura (qual instância usar, resolução de idempotência, validação de categoria ativa) isolada
  num módulo `-validacao.ts`, testável sem tocar Zapster/Resend/Supabase — mesmo padrão já usado em
  todo `motor-fluxo/`.
- Envio de verdade (I/O) verificado manualmente: religar o botão "Reenviar" do Vendas
  (`src/app/admin/(shell)/vendas/[oportunidadeId]/actions.ts`) pra chamar o mecanismo novo é o
  primeiro caso real de ponta a ponta.

## Fora de escopo desta rodada (registrado, não esquecido)

- Múltiplos números secundários por área (Financeiro com o seu, Marketing com o seu) — só 1
  compartilhado por enquanto, mas o campo `instancia` já é texto livre, não um enum fixo de 2 valores,
  então dá pra estender sem quebrar nada.
- Outros canais (Instagram, Messenger, Telegram) — o campo `canal` já é genérico o suficiente, mas a
  implementação de fato desses canais é um projeto à parte.
- Fila/retry automático em caso de falha de envio — hoje é síncrono (lança erro, quem chama decide);
  se o volume crescer a ponto de precisar de fila com backoff, é uma extensão futura.
