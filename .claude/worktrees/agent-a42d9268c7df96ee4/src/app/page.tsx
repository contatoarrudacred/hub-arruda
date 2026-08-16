import { createClient } from "@/lib/supabase/server";

async function checkSupabaseConnection() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return { error: { message: "Faltam as variáveis de ambiente do Supabase em .env.local (ver .env.local.example)." } };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("unidades_negocio")
    .select("id", { count: "exact", head: true });

  return { error };
}

export default async function Home() {
  const { error } = await checkSupabaseConnection();
  const supabaseOk = !error;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-8 font-sans dark:bg-black">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Hub Arruda
      </h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Conexão com o Supabase:{" "}
        <span className={supabaseOk ? "text-emerald-600" : "text-red-600"}>
          {supabaseOk ? "OK" : "falhou"}
        </span>
      </p>
      {error && (
        <pre className="max-w-lg overflow-auto rounded bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error.message}
        </pre>
      )}
    </div>
  );
}
