"use server";

import { buscarDocumento, type AssinafyDocumento } from "@/lib/assinafy/cliente";
import { buscarCobranca, type CobrancaStatus } from "@/lib/asaas/cliente";
import { atualizarStatusContrato, buscarContratoPorId } from "@/lib/vendas/contratos";
import { gerarUrlAssinadaContrato } from "@/lib/vendas/geracao-pdf";
import { enviarPorEmail, enviarWhatsapp } from "@/lib/vendas/notificacoes";
import { marcarComissaoParcelaRecebida } from "@/lib/vendas/comissoes";
import { sincronizarEtapaKanban } from "@/lib/vendas/oportunidades";
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

/** Gera um link assinado à parte, com Content-Disposition: attachment, sob demanda (só quando o
 * usuário clica em "Baixar") — evita gastar uma chamada ao Storage a mais no carregamento da
 * página pra quem nunca clica em baixar (o link "Ver" já é gerado de qualquer forma no page.tsx). */
export async function gerarUrlDownloadContratoAction(
  contratoId: string,
): Promise<{ sucesso: true; url: string } | { sucesso: false; erro: string }> {
  try {
    const contrato = await buscarContratoPorId(contratoId);
    if (!contrato?.pdfUrl) throw new Error("Contrato ainda não tem PDF gerado.");
    const url = await gerarUrlAssinadaContrato(contrato.pdfUrl, { forcarDownload: true });
    return { sucesso: true, url };
  } catch (erro) {
    return { sucesso: false, erro: mensagemErro(erro, "Falha ao preparar o download do PDF.") };
  }
}

/**
 * Escape hatch pra quando o webhook `document_ready` da Assinafy nunca chega (achado real, Luiz
 * 21/08/2026: uma venda com as 2 assinaturas confirmadas de verdade na Assinafy ficou presa em
 * "Aguardando Assinaturas" sem nenhum erro registrado — sinal de que o webhook nunca foi
 * processado, não de uma falha visível). Sem esta ação, esse card não tinha jeito de destravar
 * pela tela: o botão de retentativa só aparece quando existe `ultimo_erro`, e aqui não existe.
 *
 * Confere de verdade na Assinafy antes de agir (não confia só no clique) — só avança se todos os
 * signatários estiverem `completo: true` agora. Reproduz exatamente o que o webhook faria:
 * registra `assinado_em`, sincroniza `etapa_kanban` do CRM, e tenta gerar a cobrança na Asaas
 * (tentarGerarFinanceiro já marca "gerando_financeiro" antes de tentar e não relança erro de
 * cobrança — ele fica registrado em `ultimo_erro`, visível na tela após recarregar).
 */
export async function confirmarAssinaturaManualAction(contratoId: string, assinafyDocumentId: string): Promise<ResultadoAcao> {
  try {
    const documento = await buscarDocumento(assinafyDocumentId);
    const todosAssinaram = documento.signatarios.length > 0 && documento.signatarios.every((s) => s.completo);
    if (!todosAssinaram) {
      return {
        sucesso: false,
        erro: 'Nem todo mundo assinou ainda, conforme a Assinafy agora — confira com "Verificar assinaturas agora" antes de tentar de novo.',
      };
    }

    const contrato = await buscarContratoPorId(contratoId);
    if (!contrato) return { sucesso: false, erro: "Contrato não encontrado." };

    await atualizarStatusContrato(contratoId, "aguardando_assinaturas", { assinadoEm: new Date().toISOString() });
    await sincronizarEtapaKanban(contrato.oportunidadeId, "pagamento");

    const { tentarGerarFinanceiro } = await import("@/lib/vendas/progressao");
    await tentarGerarFinanceiro(contratoId);

    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, erro: mensagemErro(erro, "Falha ao confirmar a assinatura e avançar.") };
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
