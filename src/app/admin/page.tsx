import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { sair } from "./actions";

export default async function AdminHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Hub Arruda — Admin</h1>
        <form action={sair}>
          <button className="text-sm text-zinc-500 underline">Sair ({user?.email})</button>
        </form>
      </div>
      <div className="mt-6 grid max-w-md gap-3">
        <Link
          href="/admin/fluxos"
          className="rounded-xl bg-white p-4 shadow hover:shadow-md dark:bg-zinc-900"
        >
          <span className="font-medium text-zinc-900 dark:text-zinc-50">Editor de fluxo</span>
          <p className="text-sm text-zinc-500">Script de atendimento, mensagens e ramificações</p>
        </Link>
      </div>
      <p className="mt-4 text-sm text-zinc-500">
        FAQs, preços por faixa, configurações e agendas de follow-up vêm a seguir.
      </p>
    </div>
  );
}
