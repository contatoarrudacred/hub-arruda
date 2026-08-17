import "server-only";
import { marcarPautaEmProducao, selecionarProximaPautaPendente } from "./repositorio";
import type { PautaCarregada } from "./tipos";

export async function selecionarPauta(matrizConteudoId: string): Promise<PautaCarregada | null> {
  const pauta = await selecionarProximaPautaPendente(matrizConteudoId);
  if (!pauta) return null;

  await marcarPautaEmProducao(pauta.id);
  return pauta;
}
