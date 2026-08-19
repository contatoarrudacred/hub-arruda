import { listarVendas } from "@/lib/vendas/painel-vendas";
import { PainelVendasClient } from "./painel-vendas-client";

export default async function PainelVendasPage() {
  const vendas = await listarVendas();
  return <PainelVendasClient vendasIniciais={vendas} />;
}
