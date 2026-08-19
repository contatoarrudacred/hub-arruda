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

export type EntradaPacote = { documento: string; nomeRazaoSocial: string };

export type EntradaFinanceiro =
  | { especie: "boleto_pix"; formaPagamento: "avista" | "parcelado"; primeiraParcela: string; qtdParcelas: number; diaAncora: 1 | 10 | 20 }
  | { especie: "cartao"; maxParcelas: number };

type RepresentanteEntrada = {
  pessoaId: string | null;
  pessoaNova: { nome: string; documento: string } | null;
  dadosContrato: { email: string; whatsapp: string; rg: string; estadoCivil: string; profissao: string };
  endereco: { cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string } | null;
};

export type EntradaConfirmarNovaOportunidade = {
  produtoId: string;
  pessoaId: string | null;
  pessoaNova: { nome: string; documento: string } | null;
  dadosContrato: { email: string; whatsapp: string; rg: string; estadoCivil: string; profissao: string };
  endereco: { cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string } | null;
  pacote: EntradaPacote[];
  valorTotal: number | null;
  financeiro: EntradaFinanceiro | null; // null quando comissionado
  representante: RepresentanteEntrada | null; // obrigatório quando a pessoa é PJ E financeiro != null; senão ignorado
};

export type ResultadoConfirmarNovaOportunidade =
  | { sucesso: true; oportunidadeId: string }
  | { sucesso: false; erro: string };

export async function confirmarNovaOportunidadeAction(
  entrada: EntradaConfirmarNovaOportunidade,
): Promise<ResultadoConfirmarNovaOportunidade> {
  try {
    const { resolverOuCriarPessoa, atualizarDadosContratoPessoa } = await import("@/lib/vendas/pessoas");
    const { salvarEndereco } = await import("@/lib/vendas/endereco");
    const { salvarDocumentosPacote } = await import("@/lib/vendas/oportunidades");
    const { tipoPessoaPorDocumento } = await import("@/lib/vendas/documento");

    const pessoa = await resolverOuCriarPessoa({ pessoaId: entrada.pessoaId, pessoaNova: entrada.pessoaNova });
    if (!pessoa.sucesso) return { sucesso: false, erro: pessoa.erro };

    await atualizarDadosContratoPessoa(pessoa.pessoaId, {
      email: entrada.dadosContrato.email || null,
      whatsapp: entrada.dadosContrato.whatsapp || null,
      rg: entrada.dadosContrato.rg || null,
      estadoCivil: entrada.dadosContrato.estadoCivil || null,
      profissao: entrada.dadosContrato.profissao || null,
    });
    if (entrada.endereco?.cep) {
      await salvarEndereco({ ...entrada.endereco, pessoaId: pessoa.pessoaId, tipo: "residencial" });
    }

    // Financeiro null = comissionado: só cria a Oportunidade, sem contratos (ver seção 3.1/3.6 da spec)
    const { criarOportunidadeSemFunilPrevio } = await import("@/lib/vendas/clientes");
    const { oportunidadeId } = await criarOportunidadeSemFunilPrevio({
      pessoaId: pessoa.pessoaId,
      produtoId: entrada.produtoId,
      valorEstimado: entrada.valorTotal,
    });

    if (entrada.pacote.length > 0) {
      const documentosValidos = entrada.pacote.filter((d) => d.documento.trim() && d.nomeRazaoSocial.trim());
      await salvarDocumentosPacote(
        oportunidadeId,
        documentosValidos.map((d) => ({
          documento: d.documento,
          nomeRazaoSocial: d.nomeRazaoSocial,
          tipoDocumento: tipoPessoaPorDocumento(d.documento) === "pj" ? "cnpj" : "cpf",
        })),
      );
    }

    if (!entrada.financeiro) {
      return { sucesso: true, oportunidadeId };
    }

    const { buscarTemplateAtivoPorProduto } = await import("@/lib/vendas/contrato-templates");
    const { buscarPessoaArrudaCredSignatario, criarContrato } = await import("@/lib/vendas/contratos");
    const { calcularParcelasContrato } = await import("@/lib/vendas/calculo-parcelas");

    const template = await buscarTemplateAtivoPorProduto(entrada.produtoId);
    if (!template) return { sucesso: false, erro: "Nenhum template de contrato configurado pra esse produto." };

    const pessoaArrudaCredId = await buscarPessoaArrudaCredSignatario();
    if (!pessoaArrudaCredId) {
      return { sucesso: false, erro: "Signatário da ArrudaCred não configurado (Configurações > contrato_arrudacred_signatario)." };
    }

    const pessoaCompleta = await buscarPessoaCompleta(pessoa.pessoaId);
    if (!pessoaCompleta) return { sucesso: false, erro: "Pessoa não encontrada após criação/resolução." };

    let representanteId: string | null = null;
    if (pessoaCompleta.tipoPessoa === "pj") {
      if (!entrada.representante) return { sucesso: false, erro: "Informe o representante legal da empresa." };

      const { definirRepresentante } = await import("@/lib/vendas/pessoa-representantes");
      const resolvidoRepresentante = await resolverOuCriarPessoa({
        pessoaId: entrada.representante.pessoaId,
        pessoaNova: entrada.representante.pessoaNova,
      });
      if (!resolvidoRepresentante.sucesso) return { sucesso: false, erro: resolvidoRepresentante.erro };

      representanteId = resolvidoRepresentante.pessoaId;
      await definirRepresentante(pessoa.pessoaId, representanteId);
      await atualizarDadosContratoPessoa(representanteId, {
        email: entrada.representante.dadosContrato.email || null,
        whatsapp: entrada.representante.dadosContrato.whatsapp || null,
        rg: entrada.representante.dadosContrato.rg || null,
        estadoCivil: entrada.representante.dadosContrato.estadoCivil || null,
        profissao: entrada.representante.dadosContrato.profissao || null,
      });
      if (entrada.representante.endereco?.cep) {
        await salvarEndereco({ ...entrada.representante.endereco, pessoaId: representanteId, tipo: "residencial" });
      }
    }

    const valorTotal = entrada.valorTotal ?? 0;
    let parcelas;
    let formaPagamento: "avista" | "parcelado";
    let metodoPagamento: "boleto_pix" | "cartao";

    if (entrada.financeiro.especie === "boleto_pix") {
      formaPagamento = entrada.financeiro.formaPagamento;
      metodoPagamento = "boleto_pix";
      const primeiraParcela = new Date(entrada.financeiro.primeiraParcela);
      parcelas =
        formaPagamento === "avista"
          ? [{ numero: 1, valor: valorTotal, vencimento: primeiraParcela }]
          : calcularParcelasContrato(valorTotal, entrada.financeiro.qtdParcelas, primeiraParcela, entrada.financeiro.diaAncora);
    } else {
      formaPagamento = "parcelado";
      metodoPagamento = "cartao";
      // Cartão não tem tabela de parcelas prévia (ver spec seção 6) — 1 "parcela" placeholder cobrindo
      // o valor total; os títulos reais vêm da Asaas depois que o Checkout resultar num parcelamento.
      parcelas = [{ numero: 1, valor: valorTotal, vencimento: new Date() }];
    }

    const { contratoId } = await criarContrato({
      oportunidadeId,
      contratoTemplateId: template.id,
      pessoaSignatarioId: representanteId ?? pessoa.pessoaId,
      pessoaArrudaCredSignatarioId: pessoaArrudaCredId,
      fornecedorId: null,
      formaPagamento,
      metodoPagamento,
      valorTotal,
      parcelas,
    });

    const { tentarEmitirContrato } = await import("@/lib/vendas/progressao");
    await tentarEmitirContrato(contratoId);

    return { sucesso: true, oportunidadeId };
  } catch (erro) {
    console.error("Falha ao confirmar Nova Oportunidade:", erro);
    const mensagem = erro instanceof Error ? erro.message : "Falha ao criar a Oportunidade. Tente novamente.";
    return { sucesso: false, erro: mensagem };
  }
}
