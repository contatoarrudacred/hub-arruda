import { listarConversasAtendimento, listarUsuariosSistema, obterUsuarioSistemaAtual } from "@/lib/motor-fluxo/repositorio-atendimento";
import { AtendimentoClient } from "./atendimento-client";

export default async function AtendimentoPage() {
  const [usuarioAtual, atendentes, conversas] = await Promise.all([
    obterUsuarioSistemaAtual(),
    listarUsuariosSistema(),
    listarConversasAtendimento({ tipo: "tudo" }, ""),
  ]);

  return <AtendimentoClient usuarioAtual={usuarioAtual} atendentes={atendentes} conversasIniciais={conversas} />;
}
