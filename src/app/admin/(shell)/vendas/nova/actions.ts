"use server";

import { buscarPessoaPorDocumento, resolverOuCriarPessoa } from "@/lib/vendas/pessoas";
import { criarOportunidadeSemFunilPrevio } from "@/lib/vendas/clientes";
import { salvarEndereco, type EntradaSalvarEndereco } from "@/lib/vendas/endereco";

export type ResultadoBuscarPessoa =
  | { encontrada: true; id: string; nome: string; documento: string }
  | { encontrada: false };

export async function buscarPessoaPorDocumentoAction(documento: string): Promise<ResultadoBuscarPessoa> {
  const pessoa = await buscarPessoaPorDocumento(documento);
  if (!pessoa) return { encontrada: false };
  return { encontrada: true, id: pessoa.id, nome: pessoa.nome, documento: pessoa.documento };
}

export type EntradaCriarVenda = {
  pessoaId: string | null;
  pessoaNova: { nome: string; documento: string } | null;
  produtoId: string;
  valorEstimado: number | null;
  endereco: Omit<EntradaSalvarEndereco, "pessoaId" | "tipo"> | null;
};

export type ResultadoCriarVenda = { sucesso: true; oportunidadeId: string; pessoaId: string } | { sucesso: false; erro: string };

export async function criarVendaSemFunilPrevioAction(entrada: EntradaCriarVenda): Promise<ResultadoCriarVenda> {
  const pessoa = await resolverOuCriarPessoa({ pessoaId: entrada.pessoaId, pessoaNova: entrada.pessoaNova });
  if (!pessoa.sucesso) {
    return { sucesso: false, erro: pessoa.erro };
  }
  if (!entrada.produtoId) {
    return { sucesso: false, erro: "Selecione um Serviço." };
  }

  try {
    if (entrada.endereco && entrada.endereco.cep) {
      await salvarEndereco({ ...entrada.endereco, pessoaId: pessoa.pessoaId, tipo: "residencial" });
    }

    const resultado = await criarOportunidadeSemFunilPrevio({
      pessoaId: pessoa.pessoaId,
      produtoId: entrada.produtoId,
      valorEstimado: entrada.valorEstimado,
    });
    return { sucesso: true, oportunidadeId: resultado.oportunidadeId, pessoaId: pessoa.pessoaId };
  } catch {
    return { sucesso: false, erro: "Falha ao criar a venda. Tente novamente." };
  }
}
