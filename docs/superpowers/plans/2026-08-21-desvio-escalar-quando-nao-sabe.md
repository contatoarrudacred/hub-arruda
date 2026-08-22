# Desvio + escalação honesta quando a Malala não sabe responder

**Como chegou aqui:** re-testando o Achado 1b (loop na negociação de pagamento) contra produção, o
cenário `lead_pergunta_fora_do_escopo_no_meio` revelou um problema diferente e mais sério: quando o lead
pergunta algo fora do checkpoint atual (ex.: "vocês trabalham com consórcio de imóveis?"), a Malala
simplesmente ignora e repete a mesma pergunta, sem responder nem escalar. Luiz pediu uma regra dura:
nunca adivinhar/protelar — se não sabe, explicar que vai transferir pra um atendente humano. E sugeriu
formar um banco das dúvidas que ela não sabe responder.

**Causa raiz:** não é o prompt — é arquitetura. `interpretacao-ia.ts` (o classificador genérico usado em
quase todo checkpoint) foi construído de propósito **sem acesso à FAQ nem ao banco de objeções**
(comentário no próprio arquivo: "não precisa da persona da Malala nem da base de FAQ, só do contexto do
checkpoint específico") — ele só sabe dizer "bate com uma opção" ou "não bate". Quando não bate, o motor
só repete a pergunta (ver `engine.ts:449-452`). A regra de desvio (seção 5) e a regra de certeza (seção 9)
do `PERSONA_MALALA_PROMPT_SISTEMA.md` já preveem esse comportamento no papel — nunca foram implementadas
(pendência já registrada no próprio documento, item 4). Confirmado: `engine.ts` nunca importa `faqs` nem
`objecoes` hoje — isso só existe pro composer-assist de atendente humano (`composer-assist.ts`) e pro selo
de risco de esfriar (`detectarEMarcarObjecaoPendente`, que só marca a conversa como estagnada, não muda o
que a Malala responde).

## Escopo desta rodada (deliberadamente contido)

- Só o caminho do `interpretacao-ia.ts` genérico (a maioria dos checkpoints simples: `ln_passo2`,
  `triagem_menu`, etc.) — os interpretadores especializados (`faixas_documentos`,
  `negociacao_pagamento`, `lista_documentos`) já têm seu próprio tratamento de "negociando"/texto livre e
  ficam de fora por ora (o de negociação de pagamento já ganhou o ajuste de cartão nesta mesma sessão).
- Só **FAQ**, não banco de objeções — objeção precisa do playbook completo da seção 8 da persona (que
  exige geração com nuance, não classificação binária), é maior escopo. Uma pergunta que parece objeção
  cai no mesmo caminho de escalar por enquanto (um humano vendo na nota interna resolve melhor que uma
  automação malfeita).
- Resposta de FAQ é **sempre o texto literal já cadastrado** (`faqs.resposta`), nunca gerado por IA —
  zero risco de alucinação, e mantém a regra de desvio (seção 5: responde + retoma a pergunta pendente na
  mesma mensagem) sem precisar de uma 2ª chamada de IA.

## Design

### 1. Novo módulo `interpretar-desvio.ts` (+ `interpretar-desvio-validacao.ts` pra parte pura/testável)

Um único tool-call Haiku, mesmo padrão de `detector-objecao.ts` (classificação barata, "prefira escalar a
adivinhar" — mesma filosofia de falso-negativo seguro já usada em todo o motor):

```ts
type ResultadoDesvio =
  | { status: "faq"; indice: number }   // bate com uma FAQ ativa (pergunta factual, fora do checkpoint)
  | { status: "escalar" };              // não bate com nada — genuinamente não sabe responder
```

Entrada: pergunta pendente (texto do checkpoint atual), resposta do lead, lista de FAQs ativas
(`carregarFaqsAtivas`-like, já existe em `composer-assist.ts` — extrair pra `repositorio.ts` e reaproveitar
dos dois lugares).

Parte pura (`interpretar-desvio-validacao.ts`, testável sem mock do Anthropic, mesmo padrão dos outros
`-validacao.ts`):
- `validarResultadoDesvio(bruto, qtdFaqs)` — valida índice dentro do range, defensivo contra alucinação
  (mesmo padrão de `validarEscolhaFaixaMenu`).
- `montarMensagemDesvio(faq, perguntaPendente)` — monta `${faq.resposta}\n\n${perguntaPendente}` (regra de
  desvio: responde e retoma na mesma mensagem).

### 2. `engine.ts` — novo passo entre a IA genérica e o contador de tentativas

Em `avancarConversa`, logo depois do bloco `interpretarComIA` (linha ~449-452) e **antes** do bloco de
`opcional_apos_tentativas`/desiste (linha ~454) — só quando `interpretarComIA` voltou `null` (checkpoint
genérico, sem interpretador especializado rodando):

- `status: "faq"` → retorna imediatamente com a mensagem de desvio, `etapaFinal` igual (mesmo
  checkpoint), `naoReconhecido: true`, **sem incrementar o contador de tentativas** (o lead foi atendido de
  verdade, só ainda não respondeu o checkpoint — não é justo contar isso como "não entendida").
- `status: "escalar"` → retorna com `efeitos: [{ tipo: "escalar_supervisor", motivo: 'Pergunta fora do escopo/desconhecida: "${respostaLead}"' }]`, `etapaFinal: null`, `naoReconhecido: false`, mensagem de transição cordial (ex.: variação do exemplo já na seção 10 da persona: "vou te transferir pra um dos nossos consultores, que pode te atender melhor nesse ponto").

`escalar_supervisor` **já** grava a nota interna com `efeito.motivo` (`persistencia.ts:475-480`) — o "banco
de dúvidas" que o Luiz pediu sai de graça, sem tabela nova: toda pergunta escalada por este caminho vira
uma nota interna pesquisável na timeline da conversa, com o texto exato da pergunta que a Malala não soube
responder.

### 3. Contexto/wiring

- `tipos.ts`: novo campo opcional `interpretarDesvio?: InterpretadorDesvio` no contexto de
  `avancarConversa` (mesmo padrão de `interpretarFaixasDocumentos` etc.).
- `route.ts` (webhook Zapster) e `simulador/actions.ts`: injetar `interpretarDesvio` nas duas chamadas de
  `avancarConversa`, carregando FAQs ativas em `montarDependencias()`.
- `scripts/testes-malala/motor.ts` (harness): mesma injeção, pra poder re-testar contra produção.

## Testes

- `interpretar-desvio-validacao.test.ts` — TDD puro: validação de índice, montagem da mensagem de desvio.
- `engine.test.ts` — casos novos: (a) FAQ bate → mensagem de desvio + retoma, mesmo checkpoint, sem
  incrementar tentativas; (b) nada bate → escala pro supervisor com o motivo certo, encerra o
  automatizado.
- Sem mock do Anthropic (nunca teve nenhum neste projeto) — a chamada de IA em si é verificada via harness
  contra produção, mesmo padrão usado nos achados 0a/0b/3.

## Verificação

Re-rodar `lead_pergunta_fora_do_escopo_no_meio` (o cenário que achou o problema) contra produção depois
do patch de conteúdo — deve responder a pergunta de consórcio (se virar FAQ escalando) ou escalar com nota
interna, nunca mais repetir a mesma frase ignorando a pergunta.

## Pendente / fora de escopo (próxima rodada, se fizer sentido)

- Banco de objeções integrado ao mesmo mecanismo (precisa de geração com nuance, Sonnet + playbook seção
  8 — maior escopo).
- Tela de admin pra revisar as "dúvidas não respondidas" (hoje só ficam nas notas internas de cada
  conversa — funcional, mas sem visão agregada entre conversas).
- Estender o mesmo tratamento pros interpretadores especializados (`faixas_documentos`,
  `lista_documentos`) quando eles também não reconhecerem nada.
