"use client";

import Link from "next/link";
import { useState } from "react";
import { formatarCpfCnpj } from "@/lib/vendas/mascaras";
import type { OportunidadeFechamento } from "@/lib/vendas/oportunidades";
import type { PessoaCompleta } from "@/lib/vendas/pessoas";
import { confirmarVendaComissionadaAction } from "./actions";

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

function formatarValor(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

type Props = {
  oportunidade: OportunidadeFechamento;
  pessoa: PessoaCompleta;
};

export function ConfirmarComissionadaClient({ oportunidade, pessoa }: Props) {
  const [dataAssinaturaCliente, setDataAssinaturaCliente] = useState(hoje());
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);

  async function confirmar() {
    setErro(null);
    setEnviando(true);
    const resultado = await confirmarVendaComissionadaAction(oportunidade.id, dataAssinaturaCliente);
    setEnviando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    setConfirmado(true);
  }

  if (confirmado) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-8">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Venda confirmada</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          A comissão do fornecedor já está registrada no financeiro e a venda aparece no Painel de Vendas.
        </p>
        <Link href="/admin/vendas" className="text-sm font-medium text-zinc-900 underline dark:text-zinc-50">
          Ir para o Painel de Vendas
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-8">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Confirmar venda</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Produto comissionado — o contrato de verdade é entre o cliente e o fornecedor, fora do sistema. Esta ação só registra a
        comissão que a ArrudaCred vai receber. Use quando o fornecedor já tiver aprovado a venda.
      </p>

      <div className="rounded-lg border border-zinc-300 p-3 text-sm dark:border-zinc-700">
        <p className="text-zinc-900 dark:text-zinc-50">
          {pessoa.nomeRazaoSocial} <span className="text-xs text-zinc-500 dark:text-zinc-400">({formatarCpfCnpj(pessoa.documento)})</span>
        </p>
        <p className="text-zinc-600 dark:text-zinc-400">{oportunidade.produtoNome}</p>
        <p className="font-medium text-zinc-700 dark:text-zinc-300">{formatarValor(oportunidade.valorEstimado)}</p>
      </div>

      <div>
        <label className={rotulo}>Data em que o cliente assinou com o fornecedor</label>
        <input
          type="date"
          className={campo}
          value={dataAssinaturaCliente}
          onChange={(e) => setDataAssinaturaCliente(e.target.value)}
        />
      </div>

      {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

      <button
        type="button"
        onClick={confirmar}
        disabled={enviando}
        className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {enviando ? "Confirmando..." : "Confirmar venda"}
      </button>
    </div>
  );
}
