# Status dos agentes — um arquivo por agente

**Por que existe:** o Coordenador vinha *adivinhando* o que cada agente estava fazendo, a partir de commits e arquivos alterados. Nunca batia com a realidade — em 18/08/2026 a torre de controle chegou a dizer "Vendas parado" enquanto ele trabalhava a todo vapor, e um recado dele ficou 2h30 sem ser visto. A correção é inverter: **você declara, ninguém adivinha.**

## Como usar (leva 20 segundos)

Edite **só o seu arquivo** (`docs/status/<seu-nome>.md`) **quando trocar de tarefa**. Não precisa a cada commit — só quando o que você está fazendo muda de verdade.

```
tarefa: Construir a tela de Fechamento de Venda
desde: 2026-08-18T17:30:00-03:00
proxima: Contrato e assinatura digital
bloqueio:
```

- **tarefa** — uma linha, do jeito que você explicaria pro Luiz. Não "Task 7", e sim o que isso é.
- **desde** — ISO com fuso (`-03:00`). É o que faz a torre mostrar "há 40 min" corretamente.
- **proxima** — o que vem depois. Ajuda o Coordenador a antecipar colisão.
- **bloqueio** — deixe vazio se não está travado. Se preencher, aparece em vermelho na torre do Luiz.

## Por que um arquivo por agente

Para nunca dar conflito de merge. Você só toca no seu; ninguém mexe no dos outros.

## O que o Coordenador faz com isso

Lê **direto do seu worktree**, sem esperar merge — então vale no instante em que você salva, mesmo que o commit não tenha chegado em `main`. Ele compara o que você declarou com o que os arquivos mostram, e sinaliza quando os dois discordam (declarou uma coisa há 2h e não tocou em nada desde então, por exemplo).

## `turno_fim` — não é você que escreve

Um hook (`Stop`, em `.claude/settings.json`) carimba `turno_fim: <data/hora>` no seu
arquivo toda vez que você **termina de responder**. Você não precisa fazer nada, e
não apague a linha.

Ele existe porque este arquivo só é escrito enquanto você roda. Sem o carimbo, a
torre de controle do Luiz continuava mostrando o seu `tarefa:` como se você ainda
estivesse executando — por horas depois de você ter devolvido a bola. Com ele, a
torre distingue três coisas:

- 🟢 **trabalhando** — você tocou em código agora há pouco
- 🟡 **aguardando o Luiz** — você encerrou o turno; ele vê na caixa dele que
  precisa te responder, com a sua `proxima:` do lado
- ⏸ **sem sinal** — sumiu sem carimbar

Ou seja: **manter `proxima:` em dia é o que aparece pro Luiz quando ele precisa te
destravar.** É a frase que ele lê pra decidir se te retoma agora ou depois.
