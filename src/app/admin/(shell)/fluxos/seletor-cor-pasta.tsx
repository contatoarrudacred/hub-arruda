"use client";

import { useState } from "react";
import { CORES_PASTA, CORES_PASTA_LISTA, type CorPasta } from "@/lib/motor-fluxo/cores-pasta";

/** Swatch clicável que abre um popover com grade 4×4 das 16 cores da pasta — mesmo padrão de
 * bolinha usado em /admin/atendentes, só com popover em vez de linha fixa (aqui cabe dentro do
 * cabeçalho compacto de cada pasta). */
export function SeletorCorPasta({
  cor,
  aoEscolher,
  disabled,
}: {
  cor: CorPasta;
  aoEscolher: (novaCor: CorPasta) => void;
  disabled?: boolean;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        title={`Cor da pasta: ${CORES_PASTA[cor].nome}`}
        aria-label="Escolher cor da pasta"
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setAberto((v) => !v);
        }}
        className={`h-4 w-4 shrink-0 rounded-full border-2 border-white shadow disabled:opacity-50 dark:border-zinc-900 ${CORES_PASTA[cor].bg}`}
      />
      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div
            className="absolute left-0 top-6 z-20 grid grid-cols-4 gap-1.5 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            {CORES_PASTA_LISTA.map((chave) => (
              <button
                key={chave}
                type="button"
                title={CORES_PASTA[chave].nome}
                onClick={() => {
                  aoEscolher(chave);
                  setAberto(false);
                }}
                className={`h-6 w-6 rounded-full border-2 ${CORES_PASTA[chave].bg} ${
                  chave === cor ? "border-zinc-900 dark:border-white" : "border-transparent"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </span>
  );
}
