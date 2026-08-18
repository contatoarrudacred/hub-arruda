import { listarPropriedades, listarUnidadesNegocio } from "@/lib/marketing/repositorio";
import { PropriedadesClient } from "./propriedades-client";

export default async function PropriedadesPage() {
  const [propriedades, unidadesNegocio] = await Promise.all([listarPropriedades(), listarUnidadesNegocio()]);

  return <PropriedadesClient propriedadesIniciais={propriedades} unidadesNegocio={unidadesNegocio} />;
}
