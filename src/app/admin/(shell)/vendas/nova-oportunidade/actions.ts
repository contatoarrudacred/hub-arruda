"use server";

import { buscarRazaoSocialPorCnpj } from "@/lib/vendas/cnpj-publico";
import { buscarPessoaCompleta, buscarPessoaPorDocumento } from "@/lib/vendas/pessoas";

export type ResultadoBuscarPessoa =
  | {
      encontrada: true;
      id: string;
      nome: string;
      email: string | null;
      whatsapp: string | null;
      rg: string | null;
      estadoCivil: string | null;
      profissao: string | null;
    }
  | { encontrada: false };

export async function buscarPessoaPorDocumentoAction(documento: string): Promise<ResultadoBuscarPessoa> {
  const pessoa = await buscarPessoaPorDocumento(documento);
  if (!pessoa) return { encontrada: false };
  // buscarPessoaPorDocumento (PessoaEncontrada) não traz rg/estadoCivil/profissao — busca completa:
  const completa = await buscarPessoaCompleta(pessoa.id);
  if (!completa) return { encontrada: false };
  return {
    encontrada: true,
    id: completa.id,
    nome: completa.nomeRazaoSocial,
    email: completa.email,
    whatsapp: completa.whatsapp,
    rg: completa.rg,
    estadoCivil: completa.estadoCivil,
    profissao: completa.profissao,
  };
}

export async function buscarRazaoSocialAction(cnpj: string): Promise<{ razaoSocial: string } | null> {
  return buscarRazaoSocialPorCnpj(cnpj);
}
