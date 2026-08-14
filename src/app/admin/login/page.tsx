"use client";

import { useActionState } from "react";
import { entrar, type EstadoLogin } from "./actions";

const ESTADO_INICIAL: EstadoLogin = { erro: null };

export default function LoginPage() {
  const [estado, formAction, pendente] = useActionState(entrar, ESTADO_INICIAL);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-8 dark:bg-black">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow dark:bg-zinc-900"
      >
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Hub Arruda — Admin</h1>
        <div className="space-y-1">
          <label className="text-sm text-zinc-600 dark:text-zinc-400" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-zinc-600 dark:text-zinc-400" htmlFor="senha">
            Senha
          </label>
          <input
            id="senha"
            name="senha"
            type="password"
            required
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>
        {estado.erro && <p className="text-sm text-red-600 dark:text-red-400">{estado.erro}</p>}
        <button
          type="submit"
          disabled={pendente}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {pendente ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
