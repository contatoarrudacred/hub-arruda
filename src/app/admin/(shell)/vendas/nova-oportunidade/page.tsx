import { listarProdutosParaVenda } from "@/lib/vendas/produtos";
import { NovaOportunidadeClient } from "./nova-oportunidade-client";

export default async function NovaOportunidadePage() {
  const produtos = await listarProdutosParaVenda();
  return <NovaOportunidadeClient produtos={produtos} />;
}
