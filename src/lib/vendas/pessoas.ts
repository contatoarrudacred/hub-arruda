import { createClient } from "@/lib/supabase/server";
import { normalizarDocumento, tipoPessoaPorDocumento, validarDocumento } from "./documento";
import { paraCaixaAlta } from "./mascaras";

export type PessoaEncontrada = {
  id: string;
  nome: string;
  documento: string;
  tipoPessoa: "pf" | "pj";
  email: string | null;
  whatsapp: string | null;
  papeis: string[];
};

export async function buscarPessoaPorDocumento(documento: string): Promise<PessoaEncontrada | null> {
  const documentoNormalizado = normalizarDocumento(documento);
  const supabase = await createClient();
  const { data: pessoa, error } = await supabase
    .from("pessoas")
    .select("id, nome_razao_social, documento, tipo_pessoa, email, whatsapp")
    .eq("documento", documentoNormalizado)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar pessoa: ${error.message}`);
  if (!pessoa) return null;

  const { data: papeis, error: erroPapeis } = await supabase
    .from("pessoa_papeis")
    .select("tipo_papel")
    .eq("pessoa_id", pessoa.id)
    .eq("status", "ativo");
  if (erroPapeis) throw new Error(`Falha ao buscar papéis da pessoa: ${erroPapeis.message}`);

  return {
    id: pessoa.id,
    nome: pessoa.nome_razao_social,
    documento: pessoa.documento,
    tipoPessoa: pessoa.tipo_pessoa as "pf" | "pj",
    email: pessoa.email,
    whatsapp: pessoa.whatsapp,
    papeis: (papeis ?? []).map((linha) => linha.tipo_papel),
  };
}

export type PessoaCompleta = {
  id: string;
  tipoPessoa: "pf" | "pj";
  nomeRazaoSocial: string;
  documento: string;
  email: string | null;
  whatsapp: string | null;
  rg: string | null;
  estadoCivil: string | null;
  profissao: string | null;
};

export async function buscarPessoaCompleta(pessoaId: string): Promise<PessoaCompleta | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pessoas")
    .select("id, tipo_pessoa, nome_razao_social, documento, email, whatsapp, rg, estado_civil, profissao")
    .eq("id", pessoaId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar pessoa: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    tipoPessoa: data.tipo_pessoa as "pf" | "pj",
    nomeRazaoSocial: data.nome_razao_social,
    documento: data.documento,
    email: data.email,
    whatsapp: data.whatsapp,
    rg: data.rg,
    estadoCivil: data.estado_civil,
    profissao: data.profissao,
  };
}

export type EntradaDadosContratoPessoa = {
  // Achado real (Luiz, 20/08/2026): a tela Nova Oportunidade deixa editar o nome de uma pessoa já
  // existente, mas até aqui essa edição nunca era enviada pro servidor pra pessoa existente (só
  // pessoaNova, usado ao CRIAR, carregava nome) — o contrato saía com o nome antigo. `null` quando
  // quem chama não tem um nome editável nessa tela (ex.: representante legal, cujo nome só é
  // digitável ao cadastrar um novo — achado já existente permanece read-only quando encontrado).
  nome: string | null;
  email: string | null;
  whatsapp: string | null;
  rg: string | null;
  estadoCivil: string | null;
  profissao: string | null;
};

/** Atualiza os campos de uma Pessoa exigidos pelo contrato (Fechamento de Venda) — RG/estado
 * civil/profissão só fazem sentido pra Pessoa Física (signatário PF, ou representante legal de
 * uma PJ), mas a função não valida isso — quem chama decide quando usar. */
export async function atualizarDadosContratoPessoa(pessoaId: string, entrada: EntradaDadosContratoPessoa): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("pessoas")
    .update({
      ...(entrada.nome?.trim() ? { nome_razao_social: paraCaixaAlta(entrada.nome) } : {}),
      email: entrada.email,
      whatsapp: entrada.whatsapp,
      rg: entrada.rg,
      estado_civil: entrada.estadoCivil,
      profissao: entrada.profissao,
    })
    .eq("id", pessoaId);
  if (error) throw new Error(`Falha ao atualizar dados da pessoa: ${error.message}`);
}

export type EntradaCriarPessoa = {
  nome: string;
  documento: string;
  email: string | null;
  whatsapp: string | null;
};

export async function criarPessoa(entrada: EntradaCriarPessoa): Promise<{ id: string }> {
  const documentoNormalizado = normalizarDocumento(entrada.documento);
  const tipoPessoa = tipoPessoaPorDocumento(documentoNormalizado);
  if (!tipoPessoa) throw new Error("Documento inválido — não é um CPF nem CNPJ válido.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pessoas")
    .insert({
      tipo_pessoa: tipoPessoa,
      nome_razao_social: paraCaixaAlta(entrada.nome),
      documento: documentoNormalizado,
      email: entrada.email,
      whatsapp: entrada.whatsapp,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar pessoa: ${error.message}`);
  return { id: data.id };
}

export type EntradaResolverOuCriarPessoa = {
  pessoaId: string | null;
  pessoaNova: { nome: string; documento: string } | null;
};

export type ResultadoResolverPessoa = { sucesso: true; pessoaId: string } | { sucesso: false; erro: string };

export async function resolverOuCriarPessoa(entrada: EntradaResolverOuCriarPessoa): Promise<ResultadoResolverPessoa> {
  if (entrada.pessoaId) {
    return { sucesso: true, pessoaId: entrada.pessoaId };
  }

  if (!entrada.pessoaNova) {
    return { sucesso: false, erro: "Selecione ou cadastre uma Pessoa." };
  }

  if (!validarDocumento(entrada.pessoaNova.documento)) {
    return { sucesso: false, erro: "CPF/CNPJ inválido." };
  }
  if (!entrada.pessoaNova.nome.trim()) {
    return { sucesso: false, erro: "Nome é obrigatório." };
  }

  const pessoaExistente = await buscarPessoaPorDocumento(entrada.pessoaNova.documento);
  if (pessoaExistente) {
    return { sucesso: true, pessoaId: pessoaExistente.id };
  }

  const nova = await criarPessoa({
    nome: entrada.pessoaNova.nome,
    documento: entrada.pessoaNova.documento,
    email: null,
    whatsapp: null,
  });
  return { sucesso: true, pessoaId: nova.id };
}
