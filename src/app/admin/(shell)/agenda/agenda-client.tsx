"use client";

import { formatarDataHoraAgendamento } from "@/lib/motor-fluxo/regras-limpeza-nome";
import type { AgendamentoConsultor } from "@/lib/motor-fluxo/repositorio-atendimento";

const MOTIVO_LABEL: Record<string, string> = {
  divida_alta: "Dívida alta",
  pacote_caro: "Pacote caro",
};

function LinhaAgendamento({ agendamento }: { agendamento: AgendamentoConsultor }) {
  const passado = new Date(agendamento.fim) < new Date();
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 last:border-0 dark:border-zinc-800 ${passado ? "opacity-50" : ""}`}>
      <div>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{agendamento.pessoaNome}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {formatarDataHoraAgendamento(agendamento.inicio)}
          {agendamento.pessoaTelefone && ` · ${agendamento.pessoaTelefone}`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {MOTIVO_LABEL[agendamento.motivo] ?? agendamento.motivo}
        </span>
        {agendamento.status === "cancelado" && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">Cancelado</span>
        )}
      </div>
    </div>
  );
}

export function AgendaClient({
  agendamentosIniciais,
  ehConsultor,
}: {
  agendamentosIniciais: AgendamentoConsultor[];
  ehConsultor: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Minha Agenda</h1>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        Agendamentos de ligação/vídeo-chamada que a Malala marcou com leads de alto valor ou pacote
        caro (spec 2026-08-20-agendamento-consultor-alto-valor.md).
      </p>
      {!ehConsultor && (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
          Você não está marcado como consultor em /admin/atendentes — a Malala só agenda com quem
          está marcado ali.
        </p>
      )}
      {agendamentosIniciais.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400 dark:border-zinc-700">
          Nenhum agendamento ainda.
        </p>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          {agendamentosIniciais.map((a) => (
            <LinhaAgendamento key={a.id} agendamento={a} />
          ))}
        </div>
      )}
    </div>
  );
}
