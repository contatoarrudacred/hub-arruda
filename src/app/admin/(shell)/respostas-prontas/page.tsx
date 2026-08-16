import { listarRespostasProntas } from "@/lib/motor-fluxo/repositorio-admin";
import { RespostasProntasClient } from "./respostas-prontas-client";

export default async function RespostasProntasPage() {
  const respostas = await listarRespostasProntas();
  return <RespostasProntasClient respostasIniciais={respostas} />;
}
