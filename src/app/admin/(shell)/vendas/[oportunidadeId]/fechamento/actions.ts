"use server";

import { calcularParcelasContrato, type DiaAncora, type Parcela } from "@/lib/vendas/calculo-parcelas";
import { buscarTemplateAtivoPorProduto } from "@/lib/vendas/contrato-templates";
import {
  buscarContratoPorId,
  buscarPessoaArrudaCredSignatario,
  criarContrato,
  type FormaPagamento,
  type MetodoPagamento,
} from "@/lib/vendas/contratos";
import { salvarEndereco, type EntradaSalvarEndereco } from "@/lib/vendas/endereco";
import { gerarUrlAssinadaContrato } from "@/lib/vendas/geracao-pdf";
import { buscarDetalhePagamentoCrm, buscarOportunidadeParaFechamento, salvarDocumentosPacote } from "@/lib/vendas/oportunidades";
import { atualizarDadosContratoPessoa, buscarPessoaPorDocumento, resolverOuCriarPessoa } from "@/lib/vendas/pessoas";
import { definirRepresentante } from "@/lib/vendas/pessoa-representantes";
import { tipoPessoaPorDocumento } from "@/lib/vendas/documento";

export type ResultadoBuscarPessoa =
  | { encontrada: true; id: string; nome: string }
  | { encontrada: false };

export async function buscarPessoaPorDocumentoAction(documento: string): Promise<ResultadoBuscarPessoa> {
  const pessoa = await buscarPessoaPorDocumento(documento);
  if (!pessoa) return { encontrada: false };
  return { encontrada: true, id: pessoa.id, nome: pessoa.nome };
}

type EnderecoEntrada = {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

type DadosContratoEntrada = { email: string | null; whatsapp: string | null; rg: string | null; estadoCivil: string | null; profissao: string | null };

type RepresentanteEntrada = {
  pessoaId: string | null;
  pessoaNova: { nome: string; documento: string } | null;
  dadosContrato: DadosContratoEntrada;
  endereco: EnderecoEntrada | null;
};

type PagamentoEntrada =
  | { origem: "crm" }
  | {
      origem: "manual";
      formaPagamento: FormaPagamento;
      metodoPagamento: MetodoPagamento;
      primeiraParcela: string;
      qtdParcelas: number;
      diaAncora: DiaAncora;
    };

export type EntradaConfirmarFechamento = {
  oportunidadeId: string;
  pessoaId: string;
  pessoaTipo: "pf" | "pj";
  dadosContrato: DadosContratoEntrada;
  endereco: EnderecoEntrada | null;
  representante: RepresentanteEntrada | null;
  documentosPacote: { documento: string; nomeRazaoSocial: string }[];
  pagamento: PagamentoEntrada;
};

export type ResultadoConfirmarFechamento =
  | { sucesso: true; contratoId: string; pdfUrl: string | null }
  | { sucesso: false; erro: string };

async function salvarEnderecoSeInformado(pessoaId: string, endereco: EnderecoEntrada | null): Promise<void> {
  if (!endereco || !endereco.logradouro) return;
  const entrada: EntradaSalvarEndereco = {
    pessoaId,
    tipo: "residencial",
    cep: endereco.cep,
    logradouro: endereco.logradouro,
    numero: endereco.numero,
    complemento: endereco.complemento || null,
    bairro: endereco.bairro,
    cidade: endereco.cidade,
    uf: endereco.uf,
  };
  await salvarEndereco(entrada);
}

export async function confirmarFechamentoAction(entrada: EntradaConfirmarFechamento): Promise<ResultadoConfirmarFechamento> {
  console.log("[DEBUG confirmarFechamento] entrada recebida:", JSON.stringify(entrada));
  try {
    const oportunidade = await buscarOportunidadeParaFechamento(entrada.oportunidadeId);
    console.log("[DEBUG confirmarFechamento] oportunidade:", JSON.stringify(oportunidade));
    if (!oportunidade) return { sucesso: false, erro: "Oportunidade não encontrada." };

    // Template/signatário ArrudaCred faltando NÃO bloqueia a criação do contrato — o card precisa
    // aparecer no Kanban mesmo assim. A falta de um dos dois vira um erro visível na etapa de
    // emissão (montarHtmlContrato/enviarContratoParaAssinatura já checam isso e lançam erro claro,
    // capturado por tentarEmitirContrato) — mesmo achado da Nova Oportunidade, corrigido junto.
    const template = await buscarTemplateAtivoPorProduto(oportunidade.produtoId);
    console.log("[DEBUG confirmarFechamento] template encontrado:", template ? template.id : null);

    const pessoaArrudaCredId = await buscarPessoaArrudaCredSignatario();
    console.log("[DEBUG confirmarFechamento] pessoaArrudaCredId:", pessoaArrudaCredId);

    // 1) Salva dados de contrato + endereço do signatário (e do representante, se PJ)
    await atualizarDadosContratoPessoa(entrada.pessoaId, entrada.dadosContrato);
    await salvarEnderecoSeInformado(entrada.pessoaId, entrada.endereco);

    let representanteId: string | null = null;
    if (entrada.pessoaTipo === "pj") {
      if (!entrada.representante) return { sucesso: false, erro: "Informe o representante legal da empresa." };

      const resolvido = await resolverOuCriarPessoa({
        pessoaId: entrada.representante.pessoaId,
        pessoaNova: entrada.representante.pessoaNova,
      });
      if (!resolvido.sucesso) return { sucesso: false, erro: resolvido.erro };

      representanteId = resolvido.pessoaId;
      await definirRepresentante(entrada.pessoaId, representanteId);
      await atualizarDadosContratoPessoa(representanteId, entrada.representante.dadosContrato);
      await salvarEnderecoSeInformado(representanteId, entrada.representante.endereco);
    }

    // 2) Salva o pacote de documentos (se houver)
    const documentosValidos = entrada.documentosPacote.filter((d) => d.documento.trim() && d.nomeRazaoSocial.trim());
    await salvarDocumentosPacote(
      entrada.oportunidadeId,
      documentosValidos.map((d) => ({
        documento: d.documento,
        nomeRazaoSocial: d.nomeRazaoSocial,
        tipoDocumento: tipoPessoaPorDocumento(d.documento) === "pj" ? "cnpj" : "cpf",
      })),
    );

    // 3) Resolve forma de pagamento + parcelas
    let formaPagamento: FormaPagamento;
    let metodoPagamento: MetodoPagamento;
    let parcelas: Parcela[];

    if (entrada.pagamento.origem === "crm") {
      const detalhe = await buscarDetalhePagamentoCrm(entrada.oportunidadeId);
      if (!detalhe) return { sucesso: false, erro: "Detalhe de pagamento do CRM não encontrado — preencha manualmente." };
      formaPagamento = detalhe.tipo;
      metodoPagamento = detalhe.forma;
      parcelas = detalhe.parcelas.map((p) => ({ numero: p.numero, valor: p.valor, vencimento: new Date(p.vencimento) }));
    } else {
      formaPagamento = entrada.pagamento.formaPagamento;
      metodoPagamento = entrada.pagamento.metodoPagamento;
      const primeiraParcela = new Date(entrada.pagamento.primeiraParcela);
      parcelas =
        formaPagamento === "avista"
          ? [{ numero: 1, valor: oportunidade.valorEstimado, vencimento: primeiraParcela }]
          : calcularParcelasContrato(oportunidade.valorEstimado, entrada.pagamento.qtdParcelas, primeiraParcela, entrada.pagamento.diaAncora);
    }

    const somaParcelas = Math.round(parcelas.reduce((acc, p) => acc + p.valor, 0) * 100) / 100;
    const valorTotalArredondado = Math.round(oportunidade.valorEstimado * 100) / 100;
    if (somaParcelas !== valorTotalArredondado) {
      return { sucesso: false, erro: `A soma das parcelas (${somaParcelas}) não bate com o valor total (${valorTotalArredondado}).` };
    }

    // A Asaas só aceita maxInstallmentCount entre 1 e 21 — aqui o parcelamento de cartão vem do
    // mesmo campo qtdParcelas de boleto/pix (sem limite próprio na UI), então precisa checar antes
    // de criar o contrato.
    if (metodoPagamento === "cartao" && (parcelas.length < 1 || parcelas.length > 21)) {
      return { sucesso: false, erro: "Cartão aceita no máximo 21 parcelas (limite da Asaas) — reduza a quantidade de parcelas." };
    }

    // 4) Cria o contrato + parcelas — o HTML do contrato não é mais montado aqui: tentarEmitirContrato
    // (Step 5 abaixo) reconstrói tudo a partir do banco via montarHtmlContrato, igual à Nova Oportunidade.
    const { contratoId } = await criarContrato({
      oportunidadeId: entrada.oportunidadeId,
      contratoTemplateId: template?.id ?? null,
      // Sempre a pessoa resolvida (PF ou PJ) — nunca o representante. montarHtmlContrato (chamado
      // por tentarEmitirContrato logo abaixo) decide sozinho, a partir do tipoPessoa de
      // pessoaSignatarioId, se busca um representante via pessoa_representantes (definirRepresentante
      // já gravou esse vínculo acima, chaveado pelo id da PJ) — gravar aqui o id do representante
      // quebraria essa busca e faria o PDF sair sem razão social/CNPJ da empresa.
      pessoaSignatarioId: entrada.pessoaId,
      pessoaArrudaCredSignatarioId: pessoaArrudaCredId,
      fornecedorId: null,
      formaPagamento,
      metodoPagamento,
      valorTotal: oportunidade.valorEstimado,
      parcelas,
      // Aqui (diferente da Nova Oportunidade) as parcelas de cartão já são calculadas de verdade
      // (mesmo padrão de boleto_pix) — parcelas.length já reflete o parcelamento escolhido, então
      // reaproveita esse valor pro Checkout da Asaas em vez de pedir um campo novo no formulário.
      maxParcelasCartao: metodoPagamento === "cartao" ? parcelas.length : null,
    });

    // 5) Gera o PDF (com retry automático) e encadeia envio à Assinafy — mesma orquestração usada
    // pela Nova Oportunidade, agora que o contrato já nasce em "nova_oportunidade" no Step 4.
    const { tentarEmitirContrato } = await import("@/lib/vendas/progressao");
    await tentarEmitirContrato(contratoId);

    const contratoAtualizado = await buscarContratoPorId(contratoId);
    const pdfUrl = contratoAtualizado?.pdfUrl ? await gerarUrlAssinadaContrato(contratoAtualizado.pdfUrl) : null;

    return { sucesso: true, contratoId, pdfUrl };
  } catch (erro) {
    console.error("Falha ao confirmar fechamento de venda:", erro);
    const mensagem = erro instanceof Error ? erro.message : "Falha ao gerar o contrato. Tente novamente.";
    return { sucesso: false, erro: mensagem };
  }
}
