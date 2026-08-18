// Resumo automático por IA ao assumir uma conversa — Bloco C / Fase 5, item registrado em
// TELA_ATENDIMENTO_ARRUDACRED.md ("Resumo automático por IA ao assumir uma conversa em
// andamento — 3-4 linhas fixas no topo: o que o lead já disse, em que etapa está, se já levantou
// objeção"). Mesmo padrão de cliente/modelo de interpretacao-ia.ts (Haiku, é classificação/síntese
// curta, não geração com a nuance da Malala) — mas aqui é texto livre, não tool-use, porque a saída
// é um parágrafo pra leitura humana, não um valor estruturado que o motor consome.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const MODELO_RESUMO = "claude-haiku-4-5-20251001";

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

export type MensagemParaResumo = { remetente: string; conteudo: string | null };

function nomeRemetente(remetente: string): string {
  if (remetente === "lead") return "Lead";
  if (remetente === "malala") return "Malala";
  return "Atendente";
}

function montarPrompt(mensagens: MensagemParaResumo[], etapaRotulo: string | null): string {
  const transcricao = mensagens
    .filter((m) => m.conteudo)
    .map((m) => `${nomeRemetente(m.remetente)}: ${m.conteudo}`)
    .join("\n");

  return [
    "Você resume conversas de atendimento da ArrudaCred (empresa de limpeza de nome/crédito, Serasa/SPC) para um atendente humano que está prestes a assumir o controle de uma conversa que a Malala (IA) vinha conduzindo.",
    "",
    `Etapa atual do atendimento: ${etapaRotulo ?? "não identificada"}`,
    "",
    `Histórico da conversa (mais antiga primeiro):\n"""\n${transcricao}\n"""`,
    "",
    "Escreva um resumo de NO MÁXIMO 4 linhas curtas cobrindo, nesta ordem: (1) o que o lead já disse ou pediu de mais relevante, (2) em que ponto do atendimento a conversa está agora, (3) se o lead levantou alguma objeção/hesitação e qual (omita esta linha se não houve nenhuma). Sem saudação, sem introdução, sem repetir as mensagens literalmente — é pra um atendente ler em poucos segundos antes de assumir a conversa. Texto puro, sem markdown (nada de **negrito**, `código`, ou marcadores tipo •/-/1. no início da linha) — cada linha é só uma frase direta.",
  ].join("\n");
}

/** Retorna null em qualquer falha (mensagens vazias, erro de API) — o resumo é um "nice to have" da UI, nunca deve travar o fluxo de assumir a conversa. */
export async function gerarResumoConversa(mensagens: MensagemParaResumo[], etapaRotulo: string | null): Promise<string | null> {
  if (mensagens.every((m) => !m.conteudo)) return null;

  try {
    const cliente = obterCliente();
    const resposta = await cliente.messages.create({
      model: MODELO_RESUMO,
      max_tokens: 300,
      messages: [{ role: "user", content: montarPrompt(mensagens, etapaRotulo) }],
    });
    const bloco = resposta.content.find((b) => b.type === "text");
    return bloco && bloco.type === "text" ? bloco.text.trim() : null;
  } catch (e) {
    console.error("[resumo-conversa] erro ao chamar Claude:", e);
    return null;
  }
}
