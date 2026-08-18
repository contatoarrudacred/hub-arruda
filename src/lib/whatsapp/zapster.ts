import "server-only";

// Envio real de WhatsApp via Zapster (Fase 7, decidido em 11/08/2026 — ver PLANO_MESTRE seção 8.5).
// Modo não-oficial (QR), instância única por enquanto — quando existir uma segunda instância
// (número de atendimento real, sem escala), ZAPSTER_INSTANCE_ID passa a precisar de seleção por
// contexto; não fazemos isso agora (YAGNI, só existe 1 instância hoje).
// Único lugar do projeto que fala com a API da Zapster.

function obterConfig(): { baseUrl: string; token: string; instanceId: string } {
  const baseUrl = process.env.ZAPSTER_API_BASE_URL;
  const token = process.env.ZAPSTER_API_TOKEN;
  const instanceId = process.env.ZAPSTER_INSTANCE_ID;
  if (!baseUrl || !token || !instanceId) {
    throw new Error(
      "Configuração do Zapster incompleta — falta ZAPSTER_API_BASE_URL / ZAPSTER_API_TOKEN / ZAPSTER_INSTANCE_ID no .env.local (dev) ou nas variáveis de ambiente da Vercel (produção).",
    );
  }
  return { baseUrl, token, instanceId };
}

/** Telefone só com dígitos, formato internacional (ex.: 5513997226002) — sem "+", espaços ou traços, é o que a API da Zapster espera em `recipient`. */
function normalizarTelefone(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

/** Envia uma mensagem de texto simples via WhatsApp. Lança erro em caso de falha. */
export async function enviarMensagemTexto(telefone: string, texto: string): Promise<{ messageId: string }> {
  const { baseUrl, token, instanceId } = obterConfig();

  const resposta = await fetch(`${baseUrl}/wa/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instance_id: instanceId,
      recipient: normalizarTelefone(telefone),
      text: texto,
    }),
  });

  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(`Falha ao enviar mensagem via Zapster (HTTP ${resposta.status}): ${JSON.stringify(corpo)}`);
  }
  return { messageId: corpo?.message_id ?? "" };
}

/** Mostra "digitando..." (ou "gravando áudio...") pro destinatário até a próxima mensagem ser enviada (ou por até 10 min, o que vier primeiro). Não lança erro — indicador de presença é cosmético, uma falha aqui não pode travar o envio da mensagem de verdade. */
export async function definirDigitando(telefone: string): Promise<void> {
  const { baseUrl, token, instanceId } = obterConfig();
  try {
    await fetch(`${baseUrl}/wa/instances/${instanceId}/presence`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: normalizarTelefone(telefone),
        status: "typing",
        duration_strategy: "until_next_message",
      }),
    });
  } catch {
    // cosmético — ignora falha
  }
}

/** Atualiza configurações de comportamento da instância (PATCH /wa/instances/{id}/settings) — envia só o que quer mudar, o resto continua como está. Usado pra ligar confirmação de leitura, ajustar rejeição de chamada, etc. (Bloco D, 17/08/2026). Lança erro em caso de falha. */
export async function atualizarConfiguracoesInstancia(settings: Record<string, unknown>): Promise<void> {
  const { baseUrl, token, instanceId } = obterConfig();

  const resposta = await fetch(`${baseUrl}/wa/instances/${instanceId}/settings`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ settings }),
  });

  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(`Falha ao atualizar configurações da instância Zapster (HTTP ${resposta.status}): ${JSON.stringify(corpo)}`);
  }
}

/** Envia uma mídia (imagem/áudio/vídeo/documento) por URL — a mesma URL do Supabase Storage já usada no editor de fluxo/simulador. Lança erro em caso de falha. */
export async function enviarMensagemMidia(
  telefone: string,
  urlMidia: string,
  legenda?: string,
): Promise<{ messageId: string }> {
  const { baseUrl, token, instanceId } = obterConfig();

  const resposta = await fetch(`${baseUrl}/wa/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instance_id: instanceId,
      recipient: normalizarTelefone(telefone),
      media: { url: urlMidia, caption: legenda },
    }),
  });

  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(`Falha ao enviar mídia via Zapster (HTTP ${resposta.status}): ${JSON.stringify(corpo)}`);
  }
  return { messageId: corpo?.message_id ?? "" };
}
