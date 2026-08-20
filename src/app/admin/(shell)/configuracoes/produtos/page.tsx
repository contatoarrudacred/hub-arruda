import { listarFornecedores } from "@/lib/vendas/fornecedores";
import { listarProdutosCompletos } from "@/lib/vendas/produtos";
import { ProdutosClient } from "./produtos-client";

export default async function ProdutosPage() {
  const [produtos, fornecedores] = await Promise.all([listarProdutosCompletos(), listarFornecedores()]);
  return <ProdutosClient produtosIniciais={produtos} fornecedores={fornecedores} />;
}
