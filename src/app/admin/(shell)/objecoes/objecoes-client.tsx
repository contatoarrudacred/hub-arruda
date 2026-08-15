"use client";

import { useState } from "react";
import type { ObjecaoAdmin, ProdutoAdmin } from "@/lib/motor-fluxo/repositorio-admin";
import { excluirObjecaoAction, salvarObjecaoAction } from "./actions";

type Rascunho = { id: string | null; produtoId: string; objecao: string; comoLidar: string; ativo: boolean };

function paraRascunho(objecao: ObjecaoAdmin | null, produtoPadrao: string): Rascunho {
  return {
    id: objecao?.id ?? null,
    produtoId: objecao?.produtoId ?? produtoPadrao,
    objecao: objecao?.objecao ?? "",
    comoLidar: objecao?.comoLidar ?? "",
    ativo: objecao?.ativo ?? true,
  };
}

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

export function ObjecoesClient({
  objecoesIniciais,
  produtos,
}: {
  objecoesIniciais: ObjecaoAdmin[];
  produtos: ProdutoAdmin[];
}) {
  const [objecoes, setObjecoes] = useState(objecoesIniciais);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [novaObjecao, setNovaObjecao] = useState<Rascunho | null>(null);
  const produtoPadrao = produtos[0]?.id ?? "";

  return (
    <div className="max-w-3xl space-y-3 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Objeções</h1>
        <button
          onClick={() => setNovaObjecao(paraRascunho(null, produtoPadrao))}
          disabled={novaObjecao !== null}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          + Nova objeção
        </button>
      </div>

      {novaObjecao && (
        <CardObjecao
          rascunhoInicial={novaObjecao}
          produtos={produtos}
          expandidaDeInicio
          onSalvo={(objecao) => {
            setObjecoes((atual) => [objecao, ...atual]);
            setNovaObjecao(null);
          }}
          onCancelarNova={() => setNovaObjecao(null)}
          onExcluida={() => setNovaObjecao(null)}
        />
      )}

      {objecoes.map((objecao) => (
        <CardObjecao
          key={objecao.id}
          rascunhoInicial={paraRascunho(objecao, produtoPadrao)}
          produtos={produtos}
          expandida={expandidoId === objecao.id}
          onExpandir={() => setExpandidoId(expandidoId === objecao.id ? null : objecao.id)}
          onSalvo={(atualizada) =>
            setObjecoes((atual) => atual.map((o) => (o.id === atualizada.id ? atualizada : o)))
          }
          onExcluida={() => setObjecoes((atual) => atual.filter((o) => o.id !== objecao.id))}
        />
      ))}

      {objecoes.length === 0 && !novaObjecao && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma objeção cadastrada ainda.</p>
      )}
    </div>
  );
}

function CardObjecao({
  rascunhoInicial,
  produtos,
  expandida,
  expandidaDeInicio,
  onExpandir,
  onSalvo,
  onExcluida,
  onCancelarNova,
}: {
  rascunhoInicial: Rascunho;
  produtos: ProdutoAdmin[];
  expandida?: boolean;
  expandidaDeInicio?: boolean;
  onExpandir?: () => void;
  onSalvo: (objecao: ObjecaoAdmin) => void;
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
    setSalvando(true);
    const resultado = await salvarObjecaoAction(r);
    setSalvando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onSalvo({ ...r, id: resultado.id });
  }

  async function confirmarEExcluir() {
    if (!r.id) return;
    setConfirmandoExclusao(false);
    setExcluindo(true);
    await excluirObjecaoAction(r.id);
    setExcluindo(false);
    onExcluida();
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <button
        type="button"
        onClick={onExpandir}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {r.objecao || "(nova objeção)"}
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
            <label className={rotulo}>Objeção (como o lead costuma dizer)</label>
            <input
              className={campo}
              value={r.objecao}
              onChange={(e) => setR({ ...r, objecao: e.target.value })}
              placeholder='ex.: "Acho caro"'
            />
          </div>
          <div className="space-y-1">
            <label className={rotulo}>Como lidar (orientação/técnica de reversão, não resposta pronta)</label>
            <textarea
              className={campo}
              rows={4}
              value={r.comoLidar}
              onChange={(e) => setR({ ...r, comoLidar: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={rotulo}>Produto</label>
              <select
                className={campo}
                value={r.produtoId}
                onChange={(e) => setR({ ...r, produtoId: e.target.value })}
              >
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 self-end pb-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={r.ativo}
                onChange={(e) => setR({ ...r, ativo: e.target.checked })}
              />
              Ativa
            </label>
          </div>

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
              <button
                onClick={onCancelarNova}
                className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
              >
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
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Excluir esta objeção?
            </p>
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
