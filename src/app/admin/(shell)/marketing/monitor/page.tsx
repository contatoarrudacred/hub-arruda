import {
  RECLAIM_MINUTOS,
  carregarDuracaoMediaPorEtapa,
  listarEtapasConcluidasRecentes,
  listarEtapasEmAndamento,
  listarPautasPorStatus,
} from "@/lib/marketing/repositorio";
import { MonitorClient } from "./monitor-client";

/**
 * Monitor de execução — carga inicial dos 3 blocos (Server Component) + duração média por etapa
 * pra estimativa de progresso. O client component (monitor-client.tsx) recebe isto como prop
 * inicial e assina Realtime em cima só de `pautas_execucao_log` pra manter "Em andamento agora" e
 * "Concluídos recentes" atualizados sem F5 (ver spec seção 7). "Na fila" não tem tabela própria em
 * Realtime — o client infere quando uma pauta "sai da fila" a partir do primeiro evento de etapa
 * que chega pra ela (ver comentário em monitor-client.tsx).
 *
 * "Na fila" reusa listarPautasPorStatus("pendente") (mesma função/ordenação — created_at desc — já
 * usada pela Fila de Pautas, Task 10). PautaCarregada não expõe prioridade_score hoje, então isto é
 * uma aproximação de "ordenadas por prioridade" (texto do brief) — ver nota de julgamento maior em
 * repositorio.ts, logo acima de listarEtapasEmAndamento.
 */
export default async function MonitorPage() {
  const [naFila, emAndamento, concluidosRecentes, duracaoMediaPorEtapa] = await Promise.all([
    listarPautasPorStatus("pendente"),
    listarEtapasEmAndamento(),
    listarEtapasConcluidasRecentes(),
    carregarDuracaoMediaPorEtapa(),
  ]);

  return (
    <MonitorClient
      naFilaInicial={naFila}
      emAndamentoInicial={emAndamento}
      concluidosInicial={concluidosRecentes}
      duracaoMediaPorEtapa={duracaoMediaPorEtapa}
      reclaimMinutos={RECLAIM_MINUTOS}
    />
  );
}
