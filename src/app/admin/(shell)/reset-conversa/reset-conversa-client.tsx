"use client";

import { useState } from "react";
import { resetarApenasConversaAction, resetarConversaAction } from "./actions";

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";

type Bloqueio =
  | { tipo: "venda"; contratos: number; comissoes: number }
  | { tipo: "usuario_sistema"; email: string }
  | { tipo: "multiplas"; nomes: string[] };

export function ResetConversaClient() {
  const [telefone, setTelefone] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [bloqueio, setBloqueio] = useState<Bloqueio | null>(null);

  async function resetar() {
    setCarregando(true);
    setResultado(null);
    setErro(null);
    setBloqueio(null);
    const r = await resetarConversaAction(telefone);
    setCarregando(false);

    if (r.status === "erro") {
      setErro(r.mensagem);
      return;
    }
    if (r.status === "bloqueado_por_venda") {
      setBloqueio({ tipo: "venda", contratos: r.quantidadeContratos, comissoes: r.quantidadeComissoes });
      return;
    }
    if (r.status === "bloqueado_por_usuario_sistema") {
      setBloqueio({ tipo: "usuario_sistema", email: r.email });
      return;
    }
    if (r.status === "multiplas_pessoas") {
      setBloqueio({ tipo: "multiplas", nomes: r.nomes });
      return;
    }
    setResultado(
      r.status === "apagado_tudo"
        ? "Conversa apagada. A próxima mensagem desse número no WhatsApp começa do zero."
        : "Nenhuma conversa encontrada com esse número — nada pra apagar.",
    );
  }

  async function resetarApenasConversa() {
    setCarregando(true);
    setErro(null);
    const r = await resetarApenasConversaAction(telefone);
    setCarregando(false);

    if (r.status === "erro") {
      setErro(r.mensagem);
      return;
    }
    setBloqueio(null);
    setResultado(
      r.status === "apagado"
        ? "Conversa apagada — cadastro(s), oportunidade e contrato/comissão continuam intactos. A próxima mensagem desse número no WhatsApp começa do zero."
        : "Nenhuma conversa encontrada com esse número — nada pra apagar.",
    );
  }

  return (
    <div className="max-w-lg space-y-3 p-8">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Resetar conversa (teste)</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Utilitário de teste — apaga a pessoa, oportunidade, conversa e mensagens desse número de
        WhatsApp. Não desfaz. Use só com números de teste, nunca com um lead/cliente de verdade.
      </p>

      <div>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Telefone (com DDD, só números ou com máscara — tanto faz)
        </label>
        <input
          className={campo}
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          placeholder="13991975342"
        />
      </div>

      <button
        onClick={resetar}
        disabled={carregando || !telefone.trim()}
        className="rounded-full bg-red-600 px-4 py-2 text-sm text-white shadow disabled:opacity-40"
      >
        {carregando ? "Apagando..." : "Resetar conversa"}
      </button>

      {bloqueio && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
          {bloqueio.tipo === "venda" ? (
            <p>
              ⚠️ Essa pessoa já tem {bloqueio.contratos} contrato(s) e {bloqueio.comissoes} comissão(ões)
              registrados — o cadastro não pode ser apagado (quebraria esses registros de venda).
            </p>
          ) : bloqueio.tipo === "usuario_sistema" ? (
            <p>
              ⚠️ Esse telefone está ligado ao cadastro de um usuário do sistema ({bloqueio.email}) — o
              cadastro não pode ser apagado (é um login de admin, não um lead de teste).
            </p>
          ) : (
            <p>
              ⚠️ Esse telefone está ligado a mais de um cadastro de pessoa ({bloqueio.nomes.join(", ")}) — não
              dá pra saber sozinho qual apagar, então não vou arriscar apagar o errado.
            </p>
          )}
          <p>Quer apagar só a conversa? Cadastro(s), oportunidade e contrato/comissão continuam intactos.</p>
          <button
            onClick={resetarApenasConversa}
            disabled={carregando}
            className="rounded-full bg-amber-600 px-4 py-1.5 text-sm text-white shadow disabled:opacity-40"
          >
            {carregando ? "Apagando..." : "Apagar só a conversa"}
          </button>
        </div>
      )}

      {resultado && <p className="text-sm text-emerald-600 dark:text-emerald-400">{resultado}</p>}
      {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}
