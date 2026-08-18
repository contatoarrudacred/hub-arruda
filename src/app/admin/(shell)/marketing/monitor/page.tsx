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
 * "Na fila" reusa listarPautasPorStatus("pendente") (mesma função já usada pela Fila de Pautas,
 * Task 10). PautaCarregada não expõe prioridade_score hoje — extendê-la tocaria um tipo consumido
 * por toda tela do módulo, fora do escopo desta task (ver nota de julgamento maior em
 * repositorio.ts, logo acima de listarEtapasEmAndamento) — então esta tela não pode ordenar por
 * prioridade de verdade. Só a ORDEM é diferente da Fila de Pautas, porém: listarPautasPorStatus
 * ordena created_at DESC (mais novas primeiro, bom pra um admin escaneando a fila inteira), mas o
 * texto desta tela promete "mais antigas primeiro" — e é isso que bate com o desempate que o cron
 * realmente usa (prioridade_score desc, created_at asc; prioridade_score é 0 pra toda pauta hoje,
 * então created_at asc decide quem roda a seguir na prática). `.reverse()` no array já ordenado
 * (não um novo `.sort()`) entrega ascendente sem precisar do valor de created_at, que
 * PautaCarregada não carrega.
 */
export default async function MonitorPage() {
  const [naFilaBruta, emAndamento, concluidosRecentes, duracaoMediaPorEtapa] = await Promise.all([
    listarPautasPorStatus("pendente"),
    listarEtapasEmAndamento(),
    listarEtapasConcluidasRecentes(),
    carregarDuracaoMediaPorEtapa(),
  ]);

  // As duas leituras acima rodam em paralelo (Promise.all) — uma pauta pode virar em_producao no
  // instante entre as duas, aparecendo em AMBAS as listas seedadas. Sem Realtime pra corrigir isso
  // depois (o evento de INSERT que teria removido essa pauta de "na fila" já disparou antes desta
  // página carregar), filtra explicitamente aqui: qualquer pautaId já presente em emAndamento não
  // pode também aparecer em naFila na carga inicial.
  const pautaIdsEmAndamento = new Set(emAndamento.map((linha) => linha.pautaId));
  const naFilaOrdenada = naFilaBruta.filter((pauta) => !pautaIdsEmAndamento.has(pauta.id)).reverse();

  return (
    <MonitorClient
      naFilaInicial={naFilaOrdenada}
      emAndamentoInicial={emAndamento}
      concluidosInicial={concluidosRecentes}
      duracaoMediaPorEtapa={duracaoMediaPorEtapa}
      reclaimMinutos={RECLAIM_MINUTOS}
    />
  );
}
