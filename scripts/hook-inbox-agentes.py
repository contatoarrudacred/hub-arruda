#!/usr/bin/env python3
"""
Hook SessionStart — mostra a caixa de entrada dos agentes no início de cada sessão.

Por que existe: os agentes deste projeto trabalham em sessões separadas, sem canal
de mensagem entre elas. Um pedido de um agente pro outro ficava parado até alguém
lembrar de abrir o quadro-branco. Este hook faz o Claude Code injetar os pedidos
abertos direto no contexto da sessão, no primeiro segundo — sem depender de
disciplina de ninguém.

Comportamento: silencioso quando não há nada aberto (não polui sessão à toa).
Nunca falha a sessão — qualquer erro sai em silêncio com código 0.

Configurado em .claude/settings.json, evento SessionStart.
"""

import json
import os
import sys


def main() -> int:
    # No Windows o stdout sai em cp1252 e qualquer acento/emoji derruba o print —
    # o que, com o except lá embaixo, viraria um hook silenciosamente morto.
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    caminho = os.path.join(raiz, "docs", "INBOX_AGENTES.md")

    if not os.path.isfile(caminho):
        return 0

    with open(caminho, encoding="utf-8") as f:
        linhas = f.read().splitlines()

    # Só a seção "## Abertos" interessa: as linhas de dados da tabela começam com "| **".
    abertos, dentro = [], False
    for linha in linhas:
        if linha.startswith("## Abertos"):
            dentro = True
            continue
        if dentro and linha.startswith("## "):
            break
        if dentro and linha.startswith("| **"):
            abertos.append(linha)

    # o hook também cobra a declaração de status: se o arquivo do agente está
    # vazio, ninguém sabe o que ele faz e a torre volta a ser adivinhação.
    lembrete = (
        "\n📋 ANTES DE COMEÇAR: declare no que você vai trabalhar em "
        "docs/status/<seu-nome>.md (tarefa, desde, proxima, bloqueio). "
        "Leva 20 segundos e é o que faz a torre de controle do Luiz refletir "
        "a realidade em vez de adivinhação. Atualize ao TROCAR de tarefa — "
        "não a cada commit. Instruções em docs/status/_COMO_USAR.md."
    )

    if not abertos:
        # sem pedido aberto, mas ainda vale lembrar do status
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "SessionStart",
                "additionalContext": lembrete.strip(),
            }
        }, ensure_ascii=False))
        return 0

    corpo = "\n".join(abertos)
    plural = "pedido aberto" if len(abertos) == 1 else "pedidos abertos"
    contexto = (
        f"📬 CAIXA DE ENTRADA DOS AGENTES — {len(abertos)} {plural} neste projeto.\n\n"
        "As colunas são: Para | De | Desde | O que precisam | Onde está o detalhe.\n\n"
        f"{corpo}\n\n"
        "Se a coluna 'Para' é você, **responda antes de começar qualquer outra coisa** — "
        "mesmo que a resposta seja só \"visto, entra na fila\". Alguém está parado esperando.\n"
        "Como responder: escreva na seção 3 do docs/COORDENACAO_AGENTES_ARRUDACRED.md e mova "
        "sua linha de 'Abertos' pra 'Fechados hoje' no docs/INBOX_AGENTES.md.\n"
        "Se você está num worktree, o recado só existe quando chega em `main` — avise o "
        "Coordenador pra ele trazer o commit.\n"
        "Se a linha não é pra você, siga seu trabalho normalmente."
        + lembrete
    )

    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": contexto,
        }
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        # Um hook nunca deve atrapalhar o início de uma sessão.
        sys.exit(0)
