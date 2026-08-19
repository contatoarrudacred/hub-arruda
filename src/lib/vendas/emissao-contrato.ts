import { atualizarStatusContrato, buscarContratoPorId } from "./contratos";
import {
  buscarTemplatePorId,
  montarDadosClienteHtml,
  montarListaDocumentosHtml,
  montarTabelaVencimentosHtml,
  resolverPlaceholders,
  type ParcelaTabela,
  type PessoaContrato,
} from "./contrato-templates";
import { buscarEnderecoPorPessoa } from "./endereco";
import { gerarPdfContrato, uploadPdfContrato } from "./geracao-pdf";
import { listarDocumentosPacote } from "./oportunidades";
import { buscarPessoaCompleta } from "./pessoas";
import { buscarRepresentante } from "./pessoa-representantes";

const FORMA_PAGAMENTO_LABEL: Record<string, string> = { boleto_pix: "Boleto/Pix", cartao: "Cartão de crédito" };

function enderecoParaTexto(endereco: Awaited<ReturnType<typeof buscarEnderecoPorPessoa>>): string | null {
  if (!endereco) return null;
  return [
    `${endereco.logradouro}${endereco.numero ? `, ${endereco.numero}` : ""}`,
    endereco.complemento || null,
    endereco.bairro || null,
    endereco.cidade && endereco.uf ? `${endereco.cidade}/${endereco.uf}` : null,
    endereco.cep ? `CEP ${endereco.cep}` : null,
  ]
    .filter(Boolean)
    .join(" - ");
}

async function montarPessoaContrato(pessoaId: string): Promise<PessoaContrato> {
  const pessoa = await buscarPessoaCompleta(pessoaId);
  if (!pessoa) throw new Error(`Pessoa ${pessoaId} não encontrada.`);
  const endereco = await buscarEnderecoPorPessoa(pessoaId);

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

/**
 * Reconstrói o HTML do contrato inteiramente a partir do que já está salvo no banco — não depende
 * de dado em memória de nenhum formulário. É o que permite reemitir/retentar a geração do PDF a
 * qualquer momento, mesmo dias depois da Oportunidade ter sido criada.
 */
export async function montarHtmlContrato(contratoId: string): Promise<string> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato) throw new Error("Contrato não encontrado.");
  if (!contrato.contratoTemplateId) throw new Error("Contrato sem template associado.");
  if (!contrato.metodoPagamento) throw new Error("Contrato sem método de pagamento definido.");

  const template = await buscarTemplatePorId(contrato.contratoTemplateId);
  if (!template) throw new Error("Template de contrato não encontrado.");

  const pessoaSignatario = await buscarPessoaCompleta(contrato.pessoaSignatarioId);
  if (!pessoaSignatario) throw new Error("Pessoa signatária não encontrada.");

  const pessoaContrato = await montarPessoaContrato(contrato.pessoaSignatarioId);

  let representanteContrato: PessoaContrato | null = null;
  if (pessoaSignatario.tipoPessoa === "pj") {
    const representante = await buscarRepresentante(contrato.pessoaSignatarioId);
    if (!representante) throw new Error("Pessoa jurídica sem representante legal cadastrado.");
    representanteContrato = await montarPessoaContrato(representante.pessoaFisicaId);
  }

  const documentosPacote = await listarDocumentosPacote(contrato.oportunidadeId);
  const parcelasTabela: ParcelaTabela[] = contrato.parcelas.map((p) => ({
    numero: p.numero,
    valor: p.valor,
    vencimento: new Date(p.vencimentoPrevisto),
  }));
  const formaPagamentoLabel = FORMA_PAGAMENTO_LABEL[contrato.metodoPagamento];

  return resolverPlaceholders(template.conteudoHtml, {
    dadosCliente: montarDadosClienteHtml(pessoaContrato, representanteContrato),
    valorTotal: contrato.valorTotal,
    formaPagamento: formaPagamentoLabel,
    tabelaVencimentos: parcelasTabela.length > 1 ? montarTabelaVencimentosHtml(parcelasTabela, formaPagamentoLabel) : "",
    listaDocumentos: montarListaDocumentosHtml(
      documentosPacote.map((d) => ({ documento: d.documento, nomeRazaoSocial: d.nomeRazaoSocial })),
    ),
  });
}

/** Gera o PDF a partir do HTML reconstruído e sobe pro Storage — não mexe no `status` (quem chama
 * já deixou o contrato em "emitindo_contrato" antes de chamar isto). */
export async function gerarEEmitirContrato(contratoId: string): Promise<void> {
  const html = await montarHtmlContrato(contratoId);
  const pdf = await gerarPdfContrato(html);
  const { path } = await uploadPdfContrato(contratoId, pdf);
  await atualizarStatusContrato(contratoId, "emitindo_contrato", { pdfUrl: path });
}
