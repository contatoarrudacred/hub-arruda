"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// Página pública, sem autenticação (é um link de e-mail) — por isso usa o cliente service_role,
// igual ao resto do envio de e-mail (src/lib/email). O "token" é o próprio id da pessoa (uuid,
// praticamente impossível de adivinhar) — suficiente pro que isto precisa fazer, sem exigir uma
// tabela de tokens à parte.

export async function confirmarDescadastro(pessoaId: string): Promise<{ sucesso: boolean }> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("pessoas")
    .update({ email_marketing_opt_out: true })
    .eq("id", pessoaId);

  return { sucesso: !error };
}
