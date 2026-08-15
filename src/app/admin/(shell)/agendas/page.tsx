import { listarAgendasCompletas } from "@/lib/motor-fluxo/repositorio-admin";
import { AgendasClient } from "./agendas-client";

export default async function AgendasPage() {
  const agendas = await listarAgendasCompletas();

  return <AgendasClient agendasIniciais={agendas} />;
}
