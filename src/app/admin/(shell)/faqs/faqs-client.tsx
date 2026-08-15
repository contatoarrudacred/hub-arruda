"use client";

import { useState } from "react";
import type { FaqAdmin, ProdutoAdmin } from "@/lib/motor-fluxo/repositorio-admin";
import { excluirFaqAction, salvarFaqAction } from "./actions";

type Rascunho = { id: string | null; produtoId: string; pergunta: string; resposta: string; ativo: boolean };

function paraRascunho(faq: FaqAdmin | null, produtoPadrao: string): Rascunho {
  return {
    id: faq?.id ?? null,
    produtoId: faq?.produtoId ?? produtoPadrao,
    pergunta: faq?.pergunta ?? "",
    resposta: faq?.resposta ?? "",
    ativo: faq?.ativo ?? true,
  };
}

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

export function FaqsClient({ faqsIniciais, produtos }: { faqsIniciais: FaqAdmin[]; produtos: ProdutoAdmin[] }) {
  const [faqs, setFaqs] = useState(faqsIniciais);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [novaFaq, setNovaFaq] = useState<Rascunho | null>(null);
  const produtoPadrao = produtos[0]?.id ?? "";

  return (
    <div className="max-w-3xl space-y-3 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">FAQs</h1>
        <button
          onClick={() => setNovaFaq(paraRascunho(null, produtoPadrao))}
          disabled={novaFaq !== null}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          + Nova FAQ
        </button>
      </div>

      {novaFaq && (
        <CardFaq
          rascunhoInicial={novaFaq}
          produtos={produtos}
          expandidaDeInicio
          onSalvo={(faq) => {
            setFaqs((atual) => [faq, ...atual]);
            setNovaFaq(null);
          }}
          onCancelarNova={() => setNovaFaq(null)}
          onExcluida={() => setNovaFaq(null)}
        />
      )}

      {faqs.map((faq) => (
        <CardFaq
          key={faq.id}
          rascunhoInicial={paraRascunho(faq, produtoPadrao)}
          produtos={produtos}
          expandida={expandidoId === faq.id}
          onExpandir={() => setExpandidoId(expandidoId === faq.id ? null : faq.id)}
          onSalvo={(atualizada) =>
            setFaqs((atual) => atual.map((f) => (f.id === atualizada.id ? atualizada : f)))
          }
          onExcluida={() => setFaqs((atual) => atual.filter((f) => f.id !== faq.id))}
        />
      ))}

      {faqs.length === 0 && !novaFaq && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma FAQ cadastrada ainda.</p>
      )}
    </div>
  );
}

function CardFaq({
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
  onSalvo: (faq: FaqAdmin) => void;
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
    const resultado = await salvarFaqAction(r);
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
    await excluirFaqAction(r.id);
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
          {r.pergunta || "(nova FAQ)"}
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
            <label className={rotulo}>Pergunta</label>
            <input
              className={campo}
              value={r.pergunta}
              onChange={(e) => setR({ ...r, pergunta: e.target.value })}
              placeholder='ex.: "Quanto tempo demora?"'
            />
          </div>
          <div className="space-y-1">
            <label className={rotulo}>Resposta</label>
            <textarea
              className={campo}
              rows={4}
              value={r.resposta}
              onChange={(e) => setR({ ...r, resposta: e.target.value })}
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
              Excluir esta FAQ?
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
