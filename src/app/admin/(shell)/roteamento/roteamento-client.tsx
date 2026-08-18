"use client";

import { useState } from "react";
import type { RegraRoteamentoAdmin } from "@/lib/motor-fluxo/repositorio-admin";
import { excluirRegraRoteamentoAction, salvarRegraRoteamentoAction } from "./actions";

type Rascunho = {
  id: string | null;
  nome: string;
  termosTexto: string;
  etapaCodigo: string;
  ordem: number;
  ativo: boolean;
};

function paraRascunho(regra: RegraRoteamentoAdmin | null, proximaOrdem: number): Rascunho {
  return {
    id: regra?.id ?? null,
    nome: regra?.nome ?? "",
    termosTexto: regra?.termos.join(", ") ?? "",
    etapaCodigo: regra?.etapaCodigo ?? "",
    ordem: regra?.ordem ?? proximaOrdem,
    ativo: regra?.ativo ?? true,
  };
}

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

export function RoteamentoClient({
  regrasIniciais,
  etapas,
}: {
  regrasIniciais: RegraRoteamentoAdmin[];
  etapas: { id: string; codigo: string }[];
}) {
  const [regras, setRegras] = useState(regrasIniciais);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [nova, setNova] = useState<Rascunho | null>(null);
  const codigosEtapa = [...new Set(etapas.map((e) => e.codigo))].sort();

  return (
    <div className="max-w-3xl space-y-3 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Roteamento de lead novo</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Regras de palavra-chave usadas quando um número desconhecido manda a primeira mensagem — se ela contém
            algum dos termos de uma regra ativa, o fluxo é iniciado na etapa indicada (a primeira regra, em ordem,
            que bater vence). Só entram em ação quando <code>roteamento_lead_novo_modo</code> está em{" "}
            <code>&quot;palavra_chave&quot;</code> — os 3 modos (fluxo fixo / palavra-chave / manual) ficam em{" "}
            <a href="/admin/configuracoes" className="underline">
              Configurações gerais
            </a>
            .
          </p>
        </div>
        <button
          onClick={() => setNova(paraRascunho(null, regras.length))}
          disabled={nova !== null}
          className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          + Nova regra
        </button>
      </div>

      {nova && (
        <CardRegra
          rascunhoInicial={nova}
          codigosEtapa={codigosEtapa}
          expandidaDeInicio
          onSalvo={(regra) => {
            setRegras((atual) => [...atual, regra].sort((a, b) => a.ordem - b.ordem));
            setNova(null);
          }}
          onCancelarNova={() => setNova(null)}
          onExcluida={() => setNova(null)}
        />
      )}

      {regras.map((regra) => (
        <CardRegra
          key={regra.id}
          rascunhoInicial={paraRascunho(regra, regras.length)}
          codigosEtapa={codigosEtapa}
          expandida={expandidoId === regra.id}
          onExpandir={() => setExpandidoId(expandidoId === regra.id ? null : regra.id)}
          onSalvo={(atualizada) =>
            setRegras((atual) => atual.map((r) => (r.id === atualizada.id ? atualizada : r)).sort((a, b) => a.ordem - b.ordem))
          }
          onExcluida={() => setRegras((atual) => atual.filter((r) => r.id !== regra.id))}
        />
      ))}

      {regras.length === 0 && !nova && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma regra de roteamento cadastrada ainda.</p>
      )}
    </div>
  );
}

function CardRegra({
  rascunhoInicial,
  codigosEtapa,
  expandida,
  expandidaDeInicio,
  onExpandir,
  onSalvo,
  onExcluida,
  onCancelarNova,
}: {
  rascunhoInicial: Rascunho;
  codigosEtapa: string[];
  expandida?: boolean;
  expandidaDeInicio?: boolean;
  onExpandir?: () => void;
  onSalvo: (regra: RegraRoteamentoAdmin) => void;
  onExcluida: () => void;
  onCancelarNova?: () => void;
}) {
  const [r, setR] = useState(rascunhoInicial);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const aberta = expandidaDeInicio || expandida;

  async function salvar() {
    setErro(null);
    const termos = r.termosTexto
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    setSalvando(true);
    const resultado = await salvarRegraRoteamentoAction({
      id: r.id,
      nome: r.nome.trim(),
      termos,
      etapaCodigo: r.etapaCodigo,
      ordem: r.ordem,
      ativo: r.ativo,
    });
    setSalvando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onSalvo({ id: resultado.id, nome: r.nome.trim(), termos, etapaCodigo: r.etapaCodigo, ordem: r.ordem, ativo: r.ativo });
  }

  async function confirmarEExcluir() {
    if (!r.id) return;
    setConfirmandoExclusao(false);
    setExcluindo(true);
    await excluirRegraRoteamentoAction(r.id);
    setExcluindo(false);
    onExcluida();
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <button type="button" onClick={onExpandir} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {r.nome || "(nova regra)"}
        </span>
        {!r.ativo && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
            inativa
          </span>
        )}
        {onExpandir && <span className="text-zinc-400">{aberta ? "▲" : "▼"}</span>}
      </button>

      {aberta && (
        <div className="space-y-3 border-t border-zinc-200 p-4 dark:border-zinc-700">
          <div className="space-y-1">
            <label className={rotulo}>Nome (só pra identificar a regra na lista)</label>
            <input className={campo} value={r.nome} onChange={(e) => setR({ ...r, nome: e.target.value })} placeholder="ex.: Score/Rating" />
          </div>
          <div className="space-y-1">
            <label className={rotulo}>Termos (separados por vírgula)</label>
            <input
              className={campo}
              value={r.termosTexto}
              onChange={(e) => setR({ ...r, termosTexto: e.target.value })}
              placeholder="score, rating, pontuação"
            />
          </div>
          <div className="space-y-1">
            <label className={rotulo}>Etapa de destino</label>
            <input
              className={campo + " font-mono"}
              list="codigos-etapa"
              value={r.etapaCodigo}
              onChange={(e) => setR({ ...r, etapaCodigo: e.target.value })}
              placeholder="ex.: saudacao_inicial"
            />
            <datalist id="codigos-etapa">
              {codigosEtapa.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <label className={rotulo}>Ordem (regras são checadas nessa ordem — a primeira que bater vence)</label>
            <input
              type="number"
              className={campo}
              value={r.ordem}
              onChange={(e) => setR({ ...r, ordem: Number(e.target.value) })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={r.ativo} onChange={(e) => setR({ ...r, ativo: e.target.checked })} />
            Ativa
          </label>

          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

          <div className="flex items-center justify-between pt-1">
            {r.id ? (
              <button
                onClick={() => setConfirmandoExclusao(true)}
                disabled={excluindo}
                className="text-sm text-red-600 hover:underline disabled:opacity-40 dark:text-red-400"
              >
                {excluindo ? "Excluindo..." : "Excluir"}
              </button>
            ) : (
              <button onClick={onCancelarNova} className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
                Cancelar
              </button>
            )}
            <button
              onClick={salvar}
              disabled={salvando}
              className="rounded-full bg-zinc-900 px-5 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      )}

      {confirmandoExclusao && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-900">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Excluir esta regra de roteamento?</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Essa ação não pode ser desfeita.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmandoExclusao(false)}
                className="rounded-full px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarEExcluir}
                className="rounded-full bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
