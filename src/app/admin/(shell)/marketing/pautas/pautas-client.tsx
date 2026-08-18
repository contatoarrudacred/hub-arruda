"use client";

import { useMemo, useState } from "react";
import { Ajuda } from "@/components/marketing/ajuda";
import type { FunilPauta, PautaCarregada, StatusPauta } from "@/lib/marketing/tipos";
import { reabrirPautaAction } from "./actions";

type Propriedade = { id: string; nome: string };

/** PautaCarregada + propriedade resolvida no servidor via matrizConteudoId (ver page.tsx) — só existe
 * nesta tela, não é um tipo do repositório. */
export type PautaComPropriedade = PautaCarregada & { propriedadeId: string | null; propriedadeNome: string };

const FUNIL_ROTULO: Record<FunilPauta, string> = { topo: "Topo", meio: "Meio", fundo: "Fundo" };

const STATUS_CONFIG: Record<StatusPauta, { rotulo: string; classe: string; ajuda: string }> = {
  pendente: {
    rotulo: "Pendente",
    classe: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    ajuda: "Aguardando o cron pegar e processar.",
  },
  em_producao: {
    rotulo: "Em produção",
    classe: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    ajuda:
      "O cron está processando esta pauta agora — ou pode estar travada. O sistema faz reclaim automático depois de 10 minutos parada; veja o Monitor de execução para saber se está travada de verdade.",
  },
  publicado: {
    rotulo: "Publicado",
    classe: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    ajuda: "Já virou um post publicado — veja a tela Posts Publicados para conferir.",
  },
  rejeitado: {
    rotulo: "Rejeitado",
    classe: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    ajuda:
      "Reprovada em alguma etapa do pipeline. Volta pra pendente automaticamente (retry) — não deveria persistir muito tempo neste estado.",
  },
  bloqueada: {
    rotulo: "Bloqueada",
    classe: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    ajuda: "Esgotou o limite de tentativas (máx. tentativas da propriedade) — precisa de ação humana pra reabrir.",
  },
};

const STATUS_ORDEM_FILTRO: StatusPauta[] = ["pendente", "em_producao", "bloqueada", "rejeitado", "publicado"];

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400";

function BadgeStatus({ status }: { status: StatusPauta }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.classe}`}>{config.rotulo}</span>
      <Ajuda texto={config.ajuda} />
    </span>
  );
}

export function PautasClient({
  pautasIniciais,
  propriedades,
}: {
  pautasIniciais: PautaComPropriedade[];
  propriedades: Propriedade[];
}) {
  const [pautas, setPautas] = useState(pautasIniciais);
  const [filtroPropriedadeId, setFiltroPropriedadeId] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [pautaConfirmandoReabertura, setPautaConfirmandoReabertura] = useState<PautaComPropriedade | null>(null);

  const pautasFiltradas = useMemo(() => {
    return pautas.filter((p) => {
      if (filtroPropriedadeId && p.propriedadeId !== filtroPropriedadeId) return false;
      if (filtroStatus && p.status !== filtroStatus) return false;
      return true;
    });
  }, [pautas, filtroPropriedadeId, filtroStatus]);

  function aplicarReaberturaLocal(pautaId: string) {
    setPautas((atual) =>
      atual.map((p) => (p.id === pautaId ? { ...p, status: "pendente" as StatusPauta, motivoUltimaReprovacao: null } : p)),
    );
  }

  return (
    <div className="max-w-6xl space-y-3 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Fila de Pautas</h1>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className={rotulo}>Propriedade</label>
          <select
            className={`${campo} max-w-xs`}
            value={filtroPropriedadeId}
            onChange={(e) => setFiltroPropriedadeId(e.target.value)}
          >
            <option value="">Todas</option>
            {propriedades.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className={rotulo}>Status</label>
          <select className={`${campo} max-w-xs`} value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos</option>
            {STATUS_ORDEM_FILTRO.map((status) => (
              <option key={status} value={status}>
                {STATUS_CONFIG[status].rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {pautasFiltradas.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma pauta encontrada com esses filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2.5">Palavra-chave principal</th>
                <th className="px-4 py-2.5">Propriedade</th>
                <th className="px-4 py-2.5">Funil</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Tentativas</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {pautasFiltradas.map((pauta) => (
                <tr key={pauta.id} className="align-top text-zinc-800 dark:text-zinc-100">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{pauta.palavraChavePrincipal}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {pauta.angulo}
                      {pauta.geografia ? ` · ${pauta.geografia}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">{pauta.propriedadeNome}</td>
                  <td className="px-4 py-2.5">{FUNIL_ROTULO[pauta.funil]}</td>
                  <td className="px-4 py-2.5">
                    <BadgeStatus status={pauta.status} />
                    {pauta.status === "bloqueada" && pauta.motivoUltimaReprovacao && (
                      <p className="mt-1 max-w-xs text-xs text-red-600 dark:text-red-400">
                        Motivo: {pauta.motivoUltimaReprovacao}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{pauta.tentativas}</td>
                  <td className="px-4 py-2.5 text-right">
                    {pauta.status === "bloqueada" && (
                      <button
                        type="button"
                        onClick={() => setPautaConfirmandoReabertura(pauta)}
                        className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Reabrir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pautaConfirmandoReabertura && (
        <ModalConfirmarReabertura
          pauta={pautaConfirmandoReabertura}
          onCancelar={() => setPautaConfirmandoReabertura(null)}
          onReaberta={(pautaId) => {
            aplicarReaberturaLocal(pautaId);
            setPautaConfirmandoReabertura(null);
          }}
        />
      )}
    </div>
  );
}

function ModalConfirmarReabertura({
  pauta,
  onCancelar,
  onReaberta,
}: {
  pauta: PautaComPropriedade;
  onCancelar: () => void;
  onReaberta: (pautaId: string) => void;
}) {
  const [reabrindo, setReabrindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setErro(null);
    setReabrindo(true);
    const resultado = await reabrirPautaAction(pauta.id);
    setReabrindo(false);

    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onReaberta(pauta.id);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-900">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Reabrir a pauta &ldquo;{pauta.palavraChavePrincipal}&rdquo;?
        </p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Ela volta pra fila como &ldquo;pendente&rdquo; e vai passar pelo Escritor e pelo Revisor de novo no próximo
          ciclo do cron — isso reintroduz o custo (tokens) de gerar e revisar o conteúdo desde o início. Use só
          depois de já ter corrigido o que causou o bloqueio.
        </p>
        {erro && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{erro}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            disabled={reabrindo}
            className="rounded-full px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={reabrindo}
            className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
          >
            {reabrindo ? "Reabrindo..." : "Reabrir"}
          </button>
        </div>
      </div>
    </div>
  );
}
