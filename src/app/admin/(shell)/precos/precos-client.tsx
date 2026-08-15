"use client";

import { useState } from "react";
import type { FaixaPrecoAdmin, ProdutoAdmin } from "@/lib/motor-fluxo/repositorio-admin";
import { excluirFaixaPrecoAction, salvarFaixaPrecoAction } from "./actions";

type Rascunho = Omit<FaixaPrecoAdmin, "id"> & { id: string | null };

function paraRascunho(faixa: FaixaPrecoAdmin | null, produtoPadrao: string): Rascunho {
  return {
    id: faixa?.id ?? null,
    produtoId: faixa?.produtoId ?? produtoPadrao,
    faixaMin: faixa?.faixaMin ?? 0,
    faixaMax: faixa?.faixaMax ?? null,
    precoCheio: faixa?.precoCheio ?? null,
    precoAvista: faixa?.precoAvista ?? null,
    parcelasBoletoQtd: faixa?.parcelasBoletoQtd ?? null,
    parcelasBoletoValor: faixa?.parcelasBoletoValor ?? null,
    parcelasCartaoMax: faixa?.parcelasCartaoMax ?? null,
    voucherAvista: faixa?.voucherAvista ?? null,
    voucherParcelasQtd: faixa?.voucherParcelasQtd ?? null,
    voucherParcelasValor: faixa?.voucherParcelasValor ?? null,
    ativo: faixa?.ativo ?? true,
  };
}

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

function formatarReais(valor: number | null): string {
  if (valor === null) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Number input que aceita vazio = null (muitos campos aqui são opcionais). */
function CampoNumero({
  valor,
  onChange,
  placeholder,
}: {
  valor: number | null;
  onChange: (v: number | null) => void;
  placeholder: string;
}) {
  return (
    <input
      type="number"
      step="0.01"
      className={campo}
      value={valor ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      placeholder={placeholder}
    />
  );
}

export function PrecosClient({
  faixasIniciais,
  produtos,
}: {
  faixasIniciais: FaixaPrecoAdmin[];
  produtos: ProdutoAdmin[];
}) {
  const [faixas, setFaixas] = useState(faixasIniciais);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [novaFaixa, setNovaFaixa] = useState<Rascunho | null>(null);
  const produtoPadrao = produtos[0]?.id ?? "";

  return (
    <div className="max-w-3xl space-y-3 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Preços por faixa</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Faixa e valor andam juntos — tanto o intervalo (de/até) quanto os preços são editáveis
            aqui.
          </p>
        </div>
        <button
          onClick={() => setNovaFaixa(paraRascunho(null, produtoPadrao))}
          disabled={novaFaixa !== null}
          className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          + Nova faixa
        </button>
      </div>

      {novaFaixa && (
        <CardFaixa
          rascunhoInicial={novaFaixa}
          produtos={produtos}
          expandidaDeInicio
          onSalvo={(faixa) => {
            setFaixas((atual) => [...atual, faixa].sort((a, b) => a.faixaMin - b.faixaMin));
            setNovaFaixa(null);
          }}
          onCancelarNova={() => setNovaFaixa(null)}
          onExcluida={() => setNovaFaixa(null)}
        />
      )}

      {faixas.map((faixa) => (
        <CardFaixa
          key={faixa.id}
          rascunhoInicial={paraRascunho(faixa, produtoPadrao)}
          produtos={produtos}
          expandida={expandidoId === faixa.id}
          onExpandir={() => setExpandidoId(expandidoId === faixa.id ? null : faixa.id)}
          onSalvo={(atualizada) =>
            setFaixas((atual) =>
              atual.map((f) => (f.id === atualizada.id ? atualizada : f)).sort((a, b) => a.faixaMin - b.faixaMin),
            )
          }
          onExcluida={() => setFaixas((atual) => atual.filter((f) => f.id !== faixa.id))}
        />
      ))}

      {faixas.length === 0 && !novaFaixa && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma faixa de preço cadastrada ainda.</p>
      )}
    </div>
  );
}

function CardFaixa({
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
  onSalvo: (faixa: FaixaPrecoAdmin) => void;
  onExcluida: () => void;
  onCancelarNova?: () => void;
}) {
  const [r, setR] = useState(rascunhoInicial);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const aberta = expandidaDeInicio || expandida;

  function atualizar<K extends keyof Rascunho>(chave: K, valor: Rascunho[K]) {
    setR((atual) => ({ ...atual, [chave]: valor }));
  }

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const resultado = await salvarFaixaPrecoAction(r);
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
    await excluirFaixaPrecoAction(r.id);
    setExcluindo(false);
    onExcluida();
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <button type="button" onClick={onExpandir} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="flex-1 text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {formatarReais(r.faixaMin)} {r.faixaMax === null ? "ou mais" : `– ${formatarReais(r.faixaMax)}`}
        </span>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">à vista: {formatarReais(r.precoAvista)}</span>
        {!r.ativo && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
            inativa
          </span>
        )}
        {onExpandir && <span className="text-zinc-400">{aberta ? "▲" : "▼"}</span>}
      </button>

      {aberta && (
        <div className="space-y-3 border-t border-zinc-200 p-4 dark:border-zinc-700">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={rotulo}>Faixa mínima (R$)</label>
              <CampoNumero valor={r.faixaMin} onChange={(v) => atualizar("faixaMin", v ?? 0)} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <label className={rotulo}>Faixa máxima (R$) — vazio = faixa aberta</label>
              <CampoNumero valor={r.faixaMax} onChange={(v) => atualizar("faixaMax", v)} placeholder="sem limite" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={rotulo}>Preço cheio (ancoragem, riscado)</label>
              <CampoNumero valor={r.precoCheio} onChange={(v) => atualizar("precoCheio", v)} placeholder="R$" />
            </div>
            <div className="space-y-1">
              <label className={rotulo}>Preço à vista (com desconto)</label>
              <CampoNumero valor={r.precoAvista} onChange={(v) => atualizar("precoAvista", v)} placeholder="R$" />
            </div>
          </div>

          <div className={rotulo}>Parcelado Boleto/Pix</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={rotulo}>Quantidade de parcelas</label>
              <CampoNumero
                valor={r.parcelasBoletoQtd}
                onChange={(v) => atualizar("parcelasBoletoQtd", v)}
                placeholder="ex.: 6"
              />
            </div>
            <div className="space-y-1">
              <label className={rotulo}>Valor de cada parcela</label>
              <CampoNumero
                valor={r.parcelasBoletoValor}
                onChange={(v) => atualizar("parcelasBoletoValor", v)}
                placeholder="R$"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className={rotulo}>Máximo de parcelas no cartão</label>
            <CampoNumero
              valor={r.parcelasCartaoMax}
              onChange={(v) => atualizar("parcelasCartaoMax", v)}
              placeholder="ex.: 12"
            />
          </div>

          <div className={rotulo}>Condição especial (voucher)</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className={rotulo}>À vista</label>
              <CampoNumero valor={r.voucherAvista} onChange={(v) => atualizar("voucherAvista", v)} placeholder="R$" />
            </div>
            <div className="space-y-1">
              <label className={rotulo}>Qtd. parcelas</label>
              <CampoNumero
                valor={r.voucherParcelasQtd}
                onChange={(v) => atualizar("voucherParcelasQtd", v)}
                placeholder="ex.: 6"
              />
            </div>
            <div className="space-y-1">
              <label className={rotulo}>Valor da parcela</label>
              <CampoNumero
                valor={r.voucherParcelasValor}
                onChange={(v) => atualizar("voucherParcelasValor", v)}
                placeholder="R$"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={rotulo}>Produto</label>
              <select className={campo} value={r.produtoId} onChange={(e) => atualizar("produtoId", e.target.value)}>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 self-end pb-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" checked={r.ativo} onChange={(e) => atualizar("ativo", e.target.checked)} />
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
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Excluir esta faixa de preço?</p>
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
