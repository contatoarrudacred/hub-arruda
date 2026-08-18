// Selo de risco de esfriar (🔴/🟡/🟢, Bloco D/Fase 5, TELA_ATENDIMENTO_ARRUDACRED.md) — combina 3
// sinais independentes num único nível, pelo pior deles (qualquer sinal "alto" já vermelho; sem
// nenhum "alto" mas algum "medio" já amarelo). Puro/testável, sem I/O — os dados brutos (colunas de
// `conversas`, limiares de `configuracoes`) são carregados por quem chama (repositorio-atendimento.ts
// pro cabeçalho, conversas_resumo pro card da lista).

export type NivelRisco = "alto" | "medio" | "baixo";

// Sinal 2 (contador de não-reconhecimento) — limiares fixos, diferente do sinal 1 (que Luiz pediu
// explicitamente pra ser configurável, 17/08/2026). Ajustar aqui se a experiência real mostrar que
// precisam mudar; promover pra `configuracoes` só se isso virar um pedido de verdade (YAGNI).
const LIMIAR_NAO_RECONHECIMENTO_MEDIO = 2;
const LIMIAR_NAO_RECONHECIMENTO_ALTO = 3;

/** Sinal 1: tempo sem resposta do lead vs os limiares configuráveis (`selo_risco_esfriar_horas_amarelo`/`_vermelho`). Sem `aguardandoRespostaDesde` (conversa não está esperando resposta) não há risco por este sinal. */
export function nivelRiscoTempoSemResposta(
  aguardandoRespostaDesde: string | null,
  agora: Date,
  horasAmarelo: number,
  horasVermelho: number,
): NivelRisco {
  if (!aguardandoRespostaDesde) return "baixo";
  const horas = (agora.getTime() - new Date(aguardandoRespostaDesde).getTime()) / 3_600_000;
  if (horas >= horasVermelho) return "alto";
  if (horas >= horasAmarelo) return "medio";
  return "baixo";
}

/** Sinal 2: quantas vezes seguidas a Malala não reconheceu a resposta do lead (`conversas.contador_nao_reconhecimento`, zera quando ela reconhece de novo). */
export function nivelRiscoNaoReconhecimento(contador: number): NivelRisco {
  if (contador >= LIMIAR_NAO_RECONHECIMENTO_ALTO) return "alto";
  if (contador >= LIMIAR_NAO_RECONHECIMENTO_MEDIO) return "medio";
  return "baixo";
}

/** Sinal 3: negociação estagnada — objeção detectada automaticamente OU o fluxo terminou sem fechar (`conversas.estagnado_desde`). É um sinal binário (pendente ou não), não uma escala de tempo — por isso vira "alto" assim que existe, não "medio". */
export function nivelRiscoEstagnada(estagnadoDesde: string | null): NivelRisco {
  return estagnadoDesde ? "alto" : "baixo";
}

/** Combina os 3 níveis pelo pior — um único sinal "alto" já basta pro selo inteiro ficar vermelho. */
export function combinarSeloRisco(niveis: NivelRisco[]): NivelRisco {
  if (niveis.includes("alto")) return "alto";
  if (niveis.includes("medio")) return "medio";
  return "baixo";
}

export type EntradaSeloRisco = {
  aguardandoRespostaDesde: string | null;
  contadorNaoReconhecimento: number;
  estagnadoDesde: string | null;
  horasAmarelo: number;
  horasVermelho: number;
  agora?: Date;
};

/** Ponto de entrada único — calcula o selo de risco de esfriar de uma conversa a partir dos 3 sinais brutos. */
export function calcularSeloRisco(entrada: EntradaSeloRisco): NivelRisco {
  const agora = entrada.agora ?? new Date();
  return combinarSeloRisco([
    nivelRiscoTempoSemResposta(entrada.aguardandoRespostaDesde, agora, entrada.horasAmarelo, entrada.horasVermelho),
    nivelRiscoNaoReconhecimento(entrada.contadorNaoReconhecimento),
    nivelRiscoEstagnada(entrada.estagnadoDesde),
  ]);
}
