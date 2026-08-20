// Versão própria de Vendas de "listar produtos" — a versão do CRM
// (src/lib/motor-fluxo/repositorio-admin.ts, listarProdutos) só devolve {id, nome} pra popular
// dropdown de FAQ. A tela de Nova Oportunidade precisa também de `tipo` (proprio/subcontratado/
// comissionado, decide se mostra financeiro) e `exige_lista_documentos` (decide se mostra a seção
// de pacote). Não editamos o arquivo do CRM — é território deles.
//
// `exige_lista_documentos` foi aplicada em produção em 19/08/2026 (migration
// 20260819120000_vendas_nova_oportunidade_kanban.sql). O `database.types.ts` gerado pode ainda não
// ter sido regenerado com a coluna nova — mesmo padrão já usado em src/lib/vendas/contratos.ts pra
// ultimo_erro/tentativas_erro (mesma migration): select via string não-literal (não força o
// parsing de coluna do supabase-js) + cast manual pro tipo bruto esperado. Isso não afeta o dado
// real devolvido em runtime — o Supabase JS não valida contra o tipo gerado, só o TypeScript
// (compile-time) usaria isso, e aqui já contornamos com o cast.
import { createClient } from "@/lib/supabase/server";
import type { TipoProduto } from "./oportunidades";

export type ProdutoParaVenda = { id: string; nome: string; tipo: TipoProduto; exigeListaDocumentos: boolean };

type LinhaProdutoBruta = { id: string; nome: string; tipo: TipoProduto; exige_lista_documentos: boolean };

const SELECT_PRODUTO_PARA_VENDA = "id, nome, tipo, exige_lista_documentos";

export async function listarProdutosParaVenda(): Promise<ProdutoParaVenda[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produtos")
    .select(SELECT_PRODUTO_PARA_VENDA)
    .eq("ativo", true)
    .order("nome", { ascending: true });
  if (error) throw new Error(`Falha ao listar produtos: ${error.message}`);

  return ((data ?? []) as unknown as LinhaProdutoBruta[]).map((p) => ({
    id: p.id,
    nome: p.nome,
    tipo: p.tipo,
    exigeListaDocumentos: p.exige_lista_documentos,
  }));
}

/** Busca um único produto por id — usado pra validação server-side (ex.: confirmar se o produto
 * exige a lista de documentos antes de aceitar o submit da Nova Oportunidade), sem precisar buscar
 * a lista inteira de produtos ativos de novo. */
export async function buscarProdutoParaVenda(produtoId: string): Promise<ProdutoParaVenda | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("produtos").select(SELECT_PRODUTO_PARA_VENDA).eq("id", produtoId).maybeSingle();
  if (error) throw new Error(`Falha ao buscar produto: ${error.message}`);
  if (!data) return null;

  const linha = data as unknown as LinhaProdutoBruta;
  return { id: linha.id, nome: linha.nome, tipo: linha.tipo, exigeListaDocumentos: linha.exige_lista_documentos };
}
