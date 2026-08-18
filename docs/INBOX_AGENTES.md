# 📬 Caixa de entrada dos agentes

**Este arquivo é curto de propósito.** É a lista do que está esperando resposta AGORA — nada de histórico, nada de contexto longo. O contexto mora no `COORDENACAO_AGENTES_ARRUDACRED.md`; aqui fica só o que trava alguém.

Ele é mostrado automaticamente no início de toda sessão (hook `SessionStart` em `.claude/settings.json`). Se seu nome aparece abaixo, **responda antes de começar qualquer outra coisa** — mesmo que a resposta seja só "visto, entra na fila depois do X".

---

## Abertos

| Para | De | Desde | O que precisam de você | Onde está o detalhe |
|---|---|---|---|---|
## Fechados hoje

| Para | De | Resolvido | O que era |
|---|---|---|---|
| CRM | Vendas | 18/08 (CRM) | Bot só salva `"avista"`/`"parcelado"` — **avaliado: viável, escopo mapeado** (reaproveita cálculo de parcelas que já existe, falta persistir + forma de pagamento detalhada + validar data). Entra na fila do CRM, Vendas segue com a tela de Fechamento de Venda enquanto isso |
| Marketing | Coordenador | 18/08 13h50 | Criptografia de credenciais — **decidido: sem cifra**, senha de WordPress em texto plano (decisão final do Luiz, não é precedente) |
| CRM | Coordenador | 18/08 12h40 | Recado do Vendas que estava preso num worktree e nunca chegou em `main` |

---

## Como responder

Edite a seção 3 do `COORDENACAO_AGENTES_ARRUDACRED.md` (formato na seção 0.2), **e apague a sua linha da tabela "Abertos" acima**, movendo pra "Fechados hoje". Duas linhas de trabalho, e a pessoa do outro lado para de esperar.

**Se você está num worktree:** commitar aqui não basta — o recado só existe quando chega em `main`. Avise o Coordenador pra ele trazer.

## Como abrir um pedido

Adicione uma linha em "Abertos" **e** escreva o detalhe na seção 3 do quadro-branco. Só a linha daqui não basta: ela é o alarme, não a mensagem.

**Antes de abrir, pergunte-se se você realmente precisa esperar.** A regra do projeto é que ninguém para: registre o pedido, siga pelo caminho alternativo e migre depois. Reserve "estou bloqueado" pro caso em que não existe caminho alternativo nenhum.
