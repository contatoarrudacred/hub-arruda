"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ajuda } from "@/components/marketing/ajuda";
import { createClient } from "@/lib/supabase/client";
import type {
  DetalhesPostVisualizacao,
  DuracaoMediaPorEtapa,
  EtapaLog,
  EtapaTimeline,
  FunilPauta,
  PautaCarregada,
  PautaConcluida,
  PautaEmAndamento,
  StatusPauta,
  TipoConteudo,
} from "@/lib/marketing/tipos";
import { carregarDetalhesPostVisualizacaoAction } from "./actions";

const NOME_ETAPA: Record<EtapaLog, string> = {
  buscar_checklist: "Buscando checklist",
  // "gerar_conteudo" tem rótulo dinâmico (ver rotularEtapa) — 1ª tentativa é "Gerando", tentativas
  // seguintes (correção) são "Ajustando". Esta entrada só existe pra Record<EtapaLog, string> ficar
  // completo; rotularEtapa nunca lê esta chave em produção.
  gerar_conteudo: "Gerando conteúdo (Escritor)",
  // Verificação de links externos (19/08/2026, pedido do Luiz) — entre gerar_conteudo e revisar,
  // ver links-externos.ts.
  verificar_links: "Verificando links externos",
  revisar: "Revisando (Revisor)",
  inserir_links: "Inserindo links internos",
  sanitizar: "Sanitizando HTML",
  // Fase 4a+4b, Task 10 (19/08/2026) — capa + imagens secundárias + upload WordPress + schema
  // Article/Organization, ver processar-pauta.ts.
  gerar_imagens: "Gerando imagens (capa + secundárias)",
  // Fase 4e, Agente Agendador (20/08/2026) — só aparece quando a propriedade tem horários de
  // publicação configurados, ver decidirProximoHorario em agendador.ts.
  agendar: "Agendando publicação",
  publicar: "Publicando",
  registrar_resultado: "Registrando resultado",
};

const NOME_STATUS_FINAL: Record<StatusPauta, string> = {
  pendente: "Pendente",
  em_producao: "Em produção",
  publicado: "Publicado",
  rejeitado: "Rejeitado",
  bloqueada: "Bloqueada",
};

const NOME_FUNIL: Record<FunilPauta, string> = {
  topo: "Topo de funil",
  meio: "Meio de funil",
  fundo: "Fundo de funil",
};

const NOME_TIPO_CONTEUDO: Record<TipoConteudo, string> = {
  post_padrao: "Post padrão",
  post_storytelling: "Post storytelling",
  pagina_servico: "Página de serviço",
  pagina_geografica: "Página geográfica",
  homepage: "Homepage",
};

const MAX_CONCLUIDOS = 20;

// Acima disto, o texto de detalhes (motivo do Revisor ou relatório do Escritor) começa colapsado
// com botão "expandir" — pedido do Luiz: esses relatórios tendem a ficar grandes e "tomar conta"
// da tela quando há vários numa mesma timeline.
const LIMITE_TEXTO_COLAPSADO = 220;

const cartao =
  "rounded-xl border border-zinc-200 bg-white p-3.5 dark:border-zinc-700 dark:bg-zinc-900";
const tituloSecao = "flex items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-100";
const contagemSecao = "text-xs font-normal text-zinc-500 dark:text-zinc-400";

/** Linha crua como o evento Realtime de `pautas_execucao_log` entrega (colunas snake_case, sem
 * nenhum embed/join). */
type LinhaLogBruta = {
  id: string;
  pauta_id: string;
  etapa: EtapaLog;
  iniciado_em: string;
  concluido_em: string | null;
  sucesso: boolean | null;
  detalhes: string | null;
};

/** Linha crua como o evento Realtime de `pautas` entrega (migration 20260819190000). Só os campos
 * que o Monitor precisa pra decidir se um card muda de coluna. */
type LinhaPautaBruta = {
  id: string;
  palavra_chave_principal: string;
  status: StatusPauta;
  tentativas: number;
  motivo_ultima_reprovacao: string | null;
  atualizado_em: string;
};

const STATUS_FINAL: StatusPauta[] = ["publicado", "bloqueada", "rejeitado"];

/**
 * Normaliza um timestamptz cru vindo do Realtime pro formato ISO-8601 ("...T...") que o resto do
 * código assume. `@supabase/realtime-js` NÃO converte colunas `timestamptz` (só `timestamp` sem
 * fuso recebe o replace de espaço por "T") — então uma linha vinda de um evento INSERT/UPDATE ao
 * vivo chega como `"2026-08-18 10:00:00+00"` (separador espaço, offset de só 2 dígitos quando é
 * hora cheia), enquanto a mesma coluna na carga inicial (PostgREST, via page.tsx) já chega como
 * `"2026-08-18T10:00:00+00:00"` (ISO completo). As duas normalizações (separador E offset) são
 * necessárias juntas.
 */
function paraIso(valor: string): string {
  if (valor.includes("T")) return valor; // já ISO — veio do PostgREST (carga inicial)
  const comSeparadorIso = valor.replace(" ", "T");
  return comSeparadorIso.replace(/([+-]\d{2})$/, "$1:00");
}

/** `new Date(valor).getTime()`, mas devolve `null` (em vez de `NaN`) quando o valor não é um
 * instante válido. */
function paraInstanteOuNulo(valor: string): number | null {
  const ms = new Date(valor).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** `segundos` pode chegar `NaN`/`Infinity` se algum timestamp upstream não parseou — degrade pra
 * um traço neutro em vez de renderizar "NaNs"/"NaNmin". */
function formatarDuracao(segundos: number): string {
  if (!Number.isFinite(segundos)) return "—";
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s}s`;
  const minutos = Math.floor(s / 60);
  const resto = s % 60;
  return resto > 0 ? `${minutos}min ${resto}s` : `${minutos}min`;
}

function mapearEtapaLinhaBruta(linha: LinhaLogBruta): EtapaTimeline {
  return {
    id: linha.id,
    etapa: linha.etapa,
    iniciadoEm: paraIso(linha.iniciado_em),
    concluidoEm: linha.concluido_em ? paraIso(linha.concluido_em) : null,
    sucesso: linha.sucesso,
    detalhes: linha.detalhes,
  };
}

/** Rótulo de uma etapa, considerando o número da tentativa a que ela pertence — só
 * "gerar_conteudo" muda de rótulo (pedido do Luiz, 19/08/2026): o Escritor tem dois papéis, "está
 * ESCREVENDO pela primeira vez" (1ª tentativa) vs "está AJUSTANDO o que já escreveu, seguindo o
 * apontamento do Revisor" (tentativas seguintes) — visualmente bem diferente pra quem acompanha o
 * Monitor ao vivo. */
function rotularEtapa(etapa: EtapaLog, numeroTentativa: number): string {
  if (etapa === "gerar_conteudo") {
    return numeroTentativa <= 1 ? "Gerando conteúdo (Escritor)" : "Ajustando conteúdo (Escritor)";
  }
  return NOME_ETAPA[etapa];
}

type GrupoTentativa = { numero: number; etapas: EtapaTimeline[] };

/**
 * Agrupa uma timeline plana de etapas por TENTATIVA (pedido do Luiz: rótulos "1ª tentativa", "2ª
 * tentativa"...) — cada ciclo completo (gerar→revisar→...) começa com "buscar_checklist" (a
 * primeira etapa que processar-pauta.ts registra em cada iteração do loop, ver processar-pauta.ts),
 * então usamos essa etapa como fronteira de grupo. Caso raro (caminho de reaproveitamento total —
 * `posts.pronto_para_publicar`, publica direto sem regenerar nada): as etapas finais (publicar,
 * registrar_resultado) não vêm precedidas de um novo "buscar_checklist" e acabam anexadas ao último
 * grupo real — imprecisão aceitável, é o único caso em que uma "tentativa" não tem geração própria.
 */
function agruparPorTentativa(etapasOrdenadas: EtapaTimeline[]): GrupoTentativa[] {
  const grupos: GrupoTentativa[] = [];
  let atual: EtapaTimeline[] = [];
  let numero = 0;
  for (const etapa of etapasOrdenadas) {
    if (etapa.etapa === "buscar_checklist") {
      if (atual.length > 0) grupos.push({ numero: numero || 1, etapas: atual });
      numero += 1;
      atual = [etapa];
    } else {
      atual.push(etapa);
    }
  }
  if (atual.length > 0) grupos.push({ numero: numero || 1, etapas: atual });
  return grupos;
}

/**
 * Monitor de execução — redesenho de 19/08/2026 (pedido do Luiz): 1 card por PAUTA em "Em
 * andamento agora" e "Concluídos recentes" (não mais 1 card por linha de log — o desenho anterior
 * fazia uma pauta com várias tentativas aparecer repetida em dezenas de cards separados,
 * confuso). Cada card de "Em andamento" mostra uma TIMELINE vertical das etapas já rodadas +
 * a etapa atual com um ícone animado; um card só migra pra "Concluídos" quando a pauta atinge um
 * desfecho final (publicado/bloqueada/rejeitado).
 *
 * Duas assinaturas Realtime: `pautas_execucao_log` (toda nova etapa/atualização de etapa) e
 * `pautas` (migration 20260819190000 — mudança de status, é o sinal de "a pauta chegou a um
 * desfecho final" que move o card de coluna). Sem a segunda, não haveria como saber ao vivo QUANDO
 * mover um card — só as etapas de log não capturam o desfecho da pauta em si.
 */
export function MonitorClient({
  naFilaInicial,
  emAndamentoInicial,
  concluidosInicial,
  duracaoMediaPorEtapa,
  reclaimMinutos,
}: {
  naFilaInicial: PautaCarregada[];
  emAndamentoInicial: PautaEmAndamento[];
  concluidosInicial: PautaConcluida[];
  duracaoMediaPorEtapa: DuracaoMediaPorEtapa;
  reclaimMinutos: number;
}) {
  const [naFila, setNaFila] = useState<PautaCarregada[]>(naFilaInicial);
  const [emAndamento, setEmAndamento] = useState<PautaEmAndamento[]>(emAndamentoInicial);
  const [concluidos, setConcluidos] = useState<PautaConcluida[]>(concluidosInicial);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [agora, setAgora] = useState<number>(() => Date.now());
  // Botão "Visualizar Post" (pedido do Luiz) — guarda só o par (id, rótulo) da pauta aberta na
  // modal; os dados de fato (quadro-resumo + post) são buscados sob demanda por ModalVisualizarPost.
  const [visualizando, setVisualizando] = useState<{ pautaId: string; palavraChavePrincipal: string } | null>(null);

  // Nomes de pauta conhecidos a partir da carga inicial — um evento de `pautas_execucao_log` sobre
  // uma pauta totalmente nova (criada e já com uma etapa rodando entre a carga inicial e agora)
  // não traz o nome junto (a tabela de log não guarda isso) — usa este fallback até a próxima F5.
  const nomesPautas = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const pauta of naFilaInicial) mapa.set(pauta.id, pauta.palavraChavePrincipal);
    for (const p of emAndamentoInicial) mapa.set(p.pautaId, p.palavraChavePrincipal);
    for (const p of concluidosInicial) mapa.set(p.pautaId, p.palavraChavePrincipal);
    return mapa;
  }, [naFilaInicial, emAndamentoInicial, concluidosInicial]);

  const rotularPauta = useCallback(
    (pautaId: string) => nomesPautas.get(pautaId) ?? `Pauta ${pautaId.slice(0, 8)}…`,
    [nomesPautas],
  );

  // Reamostra "agora" periodicamente pra manter o tempo decorrido (e o cruzamento do limiar
  // "possivelmente travada") atualizado mesmo sem nenhum evento Realtime novo chegar.
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    const canalLog = supabase
      .channel("pautas-execucao-log")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pautas_execucao_log" },
        (payload) => {
          const eventoDelete = payload.eventType === "DELETE";
          const bruta = (eventoDelete ? payload.old : payload.new) as Partial<LinhaLogBruta> | undefined;
          if (!bruta || typeof bruta.id !== "string" || typeof bruta.pauta_id !== "string") return;

          if (eventoDelete) {
            // pautas_execucao_log é append-only no fluxo normal (ver spec seção 6) — tratado aqui
            // só defensivamente (ex.: limpeza manual no banco), removendo a etapa por id de
            // qualquer pauta em que ela apareça, nos dois buckets.
            const id = bruta.id;
            setEmAndamento((atual) => atual.map((p) => ({ ...p, etapas: p.etapas.filter((e) => e.id !== id) })));
            setConcluidos((atual) => atual.map((p) => ({ ...p, etapas: p.etapas.filter((e) => e.id !== id) })));
            return;
          }

          const linha = bruta as LinhaLogBruta; // INSERT/UPDATE sempre trazem a linha completa em `new`
          const etapaNova = mapearEtapaLinhaBruta(linha);

          setEmAndamento((atual) => {
            const pautaExiste = atual.some((p) => p.pautaId === linha.pauta_id);
            if (pautaExiste) {
              // Merge por id dentro da timeline da pauta já conhecida.
              return atual.map((p) =>
                p.pautaId === linha.pauta_id
                  ? { ...p, etapas: [...p.etapas.filter((e) => e.id !== etapaNova.id), etapaNova] }
                  : p,
              );
            }
            // Pauta nova (1ª etapa dela chegando agora) — cria o card. tentativas: 0 é um chute
            // razoável (o valor real só chega no próximo evento de `pautas`, se a pauta reprovar e
            // voltar) — não bloqueia a renderização, só o contador "Nª tentativa" fica impreciso
            // por um instante.
            return [{ pautaId: linha.pauta_id, palavraChavePrincipal: rotularPauta(linha.pauta_id), tentativas: 0, etapas: [etapaNova] }, ...atual];
          });

          // Uma etapa começou pra esta pauta — ela deixou de estar "na fila" (inferido do próprio
          // evento; a fila não tem Realtime próprio).
          setNaFila((atual) => atual.filter((p) => p.id !== linha.pauta_id));
        },
      )
      .subscribe();

    const canalPautas = supabase
      .channel("pautas-status")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pautas" },
        (payload) => {
          const bruta = payload.new as Partial<LinhaPautaBruta> | undefined;
          if (!bruta || typeof bruta.id !== "string" || typeof bruta.status !== "string") return;

          if (STATUS_FINAL.includes(bruta.status)) {
            // Desfecho final — move o card de "em andamento" pra "concluídos", carregando a
            // timeline já acumulada junto.
            setEmAndamento((atual) => {
              const pauta = atual.find((p) => p.pautaId === bruta.id);
              if (!pauta) return atual; // pauta concluiu sem nunca ter aparecido aqui (raro) — nada a mover
              setConcluidos((concluidosAtuais) => {
                const semDuplicata = concluidosAtuais.filter((p) => p.pautaId !== bruta.id);
                const nova: PautaConcluida = {
                  pautaId: pauta.pautaId,
                  palavraChavePrincipal: pauta.palavraChavePrincipal,
                  status: bruta.status as StatusPauta,
                  motivoUltimaReprovacao: bruta.motivo_ultima_reprovacao ?? null,
                  concluidoEm: bruta.atualizado_em ? paraIso(bruta.atualizado_em) : new Date().toISOString(),
                  etapas: pauta.etapas,
                };
                return [nova, ...semDuplicata]
                  .sort((a, b) => (paraInstanteOuNulo(b.concluidoEm) ?? 0) - (paraInstanteOuNulo(a.concluidoEm) ?? 0))
                  .slice(0, MAX_CONCLUIDOS);
              });
              return atual.filter((p) => p.pautaId !== bruta.id);
            });
          }
          // status pendente/em_producao: a pauta já deveria estar em "em andamento" (criada pelo
          // primeiro evento de log) — nada a fazer aqui além de deixá-la lá.
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalLog);
      supabase.removeChannel(canalPautas);
    };
  }, [rotularPauta]);

  const alternarExpandido = useCallback((pautaId: string) => {
    setExpandidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(pautaId)) novo.delete(pautaId);
      else novo.add(pautaId);
      return novo;
    });
  }, []);

  return (
    <div className="max-w-7xl space-y-4 p-8">
      <div className="flex items-center gap-1.5">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Monitor de execução</h1>
        <Ajuda texto="Tela ao vivo — assina pautas_execucao_log (novas etapas) e pautas (mudança de status) via Supabase Realtime, sem precisar recarregar a página. 'Na fila' não é atualizada por Realtime; os outros dois blocos atualizam sozinhos." />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SecaoNaFila pautas={naFila} />
        <SecaoEmAndamento
          pautas={emAndamento}
          agora={agora}
          reclaimMinutos={reclaimMinutos}
          duracaoMediaPorEtapa={duracaoMediaPorEtapa}
          onVisualizarPost={setVisualizando}
        />
        <SecaoConcluidos
          pautas={concluidos}
          expandidos={expandidos}
          onAlternarExpandido={alternarExpandido}
          onVisualizarPost={setVisualizando}
        />
      </div>

      {visualizando && (
        <ModalVisualizarPost
          pautaId={visualizando.pautaId}
          palavraChavePrincipal={visualizando.palavraChavePrincipal}
          onFechar={() => setVisualizando(null)}
        />
      )}
    </div>
  );
}

function SecaoNaFila({ pautas }: { pautas: PautaCarregada[] }) {
  return (
    <div className="space-y-2">
      <p className={tituloSecao}>
        Na fila <span className={contagemSecao}>({pautas.length})</span>
        <Ajuda texto="Pautas 'pendente' que ainda nunca foram tentadas, aguardando o próximo ciclo do cron. Ordenadas pela mesma listagem da Fila de Pautas (mais antigas primeiro)." />
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
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Spinner circular simples (ícone em movimento pedido pelo Luiz) — indica visualmente qual etapa
 * da timeline está rodando agora, sem depender de nenhuma lib externa. */
function IconeGirando({ cor }: { cor: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${cor}`}
    />
  );
}

/** Botão "Visualizar Post" (pedido do Luiz) — igual nos dois tipos de card, sempre no topo. */
function BotaoVisualizarPost({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      Visualizar post
    </button>
  );
}

function SecaoEmAndamento({
  pautas,
  agora,
  reclaimMinutos,
  duracaoMediaPorEtapa,
  onVisualizarPost,
}: {
  pautas: PautaEmAndamento[];
  agora: number;
  reclaimMinutos: number;
  duracaoMediaPorEtapa: DuracaoMediaPorEtapa;
  onVisualizarPost: (alvo: { pautaId: string; palavraChavePrincipal: string }) => void;
}) {
  return (
    <div className="space-y-2">
      <p className={tituloSecao}>
        Em andamento agora <span className={contagemSecao}>({pautas.length})</span>
        <Ajuda texto={`Pautas com pelo menos uma tentativa já iniciada e sem desfecho final — uma reprovação de conteúdo não tira o card daqui, só acrescenta linhas na timeline. Etapa sem conclusão há mais de ${reclaimMinutos} minutos (mesmo limiar do reclaim automático) vira "possivelmente travada".`} />
      </p>
      <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
        {pautas.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma pauta em andamento.</p>
        ) : (
          pautas.map((pauta) => (
            <CardEmAndamento
              key={pauta.pautaId}
              pauta={pauta}
              agora={agora}
              reclaimMinutos={reclaimMinutos}
              duracaoMediaPorEtapa={duracaoMediaPorEtapa}
              onVisualizarPost={onVisualizarPost}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CardEmAndamento({
  pauta,
  agora,
  reclaimMinutos,
  duracaoMediaPorEtapa,
  onVisualizarPost,
}: {
  pauta: PautaEmAndamento;
  agora: number;
  reclaimMinutos: number;
  duracaoMediaPorEtapa: DuracaoMediaPorEtapa;
  onVisualizarPost: (alvo: { pautaId: string; palavraChavePrincipal: string }) => void;
}) {
  const etapasOrdenadas = useMemo(
    () => [...pauta.etapas].sort((a, b) => (paraInstanteOuNulo(a.iniciadoEm) ?? 0) - (paraInstanteOuNulo(b.iniciadoEm) ?? 0)),
    [pauta.etapas],
  );
  const grupos = useMemo(() => agruparPorTentativa(etapasOrdenadas), [etapasOrdenadas]);
  const etapaAtual = etapasOrdenadas.find((e) => e.concluidoEm === null);
  const numeroTentativaAtual = grupos.find((g) => g.etapas.some((e) => e.id === etapaAtual?.id))?.numero ?? 1;
  const iniciadoEmMs = etapaAtual ? paraInstanteOuNulo(etapaAtual.iniciadoEm) : null;
  const elapsedMs = iniciadoEmMs !== null ? Math.max(0, agora - iniciadoEmMs) : null;
  const elapsedMinutos = elapsedMs !== null ? elapsedMs / 60_000 : null;
  const travada = elapsedMinutos !== null && elapsedMinutos >= reclaimMinutos;
  const mediaSegundos = etapaAtual ? duracaoMediaPorEtapa[etapaAtual.etapa] : undefined;
  const progresso =
    etapaAtual && elapsedMs !== null && mediaSegundos !== undefined && mediaSegundos > 0
      ? Math.min(100, Math.round(((elapsedMs / 1000) / mediaSegundos) * 100))
      : null;

  return (
    <div className={cartao}>
      <div className="flex items-start justify-between gap-2">
        <BotaoVisualizarPost onClick={() => onVisualizarPost({ pautaId: pauta.pautaId, palavraChavePrincipal: pauta.palavraChavePrincipal })} />
        <div className="flex shrink-0 items-center gap-1.5">
          {pauta.tentativas > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              {pauta.tentativas}ª retentativa
            </span>
          )}
          {travada ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              Possivelmente travada
            </span>
          ) : etapaAtual ? (
            <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              <IconeGirando cor="text-blue-700 dark:text-blue-300" />
              Em andamento
            </span>
          ) : null}
        </div>
      </div>

      <p className="mt-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-50">{pauta.palavraChavePrincipal}</p>

      {progresso !== null && etapaAtual && !travada && (
        <div className="mt-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div className="h-full rounded-full bg-blue-500 dark:bg-blue-400" style={{ width: `${progresso}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            ~{progresso}% do tempo médio de {rotularEtapa(etapaAtual.etapa, numeroTentativaAtual)} (média: {formatarDuracao(mediaSegundos!)})
          </p>
        </div>
      )}

      <div className="mt-2 space-y-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
        {grupos.map((grupo) => (
          <div key={grupo.numero}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{grupo.numero}ª tentativa</p>
            <div className="mt-1 space-y-1.5">
              {grupo.etapas.map((etapa) => (
                <LinhaTimeline
                  key={etapa.id}
                  etapa={etapa}
                  numeroTentativa={grupo.numero}
                  emAndamento={etapa.id === etapaAtual?.id}
                  travada={etapa.id === etapaAtual?.id && travada}
                  reclaimMinutos={reclaimMinutos}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Texto de detalhes (motivo do Revisor ou relatório do Escritor) — colapsado com botão "expandir"
 * acima de LIMITE_TEXTO_COLAPSADO caracteres, e um botão "copiar" pra área de transferência
 * (pedido do Luiz: esses relatórios tendem a ficar grandes e o usuário quer poder colar em outro
 * lugar pra ler/comparar com calma). */
function TextoColapsavel({ texto }: { texto: string }) {
  const [expandido, setExpandido] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const longo = texto.length > LIMITE_TEXTO_COLAPSADO;
  const exibido = expandido || !longo ? texto : `${texto.slice(0, LIMITE_TEXTO_COLAPSADO).trimEnd()}…`;

  const copiar = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard
        .writeText(texto)
        .then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        })
        .catch(() => {
          // Clipboard indisponível (ex.: contexto não-seguro/permissão negada) — falha silenciosa,
          // não vale quebrar a tela por causa de um botão secundário de conveniência.
        });
    },
    [texto],
  );

  return (
    <div className="mt-0.5">
      <p className="whitespace-pre-line text-[11px] text-zinc-500 dark:text-zinc-400">{exibido}</p>
      <div className="mt-0.5 flex items-center gap-2">
        {longo && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpandido((v) => !v);
            }}
            className="text-[10px] font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            {expandido ? "recolher" : "expandir"}
          </button>
        )}
        <button type="button" onClick={copiar} className="text-[10px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
          {copiado ? "copiado!" : "copiar"}
        </button>
      </div>
    </div>
  );
}

/** Uma linha da timeline dentro de um card — timestamp, nome da etapa, status (com cor/emoji/ícone
 * animado) e tempo que levou, exatamente o formato pedido pelo Luiz. */
function LinhaTimeline({
  etapa,
  numeroTentativa,
  emAndamento,
  travada,
  reclaimMinutos,
}: {
  etapa: EtapaTimeline;
  numeroTentativa: number;
  emAndamento: boolean;
  travada: boolean;
  reclaimMinutos: number;
}) {
  const iniciadoEmMs = paraInstanteOuNulo(etapa.iniciadoEm);
  const concluidoEmMs = etapa.concluidoEm ? paraInstanteOuNulo(etapa.concluidoEm) : null;
  const duracaoSegundos =
    concluidoEmMs !== null && iniciadoEmMs !== null ? (concluidoEmMs - iniciadoEmMs) / 1000 : null;
  const horaInicio = iniciadoEmMs !== null ? new Date(iniciadoEmMs).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

  // reprovacaoDeNegocio: só a etapa "revisar" tem essa semântica (sucesso técnico mas reprovação
  // de conteúdo, ver comentário em registrarEtapa, repositorio.ts). Outras etapas (gerar_conteudo,
  // gerar_imagens) também preenchem `detalhes` com sucesso:true — mas ali é um RELATÓRIO
  // informativo (o que foi feito, ou uma degradação aceitável como "capa não subiu"), não uma
  // rejeição — sem esta checagem por etapa, todo relatório do Escritor apareceria com o ícone de
  // "reprovado" (🔁) por engano.
  const reprovacaoDeNegocio = etapa.etapa === "revisar" && etapa.sucesso === true && Boolean(etapa.detalhes);

  let icone: React.ReactNode;
  let corTexto = "text-zinc-600 dark:text-zinc-400";
  if (emAndamento) {
    icone = <IconeGirando cor={travada ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"} />;
    corTexto = travada ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400";
  } else if (etapa.sucesso === false) {
    icone = <span aria-hidden>❌</span>;
    corTexto = "text-red-600 dark:text-red-400";
  } else if (reprovacaoDeNegocio) {
    icone = <span aria-hidden>🔁</span>;
    corTexto = "text-amber-600 dark:text-amber-400";
  } else {
    icone = <span aria-hidden>✅</span>;
    corTexto = "text-emerald-600 dark:text-emerald-400";
  }

  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="mt-0.5 shrink-0 tabular-nums text-zinc-400 dark:text-zinc-500">{horaInicio}</span>
      <span className="mt-0.5 shrink-0">{icone}</span>
      <div className="min-w-0 flex-1">
        <p className={corTexto}>
          {rotularEtapa(etapa.etapa, numeroTentativa)}
          {duracaoSegundos !== null && <span className="text-zinc-400 dark:text-zinc-500"> — {formatarDuracao(duracaoSegundos)}</span>}
          {emAndamento && !travada && <span className="text-zinc-400 dark:text-zinc-500"> — rodando…</span>}
          {travada && <span> — sem conclusão há mais de {reclaimMinutos}min</span>}
        </p>
        {/* Detalhes aparece sempre que existe — não só em falha/reprovação: é aqui que o relatório
            do Escritor (o que ele diz ter feito) e o motivo do Revisor (o que ele pediu) ficam
            visíveis lado a lado na timeline, pra cruzar um com o outro (pedido do Luiz). */}
        {etapa.detalhes && <TextoColapsavel texto={etapa.detalhes} />}
      </div>
    </div>
  );
}

function SecaoConcluidos({
  pautas,
  expandidos,
  onAlternarExpandido,
  onVisualizarPost,
}: {
  pautas: PautaConcluida[];
  expandidos: Set<string>;
  onAlternarExpandido: (pautaId: string) => void;
  onVisualizarPost: (alvo: { pautaId: string; palavraChavePrincipal: string }) => void;
}) {
  return (
    <div className="space-y-2">
      <p className={tituloSecao}>
        Concluídos recentes <span className={contagemSecao}>({pautas.length})</span>
        <Ajuda texto="Pautas que chegaram a um desfecho final (publicada, bloqueada, ou reprovada sem mais tentativas), mais recente primeiro. Expanda um card pra ver o histórico completo de etapas de todas as tentativas." />
      </p>
      <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
        {pautas.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma pauta concluída ainda.</p>
        ) : (
          pautas.map((pauta) => (
            <CardConcluido
              key={pauta.pautaId}
              pauta={pauta}
              expandido={expandidos.has(pauta.pautaId)}
              onAlternarExpandido={() => onAlternarExpandido(pauta.pautaId)}
              onVisualizarPost={onVisualizarPost}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CardConcluido({
  pauta,
  expandido,
  onAlternarExpandido,
  onVisualizarPost,
}: {
  pauta: PautaConcluida;
  expandido: boolean;
  onAlternarExpandido: () => void;
  onVisualizarPost: (alvo: { pautaId: string; palavraChavePrincipal: string }) => void;
}) {
  const etapasOrdenadas = useMemo(
    () => [...pauta.etapas].sort((a, b) => (paraInstanteOuNulo(a.iniciadoEm) ?? 0) - (paraInstanteOuNulo(b.iniciadoEm) ?? 0)),
    [pauta.etapas],
  );
  const grupos = useMemo(() => agruparPorTentativa(etapasOrdenadas), [etapasOrdenadas]);
  const primeiraEtapaMs = etapasOrdenadas[0] ? paraInstanteOuNulo(etapasOrdenadas[0].iniciadoEm) : null;
  const concluidoEmMs = paraInstanteOuNulo(pauta.concluidoEm);
  const tempoTotalSegundos = primeiraEtapaMs !== null && concluidoEmMs !== null ? (concluidoEmMs - primeiraEtapaMs) / 1000 : NaN;

  const publicado = pauta.status === "publicado";
  const badge = publicado ? (
    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
      ✅ Publicado
    </span>
  ) : pauta.status === "bloqueada" ? (
    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
      🚫 Bloqueada
    </span>
  ) : (
    <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {NOME_STATUS_FINAL[pauta.status]}
    </span>
  );

  return (
    <div className={cartao}>
      <div className="flex items-start justify-between gap-2">
        <BotaoVisualizarPost onClick={() => onVisualizarPost({ pautaId: pauta.pautaId, palavraChavePrincipal: pauta.palavraChavePrincipal })} />
        {badge}
      </div>

      <button type="button" onClick={onAlternarExpandido} className="mt-1.5 flex w-full items-start justify-between gap-2 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{pauta.palavraChavePrincipal}</p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Levou {formatarDuracao(tempoTotalSegundos)} no total ({etapasOrdenadas.length} etapa{etapasOrdenadas.length === 1 ? "" : "s"})
          </p>
        </div>
        <span className="shrink-0 text-zinc-400">{expandido ? "▲" : "▼"}</span>
      </button>

      {!publicado && pauta.motivoUltimaReprovacao && (
        <p className="mt-1.5 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">{pauta.motivoUltimaReprovacao}</p>
      )}

      {expandido && (
        <div className="mt-2 space-y-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
          {grupos.map((grupo) => (
            <div key={grupo.numero}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{grupo.numero}ª tentativa</p>
              <div className="mt-1 space-y-1.5">
                {grupo.etapas.map((etapa) => (
                  <LinhaTimeline key={etapa.id} etapa={etapa} numeroTentativa={grupo.numero} emAndamento={false} travada={false} reclaimMinutos={0} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Modal "Visualizar Post" (pedido do Luiz, 19/08/2026) — quadro-resumo da pauta (persona, ângulo,
 * título, slug...) + o post como está agora (rascunho em andamento ou já publicado), com imagens e
 * legendas. Busca sob demanda via server action (não faz parte da carga inicial nem do Realtime —
 * só é preciso quando o usuário efetivamente clica em "Visualizar post" de um card específico).
 */
function ModalVisualizarPost({
  pautaId,
  palavraChavePrincipal,
  onFechar,
}: {
  pautaId: string;
  palavraChavePrincipal: string;
  onFechar: () => void;
}) {
  const [dados, setDados] = useState<DetalhesPostVisualizacao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let cancelado = false;
    // Promise.resolve().then(...) empurra o reset de estado + fetch pra fora da execução síncrona
    // do efeito (mesmo padrão já usado em atendimento-client.tsx) — chamar setState direto no
    // corpo síncrono do efeito é o que o eslint (react-hooks/set-state-in-effect) rejeita.
    Promise.resolve().then(async () => {
      setCarregando(true);
      setErro(false);
      try {
        const resultado = await carregarDetalhesPostVisualizacaoAction(pautaId);
        if (cancelado) return;
        setDados(resultado);
        setCarregando(false);
      } catch {
        if (cancelado) return;
        setErro(true);
        setCarregando(false);
      }
    });
    return () => {
      cancelado = true;
    };
  }, [pautaId]);

  // Esc fecha a modal — atalho padrão, sem lib extra.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10" onClick={onFechar}>
      <div
        className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{palavraChavePrincipal}</h2>
          <button
            type="button"
            onClick={onFechar}
            className="shrink-0 rounded-full px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            ✕
          </button>
        </div>

        {carregando && <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Carregando…</p>}
        {erro && <p className="mt-4 text-sm text-red-600 dark:text-red-400">Não foi possível carregar os dados desta pauta.</p>}

        {dados && !carregando && !erro && (
          <>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
              <ItemResumo rotulo="Persona" valor={dados.personaNome ?? "—"} />
              <ItemResumo rotulo="Ângulo" valor={dados.pauta.angulo} />
              <ItemResumo rotulo="Funil" valor={NOME_FUNIL[dados.pauta.funil]} />
              <ItemResumo rotulo="Formato" valor={NOME_TIPO_CONTEUDO[dados.pauta.tipoConteudo]} />
              <ItemResumo rotulo="Geografia" valor={dados.pauta.geografia ?? "—"} />
              <ItemResumo rotulo="Tentativas" valor={String(dados.pauta.tentativas)} />
              {dados.post && (
                <>
                  <ItemResumo rotulo="Slug" valor={dados.post.slug} />
                  <ItemResumo rotulo="Score QA" valor={dados.post.scoreQa !== null ? `${dados.post.scoreQa}/100` : "—"} />
                  <ItemResumo rotulo="Status do post" valor={NOME_STATUS_POST[dados.post.status]} />
                </>
              )}
            </dl>

            {!dados.post && (
              <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                O Escritor ainda não gerou nenhum rascunho para esta pauta.
              </p>
            )}

            {dados.post && (
              <article className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                {dados.post.urlPublicada && (
                  <a
                    href={dados.post.urlPublicada}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Ver no WordPress ↗
                  </a>
                )}
                {dados.post.imagemDestaqueUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- imagem hospedada no WordPress/Storage do próprio Luiz, não vale configurar domínio remoto no next.config só pra esta modal
                  <img
                    src={dados.post.imagemDestaqueUrl}
                    alt={dados.post.imagemDestaqueAlt ?? ""}
                    className="mt-2 w-full rounded-lg object-cover"
                  />
                )}
                <h1 className="mt-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{dados.post.titulo}</h1>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <strong>Meta title:</strong> {dados.post.metaTitle}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  <strong>Meta description:</strong> {dados.post.metaDescription}
                </p>
                {/* conteudoHtml já passou por sanitizarConteudoHtml (server-side) antes de ser
                    persistido — mesmo HTML que vai pro WordPress, allowlist de tags restrita. */}
                <div
                  className="prose prose-sm mt-3 max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: dados.post.conteudoHtml }}
                />
                {dados.post.imagensSecundarias.length > 0 && (
                  <div className="mt-4 space-y-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Imagens secundárias</p>
                    {dados.post.imagensSecundarias.map((imagem) => (
                      <figure key={imagem.url}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- ver comentário acima */}
                        <img src={imagem.url} alt={imagem.alt} className="w-full rounded-lg object-cover" />
                        <figcaption className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{imagem.legenda}</figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </article>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const NOME_STATUS_POST: Record<string, string> = {
  rascunho: "Rascunho",
  publicado: "Publicado",
  falhou: "Falhou",
};

function ItemResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-zinc-400 dark:text-zinc-500">{rotulo}</dt>
      <dd className="font-medium text-zinc-700 dark:text-zinc-200">{valor}</dd>
    </div>
  );
}
