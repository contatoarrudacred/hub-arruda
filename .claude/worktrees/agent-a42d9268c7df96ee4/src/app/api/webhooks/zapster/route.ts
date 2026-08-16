import { after } from "next/server";
import { avancarConversa, iniciarFluxo, saudacaoPorHorario } from "@/lib/motor-fluxo/engine";
import {
  criarCalculadoraDadosDerivados,
  criarExtratorAbertura,
  criarResolverMensagensDinamicas,
} from "@/lib/motor-fluxo/fluxo-limpeza-nome";
import {
  carregarOuCriarConversaWhatsapp,
  correlacionarCliqueRastreio,
  extrairCodigoRastreio,
  registrarMensagemLead,
  registrarTurnoMalala,
} from "@/lib/motor-fluxo/persistencia";
import {
  carregarConfigPrecificacao,
  carregarEtapasPorCodigo,
  carregarFaixasPreco,
} from "@/lib/motor-fluxo/repositorio";
import { enviarSequenciaWhatsapp } from "@/lib/whatsapp/enviar";

// Delay/digitando entre mensagens (ver enviarSequenciaWhatsapp) pode somar alguns segundos por
// turno — maxDuration maior evita que a função seja encerrada no meio de uma sequência de envio.
export const maxDuration = 60;

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
    calcularDadosDerivados: criarCalculadoraDadosDerivados(config),
  };
}

async function processarMensagemRecebida(telefone: string, textoRecebido: string): Promise<void> {
  // Código de rastreio (zap.arrudacred.com.br, ver docs/RASTREIO_CLIQUES_WHATSAPP.md) tirado antes
  // de qualquer outra coisa — a Malala/o motor nunca veem "(ref: a1b2c3d4)" como parte da conversa.
  const { texto, codigo: codigoRastreio } = extrairCodigoRastreio(textoRecebido);

  try {
    const { etapasPorCodigo, resolverMensagensDinamicas, calcularDadosDerivados } = await montarDependencias();
    const estado = await carregarOuCriarConversaWhatsapp(telefone, etapasPorCodigo);

    if (codigoRastreio) {
      await correlacionarCliqueRastreio(codigoRastreio, estado.pessoaId);
    }

    if (estado.sobSupervisor) {
      await registrarMensagemLead(estado.conversaId, texto);
      return;
    }

    let resultado;
    let dadosNovos;
    if (estado.etapaAtualCodigo === null) {
      const dadosIniciais = criarExtratorAbertura()(texto);
      // O canal já forneceu o telefone (é de onde a mensagem veio) — não faz sentido perguntar de
      // novo (regra de checkpoint já respondido, engine.ts). Só o canal WhatsApp faz isso; outros
      // canais (widget do site, por exemplo) continuam perguntando normalmente.
      dadosIniciais.telefone = telefone;
      const resultadoPercurso = iniciarFluxo(
        "saudacao_inicial",
        etapasPorCodigo,
        dadosIniciais,
        resolverMensagensDinamicas,
        { saudacao: saudacaoPorHorario() },
      );
      resultado = resultadoPercurso;
      dadosNovos = dadosIniciais;
      await registrarMensagemLead(estado.conversaId, texto);
    } else {
      const etapaAtual = etapasPorCodigo[estado.etapaAtualCodigo];
      await registrarMensagemLead(estado.conversaId, texto);
      resultado = await avancarConversa({
        etapaAtual,
        etapasPorCodigo,
        dados: estado.dados,
        respostaLead: texto,
        resolverMensagensDinamicas,
        calcularDadosDerivados,
        variaveisGlobais: { saudacao: saudacaoPorHorario() },
      });
      dadosNovos = resultado.dadosNovos;
    }

    await registrarTurnoMalala({
      conversaId: estado.conversaId,
      oportunidadeId: estado.oportunidadeId,
      pessoaId: estado.pessoaId,
      dadosNovos,
      resultado,
    });

    await enviarSequenciaWhatsapp(telefone, resultado.mensagens);
  } catch (e) {
    console.error("[webhook zapster] erro ao processar:", e);
  }
}

export async function POST(request: Request) {
  const segredo = process.env.ZAPSTER_WEBHOOK_SECRET;
  const secretDaUrl = new URL(request.url).searchParams.get("secret");
  if (segredo && secretDaUrl !== segredo) {
    return new Response("Não autorizado", { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  console.log("[webhook zapster] payload recebido:", JSON.stringify(payload));

  if (!payload || payload.type !== "message.received") {
    return Response.json({ ignorado: true, motivo: "não é message.received" });
  }

  const data = payload.data;
  if (data?.type !== "text" || !data?.content?.text) {
    return Response.json({ ignorado: true, motivo: `tipo de mensagem "${data?.type}" ainda não tratado` });
  }

  const telefone: string | undefined = data.sender?.phone_number ?? data.recipient?.phone_number;
  const texto: string = data.content.text;
  if (!telefone) {
    return Response.json({ ignorado: true, motivo: "sem phone_number no payload" });
  }

  after(() => processarMensagemRecebida(telefone, texto));

  return Response.json({ recebido: true });
}
