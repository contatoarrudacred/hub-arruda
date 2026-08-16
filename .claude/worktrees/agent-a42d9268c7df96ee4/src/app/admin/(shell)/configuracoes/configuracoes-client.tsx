"use client";

import { useState } from "react";
import type { ConfiguracaoAdmin, ProdutoAdmin } from "@/lib/motor-fluxo/repositorio-admin";
import { excluirConfiguracaoAction, salvarConfiguracaoAction } from "./actions";

type Rascunho = {
  id: string | null;
  chave: string;
  valorTexto: string;
  descricao: string;
  produtoId: string | null;
};

function paraRascunho(config: ConfiguracaoAdmin | null): Rascunho {
  return {
    id: config?.id ?? null,
    chave: config?.chave ?? "",
    valorTexto: config ? JSON.stringify(config.valor, null, 2) : "",
    descricao: config?.descricao ?? "",
    produtoId: config?.produtoId ?? null,
  };
}

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

export function ConfiguracoesClient({
  configuracoesIniciais,
  produtos,
}: {
  configuracoesIniciais: ConfiguracaoAdmin[];
  produtos: ProdutoAdmin[];
}) {
  const [configs, setConfigs] = useState(configuracoesIniciais);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [novaConfig, setNovaConfig] = useState<Rascunho | null>(null);

  return (
    <div className="max-w-3xl space-y-3 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Configurações gerais</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Valores/parâmetros do sistema (chave → valor). O valor é editado como JSON — número simples
            (ex.: <code>899</code>), texto entre aspas, ou um objeto (ex.:{" "}
            <code>{"{"}&quot;qtd&quot;: 6, &quot;valor&quot;: 299{"}"}</code>).
            <strong> Mudar a chave ou o formato de uma configuração já usada pode quebrar cálculo em produção</strong> —
            só edite se souber o que está mudando.
          </p>
        </div>
        <button
          onClick={() => setNovaConfig(paraRascunho(null))}
          disabled={novaConfig !== null}
          className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          + Nova configuração
        </button>
      </div>

      {novaConfig && (
        <CardConfig
          rascunhoInicial={novaConfig}
          produtos={produtos}
          expandidaDeInicio
          onSalvo={(config) => {
            setConfigs((atual) => [...atual, config].sort((a, b) => a.chave.localeCompare(b.chave)));
            setNovaConfig(null);
          }}
          onCancelarNova={() => setNovaConfig(null)}
          onExcluida={() => setNovaConfig(null)}
        />
      )}

      {configs.map((config) => (
        <CardConfig
          key={config.id}
          rascunhoInicial={paraRascunho(config)}
          produtos={produtos}
          expandida={expandidoId === config.id}
          onExpandir={() => setExpandidoId(expandidoId === config.id ? null : config.id)}
          onSalvo={(atualizada) =>
            setConfigs((atual) => atual.map((c) => (c.id === atualizada.id ? atualizada : c)))
          }
          onExcluida={() => setConfigs((atual) => atual.filter((c) => c.id !== config.id))}
        />
      ))}

      {configs.length === 0 && !novaConfig && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma configuração cadastrada ainda.</p>
      )}
    </div>
  );
}

function CardConfig({
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
  onSalvo: (config: ConfiguracaoAdmin) => void;
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
    const resultado = await salvarConfiguracaoAction(r);
    setSalvando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    let valor: unknown = null;
    try {
      valor = JSON.parse(r.valorTexto);
    } catch {
      // já validado na action — não deveria cair aqui
    }
    onSalvo({
      id: resultado.id,
      chave: r.chave.trim(),
      valor,
      descricao: r.descricao.trim(),
      produtoId: r.produtoId,
    });
  }

  async function confirmarEExcluir() {
    if (!r.id) return;
    setConfirmandoExclusao(false);
    setExcluindo(true);
    await excluirConfiguracaoAction(r.id);
    setExcluindo(false);
    onExcluida();
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <button type="button" onClick={onExpandir} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="flex-1 truncate font-mono text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {r.chave || "(nova configuração)"}
        </span>
        {onExpandir && <span className="text-zinc-400">{aberta ? "▲" : "▼"}</span>}
      </button>

      {aberta && (
        <div className="space-y-3 border-t border-zinc-200 p-4 dark:border-zinc-700">
          <div className="space-y-1">
            <label className={rotulo}>Chave</label>
            <input
              className={campo + " font-mono"}
              value={r.chave}
              onChange={(e) => setR({ ...r, chave: e.target.value })}
              placeholder="ex.: limpanome_investimento_minimo_avista"
            />
          </div>
          <div className="space-y-1">
            <label className={rotulo}>Descrição (obrigatória — para que serve)</label>
            <input
              className={campo}
              value={r.descricao}
              onChange={(e) => setR({ ...r, descricao: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className={rotulo}>Valor (JSON)</label>
            <textarea
              className={campo + " font-mono"}
              rows={4}
              value={r.valorTexto}
              onChange={(e) => setR({ ...r, valorTexto: e.target.value })}
              placeholder='899 ou {"qtd": 6, "valor": 299}'
            />
          </div>
          <div className="space-y-1">
            <label className={rotulo}>Produto (opcional)</label>
            <select
              className={campo}
              value={r.produtoId ?? ""}
              onChange={(e) => setR({ ...r, produtoId: e.target.value || null })}
            >
              <option value="">Geral (não específico de um produto)</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
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
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Excluir esta configuração?</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Essa ação não pode ser desfeita — se algum cálculo do sistema depender dessa chave, ele para de
              funcionar.
            </p>
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
