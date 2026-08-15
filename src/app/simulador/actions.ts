"use server";

import { avancarConversa, iniciarFluxo, saudacaoPorHorario } from "@/lib/motor-fluxo/engine";
import {
  criarCalculadoraDadosDerivados,
  criarExtratorAbertura,
  criarResolverMensagensDinamicas,
} from "@/lib/motor-fluxo/fluxo-limpeza-nome";
import {
  criarConversaSimulador,
  registrarMensagemLead,
  registrarTurnoMalala,
} from "@/lib/motor-fluxo/persistencia";
import {
  carregarConfigPrecificacao,
  carregarEtapasPorCodigo,
  carregarFaixasPreco,
} from "@/lib/motor-fluxo/repositorio";
import type { DadosConversa, MensagemEnviada } from "@/lib/motor-fluxo/tipos";

// Server Actions que dão vida ao simulador (src/app/simulador/simulador-chat.tsx). O estado de
// navegação do fluxo (em que etapa está, o que já foi capturado) fica no client — mas, desde
// 15/08/2026, cada mensagem também é gravada de verdade em pessoas/oportunidades/conversas/
// mensagens (ver persistencia.ts), pra alimentar o motor de disparo de follow-up (Fase 6) e servir
// de rascunho pro webhook do WhatsApp real (Fase 7) reaproveitar a mesma persistência depois. O
// conteúdo do script (etapas_fluxo, precos_por_faixa, configuracoes) já vinha do Supabase a cada
// chamada, então editar o script no banco continua mudando o simulador na hora.

export type EstadoSimulador = {
  /** null = fluxo automatizado encerrado (perdida, handoff humano, ou fim do MVP1) */
  etapaAtualCodigo: string | null;
  dados: DadosConversa;
  conversaId: string | null;
  oportunidadeId: string | null;
};

export type PassoSimulador = {
  mensagens: MensagemEnviada[];
  estado: EstadoSimulador;
  encerrado: boolean;
  naoReconhecido: boolean;
};

async function montarDependencias() {
  const [etapasPorCodigo, faixas, config] = await Promise.all([
    carregarEtapasPorCodigo(),
    carregarFaixasPreco(),
    carregarConfigPrecificacao(),
  ]);
  return {
    etapasPorCodigo,
    resolverMensagensDinamicas: criarResolverMensagensDinamicas(faixas, config),
    calcularDadosDerivados: criarCalculadoraDadosDerivados(config),
  };
}

/**
 * Ponto de entrada real de qualquer conversa (SCRIPT_LIMPANOME_SERASA_SPC.md: "é sempre o lead que
 * inicia a conversa"). Recebe a primeira mensagem de verdade do lead, roda a extração determinística
 * sobre ela (regra de checkpoint já respondido) e só então entra no fluxo — que já pula sozinho
 * qualquer pergunta cuja resposta a extração conseguiu adiantar.
 */
export async function iniciarSimulacaoComMensagem(primeiraMensagemLead: string): Promise<PassoSimulador> {
  const { etapasPorCodigo, resolverMensagensDinamicas } = await montarDependencias();

  const dadosIniciais = criarExtratorAbertura()(primeiraMensagemLead);
  const resultado = iniciarFluxo(
    "saudacao_inicial",
    etapasPorCodigo,
    dadosIniciais,
    resolverMensagensDinamicas,
    { saudacao: saudacaoPorHorario() },
  );

  const { conversaId, oportunidadeId } = await criarConversaSimulador(dadosIniciais.nome ?? null);
  await registrarMensagemLead(conversaId, primeiraMensagemLead);
  await registrarTurnoMalala({ conversaId, oportunidadeId, resultado });

  return {
    mensagens: resultado.mensagens,
    estado: {
      etapaAtualCodigo: resultado.etapaFinal?.conteudo.codigo ?? null,
      dados: dadosIniciais,
      conversaId,
      oportunidadeId,
    },
    encerrado: resultado.etapaFinal === null,
    naoReconhecido: false,
  };
}

export async function enviarResposta(
  estado: EstadoSimulador,
  respostaLead: string,
): Promise<PassoSimulador> {
  if (!estado.etapaAtualCodigo || !estado.conversaId || !estado.oportunidadeId) {
    return { mensagens: [], estado, encerrado: true, naoReconhecido: false };
  }

  const { etapasPorCodigo, resolverMensagensDinamicas, calcularDadosDerivados } =
    await montarDependencias();
  const etapaAtual = etapasPorCodigo[estado.etapaAtualCodigo];

  await registrarMensagemLead(estado.conversaId, respostaLead);

  const resultado = await avancarConversa({
    etapaAtual,
    etapasPorCodigo,
    dados: estado.dados,
    respostaLead,
    resolverMensagensDinamicas,
    calcularDadosDerivados,
    variaveisGlobais: { saudacao: saudacaoPorHorario() },
  });

  await registrarTurnoMalala({
    conversaId: estado.conversaId,
    oportunidadeId: estado.oportunidadeId,
    resultado,
  });

  return {
    mensagens: resultado.mensagens,
    estado: {
      etapaAtualCodigo: resultado.etapaFinal?.conteudo.codigo ?? null,
      conversaId: estado.conversaId,
      oportunidadeId: estado.oportunidadeId,
      dados: { ...estado.dados, ...resultado.dadosNovos },
    },
    encerrado: resultado.etapaFinal === null,
    naoReconhecido: resultado.naoReconhecido,
  };
}
