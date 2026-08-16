import { listarUsuariosSistema } from "@/lib/motor-fluxo/repositorio-atendimento";
import { AtendentesClient } from "./atendentes-client";

export default async function AtendentesPage() {
  const atendentes = await listarUsuariosSistema();
  return <AtendentesClient atendentesIniciais={atendentes} />;
}
