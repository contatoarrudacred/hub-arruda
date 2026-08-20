import { buscarContratoPorId, limparErroContrato, registrarErroContrato } from "./contratos";
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

/** Etapa "Emitindo Contrato" — gera o PDF e, em seguida (mesmo card/coluna, decisão do Luiz
 * 20/08/2026: as duas são automáticas, sem pausa humana no meio, não precisam de coluna própria
 * cada uma), manda pra Assinafy via tentarEnvelopar. Ao dar certo, tentarEnvelopar já deixa o
 * contrato em "aguardando_assinaturas" (etapa 3, espera ação humana — não encadeia mais nada
 * automático a partir daqui).
 *
 * Não marca o status como "emitindo_contrato" antes de tentar — gerarEEmitirContrato já faz isso
 * como último passo, só quando dá certo. Assim, se a etapa falhar (ex.: produto sem template de
 * contrato configurado), o card fica visível no Kanban parado no último estágio que realmente
 * alcançou (aqui, "nova_oportunidade"), com o erro visível — não "some" nem fica com um rótulo que
 * sugere um progresso que não aconteceu. Achado real de teste em produção. */
export async function tentarEmitirContrato(contratoId: string): Promise<void> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato || !podeTentarAutomaticamente(contrato.tentativasErro)) return;

  const resultado = await executarPassoAutomatico(contratoId, () => gerarEEmitirContrato(contratoId));
  if (resultado.sucesso) await tentarEnvelopar(contratoId);
}

/** Manda o PDF pra Assinafy (upload + signatários + solicitação de assinatura) — segunda metade
 * de "Emitindo Contrato" (ver tentarEmitirContrato acima), não é mais uma coluna própria do
 * Kanban. Mesmo raciocínio de não marcar status antes de tentar: se falhar, o card fica no último
 * estágio confirmado ("emitindo_contrato"), com o erro visível. */
export async function tentarEnvelopar(contratoId: string): Promise<void> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato || !podeTentarAutomaticamente(contrato.tentativasErro)) return;

  await executarPassoAutomatico(contratoId, async () => {
    const { enviarContratoParaAssinatura } = await import("@/lib/assinafy/adapter");
    await enviarContratoParaAssinatura(contratoId);
  });
}

/** Etapa "Gerando Financeiro" — cria a(s) cobrança(s) na Asaas. Disparada pelo webhook da Assinafy
 * quando todo mundo assina (não pela cadeia automática inicial — isso só acontece depois de uma
 * ação humana). Ao dar certo, criarCobrancasDoContrato já deixa o contrato em
 * "aguardando_pagamento" (etapa 5, espera ação humana). Mesmo raciocínio: não marca
 * "gerando_financeiro" antes de tentar. */
export async function tentarGerarFinanceiro(contratoId: string): Promise<void> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato || !podeTentarAutomaticamente(contrato.tentativasErro)) return;

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
  } else if (contrato.status === "gerando_financeiro") {
    await tentarGerarFinanceiro(contratoId);
  }
}
