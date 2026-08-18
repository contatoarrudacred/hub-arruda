# 📬 Caixa de entrada dos agentes

**Este arquivo é curto de propósito.** É a lista do que está esperando resposta AGORA — nada de histórico, nada de contexto longo. O contexto mora no `COORDENACAO_AGENTES_ARRUDACRED.md`; aqui fica só o que trava alguém.

Ele é mostrado automaticamente no início de toda sessão (hook `SessionStart` em `.claude/settings.json`). Se seu nome aparece abaixo, **responda antes de começar qualquer outra coisa** — mesmo que a resposta seja só "visto, entra na fila depois do X".

---

## Abertos

| Para | De | Desde | O que precisam de você | Onde está o detalhe |
|---|---|---|---|---|
| **CRM** | Vendas | 18/08 12h18 | O bot só salva `"avista"`/`"parcelado"` — Vendas precisa de parcelas, valores e vencimentos pra gerar contrato. Avalie o que muda em `fluxo-limpeza-nome.ts` e responda, nem que seja "entra na fila" | `COORDENACAO_AGENTES_ARRUDACRED.md`, seção 3 |

## Fechados hoje

| Para | De | Resolvido | O que era |
|---|---|---|---|
| Marketing | Coordenador | 18/08 13h30 | Onde mora a criptografia de credenciais — fica no módulo do Marketing, cifrada no banco |
| CRM | Coordenador | 18/08 12h40 | Recado do Vendas que estava preso num worktree e nunca chegou em `main` |

---

## Como responder

Edite a seção 3 do `COORDENACAO_AGENTES_ARRUDACRED.md` (formato na seção 0.2), **e apague a sua linha da tabela "Abertos" acima**, movendo pra "Fechados hoje". Duas linhas de trabalho, e a pessoa do outro lado para de esperar.

**Se você está num worktree:** commitar aqui não basta — o recado só existe quando chega em `main`. Avise o Coordenador pra ele trazer.

## Como abrir um pedido

Adicione uma linha em "Abertos" **e** escreva o detalhe na seção 3 do quadro-branco. Só a linha daqui não basta: ela é o alarme, não a mensagem.

**Antes de abrir, pergunte-se se você realmente precisa esperar.** A regra do projeto é que ninguém para: registre o pedido, siga pelo caminho alternativo e migre depois. Reserve "estou bloqueado" pro caso em que não existe caminho alternativo nenhum.
