"use server";

import { buscarDocumento, type AssinafyDocumento } from "@/lib/assinafy/cliente";
import { buscarCobranca, type CobrancaStatus } from "@/lib/asaas/cliente";
import { enviarPorEmail, enviarWhatsapp } from "@/lib/vendas/notificacoes";
import { marcarComissaoParcelaRecebida } from "@/lib/vendas/comissoes";
import { cancelarVenda } from "@/lib/vendas/painel-vendas";

export type ResultadoAcao = { sucesso: true } | { sucesso: false; erro: string };

function mensagemErro(erro: unknown, mensagemPadrao: string): string {
  console.error(mensagemPadrao, erro);
  return erro instanceof Error ? erro.message : mensagemPadrao;
}

export async function buscarStatusAssinaturaAction(
  assinafyDocumentId: string,
): Promise<{ sucesso: true; documento: AssinafyDocumento } | { sucesso: false; erro: string }> {
  try {
    const documento = await buscarDocumento(assinafyDocumentId);
    return { sucesso: true, documento };
  } catch (erro) {
    return { sucesso: false, erro: mensagemErro(erro, "Falha ao consultar status da assinatura na Assinafy.") };
  }
}

export async function buscarStatusCobrancasAction(
  asaasPaymentIds: string[],
): Promise<{ sucesso: true; cobrancas: CobrancaStatus[] } | { sucesso: false; erro: string }> {
  try {
    const cobrancas = await Promise.all(asaasPaymentIds.map((id) => buscarCobranca(id)));
    return { sucesso: true, cobrancas };
  } catch (erro) {
    return { sucesso: false, erro: mensagemErro(erro, "Falha ao consultar status das cobranças na Asaas.") };
  }
}

export async function reenviarLinkAction(
  pessoaId: string,
  canal: "whatsapp" | "email",
  contexto: "assinatura" | "pagamento",
  link: string,
): Promise<ResultadoAcao> {
  const mensagem =
    contexto === "assinatura"
      ? `Falta sua assinatura no contrato. Acesse o link pra assinar: ${link}`
      : `Aqui está o link para pagamento: ${link}`;
  try {
    if (canal === "whatsapp") await enviarWhatsapp(pessoaId, mensagem);
    else await enviarPorEmail(pessoaId, contexto === "assinatura" ? "Falta sua assinatura" : "Link de pagamento", mensagem);
    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, erro: mensagemErro(erro, "Falha ao reenviar o link.") };
  }
}

export async function marcarComissaoRecebidaAction(comissaoParcelaId: string, recebidoEm: string): Promise<ResultadoAcao> {
  try {
    await marcarComissaoParcelaRecebida(comissaoParcelaId, new Date(recebidoEm));
    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, erro: mensagemErro(erro, "Falha ao marcar comissão como recebida.") };
  }
}

export async function cancelarVendaDetalhesAction(contratoId: string, motivo: string): Promise<ResultadoAcao> {
  try {
    await cancelarVenda(contratoId, motivo);
    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, erro: mensagemErro(erro, "Falha ao cancelar a venda.") };
  }
}

export async function tentarNovamenteAction(contratoId: string): Promise<ResultadoAcao> {
  try {
    const { tentarNovamente } = await import("@/lib/vendas/progressao");
    await tentarNovamente(contratoId);
    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, erro: mensagemErro(erro, "Falha ao tentar novamente.") };
  }
}
