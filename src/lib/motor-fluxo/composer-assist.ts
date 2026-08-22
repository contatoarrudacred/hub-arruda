// Assist do composer (Sonnet) — Bloco C / Fase 5, item registrado em
// TELA_ATENDIMENTO_ARRUDACRED.md ("assist do composer... precisa da voz/nuance da Malala").
// Diferente dos outros módulos de IA deste diretório (classificação/extração via Haiku), aqui a
// tarefa é GERAR texto com a voz da Malala — por isso usa Sonnet e a persona completa como system
// prompt (ver migration 20260817070001_persona_malala_config.sql — o texto vem de `configuracoes`,
// não de fs.readFileSync em docs/, que quebraria no bundle serverless da Vercel).
//
// Só sugere um rascunho pro atendente revisar/editar antes de enviar (preenche o composer, não
// envia sozinho) — mesmo padrão de "usar próxima etapa do script" já existente.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { carregarFaqsAtivas, carregarPersonaTexto } from "./repositorio";

const MODELO_ASSIST = "claude-sonnet-5";

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

export type MensagemParaAssist = { remetente: string; conteudo: string | null };

function nomeRemetente(remetente: string): string {
  if (remetente === "lead") return "Lead";
  if (remetente === "malala") return "Malala";
  return "Atendente";
}

function montarSystemPrompt(persona: string, faqs: { pergunta: string; resposta: string }[]): string {
  const listaFaqs = faqs.map((f) => `P: ${f.pergunta}\nR: ${f.resposta}`).join("\n\n");
  return [
    persona,
    "",
    "## FAQ (perguntas factuais já respondidas oficialmente)",
    listaFaqs || "(nenhuma FAQ cadastrada)",
  ].join("\n");
}

function montarPrompt(mensagens: MensagemParaAssist[]): string {
  const transcricao = mensagens
    .filter((m) => m.conteudo)
    .map((m) => `${nomeRemetente(m.remetente)}: ${m.conteudo}`)
    .join("\n");

  return [
    `Histórico da conversa (mais antiga primeiro):\n"""\n${transcricao}\n"""`,
    "",
    "Escreva a PRÓXIMA mensagem que a Malala mandaria agora, respondendo à última mensagem do lead, seguindo todas as regras de identidade/tom/técnicas/limites acima. Devolva SÓ o texto da mensagem, pronto pra um atendente humano revisar e enviar — sem aspas ao redor, sem comentário, sem explicação sobre a escolha.",
  ].join("\n");
}

/** Retorna null em qualquer falha — é um rascunho pro atendente, nunca deve travar o composer. */
export async function sugerirResposta(mensagens: MensagemParaAssist[]): Promise<string | null> {
  if (mensagens.every((m) => !m.conteudo)) return null;

  try {
    const [persona, faqs] = await Promise.all([carregarPersonaTexto(), carregarFaqsAtivas()]);
    if (!persona) {
      console.error("[composer-assist] persona da Malala não configurada (chave malala_persona_prompt_sistema ausente em configuracoes).");
      return null;
    }

    const cliente = obterCliente();
    const resposta = await cliente.messages.create({
      model: MODELO_ASSIST,
      max_tokens: 500,
      system: montarSystemPrompt(persona, faqs),
      messages: [{ role: "user", content: montarPrompt(mensagens) }],
    });

    const bloco = resposta.content.find((b) => b.type === "text");
    return bloco && bloco.type === "text" ? bloco.text.trim() : null;
  } catch (e) {
    console.error("[composer-assist] erro ao chamar Claude:", e);
    return null;
  }
}
