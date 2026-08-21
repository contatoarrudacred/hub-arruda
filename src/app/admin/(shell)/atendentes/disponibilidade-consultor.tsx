"use client";

import { useEffect, useState } from "react";
import { listarDisponibilidadeAction, salvarDisponibilidadeAction } from "./actions";

const NOMES_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

type LinhaDisponibilidade = { diaSemana: number; horaInicio: number; horaFim: number; ativo: boolean };

const campo = "w-16 rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";

/** Editor de disponibilidade (dias/horários) de um consultor — spec 2026-08-20-agendamento-consultor-alto-valor.md. Só aparece pra usuários marcados `eh_consultor`. */
export function DisponibilidadeConsultor({ usuarioId }: { usuarioId: string }) {
  const [linhas, setLinhas] = useState<LinhaDisponibilidade[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    listarDisponibilidadeAction(usuarioId).then(setLinhas);
  }, [usuarioId]);

  function atualizar(diaSemana: number, campoAlterado: keyof LinhaDisponibilidade, valor: number | boolean) {
    setLinhas((atual) => atual?.map((l) => (l.diaSemana === diaSemana ? { ...l, [campoAlterado]: valor } : l)) ?? null);
    setSalvo(false);
  }

  async function salvar() {
    if (!linhas) return;
    setSalvando(true);
    const resultado = await salvarDisponibilidadeAction(usuarioId, linhas);
    setSalvando(false);
    if (resultado.sucesso) setSalvo(true);
  }

  if (!linhas) return <p className="text-xs text-zinc-400">Carregando disponibilidade...</p>;

  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Disponibilidade pra agendamento de consultor (a Malala só oferece horário dentro dessa janela)
      </p>
      {linhas.map((linha) => (
        <div key={linha.diaSemana} className="flex items-center gap-2 text-xs">
          <label className="flex w-24 shrink-0 items-center gap-1.5">
            <input type="checkbox" checked={linha.ativo} onChange={(e) => atualizar(linha.diaSemana, "ativo", e.target.checked)} />
            {NOMES_DIA[linha.diaSemana]}
          </label>
          <input
            type="number"
            min={0}
            max={23}
            disabled={!linha.ativo}
            className={campo}
            value={linha.horaInicio}
            onChange={(e) => atualizar(linha.diaSemana, "horaInicio", Number(e.target.value))}
          />
          <span className="text-zinc-400">às</span>
          <input
            type="number"
            min={0}
            max={23}
            disabled={!linha.ativo}
            className={campo}
            value={linha.horaFim}
            onChange={(e) => atualizar(linha.diaSemana, "horaFim", Number(e.target.value))}
          />
          <span className="text-zinc-400">h</span>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="rounded-full bg-zinc-900 px-3 py-1 text-xs text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {salvando ? "Salvando..." : "Salvar disponibilidade"}
        </button>
        {salvo && <span className="text-xs text-emerald-600 dark:text-emerald-400">Salvo ✓</span>}
      </div>
    </div>
  );
}
