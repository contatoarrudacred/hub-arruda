// Estágio 1 (parte 1) do pipeline — escolhe a próxima pauta pendente da fila.
// Gerar pautas NOVAS a partir dos eixos da matriz é responsabilidade do Construtor de Matriz de
// Conteúdo (ainda não construído, ver MODULO_MARKETING_CONTEUDO_ARRUDACRED.md seção 6) — aqui só
// consumimos o que já está na fila.

import "server-only";
import { marcarPautaEmProducao, selecionarProximaPautaPendente } from "./repositorio";
import type { PautaCarregada } from "./tipos";

export async function selecionarPauta(matrizConteudoId: string): Promise<PautaCarregada | null> {
  const pauta = await selecionarProximaPautaPendente(matrizConteudoId);
  if (!pauta) return null;

  await marcarPautaEmProducao(pauta.id);
  return pauta;
}
