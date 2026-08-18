"use client";

// Ícone de ajuda com tooltip — puramente visual, sem estado de servidor. Hover mostra a dica (mouse);
// `focus-within` cobre teclado/toque, já que `group-hover` sozinho não dispara em dispositivos sem
// mouse. Reaproveitado pelas telas de Marketing (Tasks 7-13) sempre que um rótulo de campo/coluna
// precisa de uma explicação curta sem poluir a tela com texto fixo.
export function Ajuda({ texto }: { texto: string }) {
  return (
    <span className="group/ajuda relative inline-flex">
      <button
        type="button"
        tabIndex={0}
        aria-label={texto}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-[10px] leading-none text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-max max-w-64 -translate-x-1/2 rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity duration-100 group-hover/ajuda:opacity-100 group-focus-within/ajuda:opacity-100 dark:bg-zinc-700"
      >
        {texto}
      </span>
    </span>
  );
}
