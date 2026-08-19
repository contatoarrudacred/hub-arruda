import { createClient } from "@/lib/supabase/server";

/** Busca o representante legal (Pessoa Física) ativo de uma Pessoa Jurídica — a "representação"
 * não tem data_fim quando ainda vigente. Uma PJ pode ter mais de um representante ao longo do
 * tempo; pra contrato usamos sempre o mais recente sem data_fim. */
export async function buscarRepresentante(pessoaJuridicaId: string): Promise<{ pessoaFisicaId: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pessoa_representantes")
    .select("pessoa_fisica_id")
    .eq("pessoa_juridica_id", pessoaJuridicaId)
    .is("data_fim", null)
    .order("data_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar representante: ${error.message}`);
  if (!data) return null;
  return { pessoaFisicaId: data.pessoa_fisica_id };
}

/** Vincula uma Pessoa Física como representante legal de uma Pessoa Jurídica — idempotente
 * (se o vínculo já existir e estiver ativo, não duplica). */
export async function definirRepresentante(pessoaJuridicaId: string, pessoaFisicaId: string): Promise<void> {
  const supabase = await createClient();
  const existente = await buscarRepresentante(pessoaJuridicaId);
  if (existente?.pessoaFisicaId === pessoaFisicaId) return;

  const { error } = await supabase
    .from("pessoa_representantes")
    .insert({ pessoa_juridica_id: pessoaJuridicaId, pessoa_fisica_id: pessoaFisicaId });
  if (error) throw new Error(`Falha ao definir representante: ${error.message}`);
}
