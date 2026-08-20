"use client";

import { useRef, useState } from "react";

/** Nome + ícone de lápis — clique troca por um input, Enter/blur salva, Esc cancela. Reaproveitado
 * pra nome de fluxo e nome de pasta (mesma mecânica, quem chama decide o que fazer com o valor). */
export function EditarNomeInline({
  valor,
  aoSalvar,
  className,
  tamanhoTexto = "text-sm font-medium",
}: {
  valor: string;
  aoSalvar: (novoValor: string) => Promise<void>;
  className?: string;
  tamanhoTexto?: string;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(valor);
  const [salvando, setSalvando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function abrirEdicao() {
    setRascunho(valor);
    setEditando(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }

  async function confirmar() {
    const novoValor = rascunho.trim();
    if (!novoValor || novoValor === valor) {
      setEditando(false);
      return;
    }
    setSalvando(true);
    await aoSalvar(novoValor);
    setSalvando(false);
    setEditando(false);
  }

  if (editando) {
    return (
      <input
        ref={inputRef}
        className={`rounded border border-zinc-300 bg-white px-1.5 py-0.5 dark:border-zinc-600 dark:bg-zinc-800 ${tamanhoTexto} ${className ?? ""}`}
        value={rascunho}
        disabled={salvando}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            confirmar();
          } else if (e.key === "Escape") {
            setEditando(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span className={`group inline-flex items-center gap-1.5 ${className ?? ""}`}>
      <span className={tamanhoTexto}>{valor}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          abrirEdicao();
        }}
        className="text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-zinc-700 dark:hover:text-zinc-200"
        title="Editar nome"
        aria-label="Editar nome"
      >
        ✏️
      </button>
    </span>
  );
}
