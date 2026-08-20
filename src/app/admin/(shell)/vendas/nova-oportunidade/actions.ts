"use server";

import { buscarRazaoSocialPorCnpj } from "@/lib/vendas/cnpj-publico";
import { buscarEnderecoPorPessoa, type EnderecoPessoa } from "@/lib/vendas/endereco";
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
      endereco: EnderecoPessoa | null;
    }
  | { encontrada: false };

export async function buscarPessoaPorDocumentoAction(documento: string): Promise<ResultadoBuscarPessoa> {
  const pessoa = await buscarPessoaPorDocumento(documento);
  if (!pessoa) return { encontrada: false };
  // buscarPessoaPorDocumento (PessoaEncontrada) não traz rg/estadoCivil/profissao — busca completa:
  const completa = await buscarPessoaCompleta(pessoa.id);
  if (!completa) return { encontrada: false };
  // Achado real (Luiz, 20/08/2026): sem isso, o endereço já salvo de uma pessoa existente nunca
  // aparecia na tela — o campo ficava em branco e o submit não mandava nada pro salvarEndereco.
  const endereco = await buscarEnderecoPorPessoa(completa.id);
  return {
    encontrada: true,
    id: completa.id,
    nome: completa.nomeRazaoSocial,
    email: completa.email,
    whatsapp: completa.whatsapp,
    rg: completa.rg,
    estadoCivil: completa.estadoCivil,
    profissao: completa.profissao,
    endereco,
  };
}

export async function buscarRazaoSocialAction(cnpj: string): Promise<{ razaoSocial: string } | null> {
  return buscarRazaoSocialPorCnpj(cnpj);
}

export type EntradaPacote = { documento: string; nomeRazaoSocial: string };

export type EntradaFinanceiro =
  | {
      especie: "boleto_pix";
      formaPagamento: "avista" | "parcelado";
      primeiraParcela: string;
      qtdParcelas: number;
      diaAncora: 1 | 10 | 20;
      // Tabela de parcelas já ajustada manualmente na tela (valor/vencimento por parcela) — quando
      // presente, usada como está em vez de recalcular via calcularParcelasContrato no server. Sem
      // isso, qualquer edição feita na tabela se perdia — o server sempre recalculava do zero.
      parcelas?: { numero: number; valor: number; vencimento: string }[];
    }
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
    const { buscarProdutoParaVenda } = await import("@/lib/vendas/produtos");

    const produtoSelecionado = await buscarProdutoParaVenda(entrada.produtoId);
    // Mesma checagem do client (nova-oportunidade-client.tsx, confirmar()) — defesa no server, não só
    // no client, já que o client não é fronteira de segurança/corretude.
    if (produtoSelecionado?.exigeListaDocumentos) {
      const pacoteValido = entrada.pacote.filter((d) => d.documento.trim() && d.nomeRazaoSocial.trim());
      if (pacoteValido.length === 0) {
        return { sucesso: false, erro: "Este serviço exige a lista de nomes cobertos pelo contrato — informe ao menos um (CPF/CNPJ + nome)." };
      }
    }

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

    // Template/signatário ArrudaCred faltando NÃO bloqueia a criação do contrato — o card precisa
    // aparecer no Kanban mesmo assim, em "Nova Oportunidade". A falta de um dos dois vira um erro
    // visível na etapa de emissão (montarHtmlContrato/enviarContratoParaAssinatura já checam isso e
    // lançam erro claro, capturado por tentarEmitirContrato) — achado real de teste em produção:
    // bloquear aqui deixava a Oportunidade órfã, sem contrato, invisível no Painel de Vendas.
    const template = await buscarTemplateAtivoPorProduto(entrada.produtoId);
    const pessoaArrudaCredId = await buscarPessoaArrudaCredSignatario();

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
    let maxParcelasCartao: number | null = null;

    if (entrada.financeiro.especie === "boleto_pix") {
      formaPagamento = entrada.financeiro.formaPagamento;
      metodoPagamento = "boleto_pix";
      const primeiraParcela = new Date(entrada.financeiro.primeiraParcela);
      if (formaPagamento === "avista") {
        parcelas = [{ numero: 1, valor: valorTotal, vencimento: primeiraParcela }];
      } else if (entrada.financeiro.parcelas && entrada.financeiro.parcelas.length > 0) {
        // Tabela editada manualmente na tela — usa como está, não recalcula.
        parcelas = entrada.financeiro.parcelas.map((p) => ({
          numero: p.numero,
          valor: p.valor,
          vencimento: new Date(`${p.vencimento}T00:00:00`),
        }));
      } else {
        parcelas = calcularParcelasContrato(valorTotal, entrada.financeiro.qtdParcelas, primeiraParcela, entrada.financeiro.diaAncora);
      }
    } else {
      formaPagamento = "parcelado";
      metodoPagamento = "cartao";
      maxParcelasCartao = entrada.financeiro.maxParcelas;
      // A Asaas só aceita maxInstallmentCount entre 1 e 21 — defesa no server, não só no client
      // (que já valida isso, mas não substitui checagem server-side). Sem isso, um valor fora da
      // faixa só falharia na hora de gerar o Checkout, depois do contrato já criado e assinado.
      if (!Number.isInteger(maxParcelasCartao) || maxParcelasCartao < 1 || maxParcelasCartao > 21) {
        return { sucesso: false, erro: "Parcelas máximas do cartão precisa ser um número entre 1 e 21 (limite da Asaas)." };
      }
      // Cartão não tem tabela de parcelas prévia (ver spec seção 6) — 1 "parcela" placeholder cobrindo
      // o valor total; os títulos reais vêm da Asaas depois que o Checkout resultar num parcelamento.
      // O parcelamento escolhido (maxParcelasCartao) vai separado — parcelas_qtd fica sempre 1 aqui.
      parcelas = [{ numero: 1, valor: valorTotal, vencimento: new Date() }];
    }

    // Mesma checagem de fechamento/actions.ts — defesa no server, não só no client (que só evita
    // round-trip desnecessário, não substitui validação server-side).
    const somaParcelas = Math.round(parcelas.reduce((acc, p) => acc + p.valor, 0) * 100) / 100;
    const valorTotalArredondado = Math.round(valorTotal * 100) / 100;
    if (somaParcelas !== valorTotalArredondado) {
      return { sucesso: false, erro: `A soma das parcelas (${somaParcelas}) não bate com o valor total (${valorTotalArredondado}).` };
    }

    const { contratoId } = await criarContrato({
      oportunidadeId,
      contratoTemplateId: template?.id ?? null,
      // Sempre a pessoa resolvida (PF ou PJ) — nunca o representante. montarHtmlContrato (chamado
      // por tentarEmitirContrato logo abaixo) decide sozinho, a partir do tipoPessoa de
      // pessoaSignatarioId, se busca um representante via pessoa_representantes (definirRepresentante
      // já gravou esse vínculo acima, chaveado pelo id da PJ) — gravar aqui o id do representante
      // quebraria essa busca e faria o PDF sair sem razão social/CNPJ da empresa.
      pessoaSignatarioId: pessoa.pessoaId,
      pessoaArrudaCredSignatarioId: pessoaArrudaCredId,
      fornecedorId: null,
      formaPagamento,
      metodoPagamento,
      valorTotal,
      parcelas,
      maxParcelasCartao,
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
