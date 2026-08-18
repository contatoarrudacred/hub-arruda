// Roteamento de lead novo (Bloco D/Fase 4, TELA_ATENDIMENTO_ARRUDACRED.md seção 5-B) — decide em
// qual etapa iniciar o fluxo quando um número desconhecido manda a primeira mensagem. Puro/testável
// como o resto do motor (engine.ts) — a I/O (configuracoes, regras_roteamento) mora em repositorio.ts.

export type ModoRoteamentoLeadNovo = "fluxo_fixo" | "palavra_chave" | "manual";

export type RegraRoteamento = { termos: string[]; etapaCodigo: string };

/**
 * Retorna o código da etapa a iniciar, ou `null` quando o sistema não deve responder sozinho —
 * modo "manual", ou modo "palavra_chave" sem nenhuma regra batendo na primeira mensagem (não
 * documentado explicitamente por Luiz, mas é a leitura mais segura: melhor não adivinhar do que
 * acionar o fluxo errado).
 */
export function resolverEtapaInicialLeadNovo(
  primeiraMensagem: string,
  modo: ModoRoteamentoLeadNovo,
  etapaFixaCodigo: string,
  regras: RegraRoteamento[],
): string | null {
  if (modo === "manual") return null;
  if (modo === "fluxo_fixo") return etapaFixaCodigo;

  const textoNormalizado = primeiraMensagem.toLowerCase();
  for (const regra of regras) {
    if (regra.termos.some((termo) => textoNormalizado.includes(termo.toLowerCase()))) {
      return regra.etapaCodigo;
    }
  }
  return null;
}
