import { randomUUID, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
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
  aindaEhTokenAtual,
  capturarFotoPerfilSeNecessario,
  carregarOuCriarConversaWhatsapp,
  correlacionarCliqueRastreio,
  detectarEMarcarObjecaoPendente,
  escreverTokenBuffer,
  extrairCodigoRastreio,
  marcarStatusMensagem,
  montarRespostaConcatenadaDesdeUltimaFala,
  registrarMensagemLead,
  registrarTurnoMalala,
} from "@/lib/motor-fluxo/persistencia";
import {
  carregarConfigPrecificacao,
  carregarConfigRoteamento,
  carregarEtapasPorCodigo,
  carregarFaixasPreco,
  listarRegrasRoteamentoAtivas,
} from "@/lib/motor-fluxo/repositorio";
import { resolverEtapaInicialLeadNovo } from "@/lib/motor-fluxo/roteamento-lead-novo";
import { transcreverAudio } from "@/lib/motor-fluxo/transcricao-audio";
import { enviarSequenciaWhatsapp } from "@/lib/whatsapp/enviar";

// Delay/digitando entre mensagens (ver enviarSequenciaWhatsapp) pode somar alguns segundos por
// turno, e agora soma também o debounce de entrada (DEBOUNCE_MS abaixo) — maxDuration maior evita
// que a função seja encerrada no meio de uma sequência de envio.
export const maxDuration = 120;

// Debounce de mensagens seguidas do lead (19/08/2026, Luiz: "vamos corrigir tudo mas de forma
// global" — log real mostrou o lead respondendo em 2 mensagens seguidas, cada uma virando um
// turno do motor separado, cego pra outra). Ver escreverTokenBuffer/aindaEhTokenAtual
// (persistencia.ts) e o comentário em processarMensagemRecebida abaixo.
const DEBOUNCE_MS = 3500;

// Webhook de entrada do WhatsApp real (Fase 7, Zapster, modo não-oficial). Mesmo motor que o
// /simulador usa (ver actions.ts) — a diferença é que aqui não existe client guardando
// EstadoSimulador entre uma mensagem e outra (cada chamada é uma invocação serverless nova), então
// a posição da conversa é sempre reconstruída do banco via carregarOuCriarConversaWhatsapp.
//
// Autenticação: a Zapster não assina o payload em instâncias não-oficiais (confirmado na
// documentação deles, 16/08/2026) — por isso o segredo mora na própria URL do webhook
// (?secret=...), que só nós conhecemos, mesmo padrão do CRON_SECRET já usado no cron de
// follow-up. Se ZAPSTER_WEBHOOK_SECRET não estiver configurada, a checagem é pulada (dev local).
//
// Formato do payload ainda não testado contra tráfego real — sempre loga o corpo bruto primeiro,
// pra dar pra ajustar rápido se o formato divergir do que a documentação da Zapster descreve.
//
// Responde IMEDIATAMENTE (via after(), mesmo padrão já usado pro e-mail de boas-vindas em
// persistencia.ts) — não espera o motor rodar nem as mensagens serem enviadas. Achado real
// (16/08/2026, Luiz): o processamento síncrono (rodar o motor + mandar várias mensagens com pausa
// de 3-6s cada) demorava mais do que a Zapster espera por uma resposta, e ela reenviava o mesmo
// webhook — o reenvio chegava depois que a 1ª tentativa já tinha avançado a conversa, e a mensagem
// do lead era processada DUAS vezes (uma como abertura, outra como se fosse resposta pro próximo
// checkpoint). Responder na hora elimina o motivo do reenvio.

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
 * Mídia recebida do lead (foto/áudio/vídeo/figurinha) — Bloco B2, 17/08/2026. Diferente de texto:
 * só registra na conversa (pro humano ver na Tela de Atendimento), nunca roda o motor de fluxo em
 * cima — mesmo com a Malala no controle. A Malala só entende texto (parser determinístico); tratar
 * a URL de uma mídia como se fosse a resposta do lead corromperia a posição da conversa.
 */
async function processarMidiaRecebida(
  telefone: string,
  midiaUrl: string,
  midiaTipo: string,
  legenda: string | null,
  fotoPerfil: string | null = null,
): Promise<void> {
  try {
    const { etapasPorCodigo } = await montarDependencias();
    const estado = await carregarOuCriarConversaWhatsapp(telefone, etapasPorCodigo);
    await capturarFotoPerfilSeNecessario(estado.pessoaId, fotoPerfil);
    await registrarMensagemLead(estado.conversaId, legenda, midiaUrl, midiaTipo);
  } catch (e) {
    console.error("[webhook zapster] erro ao processar mídia recebida:", e);
  }
}

/**
 * Áudio recebido do lead (Bloco C/Fase 5, 17/08/2026) — diferente dos outros tipos de mídia:
 * transcreve primeiro (`transcricao-audio.ts`, OpenAI) e roda o texto transcrito no motor de fluxo
 * normalmente, igual a uma mensagem digitada — a Malala passa a "entender" áudio. Se a transcrição
 * falhar (sem API key, OpenAI fora do ar, etc.), cai pro comportamento antigo — só registra o
 * áudio pro humano ouvir na Tela de Atendimento, sem rodar o motor em cima (não dá pra interpretar
 * uma resposta que não conseguimos entender).
 */
async function processarAudioRecebido(telefone: string, audioUrl: string, fotoPerfil: string | null = null): Promise<void> {
  const textoTranscrito = await transcreverAudio(audioUrl);

  if (!textoTranscrito) {
    await processarMidiaRecebida(telefone, audioUrl, "audio", null, fotoPerfil);
    return;
  }

  await processarMensagemRecebida(telefone, textoTranscrito, audioUrl, "audio", fotoPerfil);
}

/**
 * `midiaUrl`/`midiaTipo` são pra quando o texto veio de uma transcrição de áudio (ver
 * `processarAudioRecebido` abaixo) — a mensagem do lead fica ligada ao áudio original na timeline
 * (toca + mostra a transcrição como legenda), mas o texto transcrito é o que roda no motor,
 * igualzinho a uma mensagem digitada.
 *
 * Debounce de mensagens seguidas (19/08/2026) — depois de registrar a mensagem, espera
 * DEBOUNCE_MS antes de rodar o motor. Se outra mensagem do mesmo lead chegar nesse meio tempo (ela
 * roda esta mesma função de novo, numa invocação separada — cada webhook é uma invocação nova, sem
 * estado compartilhado), o token da conversa é sobrescrito e ESTA invocação desiste sem fazer nada
 * — quem processa o turno é sempre a invocação da mensagem MAIS RECENTE, usando o texto de TODAS as
 * mensagens acumuladas desde a última fala da Malala (`montarRespostaConcatenadaDesdeUltimaFala`).
 * Resolve o caso real de produção onde "só meu cpf e o cnpj dela" + "nome dela está limpo" (2
 * mensagens seguidas) viravam 2 turnos do motor, cada um cego pro outro.
 */
async function processarMensagemRecebida(
  telefone: string,
  textoRecebido: string,
  midiaUrl: string | null = null,
  midiaTipo: string | null = null,
  fotoPerfil: string | null = null,
): Promise<void> {
  // Código de rastreio (zap.arrudacred.com.br, ver docs/RASTREIO_CLIQUES_WHATSAPP.md) tirado antes
  // de qualquer outra coisa — a Malala/o motor nunca veem "(ref: a1b2c3d4)" como parte da conversa.
  const { texto, codigo: codigoRastreio } = extrairCodigoRastreio(textoRecebido);

  try {
    const { etapasPorCodigo, resolverMensagensDinamicas, calcularDadosDerivados, interpretarFaixasDocumentos } =
      await montarDependencias();
    const estado = await carregarOuCriarConversaWhatsapp(telefone, etapasPorCodigo);
    await capturarFotoPerfilSeNecessario(estado.pessoaId, fotoPerfil);

    if (codigoRastreio) {
      await correlacionarCliqueRastreio(codigoRastreio, estado.pessoaId);
    }

    // Selo de risco de esfriar, sinal 3 (Bloco D/Fase 5) — detector automático de objeção rodando a
    // cada mensagem de texto do lead, independente de quem está no controle (Malala ou humano): é um
    // sinal complementar pro atendente, útil nos dois casos. Desacoplado da resposta (after()) — não
    // pode atrasar nem travar o turno.
    after(() => detectarEMarcarObjecaoPendente(estado.conversaId, texto));

    if (estado.sobSupervisor) {
      await registrarMensagemLead(estado.conversaId, texto, midiaUrl, midiaTipo);
      return;
    }

    // A mensagem é registrada JÁ (Tela de Atendimento mostra na hora, e o card "Novo Lead" existe
    // mesmo sem resposta automática) — só rodar o motor em cima dela que espera o debounce abaixo.
    await registrarMensagemLead(estado.conversaId, texto, midiaUrl, midiaTipo);

    const token = randomUUID();
    await escreverTokenBuffer(estado.conversaId, token);
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS));
    if (!(await aindaEhTokenAtual(estado.conversaId, token))) return;

    const textoConcatenado = await montarRespostaConcatenadaDesdeUltimaFala(estado.conversaId);
    if (!textoConcatenado) return;

    let resultado;
    let dadosNovos;
    if (estado.etapaAtualCodigo === null) {
      // Roteamento de lead novo (Bloco D/Fase 4, TELA_ATENDIMENTO_ARRUDACRED.md seção 5-B) — decide
      // em qual etapa iniciar, ou se não deve responder sozinho (modo "manual", ou "palavra_chave"
      // sem nenhuma regra batendo). Usa o texto CONCATENADO (ex.: "oi" + "quero limpar meu nome" em
      // 2 mensagens seguidas) — mais contexto pra decidir do que só a última mensagem isolada.
      const { modo, etapaFixaCodigo } = await carregarConfigRoteamento();
      const regras = modo === "palavra_chave" ? await listarRegrasRoteamentoAtivas() : [];
      const etapaInicial = resolverEtapaInicialLeadNovo(textoConcatenado, modo, etapaFixaCodigo, regras);
      if (etapaInicial === null) return;

      const dadosIniciais = criarExtratorAbertura()(textoConcatenado);
      // O canal já forneceu o telefone (é de onde a mensagem veio) — não faz sentido perguntar de
      // novo (regra de checkpoint já respondido, engine.ts). Só o canal WhatsApp faz isso; outros
      // canais (widget do site, por exemplo) continuam perguntando normalmente.
      dadosIniciais.telefone = telefone;
      resultado = iniciarFluxo(etapaInicial, etapasPorCodigo, dadosIniciais, resolverMensagensDinamicas, {
        saudacao: saudacaoPorHorario(),
      });
      dadosNovos = dadosIniciais;
    } else {
      const etapaAtual = etapasPorCodigo[estado.etapaAtualCodigo];
      resultado = await avancarConversa({
        etapaAtual,
        etapasPorCodigo,
        dados: estado.dados,
        respostaLead: textoConcatenado,
        resolverMensagensDinamicas,
        calcularDadosDerivados,
        interpretarComIA,
        interpretarListaDocumentos,
        interpretarFaixasDocumentos,
        interpretarNegociacaoPagamento,
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

    await enviarSequenciaWhatsapp(telefone, resultado.mensagens);
  } catch (e) {
    console.error("[webhook zapster] erro ao processar:", e);
  }
}

/** Comparação em tempo constante — evita vazar, por timing, quantos caracteres do segredo já acertaram. */
function segredosBatem(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function POST(request: Request) {
  const segredo = process.env.ZAPSTER_WEBHOOK_SECRET;

  // Falha fechado em produção: sem a env var configurada, a checagem abaixo era pulada por
  // inteiro (achado real na avaliação de 16/08/2026) — um erro de configuração na Vercel viraria
  // um endpoint aberto, aceitando "mensagens" falsas de qualquer um (gera lead falso, roda o motor
  // de verdade, custo real). Mesmo padrão de CRON_SECRET (route.ts do cron de follow-up): vazio
  // localmente pula a checagem (dev), mas em produção (Vercel) é obrigatório.
  if (!segredo) {
    if (process.env.VERCEL) {
      console.error("[webhook zapster] ZAPSTER_WEBHOOK_SECRET não configurada em produção — rejeitando.");
      return new Response("Não autorizado", { status: 401 });
    }
  } else {
    const secretDaUrl = new URL(request.url).searchParams.get("secret") ?? "";
    if (!segredosBatem(secretDaUrl, segredo)) {
      return new Response("Não autorizado", { status: 401 });
    }
  }

  const payload = await request.json().catch(() => null);
  console.log("[webhook zapster] payload recebido:", JSON.stringify(payload));

  if (!payload) {
    return Response.json({ ignorado: true, motivo: "payload vazio" });
  }

  // Confirmação de entrega/leitura (Bloco B2, 17/08/2026) — alimenta o check ✓/✓✓/✓✓azul do card
  // de contato. Nome exato do campo de correlação com a mensagem ainda não confirmado contra
  // tráfego real (mesmo caso já registrado abaixo pra message.received) — tenta os caminhos mais
  // prováveis do payload; ajustar aqui assim que o formato real for visto no log acima.
  if (payload.type === "message.delivered" || payload.type === "message.read") {
    const zapsterMessageId: string | undefined =
      payload.data?.message_id ?? payload.data?.id ?? payload.data?.message?.id;
    const quando: string = payload.data?.timestamp ?? payload.timestamp ?? new Date().toISOString();
    if (zapsterMessageId) {
      const status = payload.type === "message.delivered" ? "entregue" : "lido";
      after(() => marcarStatusMensagem(zapsterMessageId, status, quando));
    }
    return Response.json({ recebido: true });
  }

  if (payload.type !== "message.received") {
    return Response.json({ ignorado: true, motivo: `tipo de evento "${payload.type}" ainda não tratado` });
  }

  const data = payload.data;
  const telefone: string | undefined = data?.sender?.phone_number ?? data?.recipient?.phone_number;
  if (!telefone) {
    return Response.json({ ignorado: true, motivo: "sem phone_number no payload" });
  }

  // Foto de perfil do WhatsApp do lead (Bloco D, 17/08/2026) — vem em `sender.profile_picture` em
  // TODO message.received (confirmado no schema real da Zapster), null quando o contato não tem
  // foto pública. Repassada pra cada handler abaixo, que decide se muda em relação à última salva.
  const fotoPerfil: string | null = data?.sender?.profile_picture ?? null;

  if (data?.type === "text" && data?.content?.text) {
    after(() => processarMensagemRecebida(telefone, data.content.text, null, null, fotoPerfil));
    return Response.json({ recebido: true });
  }

  // Áudio (Bloco C/Fase 5, 17/08/2026) — tratado separado dos outros tipos de mídia: transcreve e
  // roda o motor de fluxo em cima do texto, não só registra. Ver processarAudioRecebido.
  const audioUrl: string | undefined = data?.content?.media?.url;
  if (data?.type === "audio" && audioUrl) {
    after(() => processarAudioRecebido(telefone, audioUrl, fotoPerfil));
    return Response.json({ recebido: true });
  }

  // Mídia (foto/vídeo/figurinha) — payload confirmado na doc real da Zapster
  // (developer.zapsterapi.com/pt-BR/v1/webhooks/event-schemas/message, 17/08/2026):
  // data.content.media.url é a URL do arquivo, data.content.text é a legenda (opcional).
  // "document" não aparece no enum de tipos deles — se aparecer no log acima, precisa mapear aqui.
  const TIPOS_MIDIA_SUPORTADOS: Record<string, string> = { image: "imagem", sticker: "imagem", video: "video" };
  const midiaTipo = data?.type ? TIPOS_MIDIA_SUPORTADOS[data.type] : undefined;
  const midiaUrl: string | undefined = data?.content?.media?.url;
  if (midiaTipo && midiaUrl) {
    const legenda: string | null = data.content?.text || null;
    after(() => processarMidiaRecebida(telefone, midiaUrl, midiaTipo, legenda, fotoPerfil));
    return Response.json({ recebido: true });
  }

  return Response.json({ ignorado: true, motivo: `tipo de mensagem "${data?.type}" ainda não tratado` });
}
