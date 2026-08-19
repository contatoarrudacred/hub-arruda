"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { formatarCpfCnpj } from "@/lib/vendas/mascaras";
import { CampoEndereco, enderecoVazio, type ValorEndereco } from "@/components/vendas/campo-endereco";
import { LeitorDocumentoIA } from "@/components/vendas/leitor-documento-ia";
import { UploadDocumentosPessoa } from "@/components/vendas/upload-documentos-pessoa";
import { UploadFotoPessoa } from "@/components/vendas/upload-foto-pessoa";
import { buscarPessoaPorDocumentoAction, criarVendaSemFunilPrevioAction } from "./actions";

type Produto = { id: string; nome: string };

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

export function NovaVendaClient({ produtos }: { produtos: Produto[] }) {
  const [documento, setDocumento] = useState("");
  const [pessoaEncontrada, setPessoaEncontrada] = useState<{ id: string; nome: string } | null>(null);
  const [nomeNovaPessoa, setNomeNovaPessoa] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [valorEstimado, setValorEstimado] = useState("");
  const [endereco, setEndereco] = useState<ValorEndereco>(enderecoVazio);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ oportunidadeId: string; pessoaId: string } | null>(null);
  const [criando, setCriando] = useState(false);
  const buscaIdRef = useRef(0);
  const buscaTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function buscarPessoa(doc: string) {
    const idAtual = ++buscaIdRef.current;
    const resultadoBusca = await buscarPessoaPorDocumentoAction(doc);
    if (idAtual !== buscaIdRef.current) return; // uma busca mais recente já foi disparada, descarta esta resposta
    setPessoaEncontrada(resultadoBusca.encontrada ? { id: resultadoBusca.id, nome: resultadoBusca.nome } : null);
  }

  function aoMudarDocumento(valor: string) {
    const formatado = formatarCpfCnpj(valor);
    setDocumento(formatado);
    if (buscaTimeoutRef.current) clearTimeout(buscaTimeoutRef.current);
    buscaTimeoutRef.current = setTimeout(() => {
      buscarPessoa(formatado);
    }, 300);
  }

  async function criarVenda() {
    setErro(null);
    setCriando(true);
    try {
      const resultadoAction = await criarVendaSemFunilPrevioAction({
        pessoaId: pessoaEncontrada?.id ?? null,
        pessoaNova: pessoaEncontrada ? null : { nome: nomeNovaPessoa, documento },
        produtoId,
        valorEstimado: valorEstimado ? Number(valorEstimado) : null,
        endereco: endereco.cep
          ? {
              cep: endereco.cep,
              logradouro: endereco.logradouro,
              numero: endereco.numero,
              complemento: endereco.complemento || null,
              bairro: endereco.bairro,
              cidade: endereco.cidade,
              uf: endereco.uf,
            }
          : null,
      });
      if (!resultadoAction.sucesso) {
        setErro(resultadoAction.erro);
        return;
      }
      setResultado({ oportunidadeId: resultadoAction.oportunidadeId, pessoaId: resultadoAction.pessoaId });
    } finally {
      setCriando(false);
    }
  }

  if (resultado) {
    return (
      <div className="max-w-2xl space-y-3 p-8">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          ✓ Venda criada — Oportunidade já está na etapa &quot;Dados para Contrato&quot;. Pode anexar documentos e foto do cliente agora, ou fazer isso depois.
        </p>
        <UploadFotoPessoa pessoaId={resultado.pessoaId} />
        <UploadDocumentosPessoa pessoaId={resultado.pessoaId} />
        <Link
          href={`/admin/vendas/${resultado.oportunidadeId}`}
          className="inline-block rounded-full bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Continuar pra gerar o contrato →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-3 p-8">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Nova venda (sem funil prévio)</h1>

      <LeitorDocumentoIA
        onDadosExtraidos={(dados) => {
          if (dados.documento) setDocumento(formatarCpfCnpj(dados.documento));
          if (dados.nome) setNomeNovaPessoa(dados.nome);
          setEndereco((atual) => ({
            ...atual,
            cep: dados.cep || atual.cep,
            logradouro: dados.logradouro || atual.logradouro,
            numero: dados.numero || atual.numero,
            bairro: dados.bairro || atual.bairro,
            cidade: dados.cidade || atual.cidade,
            uf: dados.uf || atual.uf,
          }));
        }}
      />

      <div>
        <label className={rotulo}>CPF ou CNPJ do cliente</label>
        <input
          className={campo}
          value={documento}
          onChange={(e) => aoMudarDocumento(e.target.value)}
          placeholder="000.000.000-00"
        />
      </div>
      {pessoaEncontrada ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">✓ Cliente já cadastrado: {pessoaEncontrada.nome}</p>
      ) : (
        <div>
          <label className={rotulo}>Nome (cliente novo)</label>
          <input className={campo} value={nomeNovaPessoa} onChange={(e) => setNomeNovaPessoa(e.target.value)} />
        </div>
      )}

      <div>
        <label className={rotulo}>Serviço</label>
        <select className={campo} value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
          <option value="">Selecione o Serviço</option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={rotulo}>Valor estimado (R$)</label>
        <input className={campo} type="number" value={valorEstimado} onChange={(e) => setValorEstimado(e.target.value)} />
      </div>

      <CampoEndereco value={endereco} onChange={setEndereco} />

      {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
      <button
        onClick={criarVenda}
        disabled={criando}
        className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {criando ? "Criando..." : "Criar venda"}
      </button>
    </div>
  );
}
