"use client";

import { useState } from "react";
import type { RespostaPronta } from "@/lib/motor-fluxo/repositorio-admin";
import { excluirRespostaProntaAction, salvarRespostaProntaAction } from "./actions";

type Rascunho = { id: string | null; atalho: string; texto: string; ativo: boolean };

function paraRascunho(resposta: RespostaPronta | null): Rascunho {
  return {
    id: resposta?.id ?? null,
    atalho: resposta?.atalho ?? "",
    texto: resposta?.texto ?? "",
    ativo: resposta?.ativo ?? true,
  };
}

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

export function RespostasProntasClient({ respostasIniciais }: { respostasIniciais: RespostaPronta[] }) {
  const [respostas, setRespostas] = useState(respostasIniciais);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [nova, setNova] = useState<Rascunho | null>(null);

  return (
    <div className="max-w-3xl space-y-3 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Respostas prontas</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Mensagens reaproveitáveis — digite &quot;/&quot; no composer da Tela de Atendimento pra buscar e inserir.
          </p>
        </div>
        <button
          onClick={() => setNova(paraRascunho(null))}
          disabled={nova !== null}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          + Nova resposta
        </button>
      </div>

      {nova && (
        <CardResposta
          rascunhoInicial={nova}
          expandidaDeInicio
          onSalvo={(resposta) => {
            setRespostas((atual) => [resposta, ...atual]);
            setNova(null);
          }}
          onCancelarNova={() => setNova(null)}
          onExcluida={() => setNova(null)}
        />
      )}

      {respostas.map((resposta) => (
        <CardResposta
          key={resposta.id}
          rascunhoInicial={paraRascunho(resposta)}
          expandida={expandidoId === resposta.id}
          onExpandir={() => setExpandidoId(expandidoId === resposta.id ? null : resposta.id)}
          onSalvo={(atualizada) =>
            setRespostas((atual) => atual.map((r) => (r.id === atualizada.id ? atualizada : r)))
          }
          onExcluida={() => setRespostas((atual) => atual.filter((r) => r.id !== resposta.id))}
        />
      ))}

      {respostas.length === 0 && !nova && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma resposta pronta cadastrada ainda.</p>
      )}
    </div>
  );
}

function CardResposta({
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
  onSalvo: (resposta: RespostaPronta) => void;
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
    const resultado = await salvarRespostaProntaAction(r);
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
    await excluirRespostaProntaAction(r.id);
    setExcluindo(false);
    onExcluida();
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <button type="button" onClick={onExpandir} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {r.atalho ? `/${r.atalho}` : "(nova resposta)"}
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
            <label className={rotulo}>Atalho (sem espaços, ex.: &quot;boasvindas&quot;)</label>
            <input
              className={campo}
              value={r.atalho}
              onChange={(e) => setR({ ...r, atalho: e.target.value.trim().toLowerCase().replace(/\s+/g, "") })}
              placeholder="boasvindas"
            />
          </div>
          <div className="space-y-1">
            <label className={rotulo}>Texto</label>
            <textarea className={campo} rows={4} value={r.texto} onChange={(e) => setR({ ...r, texto: e.target.value })} />
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
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Excluir esta resposta pronta?</p>
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
