"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ajuda } from "@/components/marketing/ajuda";
import { createClient } from "@/lib/supabase/client";
import type { DuracaoMediaPorEtapa, EtapaConcluida, EtapaEmAndamento, EtapaLog, PautaCarregada } from "@/lib/marketing/tipos";

const NOME_ETAPA: Record<EtapaLog, string> = {
  buscar_checklist: "Buscando checklist",
  gerar_conteudo: "Gerando conteúdo (Escritor)",
  revisar: "Revisando (Revisor)",
  inserir_links: "Inserindo links internos",
  sanitizar: "Sanitizando HTML",
  publicar: "Publicando",
  registrar_resultado: "Registrando resultado",
};

const MAX_CONCLUIDOS = 20;

const cartao =
  "rounded-xl border border-zinc-200 bg-white p-3.5 dark:border-zinc-700 dark:bg-zinc-900";
const tituloSecao = "flex items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-100";
const contagemSecao = "text-xs font-normal text-zinc-500 dark:text-zinc-400";

/** Linha crua como o evento Realtime entrega (colunas snake_case de `pautas_execucao_log`,
 * sem nenhum embed/join — só o que a própria tabela tem). */
type LinhaBruta = {
  id: string;
  pauta_id: string;
  etapa: EtapaLog;
  iniciado_em: string;
  concluido_em: string | null;
  sucesso: boolean | null;
  detalhes: string | null;
};

function formatarDuracao(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s}s`;
  const minutos = Math.floor(s / 60);
  const resto = s % 60;
  return resto > 0 ? `${minutos}min ${resto}s` : `${minutos}min`;
}

/**
 * Monitor de execução — client component que recebe a carga inicial dos 3 blocos como prop (vinda
 * do Server Component, page.tsx) e assina Realtime em `pautas_execucao_log` pra manter "Em
 * andamento agora" e "Concluídos recentes" ao vivo, sem refetch (ver spec seção 7).
 *
 * "Na fila" (pautas pendentes) NÃO tem uma tabela própria assinada via Realtime — só
 * pautas_execucao_log está habilitada pra isso (migration da Task 1). Em vez de deixar "Na fila"
 * totalmente estática até um F5, um evento de INSERT/UPDATE com concluido_em nulo (= uma etapa
 * começou pra alguma pauta) é usado como sinal indireto de que aquela pauta "saiu da fila" — ela é
 * removida de `naFila` no mesmo merge. O inverso (uma pauta voltar pra pendente após reprovação,
 * ou uma pauta pendente nova ser criada) NÃO é refletido ao vivo — isso exigiria assinar a tabela
 * `pautas`, fora do escopo desta task (só `pautas_execucao_log` tem Realtime habilitado). Registrado
 * como limitação conhecida no relatório da Task 13.
 */
export function MonitorClient({
  naFilaInicial,
  emAndamentoInicial,
  concluidosInicial,
  duracaoMediaPorEtapa,
  reclaimMinutos,
}: {
  naFilaInicial: PautaCarregada[];
  emAndamentoInicial: EtapaEmAndamento[];
  concluidosInicial: EtapaConcluida[];
  duracaoMediaPorEtapa: DuracaoMediaPorEtapa;
  reclaimMinutos: number;
}) {
  const [naFila, setNaFila] = useState<PautaCarregada[]>(naFilaInicial);
  const [emAndamento, setEmAndamento] = useState<EtapaEmAndamento[]>(emAndamentoInicial);
  const [concluidos, setConcluidos] = useState<EtapaConcluida[]>(concluidosInicial);
  const [agora, setAgora] = useState<number>(() => Date.now());

  // Nomes de pauta conhecidos a partir da carga inicial do Server Component — os eventos Realtime
  // trazem só a linha crua de pautas_execucao_log (sem join), então uma pauta que só passa a
  // existir/ser conhecida DEPOIS da carga inicial aparece com o rótulo de fallback de
  // `rotularPauta` (ver abaixo) até a página ser recarregada. Memoizado a partir das props iniciais
  // (nunca muda depois do mount), por isso é seguro incluir na dependência do efeito de assinatura
  // sem provocar re-assinatura.
  const nomesPautas = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const pauta of naFilaInicial) mapa.set(pauta.id, pauta.palavraChavePrincipal);
    for (const linha of emAndamentoInicial) mapa.set(linha.pautaId, linha.palavraChavePrincipal);
    for (const linha of concluidosInicial) mapa.set(linha.pautaId, linha.palavraChavePrincipal);
    return mapa;
  }, [naFilaInicial, emAndamentoInicial, concluidosInicial]);

  const rotularPauta = useCallback(
    (pautaId: string) => nomesPautas.get(pautaId) ?? `Pauta ${pautaId.slice(0, 8)}…`,
    [nomesPautas],
  );

  // Reamostra "agora" periodicamente pra manter o tempo decorrido (e o cruzamento do limiar
  // "possivelmente travada") atualizado mesmo sem nenhum evento Realtime novo chegar — sem isto,
  // uma etapa parada há 9min59s só passaria a aparecer como travada quando a PRÓXIMA linha
  // qualquer do log mudasse em algum lugar do sistema, o que pode não acontecer por minutos.
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel("pautas-execucao-log")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pautas_execucao_log" },
        (payload) => {
          const eventoDelete = payload.eventType === "DELETE";
          const bruta = (eventoDelete ? payload.old : payload.new) as Partial<LinhaBruta> | undefined;
          if (!bruta || typeof bruta.id !== "string") return;

          if (eventoDelete) {
            // pautas_execucao_log é append-only no fluxo normal do pipeline (ver spec seção 6) —
            // tratado aqui só defensivamente (ex.: limpeza manual no banco), removendo por id dos
            // dois buckets sem presumir em qual deles a linha estava.
            const id = bruta.id;
            setEmAndamento((atual) => atual.filter((l) => l.id !== id));
            setConcluidos((atual) => atual.filter((l) => l.id !== id));
            return;
          }

          const linha = bruta as LinhaBruta; // INSERT/UPDATE sempre trazem a linha completa em `new`
          if (linha.concluido_em) {
            // Etapa concluída: sai de "em andamento" (se estava lá) e entra/atualiza em
            // "concluídos recentes" — merge por id, mais recente primeiro, capado em MAX_CONCLUIDOS.
            setEmAndamento((atual) => atual.filter((l) => l.id !== linha.id));
            setConcluidos((atual) => {
              const semDuplicata = atual.filter((l) => l.id !== linha.id);
              const linhaConcluida: EtapaConcluida = {
                id: linha.id,
                pautaId: linha.pauta_id,
                palavraChavePrincipal: rotularPauta(linha.pauta_id),
                etapa: linha.etapa,
                iniciadoEm: linha.iniciado_em,
                concluidoEm: linha.concluido_em!,
                sucesso: linha.sucesso,
                detalhes: linha.detalhes,
              };
              return [linhaConcluida, ...semDuplicata]
                .sort((a, b) => new Date(b.concluidoEm).getTime() - new Date(a.concluidoEm).getTime())
                .slice(0, MAX_CONCLUIDOS);
            });
          } else {
            // Etapa em andamento (nova ou update intermediário raro) — merge por id.
            setEmAndamento((atual) => {
              const semDuplicata = atual.filter((l) => l.id !== linha.id);
              const linhaEmAndamento: EtapaEmAndamento = {
                id: linha.id,
                pautaId: linha.pauta_id,
                palavraChavePrincipal: rotularPauta(linha.pauta_id),
                etapa: linha.etapa,
                iniciadoEm: linha.iniciado_em,
              };
              return [linhaEmAndamento, ...semDuplicata];
            });
            // Uma etapa começou pra esta pauta — ela deixou de estar "na fila" (inferido do
            // próprio evento, ver comentário no cabeçalho do componente).
            setNaFila((atual) => atual.filter((p) => p.id !== linha.pauta_id));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [rotularPauta]);

  return (
    <div className="max-w-7xl space-y-4 p-8">
      <div className="flex items-center gap-1.5">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Monitor de execução</h1>
        <Ajuda texto="Tela ao vivo — assina o log de execução do pipeline (pautas_execucao_log) via Supabase Realtime, sem precisar recarregar a página. 'Na fila' não é atualizada por Realtime (só o log tem essa assinatura habilitada); os outros dois blocos atualizam sozinhos." />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SecaoNaFila pautas={naFila} />
        <SecaoEmAndamento
          linhas={emAndamento}
          agora={agora}
          reclaimMinutos={reclaimMinutos}
          duracaoMediaPorEtapa={duracaoMediaPorEtapa}
        />
        <SecaoConcluidos linhas={concluidos} />
      </div>
    </div>
  );
}

function SecaoNaFila({ pautas }: { pautas: PautaCarregada[] }) {
  return (
    <div className="space-y-2">
      <p className={tituloSecao}>
        Na fila <span className={contagemSecao}>({pautas.length})</span>
        <Ajuda texto="Pautas 'pendente' aguardando o próximo ciclo do cron. Ordenadas pela mesma listagem da Fila de Pautas (mais antigas primeiro)." />
      </p>
      <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
        {pautas.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma pauta pendente.</p>
        ) : (
          pautas.map((pauta) => (
            <div key={pauta.id} className={cartao}>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{pauta.palavraChavePrincipal}</p>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {pauta.angulo}
                {pauta.geografia ? ` · ${pauta.geografia}` : ""}
              </p>
              {pauta.tentativas > 0 && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  {pauta.tentativas} tentativa{pauta.tentativas > 1 ? "s" : ""} anterior{pauta.tentativas > 1 ? "es" : ""}
                  {pauta.motivoUltimaReprovacao ? `: ${pauta.motivoUltimaReprovacao}` : ""}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SecaoEmAndamento({
  linhas,
  agora,
  reclaimMinutos,
  duracaoMediaPorEtapa,
}: {
  linhas: EtapaEmAndamento[];
  agora: number;
  reclaimMinutos: number;
  duracaoMediaPorEtapa: DuracaoMediaPorEtapa;
}) {
  return (
    <div className="space-y-2">
      <p className={tituloSecao}>
        Em andamento agora <span className={contagemSecao}>({linhas.length})</span>
        <Ajuda
          texto={`Etapas com iniciado_em preenchido e concluido_em ainda vazio. Sem concluido_em pode significar "em andamento de verdade" OU "travado — a função morreu por timeout antes de fechar a linha". Distinguimos pelo tempo decorrido: mais de ${reclaimMinutos} minutos (mesmo limiar do reclaim automático) vira "possivelmente travada".`}
        />
      </p>
      <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
        {linhas.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma etapa em andamento.</p>
        ) : (
          linhas.map((linha) => (
            <ItemEmAndamento
              key={linha.id}
              linha={linha}
              agora={agora}
              reclaimMinutos={reclaimMinutos}
              duracaoMediaPorEtapa={duracaoMediaPorEtapa}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ItemEmAndamento({
  linha,
  agora,
  reclaimMinutos,
  duracaoMediaPorEtapa,
}: {
  linha: EtapaEmAndamento;
  agora: number;
  reclaimMinutos: number;
  duracaoMediaPorEtapa: DuracaoMediaPorEtapa;
}) {
  const elapsedMs = Math.max(0, agora - new Date(linha.iniciadoEm).getTime());
  const elapsedMinutos = elapsedMs / 60_000;
  const travada = elapsedMinutos >= reclaimMinutos;
  const mediaSegundos = duracaoMediaPorEtapa[linha.etapa];
  // `mediaSegundos !== undefined && > 0` (não um truthy check simples): um valor de 0s é um dado
  // histórico legítimo (etapa quase instantânea) e não pode ser confundido com "sem dados" — e
  // dividir por 0 geraria Infinity/NaN no cálculo do progresso.
  const progresso =
    mediaSegundos !== undefined && mediaSegundos > 0
      ? Math.min(100, Math.round(((elapsedMs / 1000) / mediaSegundos) * 100))
      : null;

  return (
    <div className={cartao}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{linha.palavraChavePrincipal}</p>
        {travada ? (
          <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            Possivelmente travada
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            Em andamento
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        {NOME_ETAPA[linha.etapa]} — iniciado há {formatarDuracao(elapsedMs / 1000)}
      </p>

      {travada && (
        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
          Sem conclusão registrada há mais de {reclaimMinutos} minutos — se for mesmo timeout, o reclaim automático
          libera esta pauta pro próximo ciclo do cron.
        </p>
      )}

      {progresso === null ? (
        <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">Sem dados históricos desta etapa ainda.</p>
      ) : (
        <div className="mt-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={`h-full rounded-full ${travada ? "bg-red-400 dark:bg-red-600" : "bg-blue-500 dark:bg-blue-400"}`}
              style={{ width: `${progresso}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            ~{progresso}% do tempo médio desta etapa (média: {formatarDuracao(mediaSegundos!)})
          </p>
        </div>
      )}
    </div>
  );
}

function SecaoConcluidos({ linhas }: { linhas: EtapaConcluida[] }) {
  return (
    <div className="space-y-2">
      <p className={tituloSecao}>
        Concluídos recentes <span className={contagemSecao}>({linhas.length})</span>
        <Ajuda texto="Últimas etapas concluídas do log (sucesso ou falha), mais recente primeiro — não agrupado por pauta de propósito, pra manter a ordem cronológica de um feed ao vivo." />
      </p>
      <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
        {linhas.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma etapa concluída ainda.</p>
        ) : (
          linhas.map((linha) => <ItemConcluido key={linha.id} linha={linha} />)
        )}
      </div>
    </div>
  );
}

function ItemConcluido({ linha }: { linha: EtapaConcluida }) {
  const duracaoSegundos = (new Date(linha.concluidoEm).getTime() - new Date(linha.iniciadoEm).getTime()) / 1000;
  return (
    <div className={cartao}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{linha.palavraChavePrincipal}</p>
        {linha.sucesso === false ? (
          <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            Falhou
          </span>
        ) : linha.sucesso === true ? (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            OK
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            —
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        {NOME_ETAPA[linha.etapa]} — levou {formatarDuracao(duracaoSegundos)}
      </p>
      {linha.sucesso === false && linha.detalhes && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">Motivo: {linha.detalhes}</p>
      )}
    </div>
  );
}
