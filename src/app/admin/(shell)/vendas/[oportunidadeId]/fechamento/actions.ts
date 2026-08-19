"use server";

import { calcularParcelasContrato, type DiaAncora, type Parcela } from "@/lib/vendas/calculo-parcelas";
import {
  montarDadosClienteHtml,
  montarListaDocumentosHtml,
  montarTabelaVencimentosHtml,
  resolverPlaceholders,
  buscarTemplateAtivoPorProduto,
  type PessoaContrato,
} from "@/lib/vendas/contrato-templates";
import {
  atualizarStatusContrato,
  buscarPessoaArrudaCredSignatario,
  criarContrato,
  type FormaPagamento,
  type MetodoPagamento,
} from "@/lib/vendas/contratos";
import { salvarEndereco, type EntradaSalvarEndereco } from "@/lib/vendas/endereco";
import { gerarPdfContrato, gerarUrlAssinadaContrato, uploadPdfContrato } from "@/lib/vendas/geracao-pdf";
import { buscarDetalhePagamentoCrm, buscarOportunidadeParaFechamento, salvarDocumentosPacote } from "@/lib/vendas/oportunidades";
import { atualizarDadosContratoPessoa, buscarPessoaCompleta, buscarPessoaPorDocumento, resolverOuCriarPessoa } from "@/lib/vendas/pessoas";
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
  | { sucesso: true; contratoId: string; pdfUrl: string }
  | { sucesso: false; erro: string };

const FORMA_PAGAMENTO_LABEL: Record<MetodoPagamento, string> = { boleto_pix: "Boleto/Pix", cartao: "Cartão de crédito" };

function enderecoParaTexto(endereco: EnderecoEntrada | null): string | null {
  if (!endereco || !endereco.logradouro) return null;
  const partes = [
    `${endereco.logradouro}${endereco.numero ? `, ${endereco.numero}` : ""}`,
    endereco.complemento || null,
    endereco.bairro || null,
    endereco.cidade && endereco.uf ? `${endereco.cidade}/${endereco.uf}` : null,
    endereco.cep ? `CEP ${endereco.cep}` : null,
  ].filter(Boolean);
  return partes.join(" - ");
}

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

async function montarPessoaContrato(pessoaId: string, endereco: EnderecoEntrada | null): Promise<PessoaContrato> {
  const pessoa = await buscarPessoaCompleta(pessoaId);
  if (!pessoa) throw new Error("Pessoa não encontrada.");
  return {
    tipoPessoa: pessoa.tipoPessoa,
    nomeRazaoSocial: pessoa.nomeRazaoSocial,
    documento: pessoa.documento,
    email: pessoa.email,
    whatsapp: pessoa.whatsapp,
    endereco: enderecoParaTexto(endereco),
    rg: pessoa.rg,
    estadoCivil: pessoa.estadoCivil,
    profissao: pessoa.profissao,
  };
}

export async function confirmarFechamentoAction(entrada: EntradaConfirmarFechamento): Promise<ResultadoConfirmarFechamento> {
  console.log("[DEBUG confirmarFechamento] entrada recebida:", JSON.stringify(entrada));
  try {
    const oportunidade = await buscarOportunidadeParaFechamento(entrada.oportunidadeId);
    console.log("[DEBUG confirmarFechamento] oportunidade:", JSON.stringify(oportunidade));
    if (!oportunidade) return { sucesso: false, erro: "Oportunidade não encontrada." };

    const template = await buscarTemplateAtivoPorProduto(oportunidade.produtoId);
    console.log("[DEBUG confirmarFechamento] template encontrado:", template ? template.id : null);
    if (!template) return { sucesso: false, erro: `Nenhum template de contrato configurado pro produto "${oportunidade.produtoNome}".` };

    const pessoaArrudaCredId = await buscarPessoaArrudaCredSignatario();
    console.log("[DEBUG confirmarFechamento] pessoaArrudaCredId:", pessoaArrudaCredId);
    if (!pessoaArrudaCredId) return { sucesso: false, erro: "Signatário da ArrudaCred não configurado (Configurações > contrato_arrudacred_signatario)." };

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

    // 4) Monta os blocos HTML e resolve o template
    const pessoaSignatario = await montarPessoaContrato(entrada.pessoaId, entrada.endereco);
    const representante = representanteId ? await montarPessoaContrato(representanteId, entrada.representante?.endereco ?? null) : null;

    const html = resolverPlaceholders(template.conteudoHtml, {
      dadosCliente: montarDadosClienteHtml(pessoaSignatario, representante),
      valorTotal: oportunidade.valorEstimado,
      formaPagamento: FORMA_PAGAMENTO_LABEL[metodoPagamento],
      tabelaVencimentos: parcelas.length > 1 ? montarTabelaVencimentosHtml(parcelas, FORMA_PAGAMENTO_LABEL[metodoPagamento]) : "",
      listaDocumentos: montarListaDocumentosHtml(documentosValidos.map((d) => ({ documento: d.documento, nomeRazaoSocial: d.nomeRazaoSocial }))),
    });

    // 5) Cria o contrato + parcelas
    const { contratoId } = await criarContrato({
      oportunidadeId: entrada.oportunidadeId,
      contratoTemplateId: template.id,
      pessoaSignatarioId: representanteId ?? entrada.pessoaId,
      pessoaArrudaCredSignatarioId: pessoaArrudaCredId,
      fornecedorId: null,
      formaPagamento,
      metodoPagamento,
      valorTotal: oportunidade.valorEstimado,
      parcelas,
    });

    // 6) Gera o PDF e sobe pro Storage
    const pdf = await gerarPdfContrato(html);
    const { path } = await uploadPdfContrato(contratoId, pdf);
    const pdfUrl = await gerarUrlAssinadaContrato(path);
    await atualizarStatusContrato(contratoId, "emitindo_contrato", { pdfUrl: path });

    // 7) Avança sozinho pra assinatura eletrônica quando a Assinafy já estiver configurada — sem
    // conta ainda (ASSINAFY_API_KEY vazia), a venda só fica parada em "emitindo_contrato" até
    // alguém rodar isso manualmente depois (não quebra o Fechamento de Venda por causa disso).
    if (process.env.ASSINAFY_API_KEY) {
      try {
        const { enviarContratoParaAssinatura } = await import("@/lib/assinafy/adapter");
        await enviarContratoParaAssinatura(contratoId);
      } catch (erroAssinafy) {
        console.error("Contrato gerado, mas falhou ao enviar pra assinatura:", erroAssinafy);
      }
    }

    return { sucesso: true, contratoId, pdfUrl };
  } catch (erro) {
    console.error("Falha ao confirmar fechamento de venda:", erro);
    const mensagem = erro instanceof Error ? erro.message : "Falha ao gerar o contrato. Tente novamente.";
    return { sucesso: false, erro: mensagem };
  }
}
