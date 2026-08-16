import { listarFaixasPrecoAdmin, listarProdutos } from "@/lib/motor-fluxo/repositorio-admin";
import { PrecosClient } from "./precos-client";

export default async function PrecosPage() {
  const [faixas, produtos] = await Promise.all([listarFaixasPrecoAdmin(), listarProdutos()]);

  return <PrecosClient faixasIniciais={faixas} produtos={produtos} />;
}
