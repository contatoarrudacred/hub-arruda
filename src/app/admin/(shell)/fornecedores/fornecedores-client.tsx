"use client";

import { useRef, useState } from "react";
import type { FornecedorAdmin } from "@/lib/vendas/fornecedores";
import { formatarCpfCnpj } from "@/lib/vendas/mascaras";
import { CampoEndereco, enderecoVazio, type ValorEndereco } from "@/components/vendas/campo-endereco";
import { LeitorDocumentoIA } from "@/components/vendas/leitor-documento-ia";
import { UploadDocumentosPessoa } from "@/components/vendas/upload-documentos-pessoa";
import { UploadFotoPessoa } from "@/components/vendas/upload-foto-pessoa";
import { buscarPessoaPorDocumentoAction, excluirFornecedorAction, salvarFornecedorAction } from "./actions";

const CATEGORIAS = [
  { valor: "consorcio", rotulo: "Consórcio" },
  { valor: "credito", rotulo: "Crédito" },
  { valor: "subcontratado_servico", rotulo: "Subcontratado de serviço" },
  { valor: "administrativo", rotulo: "Administrativo" },
] as const;

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

export function FornecedoresClient({ fornecedoresIniciais }: { fornecedoresIniciais: FornecedorAdmin[] }) {
  const [fornecedores, setFornecedores] = useState(fornecedoresIniciais);
  const [formAberto, setFormAberto] = useState(false);
  const [documentoBusca, setDocumentoBusca] = useState("");
  const [pessoaSelecionada, setPessoaSelecionada] = useState<{ id: string; nome: string } | null>(null);
  const [nomeNovaPessoa, setNomeNovaPessoa] = useState("");
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS)[number]["valor"]>("consorcio");
  const [endereco, setEndereco] = useState<ValorEndereco>(enderecoVazio);
  const [erro, setErro] = useState<string | null>(null);
  const [pessoaIdSalva, setPessoaIdSalva] = useState<string | null>(null);
  const buscaIdRef = useRef(0);
  const buscaTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function buscarPessoa(documento: string) {
    const idAtual = ++buscaIdRef.current;
    const resultado = await buscarPessoaPorDocumentoAction(documento);
    if (idAtual !== buscaIdRef.current) return; // uma busca mais recente já foi disparada, descarta esta resposta
    setPessoaSelecionada(resultado.encontrada ? { id: resultado.id, nome: resultado.nome } : null);
  }

  function aoMudarDocumento(valor: string) {
    const formatado = formatarCpfCnpj(valor);
    setDocumentoBusca(formatado);
    if (buscaTimeoutRef.current) clearTimeout(buscaTimeoutRef.current);
    buscaTimeoutRef.current = setTimeout(() => {
      buscarPessoa(formatado);
    }, 300);
  }

  async function salvar() {
    setErro(null);
    const resultado = await salvarFornecedorAction({
      id: null,
      pessoaId: pessoaSelecionada?.id ?? "",
      categoria,
      ativo: true,
      pessoaNova: pessoaSelecionada ? null : { nome: nomeNovaPessoa, documento: documentoBusca },
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
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    setPessoaIdSalva(resultado.pessoaId);
  }

  function fecharNovo() {
    setFormAberto(false);
    setDocumentoBusca("");
    setPessoaSelecionada(null);
    setNomeNovaPessoa("");
    setEndereco(enderecoVazio);
    setPessoaIdSalva(null);
    window.location.reload();
  }

  async function excluir(id: string) {
    await excluirFornecedorAction(id);
    setFornecedores((atual) => atual.filter((f) => f.id !== id));
  }

  return (
    <div className="max-w-3xl space-y-3 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Fornecedores</h1>
        <button
          onClick={() => setFormAberto(true)}
          disabled={formAberto}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          + Novo fornecedor
        </button>
      </div>

      {formAberto && !pessoaIdSalva && (
        <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
          <LeitorDocumentoIA
            onDadosExtraidos={(dados) => {
              if (dados.documento) setDocumentoBusca(formatarCpfCnpj(dados.documento));
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
            <label className={rotulo} title="Buscamos automaticamente se esse CPF/CNPJ já está cadastrado">
              CPF ou CNPJ
            </label>
            <input
              className={campo}
              value={documentoBusca}
              onChange={(e) => aoMudarDocumento(e.target.value)}
              placeholder="000.000.000-00"
            />
          </div>
          {pessoaSelecionada ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">✓ Pessoa já cadastrada: {pessoaSelecionada.nome}</p>
          ) : (
            <div>
              <label className={rotulo}>Nome / Razão Social</label>
              <input className={campo} value={nomeNovaPessoa} onChange={(e) => setNomeNovaPessoa(e.target.value)} />
            </div>
          )}

          <div>
            <label className={rotulo}>Categoria</label>
            <select className={campo} value={categoria} onChange={(e) => setCategoria(e.target.value as typeof categoria)}>
              {CATEGORIAS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </div>

          <CampoEndereco value={endereco} onChange={setEndereco} />

          {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
          <div className="flex gap-2">
            <button onClick={salvar} className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900">
              Salvar
            </button>
            <button onClick={() => setFormAberto(false)} className="rounded-full px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {pessoaIdSalva && (
        <div className="space-y-3 rounded-lg border border-emerald-300 p-4 dark:border-emerald-700">
          <p className="text-sm text-emerald-700 dark:text-emerald-400">✓ Fornecedor salvo. Pode anexar documentos e foto agora, ou fazer isso depois.</p>
          <UploadFotoPessoa pessoaId={pessoaIdSalva} />
          <UploadDocumentosPessoa pessoaId={pessoaIdSalva} />
          <button onClick={fecharNovo} className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900">
            Concluir
          </button>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left dark:border-zinc-700">
            <th className="py-1">Nome</th>
            <th className="py-1">Documento</th>
            <th className="py-1">Categoria</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {fornecedores.map((f) => (
            <tr key={f.id} className="border-b border-zinc-100 dark:border-zinc-800">
              <td className="py-1">{f.nome}</td>
              <td className="py-1">{formatarCpfCnpj(f.documento)}</td>
              <td className="py-1">{CATEGORIAS.find((c) => c.valor === f.categoria)?.rotulo}</td>
              <td className="py-1 text-right">
                <button onClick={() => excluir(f.id)} className="text-xs text-red-600 dark:text-red-400">
                  Excluir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {fornecedores.length === 0 && <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum fornecedor cadastrado ainda.</p>}
    </div>
  );
}
