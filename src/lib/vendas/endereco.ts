import { createClient } from "@/lib/supabase/server";
import { normalizarCep, paraCaixaAlta } from "./mascaras";

export type EnderecoViaCep = {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export async function buscarEnderecoPorCep(cep: string): Promise<EnderecoViaCep | null> {
  const cepNormalizado = normalizarCep(cep);
  if (cepNormalizado.length !== 8) return null;

  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cepNormalizado}/json/`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resposta.ok) return null;

    const dados = (await resposta.json()) as {
      erro?: boolean;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };
    if (dados.erro) return null;

    return {
      logradouro: paraCaixaAlta(dados.logradouro ?? ""),
      bairro: paraCaixaAlta(dados.bairro ?? ""),
      cidade: paraCaixaAlta(dados.localidade ?? ""),
      uf: dados.uf ?? "",
    };
  } catch {
    return null;
  }
}

export type TipoEndereco = "residencial" | "comercial" | "cobranca";

export type EntradaSalvarEndereco = {
  pessoaId: string;
  tipo: TipoEndereco;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
};

export async function salvarEndereco(entrada: EntradaSalvarEndereco): Promise<{ id: string }> {
  const supabase = await createClient();
  const linha = {
    pessoa_id: entrada.pessoaId,
    tipo: entrada.tipo,
    cep: normalizarCep(entrada.cep),
    logradouro: paraCaixaAlta(entrada.logradouro),
    numero: entrada.numero,
    complemento: entrada.complemento ? paraCaixaAlta(entrada.complemento) : null,
    bairro: paraCaixaAlta(entrada.bairro),
    cidade: paraCaixaAlta(entrada.cidade),
    uf: entrada.uf,
  };

  const { data: existente, error: erroBusca } = await supabase
    .from("enderecos")
    .select("id")
    .eq("pessoa_id", entrada.pessoaId)
    .eq("tipo", entrada.tipo)
    .maybeSingle();
  if (erroBusca) throw new Error(`Falha ao checar endereço existente: ${erroBusca.message}`);

  if (existente) {
    const { error } = await supabase.from("enderecos").update(linha).eq("id", existente.id);
    if (error) throw new Error(`Falha ao atualizar endereço: ${error.message}`);
    return { id: existente.id };
  }

  const { data, error } = await supabase.from("enderecos").insert(linha).select("id").single();
  if (error) throw new Error(`Falha ao criar endereço: ${error.message}`);
  return { id: data.id };
}

export type EnderecoPessoa = {
  id: string;
  tipo: TipoEndereco;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
};

export async function buscarEnderecoPorPessoa(
  pessoaId: string,
  tipo: TipoEndereco = "residencial",
): Promise<EnderecoPessoa | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enderecos")
    .select("id, tipo, cep, logradouro, numero, complemento, bairro, cidade, uf")
    .eq("pessoa_id", pessoaId)
    .eq("tipo", tipo)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar endereço: ${error.message}`);
  return data as EnderecoPessoa | null;
}
