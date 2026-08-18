import {
  contarNaoLidas,
  listarConversasAtendimento,
  listarUsuariosSistema,
  obterUsuarioSistemaAtual,
} from "@/lib/motor-fluxo/repositorio-atendimento";
import {
  carregarLimiaresSeloRisco,
  listarAgendasFollowup,
  listarRespostasProntasAtivas,
} from "@/lib/motor-fluxo/repositorio-admin";
import { AtendimentoClient } from "./atendimento-client";

export default async function AtendimentoPage() {
  const usuarioAtual = await obterUsuarioSistemaAtual();
  const [conversas, contagens, atendentes, respostasProntas, agendasFollowup, limiaresSeloRisco] = await Promise.all([
    listarConversasAtendimento({ tipo: "tudo" }, ""),
    contarNaoLidas(usuarioAtual.id),
    listarUsuariosSistema(),
    listarRespostasProntasAtivas(),
    listarAgendasFollowup(),
    carregarLimiaresSeloRisco(),
  ]);

  return (
    <AtendimentoClient
      usuarioAtual={usuarioAtual}
      conversasIniciais={conversas}
      contagensIniciais={contagens}
      atendentesIniciais={atendentes}
      respostasProntasIniciais={respostasProntas}
      agendasFollowupIniciais={agendasFollowup}
      limiaresSeloRisco={limiaresSeloRisco}
    />
  );
}
