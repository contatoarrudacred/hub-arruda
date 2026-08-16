import { listarObjecoes, listarProdutos } from "@/lib/motor-fluxo/repositorio-admin";
import { ObjecoesClient } from "./objecoes-client";

export default async function ObjecoesPage() {
  const [objecoes, produtos] = await Promise.all([listarObjecoes(), listarProdutos()]);

  return <ObjecoesClient objecoesIniciais={objecoes} produtos={produtos} />;
}
