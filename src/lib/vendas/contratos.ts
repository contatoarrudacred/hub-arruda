import { createClient } from "@/lib/supabase/server";
import type { Parcela } from "./calculo-parcelas";

export type FormaPagamento = "avista" | "parcelado";
// boleto_pix e cartao são as únicas duas opções da regra de negócio validada com o Luiz
// (docs/superpowers/specs/2026-08-18-captura-detalhe-pagamento-fechamento-design.md, seção 1) —
// mesmas duas opções que o bot do CRM oferece via conversas.dados.detalhe_pagamento.forma.
export type MetodoPagamento = "boleto_pix" | "cartao";
export type StatusContrato = "gerado" | "enviado" | "assinado" | "recusado" | "cancelado";

export type EntradaCriarContrato = {
  oportunidadeId: string;
  contratoTemplateId: string;
  pessoaSignatarioId: string;
  pessoaArrudaCredSignatarioId: string;
  fornecedorId: string | null;
  formaPagamento: FormaPagamento;
  metodoPagamento: MetodoPagamento;
  valorTotal: number;
  // Já calculadas por quem chama — via calcularParcelasContrato (venda sem funil prévio, ou
  // Fechamento de Venda editando manualmente) ou lidas direto de
  // conversas.dados.detalhe_pagamento.parcelas quando a Oportunidade vem do funil do CRM (o CRM já
  // aplica a mesma regra de âncora, não precisa recalcular).
  parcelas: Parcela[];
};

export async function criarContrato(entrada: EntradaCriarContrato): Promise<{ contratoId: string }> {
  const supabase = await createClient();

  const { data: contrato, error: erroContrato } = await supabase
    .from("contratos")
    .insert({
      oportunidade_id: entrada.oportunidadeId,
      contrato_template_id: entrada.contratoTemplateId,
      pessoa_signatario_id: entrada.pessoaSignatarioId,
      pessoa_arrudacred_signatario_id: entrada.pessoaArrudaCredSignatarioId,
      fornecedor_id: entrada.fornecedorId,
      status: "gerado",
      forma_pagamento: entrada.formaPagamento,
      metodo_pagamento: entrada.metodoPagamento,
      parcelas_qtd: entrada.parcelas.length,
      valor_total: entrada.valorTotal,
    })
    .select("id")
    .single();
  if (erroContrato) throw new Error(`Falha ao criar contrato: ${erroContrato.message}`);

  const { error: erroParcelas } = await supabase.from("contrato_parcelas").insert(
    entrada.parcelas.map((parcela) => ({
      contrato_id: contrato.id,
      numero: parcela.numero,
      valor: parcela.valor,
      vencimento_previsto: parcela.vencimento.toISOString().slice(0, 10),
    })),
  );
  if (erroParcelas) throw new Error(`Falha ao criar parcelas do contrato: ${erroParcelas.message}`);

  return { contratoId: contrato.id };
}

export type ContratoParcela = {
  id: string;
  numero: number;
  valor: number;
  vencimentoPrevisto: string;
  status: string;
};

export type Contrato = {
  id: string;
  oportunidadeId: string;
  status: StatusContrato;
  pdfUrl: string | null;
  formaPagamento: FormaPagamento;
  metodoPagamento: MetodoPagamento;
  parcelasQtd: number;
  valorTotal: number;
  assinafyDocumentId: string | null;
  parcelas: ContratoParcela[];
};

type LinhaContratoParcelaBruta = {
  id: string;
  numero: number;
  valor: number;
  vencimento_previsto: string;
  status: string;
};

type LinhaContratoBruta = {
  id: string;
  oportunidade_id: string;
  status: StatusContrato;
  pdf_url: string | null;
  forma_pagamento: FormaPagamento;
  metodo_pagamento: MetodoPagamento;
  parcelas_qtd: number;
  valor_total: number;
  assinafy_document_id: string | null;
  contrato_parcelas: LinhaContratoParcelaBruta[] | null;
};

export async function buscarContratoPorOportunidade(oportunidadeId: string): Promise<Contrato | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contratos")
    .select(
      "id, oportunidade_id, status, pdf_url, forma_pagamento, metodo_pagamento, parcelas_qtd, valor_total, assinafy_document_id, contrato_parcelas(id, numero, valor, vencimento_previsto, status)",
    )
    .eq("oportunidade_id", oportunidadeId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar contrato: ${error.message}`);
  if (!data) return null;

  const linha = data as unknown as LinhaContratoBruta;

  return {
    id: linha.id,
    oportunidadeId: linha.oportunidade_id,
    status: linha.status,
    pdfUrl: linha.pdf_url,
    formaPagamento: linha.forma_pagamento,
    metodoPagamento: linha.metodo_pagamento,
    parcelasQtd: linha.parcelas_qtd,
    valorTotal: linha.valor_total,
    assinafyDocumentId: linha.assinafy_document_id,
    parcelas: (linha.contrato_parcelas ?? [])
      .map((parcela) => ({
        id: parcela.id,
        numero: parcela.numero,
        valor: parcela.valor,
        vencimentoPrevisto: parcela.vencimento_previsto,
        status: parcela.status,
      }))
      .sort((a, b) => a.numero - b.numero),
  };
}

export async function atualizarStatusContrato(
  id: string,
  status: StatusContrato,
  extras?: { pdfUrl?: string; enviadoEm?: string; assinadoEm?: string; assinafyDocumentId?: string },
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contratos")
    .update({
      status,
      ...(extras?.pdfUrl !== undefined ? { pdf_url: extras.pdfUrl } : {}),
      ...(extras?.enviadoEm !== undefined ? { enviado_em: extras.enviadoEm } : {}),
      ...(extras?.assinadoEm !== undefined ? { assinado_em: extras.assinadoEm } : {}),
      ...(extras?.assinafyDocumentId !== undefined ? { assinafy_document_id: extras.assinafyDocumentId } : {}),
    })
    .eq("id", id);
  if (error) throw new Error(`Falha ao atualizar status do contrato: ${error.message}`);
}

export async function buscarPessoaArrudaCredSignatario(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("configuracoes")
    .select("valor")
    .eq("chave", "contrato_arrudacred_signatario")
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar signatário ArrudaCred: ${error.message}`);
  if (!data) return null;

  const valor = data.valor as { pessoa_id?: string } | null;
  return valor?.pessoa_id ?? null;
}
