// "Ator" — uma IA fazendo o papel do lead numa conversa adversarial (reage de verdade ao que a
// Malala responde, em vez de seguir um roteiro fixo). É o que pega repetição/alucinação que um
// cenário roteirizado não provoca, porque não reage à resposta da etapa anterior.

import Anthropic from "@anthropic-ai/sdk";

const MODELO_ATOR = "claude-sonnet-5";

let clienteSingleton: Anthropic | null = null;
function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

export type TurnoHistorico = { autor: "lead" | "malala"; texto: string };

export async function proximaMensagemAtor(params: { persona: string; historico: TurnoHistorico[] }): Promise<string> {
  const { persona, historico } = params;
  const transcricao = historico.map((h) => `${h.autor === "lead" ? "Você (lead)" : "Malala"}: ${h.texto}`).join("\n");

  const prompt = [
    "Você está fazendo o papel de um LEAD (cliente em potencial) numa simulação de teste de uma conversa de WhatsApp com a Malala, assistente virtual de atendimento da ArrudaCred (empresa de limpeza de nome/crédito).",
    "",
    `Seu papel/objetivo nesta simulação: ${persona}`,
    "",
    "Histórico da conversa até agora:",
    transcricao || "(nenhuma mensagem ainda — você inicia a conversa)",
    "",
    "Responda com a PRÓXIMA mensagem que você (o lead) mandaria agora pelo WhatsApp — texto puro, curto e natural, do jeito que uma pessoa de verdade digitaria (sem formatação markdown, sem aspas ao redor). Não escreva nenhuma explicação, só a mensagem em si.",
  ].join("\n");

  const resposta = await obterCliente().messages.create({
    model: MODELO_ATOR,
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const bloco = resposta.content.find((b) => b.type === "text");
  return bloco && bloco.type === "text" ? bloco.text.trim() : "ok";
}
