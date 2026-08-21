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

/** Cria a(s) cobrança(s) na Asaas — não tem coluna própria no Kanban (decisão do Luiz, 20/08/2026,
 * mesmo raciocínio da fusão Emitindo Contrato/Envelopando Assinaturas): disparada pelo webhook da
 * Assinafy assim que todo mundo assina, sem pausa humana no meio. Ao dar certo,
 * criarCobrancasDoContrato já deixa o contrato em "aguardando_pagamento" (espera ação humana); se
 * falhar, o erro fica visível em "aguardando_assinaturas" mesmo (etapa anterior, já confirmada) —
 * por isso não marca nenhum status "gerando_financeiro" intermediário antes de tentar. */
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
 * de tentativas (dá mais 3 tentativas automáticas antes de precisar de ação manual de novo).
 *
 * Achado real (Luiz, 20/08/2026): como "gerando_financeiro" nunca é um status de verdade (ver
 * comentário de tentarGerarFinanceiro acima), um contrato já assinado cuja cobrança falhou na
 * Asaas fica com `status = "aguardando_assinaturas"` mesmo — é o único jeito de um contrato ter
 * erro registrado nesse status (nenhuma etapa automática roda enquanto genuinamente espera
 * assinatura humana). Sem este branch, o botão "Tentar novamente" desse card não fazia nada.
 * criarCobrancasDoContrato já é seguro pra rodar de novo (pula parcela de boleto/pix já cobrada
 * com sucesso; cartão só cria o Checkout se a tentativa anterior tiver falhado antes de criar). */
export async function tentarNovamente(contratoId: string): Promise<void> {
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato) return;
  await limparErroContrato(contratoId);

  if (contrato.status === "nova_oportunidade" || contrato.status === "emitindo_contrato") {
    await tentarEmitirContrato(contratoId);
  } else if (contrato.status === "aguardando_assinaturas") {
    await tentarGerarFinanceiro(contratoId);
  }
}
