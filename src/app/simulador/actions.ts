"use server";

import { avancarConversa, iniciarFluxo, saudacaoPorHorario } from "@/lib/motor-fluxo/engine";
import {
  criarCalculadoraDadosDerivados,
  criarExtratorAbertura,
  criarResolverMensagensDinamicas,
} from "@/lib/motor-fluxo/fluxo-limpeza-nome";
import {
  carregarConfigPrecificacao,
  carregarEtapasPorCodigo,
  carregarFaixasPreco,
} from "@/lib/motor-fluxo/repositorio";
import type { DadosConversa, MensagemEnviada } from "@/lib/motor-fluxo/tipos";

// Server Actions que dão vida ao simulador (src/app/simulador/simulador-chat.tsx). O estado da
// conversa (em que etapa está, o que já foi capturado) fica no client — não persiste em nenhuma
// tabela ainda (isso é trabalho da Fase 4, quando o motor passa a escrever em pessoas/oportunidades
// de verdade). O que É real aqui é o conteúdo: etapas_fluxo, precos_por_faixa e configuracoes vêm
// do Supabase a cada chamada, então editar o script no banco muda o simulador na hora.

export type EstadoSimulador = {
  /** null = fluxo automatizado encerrado (perdida, handoff humano, ou fim do MVP1) */
  etapaAtualCodigo: string | null;
  dados: DadosConversa;
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

  return {
    mensagens: resultado.mensagens,
    estado: {
      etapaAtualCodigo: resultado.etapaFinal?.conteudo.codigo ?? null,
      dados: dadosIniciais,
    },
    encerrado: resultado.etapaFinal === null,
    naoReconhecido: false,
  };
}

export async function enviarResposta(
  estado: EstadoSimulador,
  respostaLead: string,
): Promise<PassoSimulador> {
  if (!estado.etapaAtualCodigo) {
    return { mensagens: [], estado, encerrado: true, naoReconhecido: false };
  }

  const { etapasPorCodigo, resolverMensagensDinamicas, calcularDadosDerivados } =
    await montarDependencias();
  const etapaAtual = etapasPorCodigo[estado.etapaAtualCodigo];

  const resultado = await avancarConversa({
    etapaAtual,
    etapasPorCodigo,
    dados: estado.dados,
    respostaLead,
    resolverMensagensDinamicas,
    calcularDadosDerivados,
    variaveisGlobais: { saudacao: saudacaoPorHorario() },
  });

  return {
    mensagens: resultado.mensagens,
    estado: {
      etapaAtualCodigo: resultado.etapaFinal?.conteudo.codigo ?? null,
      dados: { ...estado.dados, ...resultado.dadosNovos },
    },
    encerrado: resultado.etapaFinal === null,
    naoReconhecido: resultado.naoReconhecido,
  };
}
