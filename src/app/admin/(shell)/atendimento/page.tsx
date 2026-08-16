import {
  contarNaoLidas,
  listarConversasAtendimento,
  listarUsuariosSistema,
  obterUsuarioSistemaAtual,
} from "@/lib/motor-fluxo/repositorio-atendimento";
import { listarRespostasProntasAtivas } from "@/lib/motor-fluxo/repositorio-admin";
import { AtendimentoClient } from "./atendimento-client";

export default async function AtendimentoPage() {
  const usuarioAtual = await obterUsuarioSistemaAtual();
  const [conversas, contagens, atendentes, respostasProntas] = await Promise.all([
    listarConversasAtendimento({ tipo: "tudo" }, ""),
    contarNaoLidas(usuarioAtual.id),
    listarUsuariosSistema(),
    listarRespostasProntasAtivas(),
  ]);

  return (
    <AtendimentoClient
      usuarioAtual={usuarioAtual}
      conversasIniciais={conversas}
      contagensIniciais={contagens}
      atendentesIniciais={atendentes}
      respostasProntasIniciais={respostasProntas}
    />
  );
}
