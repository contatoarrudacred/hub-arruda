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

- Tela de admin pra revisar as "dúvidas não respondidas" (hoje só ficam nas notas internas de cada
  conversa — funcional, mas sem visão agregada entre conversas).
- Estender o mesmo tratamento pros interpretadores especializados (`faixas_documentos`,
  `lista_documentos`) quando eles também não reconhecerem nada.

## Atualização 21/08/2026 — bateria completa revelou 2 achados importantes

Depois de implementado, rodei a bateria completa (17 cenários) duas vezes: a 1ª revelou que `escalar`
estava sendo usado demais (respostas válidas mal interpretadas, objeções, hesitações — cortando o lead
do automatizado sem necessidade). Corrigido com um 3º status, `ambiguo` (mais seguro: cai no
comportamento padrão de repetir a pergunta, em vez de escalar por engano) — reduz `ResultadoDesvio` pra
`faq | escalar | ambiguo`, e reservou `escalar` só pra confiança real de outro assunto/pedido explícito
de humano. Confirmado na 2ª rodada: nenhuma escalação indevida.

### Banco de objeções — implementado (não estava no escopo original, virou pedido explícito do Luiz)

Luiz, assistindo conversas reais pela Tela de Atendimento, notou que a Malala **nunca** respondia a
objeções/hesitações — só empurrava o roteiro adiante, "indistinguível de um bot de árvore de decisão
(ManyChat)". Investigação confirmou a causa: das 3 válvulas de escape da persona (FAQ, banco de
objeções, regra de desvio), só a FAQ estava ligada — o banco de objeções (seção 8 da persona, 50 itens
cadastrados) nunca tinha sido conectado a nenhum código.

**Implementado**: `ResultadoDesvio` ganhou um 4º status, `objecao`. O classificador (Haiku) agora decide
entre `faq | objecao | escalar | ambiguo` numa chamada só (reaproveita `listarObjecoesAtivas`, já
existente pro composer-assist/detector automático). Quando `objecao`, uma 2ª chamada (Sonnet, com o
texto completo da persona como system prompt — reaproveitado de `composer-assist.ts`, agora em
`repositorio.ts::carregarPersonaTexto`) **gera** a resposta seguindo o princípio de tratamento de
objeção da seção 8.2 (ACOLHER → DIAGNOSTICAR → RESPONDER → REDUZIR BARREIRA → PEDIR AVANÇO), usando
`como_lidar` como raciocínio, nunca como script decorado — e retoma a pergunta pendente na mesma
mensagem. A resposta de FAQ também passou a usar essa mesma geração (antes era `resposta oficial +
pergunta colada crua`, mecânico demais — achado do próprio Luiz: "faq idem né?").

**Verificado**: testes de unidade (`interpretar-desvio-validacao.test.ts` cobre a resolução de
faq/objecao/escalar/ambiguo; `engine.test.ts` cobre os 4 caminhos no motor) + 647 testes totais verdes.
Ao vivo contra produção: 1 acionamento limpo confirmado funcionando bem (`lead_muda_de_ideia_varias_vezes`,
turno 12 → objeção "isso é legal?" endereçada, o lead reconhece "agora sim, obrigado por explicar" no
turno seguinte).

**Achado importante que limita o impacto prático (não é bug da feature em si)**: em 2 cenários
adversariais de objeção (`lead_muda_de_ideia_varias_vezes`, `lead_tenta_negociar_desconto_inventado`),
a objeção quase sempre vinha **embutida na mesma mensagem que uma resposta válida** (ex.: "2, entre 10 e
30 mil. Mas você ainda não me confirmou os 70% de desconto..."). Nesses casos, o classificador do
checkpoint (`interpretacao-ia.ts` ou o parser determinístico) já reconhece a parte da resposta válida e
avança o fluxo — `naoReconhecido` fica `false`, e o desvio (que só roda quando `!reconhecido`) nunca
chega a rodar. A pergunta/objeção embutida se perde silenciosamente. Isso é uma limitação estrutural
mais profunda que a feature de hoje não resolve sozinha — provavelmente exige que TODO checkpoint (não
só o fallback) também verifique "esta resposta tem algo além do que eu esperava?", mesmo quando já
reconhece uma resposta válida. Fica registrado como a extensão natural do item (b) já combinado com o
Luiz (investigar a precisão do classificador em respostas "sim, mas...") — o escopo real é maior do que
só isso: é sobre conteúdo extra embutido em qualquer resposta, não só hedges tipo "sim, mas...".

## Atualização 22/08/2026 — item (b) implementado, testado e verificado ao vivo

Luiz aprovou a Opção A (embutir a detecção na MESMA chamada de IA que já reconhece a resposta, sem
custo de uma 2ª chamada). Implementado nos 4 interpretadores (`interpretacao-ia.ts` genérico,
`interpretar-faixas-documentos.ts`, `interpretar-negociacao-pagamento.ts`,
`interpretar-lista-documentos.ts`): cada um agora também detecta, na mesma chamada, se a resposta
que reconheceu TAMBÉM carrega uma FAQ/objeção embutida (`ConteudoExtraDetectado`, resolvido contra
as listas de verdade em `resolverConteudoExtra`, mesma filosofia defensiva de
`resolverRespostaDesvio` — índice fora do range vira `null`, nunca escala). `engine.ts` carrega o
resultado até o fim do turno e, se houver, faz **prepend** da mensagem gerada (reaproveita
`gerarMensagemDesvio`) antes do avanço normal do checkpoint — nunca interrompe nem trava o turno.

**Achado sério durante a verificação ao vivo (não é bug da feature nova, é pré-existente no
`interpretar-desvio.ts` original, só nunca tinha sido exposto)**: re-testando
`lead_muda_de_ideia_varias_vezes`, a Malala chamou o lead de **"Marcelo"** quando ele tinha se
apresentado como **"Carlos"**. Causa raiz dupla, confirmada por leitura direta do banco:
1. A "pergunta pendente" enviada no prompt de geração vinha do texto ESTÁTICO de
   `conteudo.mensagens` — em checkpoints com mensagem dinâmica (`resolverMensagensDinamicas`, ex.:
   `ln_passo14`), esse texto estático é só um placeholder gravado no banco
   ("(pergunta de voucher calculada dinamicamente conforme CPF/CNPJ escolhido em ln_passo4)"), não a
   pergunta real que o lead viu.
2. A geração nunca recebia o nome real do lead (`dados.nome`) em lugar nenhum do prompt.
Sem uma pergunta real pra retomar e sem o nome certo, o modelo improvisou os dois.

**Correção**: `InterpretadorDesvio`/`GeradorConteudoExtra` (tipos.ts) passam a receber
`perguntaPendente`/`nomeLead` de quem chama (`engine.ts`), que é o único lugar com acesso a
`resolverMensagensDinamicas`/`dados`. Novo helper `textoPerguntaAtual` (engine.ts, mesma prioridade
de `mensagemRetomada`: mensagem dinâmica resolvida > texto estático) substitui o cálculo que antes
vivia dentro de `interpretar-desvio.ts`. O prompt de geração agora inclui uma instrução explícita:
usar SÓ o nome informado, ou não usar nome nenhum se ainda não for conhecido — nunca inventar.

**Verificado**: 666/667 testes (2 novos cobrindo perguntaPendente/nomeLead corretos + o caso sem
nome ainda conhecido), tsc/eslint limpos. Ao vivo: re-rodei `lead_muda_de_ideia_varias_vezes` 2x
após a correção — nome "Carlos" usado corretamente em TODOS os turnos onde a geração de
desvio/objeção disparou (antes só tinha acontecido uma vez, mas o mesmo `gerarMensagemDesvio` é
usado nos dois recursos, então o risco existia em qualquer acionamento). O turno 8 da 2ª rodada
mostra o item (b) funcionando de verdade: o lead embutiu uma pergunta sobre prazo numa resposta que
também confirmava o checkpoint, e a Malala respondeu a pergunta corretamente (endereçando o prazo)
E manteve o nome certo, tudo na mesma mensagem.

**Achado novo, registrado mas NÃO investigado ainda** (fora do escopo desta rodada): no re-teste, o
juiz apontou que a Malala ignora repetidamente a pergunta do lead sobre prazo em turnos posteriores
(depois de já ter respondido bem uma vez no turno 8), insiste de forma robótica na pergunta de faixa
de valor, e usa gatilhos de urgência/escassez ("vouchers limitados", "fechar HOJE") sem uma base
clara de que são fatos confirmados. Fica pra próxima investigação/bateria.
