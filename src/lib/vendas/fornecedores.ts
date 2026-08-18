import { createClient } from "@/lib/supabase/server";

export type FornecedorAdmin = {
  id: string;
  pessoaId: string;
  nome: string;
  documento: string;
  categoria: "consorcio" | "credito" | "subcontratado_servico" | "administrativo";
  ativo: boolean;
};

export async function listarFornecedores(): Promise<FornecedorAdmin[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornecedores")
    .select("id, pessoa_id, categoria, ativo, pessoas(nome_razao_social, documento)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao listar fornecedores: ${error.message}`);
  return (data ?? []).map((linha) => ({
    id: linha.id,
    pessoaId: linha.pessoa_id,
    nome: (linha.pessoas as unknown as { nome_razao_social: string; documento: string } | null)?.nome_razao_social ?? "",
    documento: (linha.pessoas as unknown as { nome_razao_social: string; documento: string } | null)?.documento ?? "",
    categoria: linha.categoria as FornecedorAdmin["categoria"],
    ativo: linha.ativo,
  }));
}

export async function buscarFornecedorPorId(id: string): Promise<FornecedorAdmin | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornecedores")
    .select("id, pessoa_id, categoria, ativo, pessoas(nome_razao_social, documento)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar fornecedor: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    pessoaId: data.pessoa_id,
    nome: (data.pessoas as unknown as { nome_razao_social: string; documento: string } | null)?.nome_razao_social ?? "",
    documento: (data.pessoas as unknown as { nome_razao_social: string; documento: string } | null)?.documento ?? "",
    categoria: data.categoria as FornecedorAdmin["categoria"],
    ativo: data.ativo,
  };
}

export type EntradaSalvarFornecedor = {
  id: string | null;
  pessoaId: string;
  categoria: FornecedorAdmin["categoria"];
  ativo: boolean;
};

export async function salvarFornecedor(entrada: EntradaSalvarFornecedor): Promise<{ id: string }> {
  const supabase = await createClient();
  const linha = { pessoa_id: entrada.pessoaId, categoria: entrada.categoria, ativo: entrada.ativo };
  if (entrada.id) {
    const { error } = await supabase.from("fornecedores").update(linha).eq("id", entrada.id);
    if (error) throw new Error(`Falha ao atualizar fornecedor: ${error.message}`);
    return { id: entrada.id };
  }
  const { data, error } = await supabase.from("fornecedores").insert(linha).select("id").single();
  if (error) throw new Error(`Falha ao criar fornecedor: ${error.message}`);
  return { id: data.id };
}

export async function excluirFornecedor(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("fornecedores").delete().eq("id", id);
  if (error) throw new Error(`Falha ao excluir fornecedor: ${error.message}`);
}
