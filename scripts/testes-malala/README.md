# Bateria de testes da conversa da Malala

Spec: [`docs/superpowers/specs/2026-08-21-testes-conversa-malala-e-nota-handoff.md`](../../docs/superpowers/specs/2026-08-21-testes-conversa-malala-e-nota-handoff.md).

Pedido do Luiz: o fluxo de Limpeza de Nome ficou grande demais pra testar manualmente (sequenciamento,
repetição de pergunta, alucinação, humanização, e se a transferência pra humano de fato acontece e fica
registrada). Este harness roda o motor de fluxo **de verdade** (mesma IA, mesmo banco de produção) contra
um lead fictício, sem nunca passar pela Zapster real — decisão do Luiz: só existe 1 número de WhatsApp,
rodar muitos testes em sequência arriscaria banimento, e o objetivo é validar a construção do fluxo e o
comportamento da IA, não a Zapster.

## Como rodar

```bash
pnpm tsx scripts/testes-malala/runner.ts
```

Roda todos os cenários (`cenarios.ts`). Pra rodar só um subconjunto (filtro por substring do nome do
cenário):

```bash
pnpm tsx scripts/testes-malala/runner.ts divida_alta
```

**Custa dinheiro de verdade** (chamadas reais de IA — interpretação dentro do motor, o "ator" que faz o
papel do lead nos cenários adversariais, e o "juiz" que avalia cada conversa) e escreve/apaga registros
reais no Supabase de produção (o lead fictício "Testando da Silva", criado e apagado a cada cenário). Por
isso não roda em CI nem faz parte do `pnpm test` — é sempre um comando manual, disparado quando alguém
decidir que precisa rodar de novo (não é pra rodar a cada mudança no fluxo).

## O que cada cenário verifica

- **Roteirizados** (`cenarios.ts`, `CENARIOS_ROTEIRIZADOS`): mensagens fixas em português natural (não
  números de menu "crus" — quase todo checkpoint do script já tem `interpretacao_ia` habilitada, então
  testar com linguagem natural exercita exatamente essa camada). Cobrem os ramos principais do fluxo:
  dívida baixa/média/alta, pacote caro, os 4 pontos de handoff pra humano, e a recusa de agendamento nos
  dois motivos possíveis (dívida alta insiste, pacote caro cai no self-service).
- **Adversariais** (`CENARIOS_ADVERSARIAIS`): só a persona/objetivo do lead é fixo — uma 2ª IA
  (`ator-ia.ts`) decide o que escrever a cada turno, reagindo de verdade ao que a Malala responde. É o
  que pega repetição/alucinação que um roteiro fixo não provoca, porque reage à resposta anterior.

## Como funciona (sem Zapster, sem debounce)

`motor.ts` reaproveita as MESMAS funções que o webhook real usa (`engine.ts` + `persistencia.ts`) — a
única diferença é que nunca chama `enviarSequenciaWhatsapp` (o envio de verdade pelo WhatsApp) nem passa
pela verificação de assinatura HTTP do webhook. O debounce de 3.5s do webhook real (concatenar mensagens
seguidas do lead) também não é simulado aqui — cada mensagem de cenário já chega "pronta" como um turno
completo.

## Onde ficam os resultados

Cada rodada salva em `scripts/testes-malala/resultados/` (não commitado — ver `.gitignore` da pasta):

- `<timestamp>-<cenario>.json` — o "espelho" de cada conversa: toda a transcrição (o que o lead mandou, o
  que a Malala respondeu, se foi reconhecido/interpretado por IA) + o que de fato foi gravado no banco
  (sob_supervisor, notas internas, notificações, agendamento).
- `<timestamp>-veredictos.json` — o veredito do juiz (`juiz.ts`) pra cada cenário: respondeu o que foi
  perguntado, repetiu pergunta idêntica, alucinou, tom humanizado, handoff correto (quando aplicável),
  com trechos citados da conversa como evidência.

O relatório final consolidado (visão humana, priorizado) é entregue separadamente ao Luiz a partir desses
arquivos — não gerado automaticamente por este script (fica pra quem rodar decidir o formato: Artifact,
markdown, etc.).

## Adicionando um cenário novo

Edite `cenarios.ts` — um roteirizado é só um array de mensagens (traçado contra
`fluxo-limpeza-nome.ts`); um adversarial é uma persona/objetivo em texto livre. Nenhum dos dois precisa
mexer no `runner.ts`.

## Limitações conhecidas (v1)

- Cenários roteirizados foram traçados manualmente contra o código do fluxo — se um checkpoint mudar de
  comportamento, a sequência de mensagens pode ficar desalinhada (o sintoma é `naoReconhecido: true`
  repetido no espelho, ou o cenário terminar sem chegar num estado terminal). Isso não quebra o harness,
  só produz menos evidência útil pra aquele cenário específico — vale conferir o espelho quando isso
  acontecer.
- Não simula o debounce de mensagens seguidas (concatenar 2+ mensagens do lead num turno só) — se quiser
  testar isso especificamente, monte um cenário que já manda o texto pré-concatenado como uma mensagem só.
