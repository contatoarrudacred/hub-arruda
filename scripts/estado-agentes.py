#!/usr/bin/env python3
"""
Apura o estado REAL dos agentes. Rodar SEMPRE antes de atualizar a torre de
controle ou de afirmar qualquer coisa sobre quem está esperando quem.

Por que existe: em 18/08/2026 o Coordenador escreveu na torre "aguardando CRM,
há 1h32" durante mais de uma hora depois de o CRM já ter respondido. A resposta
estava commitada em `main`, o inbox já estava zerado, e mesmo assim a torre dizia
o contrário — porque o estado foi digitado de cabeça em vez de apurado. Este
script existe para tornar isso difícil de repetir.

Uso: python scripts/estado-agentes.py
"""

import json
import os
import subprocess
import sys


def git(*args, cwd=None):
    try:
        r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, timeout=30)
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(raiz)

    print("=" * 72)
    print("ESTADO REAL DOS AGENTES — apurado agora, não de memória")
    print("=" * 72)

    # --- 1. pedidos abertos no inbox (a fonte de verdade de quem espera quem) ---
    inbox = os.path.join(raiz, "docs", "INBOX_AGENTES.md")
    abertos = []
    if os.path.isfile(inbox):
        dentro = False
        for linha in open(inbox, encoding="utf-8").read().splitlines():
            if linha.startswith("## Abertos"):
                dentro = True
                continue
            if dentro and linha.startswith("## "):
                break
            if dentro and linha.startswith("| **"):
                abertos.append(linha)

    print(f"\n📬 PEDIDOS ABERTOS: {len(abertos)}")
    if abertos:
        for a in abertos:
            print("   " + a[:160])
        print("\n   ⚠️  Alguém está esperando. Confirme se ainda é verdade antes de publicar.")
    else:
        print("   ✅ Nenhum. Se a torre diz que alguém espera, a TORRE está errada.")

    # --- 2. última atividade por branch ---
    print("\n🕒 ÚLTIMO COMMIT POR BRANCH (quem tocou o quê, e quando)")
    for br in git("branch", "--format=%(refname:short)").splitlines():
        info = git("log", "-1", "--format=%h · %ad · %an · %s", "--date=format:%d/%m %H:%M", br)
        print(f"   {br:<46} {info[:110]}")

    # --- 3. worktrees e divergência ---
    print("\n🌿 WORKTREES")
    atual = None
    for linha in git("worktree", "list", "--porcelain").splitlines():
        if linha.startswith("worktree "):
            atual = linha.split(" ", 1)[1]
        elif linha.startswith("branch "):
            br = linha.split("/")[-1]
            cont = git("rev-list", "--left-right", "--count", f"main...{br}")
            só_main, só_br = (cont.split() + ["?", "?"])[:2]
            nome = os.path.basename(atual) if atual else "?"
            sujo = git("status", "--porcelain", cwd=atual)
            print(f"   {nome:<40} branch={br}")
            print(f"      atrás de main: {só_main} | commits próprios não mesclados: {só_br}"
                  f" | working tree: {'com mudanças' if sujo else 'limpo'}")

    # --- 4. main x GitHub ---
    cont = git("rev-list", "--left-right", "--count", "origin/main...main")
    if cont:
        atras, frente = (cont.split() + ["?", "?"])[:2]
        estado = "✅ sincronizada" if atras == "0" and frente == "0" else f"⚠️  {frente} commit(s) sem enviar"
        print(f"\n☁️  MAIN x GITHUB: {estado}")

    # --- 5. o que a torre está afirmando hoje ---
    torre = os.path.join(raiz, "docs", "painel-agentes.html")
    if os.path.isfile(torre):
        txt = open(torre, encoding="utf-8").read()
        ini = txt.find('<script id="dados" type="application/json">')
        if ini != -1:
            ini = txt.find("\n", ini) + 1
            fim = txt.find("</script>", ini)
            try:
                d = json.loads(txt[ini:fim].strip())
                print(f"\n📊 A TORRE HOJE DIZ: atualizada em '{d.get('atualizado')}', commit {d.get('commit')}")
                esperas = d.get("esperas") or []
                if esperas and not abertos:
                    print("   ❌ INCOERÊNCIA: a torre mostra alguém esperando, mas o inbox está zerado.")
                    print("      Corrija a torre — ela está mentindo pro Luiz.")
                elif abertos and not esperas:
                    print("   ⚠️  O inbox tem pedido aberto e a torre não mostra relógio de espera.")
                else:
                    print("   ✅ Coerente com o inbox.")
            except Exception:
                print("\n📊 A TORRE: não consegui ler o JSON de dados.")

    print("\n" + "=" * 72)
    print("Regra: não edite o JSON da torre sem ter lido esta saída primeiro.")
    print("=" * 72)
    return 0


if __name__ == "__main__":
    sys.exit(main())
