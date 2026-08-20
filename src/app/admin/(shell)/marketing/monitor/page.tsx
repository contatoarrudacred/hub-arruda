import {
  RECLAIM_MINUTOS,
  carregarDuracaoMediaPorEtapa,
  listarPautasConcluidasRecentes,
  listarPautasEmAndamento,
  listarPautasPorStatus,
} from "@/lib/marketing/repositorio";
import { MonitorClient } from "./monitor-client";

/**
 * Monitor de execução — carga inicial dos 3 blocos (Server Component) + duração média por etapa
 * pra estimativa de progresso. Redesenho de 19/08/2026 (pedido do Luiz): "Em andamento agora" e
 * "Concluídos recentes" agora são 1 card por PAUTA (com uma timeline de etapas dentro), não mais 1
 * card por linha de log — o client component (monitor-client.tsx) assina Realtime em
 * `pautas_execucao_log` (novas etapas) E `pautas` (mudança de status, migration
 * 20260819190000) pra mover um card entre colunas sem F5.
 *
 * "Na fila" reusa listarPautasPorStatus("pendente") (mesma função já usada pela Fila de Pautas,
 * Task 10), mas agora filtra pra só pautas NUNCA tentadas (`tentativas === 0`) — uma pauta
 * "pendente" que já tentou antes (aguardando o próximo ciclo depois de uma reprovação) pertence a
 * "Em andamento agora" (ver listarPautasEmAndamento), não à fila. PautaCarregada não expõe
 * prioridade_score hoje — extendê-la tocaria um tipo consumido por toda tela do módulo, fora do
 * escopo desta task — então esta tela não pode ordenar por prioridade de verdade. Só a ORDEM é
 * diferente da Fila de Pautas, porém: listarPautasPorStatus ordena created_at DESC (mais novas
 * primeiro), mas o texto desta tela promete "mais antigas primeiro" — e é isso que bate com o
 * desempate que o cron realmente usa (prioridade_score desc, created_at asc; prioridade_score é 0
 * pra toda pauta hoje, então created_at asc decide quem roda a seguir na prática). `.reverse()` no
 * array já ordenado (não um novo `.sort()`) entrega ascendente sem precisar do valor de
 * created_at, que PautaCarregada não carrega.
 */
export default async function MonitorPage() {
  const [naFilaBruta, emAndamento, concluidosRecentes, duracaoMediaPorEtapa] = await Promise.all([
    listarPautasPorStatus("pendente"),
    listarPautasEmAndamento(),
    listarPautasConcluidasRecentes(),
    carregarDuracaoMediaPorEtapa(),
  ]);

  const naFilaOrdenada = naFilaBruta.filter((pauta) => pauta.tentativas === 0).reverse();

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
