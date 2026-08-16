"use client";

import { useState } from "react";
import { CORES_BADGE, CORES_BADGE_LISTA, type CorBadge } from "@/lib/motor-fluxo/cores-atendimento";
import type { UsuarioSistema } from "@/lib/motor-fluxo/repositorio-atendimento";
import { atualizarCorAtendenteAction } from "./actions";

function LinhaAtendente({ atendente }: { atendente: UsuarioSistema }) {
  const [cor, setCor] = useState<CorBadge>(atendente.corBadge);
  const [salvando, setSalvando] = useState(false);

  async function escolher(novaCor: CorBadge) {
    if (novaCor === cor) return;
    setSalvando(true);
    const anterior = cor;
    setCor(novaCor);
    const resultado = await atualizarCorAtendenteAction(atendente.id, novaCor);
    if (!resultado.sucesso) setCor(anterior);
    setSalvando(false);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 last:border-0 dark:border-zinc-800">
      <div>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{atendente.nome}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{atendente.email}</p>
      </div>
      <div className="flex items-center gap-1.5">
        {CORES_BADGE_LISTA.map((chave) => (
          <button
            key={chave}
            type="button"
            title={CORES_BADGE[chave].nome}
            disabled={salvando}
            onClick={() => escolher(chave)}
            className={`h-6 w-6 rounded-full border-2 disabled:opacity-50 ${CORES_BADGE[chave].bg} ${
              chave === cor ? "border-zinc-900 dark:border-white" : "border-transparent"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function AtendentesClient({ atendentesIniciais }: { atendentesIniciais: UsuarioSistema[] }) {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Atendentes</h1>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        Cor de cada atendente na Tela de Atendimento (badge na lista de conversas e fundo do painel
        quando ele está no controle) — definida aqui pelo admin, o próprio atendente não escolhe.
      </p>
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {atendentesIniciais.map((atendente) => (
          <LinhaAtendente key={atendente.id} atendente={atendente} />
        ))}
      </div>
    </div>
  );
}
