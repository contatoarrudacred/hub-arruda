"use server";

import { avancarConversa, iniciarFluxo, saudacaoPorHorario } from "@/lib/motor-fluxo/engine";
import {
  criarCalculadoraDadosDerivados,
  criarExtratorAbertura,
  criarResolverMensagensDinamicas,
} from "@/lib/motor-fluxo/fluxo-limpeza-nome";
import { interpretarComIA } from "@/lib/motor-fluxo/interpretacao-ia";
import { criarInterpretadorFaixasDocumentos } from "@/lib/motor-fluxo/interpretar-faixas-documentos";
import { interpretarListaDocumentos } from "@/lib/motor-fluxo/interpretar-lista-documentos";
import { interpretarNegociacaoPagamento } from "@/lib/motor-fluxo/interpretar-negociacao-pagamento";
import {
  carregarConfigPrecificacao,
  carregarEtapasPorCodigo,
  carregarFaixasPreco,
} from "@/lib/motor-fluxo/repositorio";
import type { DadosConversa, MensagemEnviada } from "@/lib/motor-fluxo/tipos";

// Server Actions que dão vida ao simulador (src/app/simulador/simulador-chat.tsx). 100% client-side
// a partir de 16/08/2026 (decisão de Luiz: "o simulador só simula, não é real") — não grava pessoa,
// oportunidade, conversa, mensagem nem dispara e-mail de boas-vindas. O estado de navegação do
// fluxo (em que etapa está, o que já foi capturado) vive só em EstadoSimulador, no navegador. O
// conteúdo do script (etapas_fluxo, precos_por_faixa, configuracoes) continua vindo do Supabase a
// cada chamada, então editar o script no banco continua mudando o simulador na hora — só o
// RESULTADO da conversa simulada é que não persiste em lugar nenhum.

export type EstadoSimulador = {
  /** null = fluxo automatizado encerrado (perdida, handoff humano, ou fim do MVP1) */
  etapaAtualCodigo: string | null;
  dados: DadosConversa;
  /** Sempre null — não existe conversa/oportunidade/pessoa real por trás de uma sessão do simulador. */
  conversaId: string | null;
  oportunidadeId: string | null;
  pessoaId: string | null;
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
    calcularDadosDerivados: criarCalculadoraDadosDerivados(config, faixas),
    interpretarFaixasDocumentos: criarInterpretadorFaixasDocumentos(faixas),
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
      conversaId: null,
      oportunidadeId: null,
      pessoaId: null,
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

  const { etapasPorCodigo, resolverMensagensDinamicas, calcularDadosDerivados, interpretarFaixasDocumentos } =
    await montarDependencias();
  const etapaAtual = etapasPorCodigo[estado.etapaAtualCodigo];

  const resultado = await avancarConversa({
    etapaAtual,
    etapasPorCodigo,
    dados: estado.dados,
    respostaLead,
    resolverMensagensDinamicas,
    calcularDadosDerivados,
    interpretarComIA,
    interpretarListaDocumentos,
    interpretarFaixasDocumentos,
    interpretarNegociacaoPagamento,
    variaveisGlobais: { saudacao: saudacaoPorHorario() },
  });

  return {
    mensagens: resultado.mensagens,
    estado: {
      etapaAtualCodigo: resultado.etapaFinal?.conteudo.codigo ?? null,
      conversaId: null,
      oportunidadeId: null,
      pessoaId: null,
      dados: { ...estado.dados, ...resultado.dadosNovos },
    },
    encerrado: resultado.etapaFinal === null,
    naoReconhecido: resultado.naoReconhecido,
  };
}
