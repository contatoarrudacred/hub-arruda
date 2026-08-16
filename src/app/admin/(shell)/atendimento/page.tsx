import { contarNaoLidas, listarConversasAtendimento, obterUsuarioSistemaAtual } from "@/lib/motor-fluxo/repositorio-atendimento";
import { AtendimentoClient } from "./atendimento-client";

export default async function AtendimentoPage() {
  const usuarioAtual = await obterUsuarioSistemaAtual();
  const [conversas, contagens] = await Promise.all([
    listarConversasAtendimento({ tipo: "tudo" }, ""),
    contarNaoLidas(usuarioAtual.id),
  ]);

  return <AtendimentoClient usuarioAtual={usuarioAtual} conversasIniciais={conversas} contagensIniciais={contagens} />;
}
