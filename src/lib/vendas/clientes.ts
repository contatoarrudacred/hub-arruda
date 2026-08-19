import { createClient } from "@/lib/supabase/server";

/** A Pessoa já tem pelo menos um papel (lead/cliente) sob alguma unidade de negócio — desde que
 * ela chegou a gerar uma Oportunidade. Reaproveita essa unidade em vez de pedir pra escolher de
 * novo (ex.: ao promover a cliente depois do pagamento). */
export async function buscarUnidadeNegocioDaPessoa(pessoaId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pessoa_papeis")
    .select("unidade_negocio_id")
    .eq("pessoa_id", pessoaId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar unidade de negócio da pessoa: ${error.message}`);
  return data?.unidade_negocio_id ?? null;
}

export async function promoverPessoaACliente(pessoaId: string, unidadeNegocioId: string): Promise<void> {
  const supabase = await createClient();
  const { data: papelExistente, error: erroBusca } = await supabase
    .from("pessoa_papeis")
    .select("id")
    .eq("pessoa_id", pessoaId)
    .eq("unidade_negocio_id", unidadeNegocioId)
    .eq("tipo_papel", "cliente")
    .eq("status", "ativo")
    .maybeSingle();
  if (erroBusca) throw new Error(`Falha ao checar papel de cliente: ${erroBusca.message}`);
  if (papelExistente) return;

  const { error } = await supabase
    .from("pessoa_papeis")
    .insert({ pessoa_id: pessoaId, unidade_negocio_id: unidadeNegocioId, tipo_papel: "cliente" });
  if (error) throw new Error(`Falha ao promover pessoa a cliente: ${error.message}`);
}

export type EntradaOportunidadeSemFunil = {
  pessoaId: string;
  produtoId: string;
  valorEstimado: number | null;
};

export async function criarOportunidadeSemFunilPrevio(
  entrada: EntradaOportunidadeSemFunil,
): Promise<{ oportunidadeId: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("oportunidades")
    .insert({
      pessoa_id: entrada.pessoaId,
      produto_id: entrada.produtoId,
      etapa_kanban: "dados_contrato",
      valor_estimado: entrada.valorEstimado,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar oportunidade: ${error.message}`);
  return { oportunidadeId: data.id };
}
