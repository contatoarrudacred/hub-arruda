import { atualizarStatusContrato, buscarContratoPorId, limparErroContrato, registrarErroContrato } from "./contratos";
import { gerarEEmitirContrato } from "./emissao-contrato";

const MAX_TENTATIVAS_AUTOMATICAS = 3;

/** true quando ainda vale tentar a etapa automática de novo sozinho — lógica pura, sem I/O, pra
 * poder testar sem banco. */
export function podeTentarAutomaticamente(tentativasErro: number): boolean {
  return tentativasErro < MAX_TENTATIVAS_AUTOMATICAS;
}

type ResultadoPasso = { sucesso: true } | { sucesso: false; erro: string };

async function executarPassoAutomatico(contratoId: string, executar: () => Promise<void>): Promise<ResultadoPasso> {
  try {
    await executar();
    await limparErroContrato(contratoId);
    return { sucesso: true };
  } catch (erro) {
    console.error(`Falha numa etapa automática do contrato ${contratoId}:`, erro);
    const mensagem = erro instanceof Error ? erro.message : "Falha desconhecida.";
    await registrarErroContrato(contratoId, mensagem);
    return { sucesso: false, erro: mensagem };
  }
}

/** Etapa "Emitindo Contrato" — gera o PDF. Encadeia direto pra "Envelopando Assinaturas" quando dá
 * certo, porque as duas são automáticas (não param pra esperar ninguém). */
export async function tentarEmitirContrato(contratoId: string): Promise<void> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato || !podeTentarAutomaticamente(contrato.tentativasErro)) return;

  await atualizarStatusContrato(contratoId, "emitindo_contrato");
  const resultado = await executarPassoAutomatico(contratoId, () => gerarEEmitirContrato(contratoId));
  if (resultado.sucesso) await tentarEnvelopar(contratoId);
}

/** Etapa "Envelopando Assinaturas" — manda o PDF pra Assinafy. Ao dar certo, o próprio
 * enviarContratoParaAssinatura já deixa o contrato em "aguardando_assinaturas" (etapa 4, espera
 * ação humana — não encadeia mais nada automático a partir daqui). */
export async function tentarEnvelopar(contratoId: string): Promise<void> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato || !podeTentarAutomaticamente(contrato.tentativasErro)) return;

  await atualizarStatusContrato(contratoId, "envelopando_assinaturas");
  await executarPassoAutomatico(contratoId, async () => {
    const { enviarContratoParaAssinatura } = await import("@/lib/assinafy/adapter");
    await enviarContratoParaAssinatura(contratoId);
  });
}

/** Etapa "Gerando Financeiro" — cria a(s) cobrança(s) na Asaas. Disparada pelo webhook da Assinafy
 * quando todo mundo assina (não pela cadeia automática inicial — isso só acontece depois de uma
 * ação humana). Ao dar certo, criarCobrancasDoContrato já deixa o contrato em
 * "aguardando_pagamento" (etapa 6, espera ação humana). */
export async function tentarGerarFinanceiro(contratoId: string): Promise<void> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato || !podeTentarAutomaticamente(contrato.tentativasErro)) return;

  await atualizarStatusContrato(contratoId, "gerando_financeiro");
  await executarPassoAutomatico(contratoId, async () => {
    const { criarCobrancasDoContrato } = await import("@/lib/asaas/adapter");
    await criarCobrancasDoContrato(contratoId);
  });
}

/** Dispatcher usado pela retentativa manual (botão por card / ação em lote no Painel) — decide
 * qual etapa automática tentar de novo com base no status atual do contrato, e reseta o contador
 * de tentativas (dá mais 3 tentativas automáticas antes de precisar de ação manual de novo). */
export async function tentarNovamente(contratoId: string): Promise<void> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato) return;
  await limparErroContrato(contratoId);

  if (contrato.status === "nova_oportunidade" || contrato.status === "emitindo_contrato") {
    await tentarEmitirContrato(contratoId);
  } else if (contrato.status === "envelopando_assinaturas") {
    await tentarEnvelopar(contratoId);
  } else if (contrato.status === "gerando_financeiro") {
    await tentarGerarFinanceiro(contratoId);
  }
}
