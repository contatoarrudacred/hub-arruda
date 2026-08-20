"use client";

import { useMemo, useState } from "react";
import { Ajuda } from "@/components/marketing/ajuda";
import type { ItemChecklistAdmin } from "@/lib/marketing/tipos";
import { excluirItemChecklistAction, salvarItemChecklistAction } from "./actions";

type Propriedade = { id: string; nome: string };

type Rascunho = {
  id: string | null;
  propriedadeId: string;
  item: string;
  peso: string;
  ativo: boolean;
  itemParaRevisor: string;
};

function paraRascunho(i: ItemChecklistAdmin | null, propriedadeIdPadrao: string): Rascunho {
  return {
    id: i?.id ?? null,
    propriedadeId: i?.propriedadeId ?? propriedadeIdPadrao,
    item: i?.item ?? "",
    peso: i ? String(i.peso) : "1",
    ativo: i?.ativo ?? true,
    itemParaRevisor: i?.itemParaRevisor ?? "",
  };
}

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400";

export function ChecklistClient({
  itensIniciais,
  propriedades,
}: {
  itensIniciais: ItemChecklistAdmin[];
  propriedades: Propriedade[];
}) {
  const [itens, setItens] = useState(itensIniciais);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [criandoNovo, setCriandoNovo] = useState(false);
  const [filtroPropriedadeId, setFiltroPropriedadeId] = useState("");

  const nomePropriedade = useMemo(() => {
    const mapa = new Map(propriedades.map((p) => [p.id, p.nome]));
    return (id: string) => mapa.get(id) ?? "(propriedade desconhecida)";
  }, [propriedades]);

  const itensFiltrados = filtroPropriedadeId ? itens.filter((i) => i.propriedadeId === filtroPropriedadeId) : itens;

  return (
    <div className="max-w-3xl space-y-3 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Checklist de QA</h1>
        <button
          onClick={() => setCriandoNovo(true)}
          disabled={criandoNovo || propriedades.length === 0}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          + Novo item
        </button>
      </div>

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

      {propriedades.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Cadastre uma propriedade digital antes de criar itens de checklist de QA.
        </p>
      )}

      {criandoNovo && (
        <CardItem
          rascunhoInicial={paraRascunho(null, filtroPropriedadeId || propriedades[0]?.id || "")}
          propriedades={propriedades}
          expandidaDeInicio
          onSalvo={(i) => {
            setItens((atual) => [i, ...atual]);
            setCriandoNovo(false);
          }}
          onCancelarNovo={() => setCriandoNovo(false)}
          onExcluido={() => setCriandoNovo(false)}
        />
      )}

      {itensFiltrados.map((i) => (
        <CardItem
          key={i.id}
          rascunhoInicial={paraRascunho(i, i.propriedadeId)}
          propriedades={propriedades}
          expandida={expandidoId === i.id}
          onExpandir={() => setExpandidoId(expandidoId === i.id ? null : i.id)}
          onSalvo={(atualizado) => setItens((atual) => atual.map((x) => (x.id === atualizado.id ? atualizado : x)))}
          onExcluido={() => setItens((atual) => atual.filter((x) => x.id !== i.id))}
        />
      ))}

      {itensFiltrados.length === 0 && !criandoNovo && propriedades.length > 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {filtroPropriedadeId
            ? `Nenhum item de checklist cadastrado para ${nomePropriedade(filtroPropriedadeId)} ainda.`
            : "Nenhum item de checklist cadastrado ainda."}
        </p>
      )}
    </div>
  );
}

function CardItem({
  rascunhoInicial,
  propriedades,
  expandida,
  expandidaDeInicio,
  onExpandir,
  onSalvo,
  onExcluido,
  onCancelarNovo,
}: {
  rascunhoInicial: Rascunho;
  propriedades: Propriedade[];
  expandida?: boolean;
  expandidaDeInicio?: boolean;
  onExpandir?: () => void;
  onSalvo: (i: ItemChecklistAdmin) => void;
  onExcluido: () => void;
  onCancelarNovo?: () => void;
}) {
  const [r, setR] = useState<Rascunho>(rascunhoInicial);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const aberta = expandidaDeInicio || expandida;
  const ehNovo = r.id === null;
  const nomePropriedadeAtual = propriedades.find((p) => p.id === r.propriedadeId)?.nome ?? "(propriedade desconhecida)";

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const resultado = await salvarItemChecklistAction({
      id: r.id,
      propriedadeId: r.propriedadeId,
      item: r.item,
      peso: Number(r.peso),
      ativo: r.ativo,
      itemParaRevisor: r.itemParaRevisor.trim() || null,
    });
    setSalvando(false);

    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onSalvo(resultado.item);
  }

  async function confirmarEExcluir() {
    if (!r.id) return;
    setConfirmandoExclusao(false);
    setExcluindo(true);
    await excluirItemChecklistAction(r.id);
    setExcluindo(false);
    onExcluido();
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <button type="button" onClick={onExpandir} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {r.item || "(novo item)"}
        </span>
        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">peso {r.peso || "—"}</span>
        {!r.ativo && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
            inativo
          </span>
        )}
        {onExpandir && <span className="text-zinc-400">{aberta ? "▲" : "▼"}</span>}
      </button>

      {aberta && (
        <div className="space-y-4 border-t border-zinc-200 p-4 dark:border-zinc-700">
          <div className="space-y-1">
            <label className={rotulo}>Item do checklist</label>
            <textarea
              className={campo}
              rows={2}
              value={r.item}
              onChange={(e) => setR({ ...r, item: e.target.value })}
              placeholder="ex.: Tem CTA claro no final do texto?"
            />
          </div>

          <div className="space-y-1">
            <label className={rotulo}>
              Texto alternativo pro Revisor (opcional)
              <Ajuda texto="Deixe em branco pra usar o mesmo texto acima nos dois. Preencha quando quiser que o Revisor aceite algo mais tolerante que o alvo pedido ao Escritor — ex.: Escritor mira 'resposta de 40-60 palavras', Revisor aceita '20-80 palavras'. Útil pra faixas numéricas estreitas, que são difíceis de acertar com precisão em todas as seções de um artigo." />
            </label>
            <textarea
              className={campo}
              rows={2}
              value={r.itemParaRevisor}
              onChange={(e) => setR({ ...r, itemParaRevisor: e.target.value })}
              placeholder="ex.: Resposta direta e extraível (20-80 palavras) logo abaixo de cada H2 — deixe em branco para usar o mesmo texto do item acima"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={rotulo}>
                Peso
                <Ajuda texto="Peso relativo deste item no score ponderado calculado pelo Revisor. O Revisor só aprova automaticamente posts com score final de pelo menos 80/100 — itens com peso maior pesam mais nesse cálculo." />
              </label>
              <input
                type="number"
                min={1}
                step={1}
                className={campo}
                value={r.peso}
                onChange={(e) => setR({ ...r, peso: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className={rotulo}>
                Propriedade
                {!ehNovo && (
                  <Ajuda texto="A propriedade dona não é editável nesta tela depois de criado o item — crie um novo item se precisar do mesmo check em outra propriedade." />
                )}
              </label>
              {ehNovo ? (
                <select
                  className={campo}
                  value={r.propriedadeId}
                  onChange={(e) => setR({ ...r, propriedadeId: e.target.value })}
                >
                  {propriedades.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              ) : (
                <input className={`${campo} opacity-60`} value={nomePropriedadeAtual} disabled />
              )}
            </div>
          </div>

          <label className="flex items-center gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={r.ativo} onChange={(e) => setR({ ...r, ativo: e.target.checked })} />
            Ativo
            <Ajuda texto="Prefira desativar em vez de excluir: um item desativado para de contar no score de posts novos, mas mantém o histórico de por que posts antigos foram avaliados daquele jeito. Excluir apaga o item de vez, inclusive da explicação de scores passados." />
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
              <button onClick={onCancelarNovo} className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
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
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Excluir este item de checklist?</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Essa ação não pode ser desfeita — considere desativar em vez de excluir para preservar o histórico.
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
