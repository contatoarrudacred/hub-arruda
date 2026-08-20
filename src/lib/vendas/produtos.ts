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

// -----------------------------------------------------------------------------
// CRUD completo — tela de cadastro "Produtos & Serviços" (Configurações → Geral).
// -----------------------------------------------------------------------------

export type FonteReceita = "venda_direta" | "comissao";
export type FornecedorDefinidoEm = "venda" | "ordem_servico";

export type ProdutoCompleto = {
  id: string;
  nome: string;
  nomeReduzido: string | null;
  tipo: TipoProduto;
  parceiroExecutor: string | null;
  fonteReceita: FonteReceita;
  fornecedorId: string | null;
  fornecedorDefinidoEm: FornecedorDefinidoEm | null;
  exigeListaDocumentos: boolean;
  ativo: boolean;
};

type LinhaProdutoCompleta = {
  id: string;
  nome: string;
  nome_reduzido: string | null;
  tipo: TipoProduto;
  parceiro_executor: string | null;
  fonte_receita: FonteReceita;
  fornecedor_id: string | null;
  fornecedor_definido_em: FornecedorDefinidoEm | null;
  exige_lista_documentos: boolean;
  ativo: boolean;
};

const SELECT_PRODUTO_COMPLETO =
  "id, nome, nome_reduzido, tipo, parceiro_executor, fonte_receita, fornecedor_id, fornecedor_definido_em, exige_lista_documentos, ativo";

function paraProdutoCompleto(linha: LinhaProdutoCompleta): ProdutoCompleto {
  return {
    id: linha.id,
    nome: linha.nome,
    nomeReduzido: linha.nome_reduzido,
    tipo: linha.tipo,
    parceiroExecutor: linha.parceiro_executor,
    fonteReceita: linha.fonte_receita,
    fornecedorId: linha.fornecedor_id,
    fornecedorDefinidoEm: linha.fornecedor_definido_em,
    exigeListaDocumentos: linha.exige_lista_documentos,
    ativo: linha.ativo,
  };
}

/** Lista todos os produtos (ativos e inativos) — tela de cadastro, ao contrário de
 * listarProdutosParaVenda (só ativos, campos reduzidos, usada na Nova Oportunidade). */
export async function listarProdutosCompletos(): Promise<ProdutoCompleto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("produtos").select(SELECT_PRODUTO_COMPLETO).order("nome", { ascending: true });
  if (error) throw new Error(`Falha ao listar produtos: ${error.message}`);

  return ((data ?? []) as unknown as LinhaProdutoCompleta[]).map(paraProdutoCompleto);
}

export async function buscarProdutoCompleto(produtoId: string): Promise<ProdutoCompleto | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("produtos").select(SELECT_PRODUTO_COMPLETO).eq("id", produtoId).maybeSingle();
  if (error) throw new Error(`Falha ao buscar produto: ${error.message}`);
  if (!data) return null;

  return paraProdutoCompleto(data as unknown as LinhaProdutoCompleta);
}

export type EntradaSalvarProduto = {
  nome: string;
  nomeReduzido: string | null;
  tipo: TipoProduto;
  parceiroExecutor: string | null;
  fonteReceita: FonteReceita;
  fornecedorId: string | null;
  fornecedorDefinidoEm: FornecedorDefinidoEm | null;
  exigeListaDocumentos: boolean;
  ativo: boolean;
};

/** Acha a única unidade de negócio do sistema ("ArrudaCred") — mesmo padrão já usado em
 * src/lib/vendas/fornecedores.ts (garantirPapelFornecedor): produtos.unidade_negocio_id é
 * obrigatório no schema, mas o sistema é single-tenant hoje, então não expomos esse campo na
 * tela — é resolvido sozinho na criação. */
async function buscarUnidadeNegocioArrudaCred(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("unidades_negocio").select("id").eq("nome", "ArrudaCred").single();
  if (error || !data) throw new Error("Unidade de negócio 'ArrudaCred' não encontrada — não deveria acontecer.");
  return data.id;
}

export async function criarProduto(entrada: EntradaSalvarProduto): Promise<{ id: string }> {
  const supabase = await createClient();
  const unidadeNegocioId = await buscarUnidadeNegocioArrudaCred();

  const { data, error } = await supabase
    .from("produtos")
    .insert({
      unidade_negocio_id: unidadeNegocioId,
      nome: entrada.nome,
      nome_reduzido: entrada.nomeReduzido,
      tipo: entrada.tipo,
      parceiro_executor: entrada.parceiroExecutor,
      fonte_receita: entrada.fonteReceita,
      fornecedor_id: entrada.fornecedorId,
      fornecedor_definido_em: entrada.fornecedorDefinidoEm,
      exige_lista_documentos: entrada.exigeListaDocumentos,
      ativo: entrada.ativo,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar produto: ${error.message}`);
  return { id: data.id };
}

export async function atualizarProduto(produtoId: string, entrada: EntradaSalvarProduto): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("produtos")
    .update({
      nome: entrada.nome,
      nome_reduzido: entrada.nomeReduzido,
      tipo: entrada.tipo,
      parceiro_executor: entrada.parceiroExecutor,
      fonte_receita: entrada.fonteReceita,
      fornecedor_id: entrada.fornecedorId,
      fornecedor_definido_em: entrada.fornecedorDefinidoEm,
      exige_lista_documentos: entrada.exigeListaDocumentos,
      ativo: entrada.ativo,
    })
    .eq("id", produtoId);
  if (error) throw new Error(`Falha ao atualizar produto: ${error.message}`);
}
