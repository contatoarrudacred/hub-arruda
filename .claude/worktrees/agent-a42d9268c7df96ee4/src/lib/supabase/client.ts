import { createBrowserClient } from "@supabase/ssr";

// Cliente para uso em Client Components — respeita RLS, autentica com a sessão do usuário logado (Supabase Auth).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
