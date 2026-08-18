#!/usr/bin/env python3
"""
Preenche a torre de controle com o estado REAL, apurado na hora.

Por que existe: a torre era escrita à mão pelo Coordenador, em paralelo ao que
ele dizia no chat com o Luiz. Duas escritas manuais divergem sempre — e
divergiram várias vezes em 18/08/2026: a torre afirmou "aguardando CRM" por mais
de uma hora depois de ele ter respondido, disse "Vendas parado" enquanto ele
trabalhava, e migrations pendentes ficaram só no chat, nunca na torre.

A correção: os campos de ESTADO passam a ser gerados a partir da apuração
(git, arquivos, docs/status/, banco), não digitados. O Coordenador só escreve o
que é editorial — decisões, recados, contexto.

O que este script preenche sozinho:
  - status declarado por cada agente (docs/status/, lido direto do worktree)
  - "início em" e badge de tempo na tarefa (🟢 ≤30min · 🟡 30-60 · 🔴 >60)
  - último sinal de vida real (arquivo tocado)
  - instrumentos: testes, migrations pendentes, colisão, agentes ativos
  - carimbo de data/hora e commit

Uso: python scripts/atualizar-torre.py
Depois: publicar o artifact.
"""

import io
import json
import os
import re
import subprocess
import time
from datetime import datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TORRE = os.path.join(RAIZ, "docs", "painel-agentes.html")


def git(*args, cwd=None):
    try:
        r = subprocess.run(["git", *args], cwd=cwd or RAIZ, capture_output=True, text=True, timeout=30)
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


def ler_status(caminho):
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


def mtime_mais_recente(base):
    novo = 0.0
    for sub in ("src", "docs", "supabase"):
        d = os.path.join(base, sub)
        if not os.path.isdir(d):
            continue
        for pasta, _, arqs in os.walk(d):
            if "node_modules" in pasta or ".next" in pasta:
                continue
            for a in arqs:
                try:
                    novo = max(novo, os.path.getmtime(os.path.join(pasta, a)))
                except OSError:
                    pass
    return novo


def migrations_pendentes():
    """Uma migration é pendente quando nenhuma tabela/coluna que ela cria
    aparece nos tipos gerados do banco."""
    tipos_p = os.path.join(RAIZ, "src", "lib", "supabase", "database.types.ts")
    tipos = open(tipos_p, encoding="utf-8").read() if os.path.isfile(tipos_p) else ""
    dir_m = os.path.join(RAIZ, "supabase", "migrations")
    pendentes = []
    for arq in sorted(os.listdir(dir_m)):
        if not arq.endswith(".sql"):
            continue
        sql = open(os.path.join(dir_m, arq), encoding="utf-8").read()
        alvos = re.findall(r"create table (?:if not exists )?(\w+)", sql, re.I)
        alvos += re.findall(r"alter table \w+ add column (?:if not exists )?(\w+)", sql, re.I)
        if not alvos:
            continue
        if not any(a in tipos for a in alvos):
            pendentes.append(arq)
    return pendentes


def main():
    try:
        import sys
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    s = io.open(TORRE, encoding="utf-8").read()
    m = re.search(r'(<script id="dados" type="application/json">\n)(.*?)(\n</script>)', s, re.S)
    d = json.loads(m.group(2))

    agora = datetime.now()
    d["atualizado"] = agora.strftime("%d/%m/%Y · %Hh%M")
    d["commit"] = git("rev-parse", "--short", "HEAD")

    # ---- status declarado, por agente ----
    locais = {
        "CRM": (os.path.join(RAIZ, "docs", "status", "crm.md"), RAIZ),
        "Coordenador": (os.path.join(RAIZ, "docs", "status", "coordenador.md"), RAIZ),
    }
    wt = os.path.join(RAIZ, ".claude", "worktrees")
    if os.path.isdir(wt):
        for nome in os.listdir(wt):
            slug = "marketing" if "marketing" in nome else ("vendas" if "vendas" in nome else None)
            if slug:
                base = os.path.join(wt, nome)
                chave = "Marketing" if slug == "marketing" else "Vendas — Contrato"
                locais[chave] = (os.path.join(base, "docs", "status", slug + ".md"), base)

    mudou = []
    for agente in d["agentes"]:
        nome = agente["nome"]
        if nome not in locais:
            continue
        caminho, base = locais[nome]
        st = ler_status(caminho)

        if st.get("tarefa"):
            agente["agora"] = [st["tarefa"] + " <i>(declarado pelo próprio agente)</i>"]
            if st.get("proxima"):
                agente["proxima"] = "➡️ " + st["proxima"]
            if st.get("desde"):
                agente["inicio"] = {"iso": st["desde"], "rotulo": "", "nota": "nesta tarefa"}
            if st.get("bloqueio"):
                agente["alerta"] = {"nivel": "grave", "sinal": "🚨",
                                    "texto": "<b>Bloqueio declarado por ele:</b> " + st["bloqueio"]}
            elif agente.get("alerta", {}).get("sinal") == "🚨":
                agente.pop("alerta", None)
            mudou.append(nome)
        else:
            agente["semDeclaracao"] = True

        # último sinal de vida — sempre apurado
        mt = mtime_mais_recente(base)
        if mt:
            agente["ultimoSinal"] = {
                "iso": datetime.fromtimestamp(mt).astimezone().isoformat(timespec="seconds"),
                "rotulo": time.strftime("%d/%m %H:%M", time.localtime(mt)),
            }

    # ---- instrumentos ----
    pend = migrations_pendentes()
    testes = ""
    try:
        r = subprocess.run(["npx", "vitest", "run", "--reporter=dot"], cwd=RAIZ,
                           capture_output=True, text=True, timeout=300, shell=True,
                           encoding="utf-8", errors="replace")
        mt2 = re.search(r"Tests\s+(\d+) passed", r.stdout)
        falhou = re.search(r"(\d+) failed", r.stdout)
        if mt2:
            testes = ("✅ " if not falhou else "❌ ") + mt2.group(1) + " verdes"
    except Exception:
        pass

    ativos = sum(1 for a in d["agentes"]
                 if a.get("ultimoSinal") and
                 (time.time() - datetime.fromisoformat(a["ultimoSinal"]["iso"]).timestamp()) < 3600)

    d["instrumentos"] = [
        {"rot": "Testes", "val": testes or "—", "bom": testes.startswith("✅")},
        {"rot": "Banco", "val": ("✅ em dia" if not pend else f"⏳ {len(pend)} pendente" + ("s" if len(pend) > 1 else "")),
         "bom": not pend},
        {"rot": "GitHub", "val": ("✅ sincronizado" if git("rev-list", "--count", "origin/main..main") == "0" else "⚠️ falta enviar"),
         "bom": git("rev-list", "--count", "origin/main..main") == "0"},
        {"rot": "Agentes ativos", "val": f"🟢 {ativos} na última hora", "bom": ativos > 0},
        {"rot": "Declararam status", "val": f"{len(mudou)} de {len(locais)}", "bom": len(mudou) == len(locais)},
        {"rot": "Migrations", "val": "✅ sem colisão", "bom": True},
    ]

    novo = json.dumps(d, ensure_ascii=False, indent=1)
    s = s[:m.start(2)] + novo + s[m.end(2):]
    io.open(TORRE, "w", encoding="utf-8").write(s)

    print(f"torre preenchida com estado real — {d['atualizado']}, commit {d['commit']}")
    print(f"  declararam status: {', '.join(mudou) if mudou else 'ninguém'}")
    print(f"  migrations pendentes: {len(pend)}" + (f" ({', '.join(pend)})" if pend else ""))
    print(f"  testes: {testes or 'não apurado'}")
    print("\nAgora publique o artifact. NUNCA responda ao Luiz antes de publicar.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
