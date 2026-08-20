"use server";

import { carregarDetalhesPostVisualizacao } from "@/lib/marketing/repositorio";
import type { DetalhesPostVisualizacao } from "@/lib/marketing/tipos";

// Botão "Visualizar Post" do Monitor (19/08/2026, pedido do Luiz) — server action porque
// monitor-client.tsx é "use client" e repositorio.ts é server-only. Busca sob demanda (não junto
// da carga inicial nem via Realtime) porque só é preciso quando o usuário clica no botão de um
// card específico — a maioria dos cards em tela nunca tem esse botão clicado numa sessão.
export async function carregarDetalhesPostVisualizacaoAction(pautaId: string): Promise<DetalhesPostVisualizacao | null> {
  return carregarDetalhesPostVisualizacao(pautaId);
}
