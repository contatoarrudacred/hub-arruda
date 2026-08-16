import { avancarConversa, iniciarFluxo, saudacaoPorHorario } from "@/lib/motor-fluxo/engine";
import {
  criarCalculadoraDadosDerivados,
  criarExtratorAbertura,
  criarResolverMensagensDinamicas,
} from "@/lib/motor-fluxo/fluxo-limpeza-nome";
import {
  carregarOuCriarConversaWhatsapp,
  registrarMensagemLead,
  registrarTurnoMalala,
} from "@/lib/motor-fluxo/persistencia";
import {
  carregarConfigPrecificacao,
  carregarEtapasPorCodigo,
  carregarFaixasPreco,
} from "@/lib/motor-fluxo/repositorio";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp/enviar";

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

  try {
    const { etapasPorCodigo, resolverMensagensDinamicas, calcularDadosDerivados } = await montarDependencias();
    const estado = await carregarOuCriarConversaWhatsapp(telefone, etapasPorCodigo);

    if (estado.sobSupervisor) {
      await registrarMensagemLead(estado.conversaId, texto);
      return Response.json({ processado: true, sobSupervisor: true });
    }

    let resultado;
    let dadosNovos;
    if (estado.etapaAtualCodigo === null) {
      const dadosIniciais = criarExtratorAbertura()(texto);
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

    for (const item of resultado.mensagens) {
      await enviarMensagemWhatsapp(telefone, item.mensagem);
    }

    return Response.json({ processado: true, mensagensEnviadas: resultado.mensagens.length });
  } catch (e) {
    console.error("[webhook zapster] erro ao processar:", e);
    return Response.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
