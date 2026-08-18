#!/usr/bin/env python
"""Carimba o fim de turno de cada agente no arquivo de status.

Por que existe: docs/status/<agente>.md só é escrito ENQUANTO o agente roda.
Quando ele termina de responder e devolve a bola pro Luiz, ninguem apaga o
"fazendo agora" — e a torre passa a repetir por horas uma frase que ja nao
descreve a realidade. Foi exatamente a queixa do Luiz em 18/08.

Dois modos:
  --bind  (PostToolUse em Write|Edit) — quando uma sessao escreve em
          docs/status/X.md, aprende que essa sessao E o agente X. E o unico
          jeito de distinguir o CRM do Coordenador: os dois moram na raiz.
  --fim   (Stop) — o agente acabou de responder. Carimba turno_fim.
"""
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

RAIZ = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
MAPA = os.path.join(RAIZ, ".claude", "agentes-sessao.json")
FUSO = timezone(timedelta(hours=-3))

# worktree -> agente. A raiz fica de fora de proposito: la moram dois.
POR_WORKTREE = {
    "pipeline-conteudo-marketing-nucleo": "marketing",
    "vendas-contrato": "vendas",
}


def ler_mapa():
    try:
        with open(MAPA, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def gravar_mapa(m):
    os.makedirs(os.path.dirname(MAPA), exist_ok=True)
    with open(MAPA, "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=1)


def agente_do_worktree(cwd):
    cwd = (cwd or "").replace(chr(92), "/")
    for pasta, nome in POR_WORKTREE.items():
        if "/.claude/worktrees/" + pasta in cwd:
            return nome
    return None


def main():
    modo = sys.argv[1] if len(sys.argv) > 1 else "--fim"
    try:
        ev = json.load(sys.stdin)
    except Exception:
        ev = {}
    sessao = ev.get("session_id") or ""
    cwd = ev.get("cwd") or os.getcwd()

    if modo == "--bind":
        alvo = (ev.get("tool_input") or {}).get("file_path") or ""
        m = re.search(r"docs/status/([a-z_-]+)[.]md$", alvo.replace(chr(92), "/"))
        if m and sessao and not m.group(1).startswith("_"):
            mapa = ler_mapa()
            if mapa.get(sessao) != m.group(1):
                mapa[sessao] = m.group(1)
                gravar_mapa(mapa)
        return

    # --fim
    agente = agente_do_worktree(cwd) or ler_mapa().get(sessao)
    if not agente:
        return  # sessao nao identificada; melhor calar do que carimbar errado

    caminho = os.path.join(RAIZ, "docs", "status", agente + ".md")
    if not os.path.exists(caminho):
        return
    with open(caminho, encoding="utf-8") as f:
        txt = f.read()

    agora = datetime.now(FUSO).replace(microsecond=0).isoformat()
    linha = "turno_fim: " + agora
    if re.search(r"^turno_fim:.*$", txt, re.M):
        txt = re.sub(r"^turno_fim:.*$", linha, txt, count=1, flags=re.M)
    else:
        txt = txt.rstrip("\n") + "\n" + linha + "\n"
    with open(caminho, "w", encoding="utf-8") as f:
        f.write(txt)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # hook nunca pode atrapalhar o agente
