"use client";

import { useState } from "react";
import { CampoEndereco, enderecoVazio, type ValorEndereco } from "@/components/vendas/campo-endereco";
import { LeitorDocumentoIA } from "@/components/vendas/leitor-documento-ia";
import { formatarCpfCnpj } from "@/lib/vendas/mascaras";
import { tipoPessoaPorDocumento } from "@/lib/vendas/documento";
import type { ProdutoParaVenda } from "@/lib/vendas/produtos";
import { buscarPessoaPorDocumentoAction, buscarRazaoSocialAction, type ResultadoBuscarPessoa } from "./actions";

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";
const secao = "space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700";

type DadosContratoForm = { nome: string; email: string; whatsapp: string; rg: string; estadoCivil: string; profissao: string };

const dadosContratoVazios: DadosContratoForm = { nome: "", email: "", whatsapp: "", rg: "", estadoCivil: "", profissao: "" };

export function NovaOportunidadeClient({ produtos }: { produtos: ProdutoParaVenda[] }) {
  const [produtoId, setProdutoId] = useState("");
  const produtoSelecionado = produtos.find((p) => p.id === produtoId) ?? null;

  const [documento, setDocumento] = useState("");
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [dadosContrato, setDadosContrato] = useState<DadosContratoForm>(dadosContratoVazios);
  const [endereco, setEndereco] = useState<ValorEndereco>(enderecoVazio);
  const [buscandoPessoa, setBuscandoPessoa] = useState(false);

  async function aoDigitarDocumento(valor: string) {
    const formatado = formatarCpfCnpj(valor);
    setDocumento(formatado);
    const tipo = tipoPessoaPorDocumento(formatado);
    if (!tipo) return;

    setBuscandoPessoa(true);
    const resultado: ResultadoBuscarPessoa = await buscarPessoaPorDocumentoAction(formatado);
    if (resultado.encontrada) {
      setPessoaId(resultado.id);
      setDadosContrato({
        nome: resultado.nome,
        email: resultado.email ?? "",
        whatsapp: resultado.whatsapp ?? "",
        rg: resultado.rg ?? "",
        estadoCivil: resultado.estadoCivil ?? "",
        profissao: resultado.profissao ?? "",
      });
    } else {
      setPessoaId(null);
      if (tipo === "pj") {
        const razaoSocial = await buscarRazaoSocialAction(formatado);
        setDadosContrato({ ...dadosContratoVazios, nome: razaoSocial?.razaoSocial ?? "" });
      } else {
        setDadosContrato(dadosContratoVazios);
      }
    }
    setBuscandoPessoa(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Nova Oportunidade</h1>

      <div className={secao}>
        <label className={rotulo}>Serviço</label>
        <select className={campo} value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
          <option value="">Selecione...</option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        {produtoSelecionado?.exigeListaDocumentos && (
          <p className="text-xs text-zinc-500">
            Este serviço aceita mais de um CPF/CNPJ no mesmo contrato — a seção de pacote de documentos entra na próxima etapa desta tela.
          </p>
        )}
      </div>

      <div className={secao}>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Quem assina o contrato</h2>
        <LeitorDocumentoIA
          onDadosExtraidos={(dados) => {
            if (dados.documento) aoDigitarDocumento(dados.documento);
            if (dados.nome) setDadosContrato((atual) => ({ ...atual, nome: dados.nome }));
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
        <label className={rotulo}>CPF/CNPJ</label>
        <input className={campo} value={documento} onChange={(e) => aoDigitarDocumento(e.target.value)} />
        {buscandoPessoa && <p className="text-xs text-zinc-500">Buscando...</p>}
        {!buscandoPessoa && pessoaId && <p className="text-xs text-emerald-600 dark:text-emerald-400">Pessoa já cadastrada — dados carregados.</p>}
        <label className={rotulo}>Nome completo / Razão social</label>
        <input
          className={campo}
          value={dadosContrato.nome}
          onChange={(e) => setDadosContrato({ ...dadosContrato, nome: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={rotulo}>RG</label>
            <input className={campo} value={dadosContrato.rg} onChange={(e) => setDadosContrato({ ...dadosContrato, rg: e.target.value })} />
          </div>
          <div>
            <label className={rotulo}>Estado civil</label>
            <input
              className={campo}
              value={dadosContrato.estadoCivil}
              onChange={(e) => setDadosContrato({ ...dadosContrato, estadoCivil: e.target.value })}
            />
          </div>
          <div>
            <label className={rotulo}>Profissão</label>
            <input
              className={campo}
              value={dadosContrato.profissao}
              onChange={(e) => setDadosContrato({ ...dadosContrato, profissao: e.target.value })}
            />
          </div>
          <div>
            <label className={rotulo}>E-mail</label>
            <input className={campo} value={dadosContrato.email} onChange={(e) => setDadosContrato({ ...dadosContrato, email: e.target.value })} />
          </div>
          <div>
            <label className={rotulo}>WhatsApp</label>
            <input
              className={campo}
              value={dadosContrato.whatsapp}
              onChange={(e) => setDadosContrato({ ...dadosContrato, whatsapp: e.target.value })}
            />
          </div>
        </div>
        <CampoEndereco value={endereco} onChange={setEndereco} />
      </div>

      {/* Seções de pacote de documentos e financeiro entram na Task 13 — pessoaId acima já fica
          pronto pra ser consumido pelo submit final daquela task. */}
    </div>
  );
}
