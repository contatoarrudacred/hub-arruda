"""Le as transcricoes do Claude Code para saber quem esta rodando e quem parou.

Por que este sensor e melhor que os anteriores:

  commits          — o agente pode trabalhar uma hora sem commitar
  mtime de arquivo — minha propria sincronizacao de worktree mexe nos arquivos
                     dele e o faz parecer ativo
  hook de fim de turno — so vale a partir do proximo turno; nao explica o passado

A transcricao responde as duas perguntas de uma vez, e retroativamente:
QUANDO foi a ultima troca e DE QUEM foi a ultima palavra. Se a ultima palavra
foi do agente, ele terminou de responder e a bola esta com o humano — um agente
nao volta a se mexer sozinho.
"""
import glob
import io
import json
import os
import time

BASE = os.path.expanduser(os.path.join("~", ".claude", "projects"))

# branch -> agente. "main" fica de fora: ali moram o CRM e o Coordenador,
# separados pela variavel CLAUDE_CODE_SESSION_ID (a minha).
POR_BRANCH = {
    "worktree-pipeline-conteudo-marketing-nucleo": "Marketing",
    "worktree-vendas-contrato": "Vendas — Contrato",
}


def _limpar(t):
    for c in "*`#>":
        t = t.replace(c, "")
    return " ".join(t.split())


def _ler(arquivo):
    regs = []
    try:
        for linha in io.open(arquivo, encoding="utf-8", errors="replace"):
            try:
                regs.append(json.loads(linha))
            except ValueError:
                pass
    except OSError:
        pass
    return regs


def ler_sessoes(horas=36):
    """{agente: {fim, papel, texto, sessao}} — uma entrada por agente."""
    minha = os.environ.get("CLAUDE_CODE_SESSION_ID", "")
    achados = {}
    for pasta in glob.glob(os.path.join(BASE, "*HUBARRUDA*")):
        for arq in glob.glob(os.path.join(pasta, "*.jsonl")):
            if time.time() - os.path.getmtime(arq) > horas * 3600:
                continue
            regs = _ler(arq)
            msgs = [r for r in regs if r.get("type") in ("user", "assistant")]
            if not msgs:
                continue
            ult = msgs[-1]
            branch = ""
            for r in reversed(regs):
                if r.get("gitBranch"):
                    branch = r["gitBranch"]
                    break
            sessao = os.path.basename(arq)[:-6]
            nome = POR_BRANCH.get(branch)
            if not nome and branch == "main":
                nome = "Coordenador" if sessao == minha else "CRM"
            if not nome:
                continue

            # UTC -> epoch
            ts = ult.get("timestamp") or ""
            try:
                fim = time.mktime(time.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S")) - time.timezone
            except ValueError:
                continue

            texto = ""
            for r in msgs:
                if r.get("type") == "assistant":
                    c = r.get("message", {}).get("content")
                    if isinstance(c, list):
                        t = " ".join(b.get("text", "") for b in c if b.get("type") == "text").strip()
                        if t:
                            texto = t

            # a mesma sessao aparece em varias pastas (worktree movido); fica a mais nova
            if nome not in achados or fim > achados[nome]["fim"]:
                achados[nome] = {
                    "fim": fim,
                    "papel": ult.get("type"),
                    "texto": _limpar(texto)[-420:],
                    "sessao": sessao,
                }
    return achados


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    for nome, s in sorted(ler_sessoes().items(), key=lambda x: -x[1]["fim"]):
        quem = "esperando um humano" if s["papel"] == "assistant" else "turno em andamento"
        print("%-20s %s  %s" % (nome, time.strftime("%d/%m %H:%M", time.localtime(s["fim"])), quem))
        if s["texto"]:
            print("     ...%s" % s["texto"][-160:])
