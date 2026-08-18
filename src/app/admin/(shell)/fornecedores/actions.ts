"use server";

import { revalidatePath } from "next/cache";
import { buscarPessoaPorDocumento, resolverOuCriarPessoa } from "@/lib/vendas/pessoas";
import {
  excluirFornecedor as excluirFornecedorRepo,
  salvarFornecedor as salvarFornecedorRepo,
  type EntradaSalvarFornecedor,
} from "@/lib/vendas/fornecedores";
import { salvarEndereco, type EntradaSalvarEndereco } from "@/lib/vendas/endereco";

export type ResultadoBuscarPessoa =
  | { encontrada: true; id: string; nome: string; documento: string }
  | { encontrada: false };

export async function buscarPessoaPorDocumentoAction(documento: string): Promise<ResultadoBuscarPessoa> {
  const pessoa = await buscarPessoaPorDocumento(documento);
  if (!pessoa) return { encontrada: false };
  return { encontrada: true, id: pessoa.id, nome: pessoa.nome, documento: pessoa.documento };
}

export type ResultadoSalvarFornecedor = { sucesso: true; id: string; pessoaId: string } | { sucesso: false; erro: string };

export async function salvarFornecedorAction(
  entrada: EntradaSalvarFornecedor & {
    pessoaNova: { nome: string; documento: string } | null;
    endereco: Omit<EntradaSalvarEndereco, "pessoaId" | "tipo"> | null;
  },
): Promise<ResultadoSalvarFornecedor> {
  try {
    const pessoa = await resolverOuCriarPessoa({ pessoaId: entrada.pessoaId || null, pessoaNova: entrada.pessoaNova });
    if (!pessoa.sucesso) {
      return { sucesso: false, erro: pessoa.erro };
    }

    const resultado = await salvarFornecedorRepo({ ...entrada, pessoaId: pessoa.pessoaId });

    if (entrada.endereco && entrada.endereco.cep) {
      await salvarEndereco({ ...entrada.endereco, pessoaId: pessoa.pessoaId, tipo: "comercial" });
    }

    revalidatePath("/admin/fornecedores");
    return { sucesso: true, id: resultado.id, pessoaId: pessoa.pessoaId };
  } catch {
    return {
      sucesso: false,
      erro: "Falha ao salvar fornecedor. Verifique se essa pessoa já não está cadastrada como fornecedor.",
    };
  }
}

export type ResultadoExcluirFornecedor = { sucesso: true } | { sucesso: false; erro: string };

export async function excluirFornecedorAction(id: string): Promise<ResultadoExcluirFornecedor> {
  try {
    await excluirFornecedorRepo(id);
    revalidatePath("/admin/fornecedores");
    return { sucesso: true };
  } catch {
    return { sucesso: false, erro: "Falha ao excluir fornecedor." };
  }
}
