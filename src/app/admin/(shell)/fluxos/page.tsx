import { listarFluxos, listarPastas } from "@/lib/motor-fluxo/repositorio-admin";
import { FluxosClient } from "./fluxos-client";

export default async function FluxosPage() {
  const [fluxos, pastas] = await Promise.all([listarFluxos(), listarPastas()]);

  return <FluxosClient fluxosIniciais={fluxos} pastasIniciais={pastas} />;
}
