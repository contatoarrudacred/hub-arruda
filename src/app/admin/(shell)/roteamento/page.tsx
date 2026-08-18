import { carregarResumoDeTodasEtapas, listarRegrasRoteamento } from "@/lib/motor-fluxo/repositorio-admin";
import { RoteamentoClient } from "./roteamento-client";

export default async function RoteamentoPage() {
  const [regras, etapas] = await Promise.all([listarRegrasRoteamento(), carregarResumoDeTodasEtapas()]);
  return <RoteamentoClient regrasIniciais={regras} etapas={etapas} />;
}
