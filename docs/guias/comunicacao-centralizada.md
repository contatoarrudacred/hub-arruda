# Guia prático — Comunicação Centralizada

Pra quem está em Financeiro, Marketing, Operações (ou qualquer módulo novo) e precisa mandar
WhatsApp ou e-mail pro cliente: **não chame a Zapster nem o Resend direto**. Chame
`enviarComunicacao`, em `src/lib/comunicacao/enviar.ts`. É o único ponto de entrada — ele decide
instância de WhatsApp, grava a mensagem na Tela de Atendimento, aplica idempotência, tudo isso sem
o seu módulo precisar saber como.

Design completo (se quiser entender o "porquê"): `docs/superpowers/specs/2026-08-22-comunicacao-centralizada-crm-design.md`.

## Como chamar

```ts
import { enviarComunicacao } from "@/lib/comunicacao/enviar";
```

Assinatura (`src/lib/comunicacao/tipos.ts`):

```ts
type ParametrosComunicacao = {
  pessoaId: string;
  categoriaId: string;
  chaveIdempotencia?: string;
} & (
  | { canal: "whatsapp"; conteudo: { texto: string } }
  | { canal: "email"; conteudo: { assunto: string; corpo: string } }
);

type ResultadoComunicacao =
  | { status: "enviado"; mensagemId: string; instancia?: "oficial" | "secundaria" }
  | { status: "idempotente_repetido"; mensagemId: string };
```

### Exemplo — WhatsApp

```ts
const resultado = await enviarComunicacao({
  pessoaId,
  categoriaId,
  canal: "whatsapp",
  conteudo: { texto: `Sua parcela vence amanhã. Link: ${link}` },
});
```

### Exemplo — E-mail

```ts
const resultado = await enviarComunicacao({
  pessoaId,
  categoriaId,
  canal: "email",
  conteudo: {
    assunto: "Sua parcela vence amanhã",
    corpo: `Olá! Sua parcela vence amanhã. Acesse o link para pagar: ${link}`,
  },
});
```

`conteudo.corpo` do e-mail é texto/parágrafo simples — o layout padrão (`EmailLayout`/
`EmailComunicacaoGenerica`) cuida sozinho de cabeçalho, rodapé e identidade visual. Nunca passe
HTML cru aqui.

Os dois casos retornam `{ status: "enviado", mensagemId }` (ou `"idempotente_repetido"` — ver
seção de idempotência). `enviarComunicacao` lança erro em caso de falha real (categoria inválida,
pessoa sem e-mail cadastrado ao mandar por e-mail, falha da Zapster/Resend) — trate com
try/catch se o seu fluxo não pode travar por causa disso (padrão usado em
`enviarLinkPagamentoWhatsapp`, ver abaixo).

## E-mail: aviso obrigatório, não respeita opt-out de marketing

Decisão do Luiz (22/08/2026): `enviarComunicacao` **não checa** `pessoas.email_marketing_opt_out`
ao mandar e-mail. Isso é proposital, não um bug — as comunicações que passam por este mecanismo
(cobrança, institucional, lembrete, o que Vendas/Financeiro/Marketing precisar registrar como
categoria) são avisos obrigatórios sobre a conta/contrato do cliente, não propaganda. Quem optou
por não receber e-mail de marketing continua recebendo esses avisos normalmente — o template
(`EmailComunicacaoGenerica`) já inclui uma nota de rodapé deixando isso explícito pro destinatário.

**Isso só vale enquanto o mecanismo for usado só pra avisos obrigatórios.** Se algum módulo um dia
precisar mandar conteúdo genuinamente promocional (propaganda, cupom, newsletter) por aqui, ESSE
caso específico precisa respeitar o opt-out — não existe hoje uma forma de marcar uma categoria
como "isso é marketing, checar o opt-out" antes de mandar. Não force esse uso sem antes conversar
com o Luiz/CRM pra decidir como distinguir os dois casos (provavelmente um campo na categoria).

## Categoria (`categoriaId`)

Toda mensagem enviada pelo mecanismo precisa de uma categoria (ex.: "Cobrança", "Marketing",
"Suporte") — administrável em `/admin/configuracoes/categorias-comunicacao`. `enviarComunicacao`
não valida a categoria sozinho (o FK do banco já garante que o id existe); **é responsabilidade de
quem chama** buscar o id certo e decidir o que fazer se a categoria não existir mais ou tiver sido
desativada.

Padrão real já usado por Vendas (`src/lib/vendas/notificacoes.ts`):

```ts
import { listarCategoriasComunicacaoAtivas } from "@/lib/comunicacao/categorias-repositorio";

async function idCategoriaCobranca(): Promise<string> {
  const categorias = await listarCategoriasComunicacaoAtivas();
  const categoria = categorias.find((c) => c.nome === "Cobrança");
  if (!categoria) {
    throw new Error(
      'Categoria "Cobrança" não encontrada ou desativada em categorias_comunicacao — configure em /admin/configuracoes/categorias-comunicacao.',
    );
  }
  return categoria.id;
}
```

Copie esse padrão pro seu módulo: uma função pequena que resolve o nome da categoria pro id atual,
lançando um erro claro (com o caminho da tela de configuração) se ela não existir/estiver
desativada. Não hardcode o id da categoria em nenhum lugar — nomes podem ser reorganizados na tela
de configuração, ids não.

## Chave de idempotência

`chaveIdempotencia` é opcional, mas vale a pena sempre que o seu código **pode chamar
`enviarComunicacao` mais de uma vez pro mesmo evento de negócio** — o exemplo real é retry
explícito: `criarCobrancasDoContrato` (`src/lib/asaas/adapter.ts`) pode rodar de novo numa
retentativa manual depois de já ter mandado o link de pagamento com sucesso antes. Sem uma chave,
isso reenviaria o mesmo link duplicado ao cliente. A correção real:

```ts
await enviarLinkPagamentoWhatsapp(contrato.pessoaSignatarioId, link, `vendas_link_pagamento_${contratoId}`);
```

Use uma chave estável e determinística pro evento (ex.: `"<contexto>_<id-do-registro>"`), não um
UUID novo a cada chamada — senão a chave nunca repete e não protege nada. Se a mesma chave já foi
usada antes, `enviarComunicacao` devolve `{ status: "idempotente_repetido", mensagemId }` sem
mandar a mensagem de novo.

Não use chave de idempotência pra reenvios **intencionais** (ex.: um botão "Reenviar" que o usuário
clica de propósito) — ali cada clique deve mandar de verdade.

Nota honesta: a checagem de idempotência não é 100% atômica sob concorrência real (duas chamadas
simultâneas com a mesma chave podem ambas passar da checagem prévia e mandar a mensagem de verdade
duas vezes por fora) — o INSERT final na tabela `mensagens` tem uma constraint UNIQUE que evita
duplicar o registro na timeline, mas não evita o duplo envio externo numa corrida genuína. Pra
retries sequenciais (o caso comum: uma tentativa falhou, o usuário/cron tenta de novo depois) isso
não é um problema.

## Número oficial x secundário — você não precisa se preocupar com isso

A ArrudaCred tem uma regra dura: o número **oficial** de WhatsApp nunca pode iniciar uma conversa
do zero (risco de banimento em modo não oficial) — só o número **secundário** pode fazer o primeiro
contato, sempre avisando o cliente pra responder no oficial. `enviarComunicacao` decide isso
sozinho: se já existe uma conversa oficial ativa com essa pessoa, manda por ali; senão, manda pelo
secundário com um aviso automático embutido no início do texto. Quem chama não escolhe instância,
não monta o aviso, não precisa saber que isso existe — só chama `enviarComunicacao` normalmente.

O único efeito visível pra quem chama: o `ResultadoComunicacao` de um envio por WhatsApp pode trazer
`instancia: "oficial" | "secundaria"` — informativo, geralmente não precisa ser usado.

## Onde a mensagem aparece depois

Toda mensagem enviada por `enviarComunicacao` é gravada em `mensagens` com `remetente: "sistema"` e
aparece na Tela de Atendimento (`/admin/atendimento`), na timeline da conversa da pessoa, junto com
o histórico de WhatsApp normal (Malala/atendente/lead). Hoje a Tela de Atendimento só lista
conversas de canal `whatsapp` — conversas de e-mail (canal `"email"`) ficam registradas no banco mas
ainda não têm tela própria de visualização.
