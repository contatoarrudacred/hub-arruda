"use client";

import { useState } from "react";
import { resetarConversaAction } from "./actions";

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";

export function ResetConversaClient() {
  const [telefone, setTelefone] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function resetar() {
    setCarregando(true);
    setResultado(null);
    setErro(null);
    const r = await resetarConversaAction(telefone);
    setCarregando(false);
    if (!r.sucesso) {
      setErro(r.erro);
      return;
    }
    setResultado(
      r.encontrado
        ? "Conversa apagada. A próxima mensagem desse número no WhatsApp começa do zero."
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

      {resultado && <p className="text-sm text-emerald-600 dark:text-emerald-400">{resultado}</p>}
      {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}
