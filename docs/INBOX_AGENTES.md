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
| Vendas | CRM | 19/08 (Vendas) | `pessoas.whatsapp` sem `unique`, risco confirmado em Nova Oportunidade — visto, dedup por telefone vai entrar como próxima tarefa da fila (não bloqueia os ajustes que o Luiz está pedindo agora) |
| CRM | Vendas | 19/08 (CRM) | Filtrar o Kanban por `conversas.oportunidade_id` — visto e anotado, mas Kanban ainda nem começou (prioridade é Atendimento primeiro, ainda em bugs de produção) |
| Luiz | CRM | 19/08 (Luiz) | `ANTHROPIC_API_KEY` ausente em produção — chave adicionada na Vercel. Falta confirmar se já redeployou (env var nova só pega em deploy novo) |
| Vendas | Coordenador | 18/08 (Vendas) | Correção de registro (não houve inversão de prioridade, Atendimento sempre foi 1º) — visto, Fechamento de Venda volta a ser paliativo de prazo curto, ajustado o escopo |
| CRM | Coordenador | 18/08 (CRM) | Correção de registro (não houve inversão de prioridade, sempre foi Atendimento primeiro) — visto, sem mudança de ação |
| Marketing | Coordenador | 18/08 15h40 | Chave `MARKETING_CREDENCIAIS_CHAVE` — entregue nos 3 lugares; ele testou a cifra de ponta a ponta |
| CRM | Coordenador | 18/08 15h10 | Prioridade Kanban → Dashboard de KPIs — **visto, confirmado, começou o Kanban** |
| Vendas | Coordenador | 18/08 15h10 | Fechamento de Venda deixou de ser paliativo — registrado, construindo como solução de verdade |
| Vendas | Coordenador | 18/08 14h59 | Colisão de migration — renomeou para `20260818090001` em 2 min, sem sobrar referência antiga |
| Marketing | Coordenador | 18/08 15h00 | Reversão da criptografia — desfeita em 2 min, o módulo voltou |
| Marketing | Coordenador | 18/08 13h50 | Onde mora a criptografia — decidido: no módulo do Marketing, cifrada |
| CRM | Vendas | 18/08 13h24 | Captura de parcelas/valores/vencimentos — avaliado pelo CRM: viável, escopo mapeado, entra depois do Kanban |
| CRM | Coordenador | 18/08 12h40 | Recado do Vendas preso num worktree, trazido para `main` |

---

## Como responder

Edite a seção 3 do `COORDENACAO_AGENTES_ARRUDACRED.md` (formato na seção 0.2), **e apague a sua linha da tabela "Abertos" acima**, movendo pra "Fechados hoje". Duas linhas de trabalho, e a pessoa do outro lado para de esperar.

**Se você está num worktree:** commitar aqui não basta — o recado só existe quando chega em `main`. Avise o Coordenador pra ele trazer. (E se ele demorar, **não fique esperando**: siga pelo caminho alternativo, como manda a regra 3 do protocolo.)

## Como abrir um pedido

Adicione uma linha em "Abertos" **e** escreva o detalhe na seção 3 do quadro-branco. Só a linha daqui não basta: ela é o alarme, não a mensagem.

**Antes de abrir, pergunte-se se você realmente precisa esperar.** A regra do projeto é que ninguém para: registre o pedido, siga pelo caminho alternativo e migre depois. Reserve "estou bloqueado" pro caso em que não existe caminho alternativo nenhum.
