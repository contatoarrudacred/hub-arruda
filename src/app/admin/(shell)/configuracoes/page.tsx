import { listarConfiguracoes, listarProdutos } from "@/lib/motor-fluxo/repositorio-admin";
import { ConfiguracoesClient } from "./configuracoes-client";

export default async function ConfiguracoesPage() {
  const [configuracoes, produtos] = await Promise.all([listarConfiguracoes(), listarProdutos()]);

  return <ConfiguracoesClient configuracoesIniciais={configuracoes} produtos={produtos} />;
}
