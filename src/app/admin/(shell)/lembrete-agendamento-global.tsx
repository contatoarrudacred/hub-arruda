"use client";

import { useEffect, useState } from "react";
import { verificarLembreteAgendamentoAction } from "./actions";

const INTERVALO_POLLING_MS = 30_000;

/**
 * Modal global de lembrete de agendamento (spec 2026-08-20-agendamento-consultor-alto-valor.md) —
 * mora no layout raiz do admin de propósito, pra aparecer em QUALQUER tela, não só na de
 * Atendimento (pedido explícito de Luiz: "uma modal que explode na tela em qualquer parte do
 * sistema"). Polling simples (30s) — mesmo padrão já usado pelo sino de notificação.
 */
export function LembreteAgendamentoGlobal() {
  const [lembrete, setLembrete] = useState<{ pessoaNome: string; inicio: string; tipo: "15min" | "hora" } | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function checar() {
      const resultado = await verificarLembreteAgendamentoAction();
      if (!cancelado && resultado) setLembrete(resultado);
    }
    checar();
    const intervalo = setInterval(checar, INTERVALO_POLLING_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, []);

  if (!lembrete) return null;

  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(lembrete.inicio),
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 text-center shadow-xl dark:bg-zinc-900">
        <p className="text-3xl">🔔</p>
        <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {lembrete.tipo === "hora" ? "É agora!" : "Daqui a 15 minutos"}
        </p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Ligação/vídeo-chamada agendada com <strong>{lembrete.pessoaNome}</strong> às {hora}.
        </p>
        <button
          type="button"
          onClick={() => setLembrete(null)}
          className="mt-4 rounded-full bg-zinc-900 px-4 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Ok
        </button>
      </div>
    </div>
  );
}
