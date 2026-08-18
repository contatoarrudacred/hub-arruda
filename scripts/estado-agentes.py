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
import time


def git(*args, cwd=None):
    try:
        r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, timeout=30)
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


def ler_status(caminho):
    """Lê um docs/status/<agente>.md no formato `chave: valor`."""
    d = {}
    if not os.path.isfile(caminho):
        return d
    for linha in open(caminho, encoding="utf-8").read().splitlines():
        if ":" in linha and not linha.startswith("#"):
            k, v = linha.split(":", 1)
            k = k.strip().lower()
            if k in ("tarefa", "desde", "proxima", "bloqueio"):
                d[k] = v.strip()
    return d


def idade(iso):
    """'há 40 min' a partir de um ISO. Devolve (texto, minutos) ou ('', None)."""
    if not iso:
        return "", None
    try:
        from datetime import datetime
        t = datetime.fromisoformat(iso)
        mins = int((datetime.now(t.tzinfo) - t).total_seconds() // 60)
    except Exception:
        return "", None
    if mins < -5:
        return "", None
    mins = max(mins, 0)
    if mins < 60:
        return f"há {mins} min", mins
    return f"há {mins // 60}h{mins % 60:02d}", mins


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

    # --- 1.5 COLISÃO DE MIGRATION: o incidente que criou este papel ---
    print()
    print("🗄️  MIGRATIONS — colisão de timestamp entre agentes")
    vistos = {}
    locais = [("main", os.path.join(raiz, "supabase", "migrations"))]
    wt = os.path.join(raiz, ".claude", "worktrees")
    if os.path.isdir(wt):
        for nome in os.listdir(wt):
            cam = os.path.join(wt, nome, "supabase", "migrations")
            if os.path.isdir(cam):
                locais.append((nome, cam))
    for dono, cam in locais:
        for arq in os.listdir(cam):
            if not arq.endswith(".sql"):
                continue
            ts = arq[:14]
            if not ts.isdigit():
                continue
            vistos.setdefault(ts, {})[arq] = vistos.setdefault(ts, {}).get(arq, [])
            vistos[ts][arq].append(dono)

    colidiu = False
    for ts in sorted(vistos):
        if len(vistos[ts]) > 1:   # mesmo timestamp, ARQUIVOS diferentes
            colidiu = True
            print(f"   ❌ COLISÃO em {ts}:")
            for arq, donos in vistos[ts].items():
                print(f"      {arq}  →  {', '.join(sorted(set(donos)))}")
    if not colidiu:
        print("   ✅ Nenhuma colisão. Cada timestamp tem um arquivo só.")
    else:
        print("   Quem escreveu DEPOIS renomeia (convenção do projeto). Avise os dois hoje.")

    # --- 1.7 O QUE CADA AGENTE DECLARA estar fazendo (fonte: eles, não eu) ---
    print()
    print("🗣️  O QUE CADA AGENTE DECLARA (docs/status/, lido direto do worktree)")
    locais_status = [("CRM", os.path.join(raiz, "docs", "status", "crm.md"), raiz),
                     ("Coordenador", os.path.join(raiz, "docs", "status", "coordenador.md"), raiz)]
    wt_dir = os.path.join(raiz, ".claude", "worktrees")
    if os.path.isdir(wt_dir):
        for nome in os.listdir(wt_dir):
            slug = "marketing" if "marketing" in nome else ("vendas" if "vendas" in nome else None)
            if slug:
                base = os.path.join(wt_dir, nome)
                locais_status.append((slug.capitalize(), os.path.join(base, "docs", "status", slug + ".md"), base))

    for nome, cam, base in locais_status:
        st = ler_status(cam)
        tarefa = st.get("tarefa") or ""
        if not tarefa:
            print(f"   {nome:<13} ⚪ não declarou nada — a torre vai ter que adivinhar de novo")
            continue
        txt, mins = idade(st.get("desde"))
        if mins is None:
            sinal = "⚪"
        elif mins <= 30:
            sinal = "🟢"
        elif mins <= 60:
            sinal = "🟡"
        else:
            sinal = "🔴"
        print(f"   {nome:<13} {sinal} {tarefa[:64]}")
        if txt:
            print(f"                 nesta tarefa {txt}")
        if st.get("bloqueio"):
            print(f"                 🚨 BLOQUEIO: {st['bloqueio'][:70]}")
        # cruza o que ele declara com o que os arquivos mostram
        novo_mtime = 0.0
        for sub in ("src", "docs", "supabase"):
            d2 = os.path.join(base, sub)
            if not os.path.isdir(d2):
                continue
            for pasta, _, arqs in os.walk(d2):
                if "node_modules" in pasta or ".next" in pasta:
                    continue
                for a in arqs:
                    try:
                        novo_mtime = max(novo_mtime, os.path.getmtime(os.path.join(pasta, a)))
                    except OSError:
                        pass
        if novo_mtime:
            parado = (time.time() - novo_mtime) / 60
            if parado > 45 and mins is not None:
                print(f"                 ⚠️  declarou isso, mas não toca em arquivo há {int(parado)} min")

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
            # commit é proxy ruim pra "está trabalhando": o agente pode estar
            # editando há meia hora sem commitar. mtime dos fontes vê isso.
            recentes, mais_novo = 0, 0.0
            for sub in ("src", "docs", "supabase"):
                base = os.path.join(atual, sub) if atual else None
                if not base or not os.path.isdir(base):
                    continue
                for pasta, _, arqs in os.walk(base):
                    if "node_modules" in pasta or ".next" in pasta:
                        continue
                    for a in arqs:
                        try:
                            mt = os.path.getmtime(os.path.join(pasta, a))
                        except OSError:
                            continue
                        mais_novo = max(mais_novo, mt)
                        if time.time() - mt < 30 * 60:
                            recentes += 1
            if mais_novo:
                quando = time.strftime("%d/%m %H:%M", time.localtime(mais_novo))
                viva = " 🟢 MEXENDO AGORA" if recentes else ""
                print(f"      arquivo mais recente: {quando} ({recentes} tocados nos últimos 30min){viva}")

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
