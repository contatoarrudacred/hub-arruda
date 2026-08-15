"use client";

import { useState } from "react";
import { confirmarDescadastro } from "./actions";

const NAVY = "#141e33";

export function ConfirmarDescadastro({ pessoaId }: { pessoaId: string }) {
  const [estado, setEstado] = useState<"aguardando" | "confirmando" | "feito" | "erro">("aguardando");

  async function confirmar() {
    setEstado("confirmando");
    const resultado = await confirmarDescadastro(pessoaId);
    setEstado(resultado.sucesso ? "feito" : "erro");
  }

  if (estado === "feito") {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Pronto — você não vai mais receber e-mails automáticos da ArrudaCred. Se mudar de ideia, é
        só voltar a falar com a gente no WhatsApp.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Confirma que não quer mais receber e-mails automáticos da ArrudaCred?
      </p>
      <button
        onClick={confirmar}
        disabled={estado === "confirmando"}
        className="rounded-full px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
        style={{ backgroundColor: NAVY }}
      >
        {estado === "confirmando" ? "Confirmando..." : "Sim, quero me descadastrar"}
      </button>
      {estado === "erro" && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Não consegui confirmar agora — tenta de novo em alguns instantes.
        </p>
      )}
      <p className="text-xs text-zinc-400">
        Isso não afeta o atendimento pelo WhatsApp — só os e-mails automáticos.
      </p>
    </div>
  );
}
