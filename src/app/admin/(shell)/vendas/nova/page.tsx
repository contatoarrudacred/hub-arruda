import { listarProdutos } from "@/lib/motor-fluxo/repositorio-admin";
import { NovaVendaClient } from "./nova-venda-client";

export default async function NovaVendaPage() {
  const produtos = await listarProdutos();
  return <NovaVendaClient produtos={produtos} />;
}
