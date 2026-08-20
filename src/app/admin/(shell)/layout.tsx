import { createClient } from "@/lib/supabase/server";
import { LembreteAgendamentoGlobal } from "./lembrete-agendamento-global";
import { Sidebar } from "./sidebar";

// Layout persistente de /admin/* — barra lateral fixa (identidade navy/dourado combinada com
// Luiz, 14/08/2026) em vez de cada página ter seu próprio link "← Voltar" solto.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userEmail={user?.email} />
      <main className="min-w-0 flex-1 overflow-y-auto bg-zinc-50 dark:bg-black">{children}</main>
      <LembreteAgendamentoGlobal />
    </div>
  );
}
