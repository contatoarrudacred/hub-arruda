import { listarFornecedores } from "@/lib/vendas/fornecedores";
import { FornecedoresClient } from "./fornecedores-client";

export default async function FornecedoresPage() {
  const fornecedores = await listarFornecedores();
  return <FornecedoresClient fornecedoresIniciais={fornecedores} />;
}
