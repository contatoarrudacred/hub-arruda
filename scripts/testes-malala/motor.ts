// Roda o motor de fluxo de verdade (mesmo código de produção) contra um telefone de teste, SEM
// nunca chamar a Zapster real — mesma separação já existente no webhook real
// (src/app/api/webhooks/zapster/route.ts): "decidir e gravar" (engine.ts + persistencia.ts) é
// independente de "efetivamente mandar pelo WhatsApp" (enviarSequenciaWhatsapp, não importado
// aqui). Ver spec docs/superpowers/specs/2026-08-21-testes-conversa-malala-e-nota-handoff.md.
//
// Import deste arquivo só deve acontecer DEPOIS de "./ambiente" já ter rodado (stub de
// "server-only" + carga do .env.local) — sempre via `await import("./motor")` dinâmico a partir de
// um script que já importou "./ambiente" estaticamente primeiro (ver runner.ts).

import { avancarConversa, iniciarFluxo, saudacaoPorHorario, textoDeMensagem } from "@/lib/motor-fluxo/engine";
import {
  criarCalculadoraDadosDerivados,
  criarExtratorAbertura,
  criarResolverMensagensDinamicas,
} from "@/lib/motor-fluxo/fluxo-limpeza-nome";
import { interpretarComIA } from "@/lib/motor-fluxo/interpretacao-ia";
import { criarInterpretadorDesvio } from "@/lib/motor-fluxo/interpretar-desvio";
import { criarInterpretadorFaixasDocumentos } from "@/lib/motor-fluxo/interpretar-faixas-documentos";
import { interpretarListaDocumentos } from "@/lib/motor-fluxo/interpretar-lista-documentos";
import { interpretarNegociacaoPagamento } from "@/lib/motor-fluxo/interpretar-negociacao-pagamento";
import { carregarOuCriarConversaWhatsapp, registrarMensagemLead, registrarTurnoMalala } from "@/lib/motor-fluxo/persistencia";
import {
  carregarConfigPrecificacao,
  carregarDadosAgendamentoConsultor,
  carregarEtapasPorCodigo,
  carregarFaixasPreco,
  carregarFaqsAtivas,
} from "@/lib/motor-fluxo/repositorio";
import type { DadosConversa, ResultadoAvanco } from "@/lib/motor-fluxo/tipos";

async function montarDependencias() {
  const [etapasPorCodigo, faixas, config, dadosAgendamento, faqsAtivas] = await Promise.all([
    carregarEtapasPorCodigo(),
    carregarFaixasPreco(),
    carregarConfigPrecificacao(),
    carregarDadosAgendamentoConsultor(),
    carregarFaqsAtivas(),
  ]);
  return {
    etapasPorCodigo,
    resolverMensagensDinamicas: criarResolverMensagensDinamicas(faixas, config),
    calcularDadosDerivados: criarCalculadoraDadosDerivados(config, faixas, {
      disponibilidadeConsultor: dadosAgendamento.disponibilidade,
      agendamentosExistentes: dadosAgendamento.agendamentosExistentes,
    }),
    interpretarFaixasDocumentos: criarInterpretadorFaixasDocumentos(faixas, config.corteAltoValor),
    interpretarDesvio: criarInterpretadorDesvio(faqsAtivas),
  };
}

export type ResultadoTurnoTeste = {
  mensagensMalala: string[];
  etapaCodigo: string | null;
  naoReconhecido: boolean;
  interpretadoPorIA: boolean;
  /** true quando a conversa entrou sob supervisão humana NESTE turno ou já estava antes — motivo
   * pra parar de mandar mensagens automáticas de teste (o script real também para de responder
   * sozinho aqui, ver `processarMensagemRecebida`). */
  sobSupervisor: boolean;
  /** etapaFinal === null — não necessariamente handoff, também acontece em fins normais do MVP1. */
  encerrado: boolean;
};

/**
 * Um turno completo — mesma sequência de `processarMensagemRecebida` (route.ts), sem o debounce de
 * 3.5s (cada mensagem de cenário já chega "pronta", não precisa concatenar) e sem o envio real pelo
 * WhatsApp. Sempre relê o estado do banco no início (mesmo padrão do webhook real — sem client
 * guardando estado entre turnos).
 */
export async function rodarTurno(telefone: string, textoLead: string): Promise<ResultadoTurnoTeste> {
  const { etapasPorCodigo, resolverMensagensDinamicas, calcularDadosDerivados, interpretarFaixasDocumentos, interpretarDesvio } =
    await montarDependencias();
  const estado = await carregarOuCriarConversaWhatsapp(telefone, etapasPorCodigo);

  if (estado.sobSupervisor) {
    await registrarMensagemLead(estado.conversaId, textoLead);
    return {
      mensagensMalala: [],
      etapaCodigo: estado.etapaAtualCodigo,
      naoReconhecido: false,
      interpretadoPorIA: false,
      sobSupervisor: true,
      encerrado: true,
    };
  }

  await registrarMensagemLead(estado.conversaId, textoLead);

  let resultado: ResultadoAvanco;
  let dadosNovos: DadosConversa;

  if (estado.etapaAtualCodigo === null) {
    const dadosIniciais = criarExtratorAbertura()(textoLead);
    dadosIniciais.telefone = telefone;
    const percurso = iniciarFluxo("saudacao_inicial", etapasPorCodigo, dadosIniciais, resolverMensagensDinamicas, {
      saudacao: saudacaoPorHorario(),
    });
    // iniciarFluxo (1ª mensagem) não tem o conceito de naoReconhecido/interpretadoPorIA — mesmo
    // tratamento do webhook real (route.ts): trata como false.
    resultado = { ...percurso, dadosNovos: dadosIniciais, naoReconhecido: false, interpretadoPorIA: false };
    dadosNovos = dadosIniciais;
  } else {
    const etapaAtual = etapasPorCodigo[estado.etapaAtualCodigo];
    resultado = await avancarConversa({
      etapaAtual,
      etapasPorCodigo,
      dados: estado.dados,
      respostaLead: textoLead,
      resolverMensagensDinamicas,
      calcularDadosDerivados,
      interpretarComIA,
      interpretarListaDocumentos,
      interpretarFaixasDocumentos,
      interpretarNegociacaoPagamento,
      interpretarDesvio,
      variaveisGlobais: { saudacao: saudacaoPorHorario() },
    });
    dadosNovos = resultado.dadosNovos;
  }

  await registrarTurnoMalala({
    conversaId: estado.conversaId,
    oportunidadeId: estado.oportunidadeId,
    pessoaId: estado.pessoaId,
    dadosNovos,
    dadosCompletos: { ...estado.dados, ...dadosNovos },
    resultado,
  });

  const escalouNesteTurno = resultado.efeitos.some(
    (e) => (e.tipo === "encerrar_fluxo_automatizado" && e.sobSupervisor) || e.tipo === "escalar_supervisor" || e.tipo === "agendar_consultor",
  );

  return {
    mensagensMalala: resultado.mensagens.map((m) => textoDeMensagem(m.mensagem)),
    etapaCodigo: resultado.etapaFinal?.conteudo.codigo ?? null,
    naoReconhecido: resultado.naoReconhecido,
    interpretadoPorIA: resultado.interpretadoPorIA,
    sobSupervisor: escalouNesteTurno,
    encerrado: resultado.etapaFinal === null,
  };
}
