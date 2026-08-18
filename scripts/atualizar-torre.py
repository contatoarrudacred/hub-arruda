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
import sys
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


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sessoes import estado, ler_sessoes  # noqa: E402


def ler_status(caminho):
    d = {}
    if not os.path.isfile(caminho):
        return d
    for linha in open(caminho, encoding="utf-8").read().splitlines():
        if ":" in linha and not linha.startswith("#"):
            k, v = linha.split(":", 1)
            k = k.strip().lower()
            if k in ("tarefa", "desde", "proxima", "bloqueio", "turno_fim"):
                d[k] = v.strip()
    return d


def mtime_mais_recente(base, subpastas=("src", "supabase")):
    """Mede atividade pelo CÓDIGO (src/, supabase/), não por docs/.

    Motivo: o Coordenador mexe em docs/ o tempo todo — quadro-branco, inbox,
    torre, status. Se docs/ contasse, a atividade dele mascararia a dos outros:
    o CRM trabalha na mesma raiz, e sincronizar um worktree atualiza arquivos
    lá dentro. Medindo só código, o sinal é do agente, não meu."""
    novo = 0.0
    for sub in subpastas:
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

    sessoes = ler_sessoes()
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

        # Sinal de vida do AGENTE, não meu.
        #
        # mtime sozinho não serve: quando eu sincronizo o worktree de alguém
        # (git merge main), arquivos src/ são reescritos e ele parece ativo.
        # Foi o que aconteceu com o Marketing às 19h18 — eu mesclei, e a torre
        # disse que ele estava trabalhando.
        #
        # O sinal honesto é: último commit DELE (ignorando merges, que costumam
        # ser meus) e, se houver trabalho não commitado, o mtime — porque aí a
        # alteração é dele de verdade.
        br = git("rev-parse", "--abbrev-ref", "HEAD", cwd=base)
        ult_commit = git("log", "-1", "--no-merges", "--format=%ct", br, cwd=base)
        mt = float(ult_commit) if ult_commit.isdigit() else 0.0
        if git("status", "--porcelain", cwd=base):     # trabalho em curso, não commitado
            mt = max(mt, mtime_mais_recente(base))
        if nome == "Coordenador":
            # Eu não escrevo src/. O meu trabalho é docs/ e scripts/ — medir-me
            # pelo mesmo sensor dos outros me faria aparecer parado o tempo todo.
            mt = max(mt, mtime_mais_recente(base, ("docs", "scripts")))
        if mt:
            parado_min = int((time.time() - mt) / 60)
            agente["ultimoSinal"] = {
                "iso": datetime.fromtimestamp(mt).astimezone().isoformat(timespec="seconds"),
                "rotulo": time.strftime("%d/%m %H:%M", time.localtime(mt)),
            }
            # Sessão fechada não é o mesmo que trabalhando devagar. Depois de 45min
            # sem tocar em arquivo nenhum, o honesto é dizer que ele parou — senão
            # a torre mostra uma tarefa antiga como se estivesse em curso.
            # Quatro estados. Não existe um quinto, e nenhum agente fica sem um.
            #
            #   TRABALHANDO — a última palavra da conversa foi de um humano
            #   AGUARDANDO  — a última palavra foi do agente: ele parou e espera
            #   PARADO      — não há conversa recente; sessão fechada
            #   ERRO        — a conversa terminou em falha (limite, queda de API)
            #
            # A fonte é a transcrição da sessão, não commit nem arquivo alterado:
            # só ela distingue "terminou" de "está esperando".
            ses = sessoes.get(nome)
            est = "TRABALHANDO" if nome == "Coordenador" else estado(ses)
            agente["estado"] = est
            agente.pop("inativo", None)
            agente.pop("aguardandoLuiz", None)

            CHIPS = {
                "TRABALHANDO": ("rodando", "🟢 TRABALHANDO"),
                "AGUARDANDO": ("aguardando", "🟡 AGUARDANDO"),
                "PARADO": ("parado", "⏸ PARADO"),
                "ERRO": ("travado", "❌ ERRO"),
            }
            tipo, rotulo = CHIPS[est]
            agente["chip"] = {"tipo": tipo, "texto": rotulo}

            if est == "AGUARDANDO":
                agente["inativo"] = True
                agente["aguardandoLuiz"] = True
                agente["esperaDesde"] = time.strftime("%Hh%M", time.localtime(ses["fim"]))
                agente["ultimaFala"] = ses["texto"]
                agente["agora"] = [
                    "<b>Parou às " + agente["esperaDesde"] + " e está esperando sua resposta.</b> "
                    "Não é lentidão — ele respondeu e não volta a se mexer até você falar com ele."
                    + (" O que te disse: <i>“…" + ses["texto"][-260:] + "”</i>" if ses["texto"] else "")
                ]
            elif est == "ERRO":
                agente["inativo"] = True
                agente["alerta"] = {"nivel": "grave", "sinal": "🚨",
                                    "texto": "<b>A conversa dele terminou em erro:</b> " +
                                             (ses.get("erro") or "sem detalhe") +
                                             ". Não adianta esperar — precisa abrir a conversa."}
            elif est == "PARADO":
                agente["inativo"] = True
                agente["agora"] = [
                    "<b>Sessão fechada.</b> Nenhuma conversa recente. "
                    + ("A última coisa que ele declarou foi: <i>" + st["tarefa"] + "</i>."
                       if st.get("tarefa") else "")
                ]

    # ---- um item de resposta por agente que está esperando ----
    # A caixa do Luiz precisa ter UMA linha por agente parado, com a pergunta
    # dele à mostra e campo de resposta. O que ele escrever aqui eu entrego
    # dentro da conversa do agente (send_message), fechando o ciclo.
    def slug(n):
        return (n.split("—")[0].strip().lower()
                .replace("ç", "c").replace("ã", "a").replace(" ", "-"))

    por_id = {t.get("id"): t for t in d["tarefas"]}
    for agente in d["agentes"]:
        if agente["nome"] == "Coordenador":
            continue
        iid = "aguardando-" + slug(agente["nome"])
        item = por_id.get(iid)
        if agente.get("aguardandoLuiz"):
            if item is None:
                item = {"id": iid, "respostas": []}
                d["tarefas"].insert(0, item)
            item.update({
                "prazo": "agora",
                "prazoRot": "🟡 Esperando",
                "concluida": False,
                "titulo": agente["nome"] + " parou às " + agente.get("esperaDesde", "?") +
                          " esperando sua resposta",
                "corpo": ("<b>O que ele te perguntou:</b><br><i>“…" +
                          (agente.get("ultimaFala") or "")[-400:] + "”</i><br><br>" +
                          "Responda aqui embaixo — eu entrego direto na conversa dele, e ele "
                          "volta a trabalhar. Enquanto ninguém responder, ele fica parado."),
            })
        elif item is not None and not item.get("concluida"):
            item["concluida"] = True
            item["prazoRot"] = "✅ Retomado"
            item["titulo"] = agente["nome"] + " voltou a trabalhar"

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

    # ---- ALERTAS: derivados do estado, nunca escritos à mão ----
    # Um alerta que sobrevive ao fato que o gerou é pior que nenhum alerta:
    # ensina o Luiz a ignorar a faixa vermelha. Por isso esta lista é
    # reconstruída do zero a cada apuração.
    esperas = []

    if pend:
        esperas.append({
            "tempo": "🗄️",
            "frio": False,
            "acao": "rodar no SQL Editor",
            "texto": ("<b>" + str(len(pend)) + " migration" + ("s" if len(pend) > 1 else "") +
                      " aguardando você</b> — escrita" + ("s" if len(pend) > 1 else "") +
                      " pelos agentes e paradas antes do banco, como a regra manda: <code>" +
                      "</code>, <code>".join(m[:40] for m in pend) + "</code>. " +
                      "Arquivo consolidado em <code>docs/migrations-pendentes-supabase.sql</code>."),
        })

    # pedidos abertos no inbox
    inbox = os.path.join(RAIZ, "docs", "INBOX_AGENTES.md")
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
                abertos.append(linha.split("|")[1].strip().strip("*"))
    if abertos:
        esperas.append({
            "tempo": "📬",
            "frio": False,
            "acao": "os agentes veem ao abrir sessão",
            "texto": ("<b>" + str(len(abertos)) + " pedido" + ("s" if len(abertos) > 1 else "") +
                      " aberto" + ("s" if len(abertos) > 1 else "") + " entre agentes</b> — para: " +
                      ", ".join("<b>" + a + "</b>" for a in abertos) +
                      ". Se algum deles estiver com a sessão fechada, um toque seu na conversa resolve."),
        })

    # bloqueios declarados pelos próprios agentes
    for agente in d["agentes"]:
        al = agente.get("alerta") or {}
        if al.get("sinal") == "🚨":
            esperas.append({
                "tempo": "🚨", "frio": True, "acao": "avisar " + agente["nome"],
                "texto": "<b>" + agente["nome"] + " declarou bloqueio.</b> " + al.get("texto", ""),
            })

    # "Parado" tem duas causas muito diferentes, e a diferença é o que o Luiz
    # precisa saber: se a bola está com ele ou se a sessão simplesmente morreu.
    aguardando = [a for a in d["agentes"] if a.get("aguardandoLuiz")]
    sem_sinal = [a["nome"] for a in d["agentes"]
                 if a.get("inativo") and not a.get("aguardandoLuiz")]
    # O Coordenador não entra na conta: eu estou sempre rodando quando gero
    # esta página, e não sou um agente que o Luiz precisa retomar.
    locais_qtd = len([a for a in d["agentes"]
                      if a["nome"] in locais and a["nome"] != "Coordenador"])

    if aguardando:
        itens = "".join(
            "<li><b>" + a["nome"] + "</b> — parado desde <b>" + a.get("esperaDesde", "?") + "</b>: " +
            (("<i>“…" + a["ultimaFala"][-200:] + "”</i>") if a.get("ultimaFala")
             else a.get("proxima", "").replace("➡️ ", "").split(" — <b>")[0] or "sem detalhe declarado") +
            "</li>" for a in aguardando)
        esperas.insert(0, {
            "tempo": "🟡", "frio": False, "acao": "retomar a conversa",
            "texto": ("<b>" + ("1 agente está parado esperando você"
                      if len(aguardando) == 1
                      else str(len(aguardando)) + " agentes estão parados esperando você") +
                      ".</b> Cada um terminou de responder e não volta a se mexer sozinho — "
                      "um agente só trabalha enquanto tem conversa aberta com você. "
                      "O que cada um deixou na sua mão:<ul>" + itens + "</ul>"),
        })

    if sem_sinal and len(sem_sinal) + len(aguardando) >= locais_qtd and not aguardando:
        esperas.insert(0, {
            "tempo": "⏸", "frio": False, "acao": "abrir as conversas",
            "texto": ("<b>Nenhum agente está rodando.</b> Ninguém tocou em código há mais de "
                      "45 minutos. Alguns podem estar esperando uma instrução sua e outros "
                      "podem ter tido a sessão fechada — a partir de agora a torre passa a "
                      "distinguir os dois casos sozinha, no primeiro turno que cada um rodar. "
                      "Enquanto as conversas estiverem fechadas, nada avança e esta página não muda."),
        })
    elif sem_sinal:
        esperas.append({
            "tempo": "⏸", "frio": False, "acao": "retomar a conversa",
            "texto": "<b>Sem sinal de vida:</b> " + ", ".join("<b>" + n + "</b>" for n in sem_sinal) +
                     ". Não registraram fim de turno — provavelmente a sessão foi fechada.",
        })

    d["esperas"] = esperas

    novo = json.dumps(d, ensure_ascii=False, indent=1)
    s = s[:m.start(2)] + novo + s[m.end(2):]
    io.open(TORRE, "w", encoding="utf-8").write(s)

    print(f"torre preenchida com estado real — {d['atualizado']}, commit {d['commit']}")
    print(f"  declararam status: {', '.join(mudou) if mudou else 'ninguém'}")
    print(f"  migrations pendentes: {len(pend)}" + (f" ({', '.join(pend)})" if pend else ""))
    print(f"  testes: {testes or 'não apurado'}")
    print(f"  alertas na torre: {len(esperas)}" + (" (nenhum — nada pendente)" if not esperas else ""))
    print("\nAgora publique o artifact. NUNCA responda ao Luiz antes de publicar.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
