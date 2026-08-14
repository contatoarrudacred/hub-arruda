import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente com service_role — IGNORA RLS. Só para código de backend que precisa
// operar fora do contexto de um usuário autenticado (webhooks do WhatsApp/Zapster,
// motor de fluxo, agendador de follow-up). O import "server-only" faz o build
// falhar se isto acabar sendo importado por engano em código de cliente.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
