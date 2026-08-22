"use client";

import { useState } from "react";
import type { CategoriaComunicacao } from "@/lib/comunicacao/categorias-repositorio";
import { excluirCategoriaComunicacaoAction, salvarCategoriaComunicacaoAction } from "./actions";

type Rascunho = { id: string | null; nome: string; ativo: boolean };

function paraRascunho(categoria: CategoriaComunicacao | null): Rascunho {
  return { id: categoria?.id ?? null, nome: categoria?.nome ?? "", ativo: categoria?.ativo ?? true };
}

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";

export function CategoriasComunicacaoClient({ categoriasIniciais }: { categoriasIniciais: CategoriaComunicacao[] }) {
  const [categorias, setCategorias] = useState(categoriasIniciais);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [novaCategoria, setNovaCategoria] = useState<Rascunho | null>(null);

  return (
    <div className="max-w-2xl space-y-3 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Categorias de Comunicação</h1>
        <button
          onClick={() => setNovaCategoria(paraRascunho(null))}
          disabled={novaCategoria !== null}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          + Nova categoria
        </button>
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Categorias usadas pelos módulos (Vendas, Financeiro, Marketing...) pra classificar mensagens automáticas enviadas ao cliente.
      </p>

      {novaCategoria && (
        <CardCategoria
          rascunhoInicial={novaCategoria}
          expandidaDeInicio
          onSalvo={(categoria) => {
            setCategorias((atual) => [categoria, ...atual]);
            setNovaCategoria(null);
          }}
          onCancelarNova={() => setNovaCategoria(null)}
          onExcluida={() => setNovaCategoria(null)}
        />
      )}

      {categorias.map((categoria) => (
        <CardCategoria
          key={categoria.id}
          rascunhoInicial={paraRascunho(categoria)}
          expandida={expandidoId === categoria.id}
          onExpandir={() => setExpandidoId(expandidoId === categoria.id ? null : categoria.id)}
          onSalvo={(atualizada) =>
            setCategorias((atual) => atual.map((c) => (c.id === atualizada.id ? atualizada : c)))
          }
          onExcluida={() => setCategorias((atual) => atual.filter((c) => c.id !== categoria.id))}
        />
      ))}

      {categorias.length === 0 && !novaCategoria && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma categoria cadastrada ainda.</p>
      )}
    </div>
  );
}

function CardCategoria({
  rascunhoInicial,
  expandida,
  expandidaDeInicio,
  onExpandir,
  onSalvo,
  onExcluida,
  onCancelarNova,
}: {
  rascunhoInicial: Rascunho;
  expandida?: boolean;
  expandidaDeInicio?: boolean;
  onExpandir?: () => void;
  onSalvo: (categoria: CategoriaComunicacao) => void;
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
    const resultado = await salvarCategoriaComunicacaoAction(r.id, { nome: r.nome, ativo: r.ativo });
    setSalvando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onSalvo({ id: resultado.id, nome: r.nome, ativo: r.ativo });
  }

  async function confirmarEExcluir() {
    if (!r.id) return;
    setConfirmandoExclusao(false);
    setExcluindo(true);
    await excluirCategoriaComunicacaoAction(r.id);
    setExcluindo(false);
    onExcluida();
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <button type="button" onClick={onExpandir} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {r.nome || "(nova categoria)"}
        </span>
        {!r.ativo && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">inativa</span>
        )}
        {onExpandir && <span className="text-zinc-400">{aberta ? "▲" : "▼"}</span>}
      </button>

      {aberta && (
        <div className="space-y-3 border-t border-zinc-200 p-4 dark:border-zinc-700">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Nome</label>
            <input className={campo} value={r.nome} onChange={(e) => setR({ ...r, nome: e.target.value })} placeholder="ex.: Cobrança" />
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
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Excluir esta categoria?</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Mensagens antigas que já usam essa categoria continuam existindo, só perdem a referência (categoria fica vazia nelas). Essa ação não pode ser desfeita.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmandoExclusao(false)}
                className="rounded-full px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button onClick={confirmarEExcluir} className="rounded-full bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
