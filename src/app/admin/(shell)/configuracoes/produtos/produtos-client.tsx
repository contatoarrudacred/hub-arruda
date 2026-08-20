"use client";

import { useState } from "react";
import type { FornecedorAdmin } from "@/lib/vendas/fornecedores";
import type { EntradaSalvarProduto, FonteReceita, FornecedorDefinidoEm, ProdutoCompleto } from "@/lib/vendas/produtos";
import type { TipoProduto } from "@/lib/vendas/oportunidades";
import { salvarProdutoAction } from "./actions";

const TIPO_LABEL: Record<TipoProduto, string> = {
  proprio: "Próprio (ArrudaCred executa e fatura)",
  subcontratado: "Subcontratado (ArrudaCred fatura, fornecedor executa)",
  comissionado: "Comissionado (fornecedor fatura, ArrudaCred só recebe comissão)",
};

const FONTE_RECEITA_LABEL: Record<FonteReceita, string> = { venda_direta: "Venda direta", comissao: "Comissão" };

function paraRascunho(produto: ProdutoCompleto | null): EntradaSalvarProduto & { id: string | null } {
  return {
    id: produto?.id ?? null,
    nome: produto?.nome ?? "",
    nomeReduzido: produto?.nomeReduzido ?? null,
    tipo: produto?.tipo ?? "proprio",
    parceiroExecutor: produto?.parceiroExecutor ?? null,
    fonteReceita: produto?.fonteReceita ?? "venda_direta",
    fornecedorId: produto?.fornecedorId ?? null,
    fornecedorDefinidoEm: produto?.fornecedorDefinidoEm ?? null,
    exigeListaDocumentos: produto?.exigeListaDocumentos ?? false,
    ativo: produto?.ativo ?? true,
  };
}

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

export function ProdutosClient({
  produtosIniciais,
  fornecedores,
}: {
  produtosIniciais: ProdutoCompleto[];
  fornecedores: FornecedorAdmin[];
}) {
  const [produtos, setProdutos] = useState(produtosIniciais);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [novoProduto, setNovoProduto] = useState<(EntradaSalvarProduto & { id: string | null }) | null>(null);

  return (
    <div className="max-w-3xl space-y-3 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Produtos & Serviços</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Catálogo de produtos/serviços vendidos — usado na Nova Oportunidade, nos templates de contrato e no cálculo de comissão.
          </p>
        </div>
        <button
          onClick={() => setNovoProduto(paraRascunho(null))}
          disabled={novoProduto !== null}
          className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          + Novo produto
        </button>
      </div>

      {novoProduto && (
        <CardProduto
          rascunhoInicial={novoProduto}
          fornecedores={fornecedores}
          expandidaDeInicio
          onSalvo={(produto) => {
            setProdutos((atual) => [...atual, produto].sort((a, b) => a.nome.localeCompare(b.nome)));
            setNovoProduto(null);
          }}
          onCancelarNovo={() => setNovoProduto(null)}
        />
      )}

      {produtos.map((produto) => (
        <CardProduto
          key={produto.id}
          rascunhoInicial={paraRascunho(produto)}
          fornecedores={fornecedores}
          expandida={expandidoId === produto.id}
          onExpandir={() => setExpandidoId(expandidoId === produto.id ? null : produto.id)}
          onSalvo={(atualizado) => setProdutos((atual) => atual.map((p) => (p.id === atualizado.id ? atualizado : p)))}
        />
      ))}

      {produtos.length === 0 && !novoProduto && <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum produto cadastrado ainda.</p>}
    </div>
  );
}

function CardProduto({
  rascunhoInicial,
  fornecedores,
  expandida,
  expandidaDeInicio,
  onExpandir,
  onSalvo,
  onCancelarNovo,
}: {
  rascunhoInicial: EntradaSalvarProduto & { id: string | null };
  fornecedores: FornecedorAdmin[];
  expandida?: boolean;
  expandidaDeInicio?: boolean;
  onExpandir?: () => void;
  onSalvo: (produto: ProdutoCompleto) => void;
  onCancelarNovo?: () => void;
}) {
  const [r, setR] = useState(rascunhoInicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const aberta = expandidaDeInicio || expandida;

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const resultado = await salvarProdutoAction(r.id, r);
    setSalvando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onSalvo({ ...r, id: resultado.id });
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <button type="button" onClick={onExpandir} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {r.nome || "(novo produto)"}
          {!r.ativo && <span className="ml-2 text-xs font-normal text-zinc-400">(inativo)</span>}
        </span>
        {onExpandir && <span className="text-zinc-400">{aberta ? "▲" : "▼"}</span>}
      </button>

      {aberta && (
        <div className="space-y-3 border-t border-zinc-200 p-4 dark:border-zinc-700">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={rotulo}>Nome</label>
              <input className={campo} value={r.nome} onChange={(e) => setR({ ...r, nome: e.target.value })} placeholder="ex.: Limpeza de Nome (CPF/CNPJ) — Serasa/SPC" />
            </div>
            <div className="space-y-1">
              <label className={rotulo}>Nome reduzido (opcional)</label>
              <input
                className={campo}
                value={r.nomeReduzido ?? ""}
                onChange={(e) => setR({ ...r, nomeReduzido: e.target.value || null })}
                placeholder="ex.: Limpa Nome"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className={rotulo}>Tipo</label>
            <select
              className={campo}
              value={r.tipo}
              onChange={(e) => {
                const tipo = e.target.value as TipoProduto;
                setR({
                  ...r,
                  tipo,
                  fornecedorId: tipo === "comissionado" ? r.fornecedorId : null,
                  fornecedorDefinidoEm: tipo === "subcontratado" ? r.fornecedorDefinidoEm : null,
                });
              }}
            >
              {(Object.entries(TIPO_LABEL) as [TipoProduto, string][]).map(([valor, label]) => (
                <option key={valor} value={valor}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {r.tipo === "comissionado" && (
            <div className="space-y-1">
              <label className={rotulo}>Fornecedor/administradora</label>
              <select className={campo} value={r.fornecedorId ?? ""} onChange={(e) => setR({ ...r, fornecedorId: e.target.value || null })}>
                <option value="">Selecione...</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          {r.tipo === "subcontratado" && (
            <div className="space-y-1">
              <label className={rotulo}>Onde o fornecedor é escolhido</label>
              <select
                className={campo}
                value={r.fornecedorDefinidoEm ?? ""}
                onChange={(e) => setR({ ...r, fornecedorDefinidoEm: (e.target.value || null) as FornecedorDefinidoEm | null })}
              >
                <option value="">Selecione...</option>
                <option value="venda">Na Venda (fechamento)</option>
                <option value="ordem_servico">Na Ordem de Serviço</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={rotulo}>Parceiro executor (opcional)</label>
              <input
                className={campo}
                value={r.parceiroExecutor ?? ""}
                onChange={(e) => setR({ ...r, parceiroExecutor: e.target.value || null })}
                placeholder="ex.: nome do banco/operadora"
              />
            </div>
            <div className="space-y-1">
              <label className={rotulo}>Fonte de receita</label>
              <select className={campo} value={r.fonteReceita} onChange={(e) => setR({ ...r, fonteReceita: e.target.value as FonteReceita })}>
                {(Object.entries(FONTE_RECEITA_LABEL) as [FonteReceita, string][]).map(([valor, label]) => (
                  <option key={valor} value={valor}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={r.exigeListaDocumentos}
                onChange={(e) => setR({ ...r, exigeListaDocumentos: e.target.checked })}
              />
              Exige lista de nomes cobertos (pacote de documentos)
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" checked={r.ativo} onChange={(e) => setR({ ...r, ativo: e.target.checked })} />
              Ativo
            </label>
          </div>

          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

          <div className="flex items-center justify-between pt-1">
            {!r.id && (
              <button onClick={onCancelarNovo} className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
                Cancelar
              </button>
            )}
            <button
              onClick={salvar}
              disabled={salvando}
              className="ml-auto rounded-full bg-zinc-900 px-5 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
