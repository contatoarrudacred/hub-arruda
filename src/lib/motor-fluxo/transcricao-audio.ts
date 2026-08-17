// Transcrição de áudio (Bloco C / Fase 5) — requisito de arquitetura registrado desde 11/08/2026
// (PLANO_MESTRE seção 2.2): o lead pode responder ou perguntar por áudio no WhatsApp, e a Malala só
// entende texto (parser determinístico) — precisa transcrever ANTES do texto entrar no pipeline de
// interpretação normal (parser → IA se necessário). Claude não transcreve áudio nativamente, por
// isso usa a OpenAI (`gpt-4o-mini-transcribe`, ~$0,003/min — irrelevante em qualquer volume
// realista), único uso de IA deste sistema que não é Anthropic.

import "server-only";

const MODELO_TRANSCRICAO = "gpt-4o-mini-transcribe";

/** A OpenAI decide como decodificar o áudio pela extensão do nome do arquivo enviado — mandar tudo como ".ogg" (formato real do WhatsApp/Opus) faz ela rejeitar qualquer outro formato ("Audio file might be corrupted or unsupported"), mesmo com bytes válidos. */
function extensaoPorContentType(contentType: string | null): string {
  if (!contentType) return "ogg";
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("mpeg") || contentType.includes("mp3")) return "mp3";
  if (contentType.includes("mp4") || contentType.includes("m4a")) return "m4a";
  if (contentType.includes("webm")) return "webm";
  return "ogg";
}

/** Retorna null em qualquer falha (sem API key, download do áudio falhou, OpenAI recusou) — quem chama decide o que fazer quando não dá pra transcrever (ver processarAudioRecebido, route.ts). */
export async function transcreverAudio(audioUrl: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[transcricao-audio] OPENAI_API_KEY não configurada.");
    return null;
  }

  try {
    const respostaArquivo = await fetch(audioUrl);
    if (!respostaArquivo.ok) {
      throw new Error(`Falha ao baixar áudio (${respostaArquivo.status})`);
    }
    const extensao = extensaoPorContentType(respostaArquivo.headers.get("content-type"));
    const blob = await respostaArquivo.blob();

    const formData = new FormData();
    formData.append("file", blob, `audio.${extensao}`);
    formData.append("model", MODELO_TRANSCRICAO);

    const resposta = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!resposta.ok) {
      const corpo = await resposta.text();
      throw new Error(`OpenAI respondeu ${resposta.status}: ${corpo}`);
    }

    const dados = (await resposta.json()) as { text?: string };
    const texto = dados.text?.trim();
    return texto || null;
  } catch (e) {
    console.error("[transcricao-audio] erro ao transcrever áudio:", e);
    return null;
  }
}
