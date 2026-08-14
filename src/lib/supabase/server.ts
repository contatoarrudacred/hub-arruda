import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente para uso em Server Components, Route Handlers e Server Actions — respeita RLS,
// autentica com a sessão do usuário logado (lida via cookies).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Chamado a partir de um Server Component (sem permissão de escrever cookie) —
            // ignorado com segurança porque o proxy.ts cuida de renovar a sessão.
          }
        },
      },
    },
  );
}
