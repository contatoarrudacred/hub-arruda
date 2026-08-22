import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type CategoriaComunicacao = { id: string; nome: string; ativo: boolean };

export async function listarCategoriasComunicacao(): Promise<CategoriaComunicacao[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("categorias_comunicacao").select("id, nome, ativo").order("nome");
  if (error) throw new Error(`Falha ao carregar categorias de comunicação: ${error.message}`);
  return data ?? [];
}

/** Só as ativas — é isto que src/lib/comunicacao/enviar.ts (Task 8) usaria se precisasse validar categoriaId contra a lista ativa (fora de escopo desta rodada — o FK já garante que o id existe; validar "está ativa" fica pra quando algum módulo pedir). */
export async function listarCategoriasComunicacaoAtivas(): Promise<CategoriaComunicacao[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("categorias_comunicacao")
    .select("id, nome, ativo")
    .eq("ativo", true)
    .order("nome");
  if (error) throw new Error(`Falha ao carregar categorias de comunicação ativas: ${error.message}`);
  return data ?? [];
}

export async function criarCategoriaComunicacao(nome: string): Promise<{ id: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("categorias_comunicacao").insert({ nome }).select("id").single();
  if (error || !data) throw new Error(`Falha ao criar categoria: ${error?.message}`);
  return { id: data.id };
}

export async function atualizarCategoriaComunicacao(id: string, entrada: { nome: string; ativo: boolean }): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("categorias_comunicacao")
    .update({ nome: entrada.nome, ativo: entrada.ativo, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Falha ao atualizar categoria ${id}: ${error.message}`);
}

/** Exclusão física — mesmo padrão real já usado em objeções/FAQs (ver objecoes-client.tsx, excluirObjecaoAction). Mensagens antigas que já referenciam esta categoria mantêm categoria_id (FK sem ON DELETE CASCADE — a linha em mensagens não é afetada, só passa a ter categoria_id apontando pra um id que não existe mais seria um problema; CONFIRMAR na Task 1 que o FK usa ON DELETE SET NULL, não o padrão RESTRICT/NO ACTION — se a migration não especificou, adicionar `on delete set null` na coluna `categoria_id` antes de implementar esta função). */
export async function excluirCategoriaComunicacao(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("categorias_comunicacao").delete().eq("id", id);
  if (error) throw new Error(`Falha ao excluir categoria ${id}: ${error.message}`);
}
