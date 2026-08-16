import {
  contarNaoLidas,
  listarConversasAtendimento,
  listarUsuariosSistema,
  obterUsuarioSistemaAtual,
} from "@/lib/motor-fluxo/repositorio-atendimento";
import { AtendimentoClient } from "./atendimento-client";

export default async function AtendimentoPage() {
  const usuarioAtual = await obterUsuarioSistemaAtual();
  const [conversas, contagens, atendentes] = await Promise.all([
    listarConversasAtendimento({ tipo: "tudo" }, ""),
    contarNaoLidas(usuarioAtual.id),
    listarUsuariosSistema(),
  ]);

  return (
    <AtendimentoClient
      usuarioAtual={usuarioAtual}
      conversasIniciais={conversas}
      contagensIniciais={contagens}
      atendentesIniciais={atendentes}
    />
  );
}
