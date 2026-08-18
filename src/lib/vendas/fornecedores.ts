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

  // O design (spec seção 3.1) define `fornecedores` como extensão de
  // `pessoa_papeis.tipo_papel = 'fornecedor'` — é essa linha que carrega o escopo por
  // unidade de negócio (`fornecedores` não tem `unidade_negocio_id` próprio). Só roda no
  // CREATE: um fornecedor já existente já tem seu papel. Best-effort: não deixa a criação
  // do fornecedor falhar por causa disso.
  await garantirPapelFornecedor(entrada.pessoaId);

  return { id: data.id };
}

async function garantirPapelFornecedor(pessoaId: string): Promise<void> {
  const supabase = await createClient();

  const { data: unidade, error: erroUnidade } = await supabase
    .from("unidades_negocio")
    .select("id")
    .eq("nome", "ArrudaCred")
    .single();
  if (erroUnidade || !unidade) {
    console.error("Falha ao localizar unidade de negócio 'ArrudaCred' para papel de fornecedor:", erroUnidade?.message);
    return;
  }

  const { data: papelExistente, error: erroBusca } = await supabase
    .from("pessoa_papeis")
    .select("id")
    .eq("pessoa_id", pessoaId)
    .eq("unidade_negocio_id", unidade.id)
    .eq("tipo_papel", "fornecedor")
    .eq("status", "ativo")
    .maybeSingle();
  if (erroBusca) {
    console.error("Falha ao checar papel de fornecedor:", erroBusca.message);
    return;
  }
  if (papelExistente) return;

  const { error: erroInsert } = await supabase
    .from("pessoa_papeis")
    .insert({ pessoa_id: pessoaId, unidade_negocio_id: unidade.id, tipo_papel: "fornecedor" });
  if (erroInsert) {
    console.error("Falha ao criar papel de fornecedor:", erroInsert.message);
  }
}

export async function excluirFornecedor(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("fornecedores").delete().eq("id", id);
  if (error) throw new Error(`Falha ao excluir fornecedor: ${error.message}`);
}
