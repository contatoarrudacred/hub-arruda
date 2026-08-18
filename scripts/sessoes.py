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


def _fala_humana(r):
    """Mensagem escrita por uma pessoa — nao tool_result, nao anexo.

    Isto importa: quando EU sincronizo o worktree de um agente, o app enfileira
    'attachment' e 'tool_result' na conversa dele, com carimbo de agora. Contar
    esses registros fazia a torre jurar que ele estava trabalhando. Sao as
    minhas proprias maos aparecendo como se fossem as dele.
    """
    if r.get("type") != "user" or r.get("isMeta") or r.get("isSidechain"):
        return False
    c = r.get("message", {}).get("content")
    if isinstance(c, str):
        return bool(c.strip())
    if isinstance(c, list):
        if any(b.get("type") == "tool_result" for b in c):
            return False
        return any(b.get("type") == "text" and (b.get("text") or "").strip() for b in c)
    return False


def _fala_agente(r):
    if r.get("type") != "assistant" or r.get("isSidechain"):
        return False
    c = r.get("message", {}).get("content")
    return isinstance(c, list) and any(
        b.get("type") == "text" and (b.get("text") or "").strip() for b in c)


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
            msgs = [r for r in regs if _fala_humana(r) or _fala_agente(r)]
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
                if _fala_agente(r):
                    c = r.get("message", {}).get("content")
                    if isinstance(c, list):
                        t = " ".join(b.get("text", "") for b in c if b.get("type") == "text").strip()
                        if t:
                            texto = t

            # a mesma sessao aparece em varias pastas (worktree movido); fica a mais nova
            erro = ""
            if ult.get("isApiErrorMessage") or ult.get("apiErrorStatus"):
                c = ult.get("message", {}).get("content")
                if isinstance(c, list):
                    erro = " ".join(b.get("text", "") for b in c if b.get("type") == "text")[:200]
                erro = erro or "erro de API sem detalhe"

            if nome not in achados or fim > achados[nome]["fim"]:
                achados[nome] = {
                    "fim": fim,
                    "papel": ult.get("type"),
                    "texto": _limpar(texto)[-420:],
                    "sessao": sessao,
                    "erro": erro,
                }
    return achados


def estado(s, agora=None, minutos_parado=3):
    """Os quatro estados possiveis. Nao ha um quinto.

    ERRO        — a ultima coisa na conversa foi uma falha (limite de uso,
                  queda de API). Nao adianta esperar: precisa de acao.
    AGUARDANDO  — a ultima palavra foi do agente. Ele respondeu e nao volta a
                  se mexer ate alguem falar com ele.
    TRABALHANDO — a ultima palavra foi do humano, ou a troca foi agora ha pouco.
    PARADO      — nao ha conversa recente nenhuma. Sessao fechada.
    """
    if not s:
        return "PARADO"
    if s.get("erro"):
        return "ERRO"
    idade = ((agora or time.time()) - s["fim"]) / 60
    if s["papel"] == "user" or idade < minutos_parado:
        return "TRABALHANDO"
    if idade > 60 * 18:
        return "PARADO"
    return "AGUARDANDO"


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    for nome, s in sorted(ler_sessoes().items(), key=lambda x: -x[1]["fim"]):
        print("%-20s %s  %s" % (nome, time.strftime("%d/%m %H:%M", time.localtime(s["fim"])), estado(s)))
        if s["texto"]:
            print("     ...%s" % s["texto"][-160:])
