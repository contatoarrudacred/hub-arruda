// O motor de fluxo — lê o formato genérico de `etapas_fluxo.conteudo` (ConteudoEtapa) e decide o
// próximo passo. Não sabe nada sobre "Limpeza de Nome" nem sobre nenhum produto específico —
// isso é o que permite reaproveitar o mesmo motor para os próximos produtos (PLANO_MESTRE
// seção 8.9). Função pura (exceto o hook opcional de IA, que é assíncrono) — o Supabase entra só
// na camada de repositório.

import { expandirParcelas } from "./calculo-vencimentos-pagamento";
import { extrairNomeDeResposta } from "./extracao";
import { parseResposta } from "./parser";
import type { ParcelaTier } from "./regras-limpeza-nome";
import type {
  CalcularDadosDerivados,
  ConfigDelay,
  ContextoAvanco,
  ConteudoEtapa,
  DadosConversa,
  EfeitoNegocio,
  EtapaCarregada,
  MensagemEnviada,
  MensagemEtapa,
  Opcao,
  ResolverMensagensDinamicas,
  ResultadoAvanco,
} from "./tipos";

const KANBAN_SUBETAPA_PERDIDA = "perdida";
const KANBAN_SUBETAPA_PADRAO = "novo_lead_triagem";
// Padrão mudou de "nenhum" pra "automatico" em 15/08/2026 (Luiz) — ver calcularDelayAutomatico.
const DELAY_PADRAO: ConfigDelay = { tipo: "automatico" };

// Parâmetros do delay automático (Luiz, 15/08/2026; piso/teto aumentados em 16/08/2026) — ainda
// fixos no código; migram pra `configuracoes` (editável pelo admin) quando a tela de Configurações
// gerais existir (item #9). Piso subiu de 0,8s pra 3s depois de um teste real no WhatsApp (Zapster,
// modo não oficial) mostrar mensagens entregues fora de ordem quando enviadas rápido demais uma
// atrás da outra — a Zapster não garante ordem de entrega nesse modo (ver mensagem de Luiz,
// 16/08/2026). Juntar as mensagens num envio só foi cogitado e descartado: estragaria o ritmo do
// script de vendas (pausas entre balões são intencionais). Delay maior é a mitigação aceita por
// enquanto — resolve por si só quando migrar pro WABA oficial (Fase 7, entrega via infra da Meta).
const DELAY_AUTOMATICO_BASE_SEGUNDOS = 0.6;
const DELAY_AUTOMATICO_POR_CARACTERE = 0.016;
const DELAY_AUTOMATICO_MIN_SEGUNDOS = 3.0;
const DELAY_AUTOMATICO_MAX_SEGUNDOS = 6.0;
const DELAY_AUTOMATICO_JITTER_SEGUNDOS = 0.5;

/** Extrai um texto legível de qualquer tipo de mensagem — usado tanto pra retomar a pergunta quando a resposta não é reconhecida quanto pra dar contexto do checkpoint pra interpretação por IA (interpretacao-ia.ts). */
export function textoDeMensagem(msg: MensagemEtapa): string {
  switch (msg.tipo) {
    case "texto":
      return msg.texto;
    case "imagem":
    case "audio":
    case "video":
    case "documento":
      return msg.legenda ?? "(mídia)";
    case "localizacao":
      return msg.nome ?? "(localização)";
    case "contato":
      return `(contato: ${msg.nome})`;
    case "pix":
      return "(dados de pagamento Pix)";
  }
}

/** `mensagensResolvidas` (saída de resolverMensagensDinamicas) tem prioridade sobre o conteúdo estático da etapa — sem isso, o "não entendi" de um checkpoint com texto dinâmico (ln_passo6, ln_passo12, ln_passo14, ln_passo15_*) repetia o placeholder cru gravado no banco em vez da pergunta de verdade. */
function mensagemRetomada(conteudo: ConteudoEtapa, mensagensResolvidas?: MensagemEtapa[]): MensagemEtapa {
  const lista = mensagensResolvidas ?? conteudo.mensagens;
  const ultima = lista[lista.length - 1];
  const pergunta = textoDeMensagem(ultima);
  return {
    tipo: "texto",
    texto: `Desculpe, não entendi sua resposta — pra eu continuar te ajudando: ${pergunta}`,
  };
}

/**
 * Resolve `{tipo: "automatico"}` num `{tipo: "aleatorio", ...}` concreto, calculado a partir do
 * tamanho da mensagem — objetivo duplo de Luiz (15/08/2026): dar um respiro proporcional ao
 * tamanho do texto pro lead pensar, e nunca repetir o mesmo tempo em conversas diferentes (a
 * margem de jitter por cima garante isso mesmo entre mensagens de tamanho parecido) — sem simular
 * literalmente velocidade de digitação humana, por isso o teto de `DELAY_AUTOMATICO_MAX_SEGUNDOS`.
 */
function calcularDelayAutomatico(mensagem: MensagemEtapa): ConfigDelay {
  const comprimento = textoDeMensagem(mensagem).length;
  const alvo = DELAY_AUTOMATICO_BASE_SEGUNDOS + comprimento * DELAY_AUTOMATICO_POR_CARACTERE;
  // deixa espaço pro jitter não estourar o teto absoluto
  const alvoComEspacoPraJitter = Math.min(
    alvo,
    DELAY_AUTOMATICO_MAX_SEGUNDOS - DELAY_AUTOMATICO_JITTER_SEGUNDOS,
  );
  const min = Math.max(
    DELAY_AUTOMATICO_MIN_SEGUNDOS,
    alvoComEspacoPraJitter - DELAY_AUTOMATICO_JITTER_SEGUNDOS,
  );
  const max = Math.min(
    DELAY_AUTOMATICO_MAX_SEGUNDOS,
    alvoComEspacoPraJitter + DELAY_AUTOMATICO_JITTER_SEGUNDOS,
  );
  return {
    tipo: "aleatorio",
    min_segundos: Math.round(min * 10) / 10,
    max_segundos: Math.round(max * 10) / 10,
  };
}

function resolverDelay(configDelay: ConfigDelay | undefined, mensagem: MensagemEtapa): ConfigDelay {
  const efetivo = configDelay ?? DELAY_PADRAO;
  return efetivo.tipo === "automatico" ? calcularDelayAutomatico(mensagem) : efetivo;
}

/** Empacota uma mensagem com o digitando/delay da etapa de onde ela veio (default: digitando=true, delay automático por tamanho). */
function empacotar(mensagem: MensagemEtapa, conteudo: ConteudoEtapa): MensagemEnviada {
  return {
    mensagem,
    digitando: conteudo.digitando ?? true,
    delay: resolverDelay(conteudo.delay, mensagem),
  };
}

/** `[Primeiro_Nome]` vem de `dados.nome` (regra de negócio fixa); os demais placeholders (ex.: `[saudacao]`) vêm de `variaveisGlobais`, calculados por quem chama o motor (ex.: hora do dia) — mantém o motor determinístico/testável. Exportada porque o motor de disparo de follow-up (persistencia.ts) reaproveita — o conteúdo dos itens da agenda usa o mesmo placeholder `[Primeiro_Nome]`. */
export function substituirVariaveisTexto(
  texto: string,
  dados: DadosConversa,
  variaveisGlobais: Record<string, string>,
): string {
  const primeiroNome = dados.nome?.trim().split(/\s+/)[0] ?? "";
  let resultado = texto.replaceAll("[Primeiro_Nome]", primeiroNome);
  for (const [chave, valor] of Object.entries(variaveisGlobais)) {
    resultado = resultado.replaceAll(`[${chave}]`, valor);
  }
  return resultado;
}

/** Aplica a substituição de variáveis só nos campos de texto de cada tipo de mensagem (texto e legenda de mídia) — os demais campos (URL, coordenadas, chave pix...) não têm variável. */
function substituirVariaveisMensagem(
  msg: MensagemEtapa,
  dados: DadosConversa,
  variaveisGlobais: Record<string, string>,
): MensagemEtapa {
  if (msg.tipo === "texto") {
    return { ...msg, texto: substituirVariaveisTexto(msg.texto, dados, variaveisGlobais) };
  }
  if ("legenda" in msg && msg.legenda) {
    return { ...msg, legenda: substituirVariaveisTexto(msg.legenda, dados, variaveisGlobais) };
  }
  return msg;
}

/** Próxima etapa "linear" de uma etapa que não está ramificando por opção nem por texto — pode ser fixa ou decidida por um campo já acumulado em `dados` (etapas "roteador"). */
function resolverProximoLinear(conteudo: ConteudoEtapa, dados: DadosConversa): string | undefined {
  if (conteudo.proximo_por_dado) {
    const { campo, se_igual, entao, senao } = conteudo.proximo_por_dado;
    return dados[campo] === se_igual ? entao : senao;
  }
  return conteudo.proximo_codigo;
}

/**
 * Regra de checkpoint já respondido (SCRIPT_LIMPANOME_SERASA_SPC.md, premissas gerais): se o dado
 * que esta etapa perguntaria já está em `dados` — porque o lead se antecipou na abertura, ou porque
 * o canal já forneceu (ex.: telefone no WhatsApp) — a pergunta não é enviada, o motor resolve como
 * se a resposta já tivesse chegado e segue direto. Só cobre etapas com `opcoes` ou `proximo_codigo`
 * linear: com `proximo_condicional` não dá pra saber com segurança qual ramo tomar sem o texto
 * original da resposta, então essas continuam perguntando normalmente mesmo com o dado já salvo.
 */
function proximoSeJaConhecido(etapa: EtapaCarregada, dados: DadosConversa): string | undefined {
  if (!etapa.campoSalvo || !etapa.conteudo.aguarda_resposta) return undefined;
  const valorConhecido = dados[etapa.campoSalvo];
  if (!valorConhecido) return undefined;
  if (etapa.conteudo.proximo_condicional) return undefined;

  const opcaoConhecida = etapa.conteudo.opcoes?.find((o) => o.valor === valorConhecido);
  if (etapa.conteudo.opcoes && !opcaoConhecida) return undefined; // valor não bate com nenhuma opção conhecida — pergunta por segurança
  return opcaoConhecida?.proximo_codigo ?? resolverProximoLinear(etapa.conteudo, dados);
}

type ResultadoPercurso = {
  mensagens: MensagemEnviada[];
  etapaFinal: EtapaCarregada | null;
  efeitos: EfeitoNegocio[];
  kanbanSubetapa: string | null;
};

/**
 * Anda pelas etapas a partir de `codigoInicial` enquanto elas não esperam resposta (as mensagens
 * "em sequência, sem esperar resposta" do script viram vários registros com aguarda_resposta=false
 * encadeados, incluindo "roteadores" sem mensagem própria que só decidem por onde seguir). Para
 * quando encontra uma etapa que espera resposta, ou quando o fluxo acaba.
 */
function percorrerAPartirDe(
  codigoInicial: string,
  etapasPorCodigo: Record<string, EtapaCarregada>,
  dados: DadosConversa,
  resolverMensagensDinamicas?: ResolverMensagensDinamicas,
  variaveisGlobais: Record<string, string> = {},
): ResultadoPercurso {
  const mensagens: MensagemEnviada[] = [];
  const efeitos: EfeitoNegocio[] = [];
  let codigoAtual: string | undefined = codigoInicial;

  while (codigoAtual) {
    const etapa = etapasPorCodigo[codigoAtual];
    if (!etapa) {
      throw new Error(
        `Etapa de código "${codigoAtual}" não encontrada no fluxo — verifique o editor de fluxo.`,
      );
    }

    const pulaPorJaConhecido = proximoSeJaConhecido(etapa, dados);
    if (pulaPorJaConhecido) {
      codigoAtual = pulaPorJaConhecido;
      continue;
    }

    const dinamicas = resolverMensagensDinamicas?.(etapa.conteudo.codigo, dados);
    for (const mensagem of dinamicas ?? etapa.conteudo.mensagens) {
      const substituida = substituirVariaveisMensagem(mensagem, dados, variaveisGlobais);
      mensagens.push(empacotar(substituida, etapa.conteudo));
    }

    if (etapa.conteudo.aguarda_resposta) {
      return {
        mensagens,
        etapaFinal: etapa,
        efeitos,
        kanbanSubetapa: etapa.conteudo.kanban_subetapa ?? null,
      };
    }

    const proximo = resolverProximoLinear(etapa.conteudo, dados);
    if (!proximo) {
      efeitos.push({
        tipo: "encerrar_fluxo_automatizado",
        etapaKanban: etapa.conteudo.kanban_subetapa ?? KANBAN_SUBETAPA_PADRAO,
        sobSupervisor: etapa.conteudo.encerramento?.sob_supervisor ?? false,
      });
      return {
        mensagens,
        etapaFinal: null,
        efeitos,
        kanbanSubetapa: etapa.conteudo.kanban_subetapa ?? null,
      };
    }
    codigoAtual = proximo;
  }

  return { mensagens, etapaFinal: null, efeitos, kanbanSubetapa: null };
}

/** Ponto de entrada de um fluxo (primeira mensagem da conversa, ou troca de fluxo após a triagem). */
export function iniciarFluxo(
  codigoInicial: string,
  etapasPorCodigo: Record<string, EtapaCarregada>,
  dados: DadosConversa = {},
  resolverMensagensDinamicas?: ResolverMensagensDinamicas,
  variaveisGlobais: Record<string, string> = {},
): ResultadoPercurso {
  return percorrerAPartirDe(
    codigoInicial,
    etapasPorCodigo,
    dados,
    resolverMensagensDinamicas,
    variaveisGlobais,
  );
}

/** Processa a resposta do lead à etapa em que a conversa está parada e decide o que vem a seguir. Assíncrona só por causa do encaixe opcional de interpretação por IA (interpretarComIA). */
export async function avancarConversa(contexto: ContextoAvanco): Promise<ResultadoAvanco> {
  const {
    etapaAtual,
    etapasPorCodigo,
    dados,
    respostaLead,
    resolverMensagensDinamicas,
    calcularDadosDerivados,
    interpretarComIA,
    interpretarListaDocumentos,
    variaveisGlobais = {},
  } = contexto;
  const conteudo = etapaAtual.conteudo;

  const parse = parseResposta(conteudo, respostaLead);

  let reconhecido: { valor: string; opcaoEscolhida?: Opcao } | null = parse.reconhecido
    ? { valor: parse.valor, opcaoEscolhida: parse.opcaoEscolhida }
    : null;

  // "nome" é regra de negócio fixa do motor (mesma exceção já registrada em substituirVariaveisTexto,
  // pro [Primeiro_Nome]) — sem isto, uma resposta tipo "sou Luiz, boa tarde!" vira o nome inteiro
  // "sou Luiz, boa tarde!", e o [Primeiro_Nome] usa só a primeira palavra bruta ("sou").
  if (reconhecido && etapaAtual.campoSalvo === "nome" && conteudo.tipo_resposta === "texto_livre") {
    const nomeExtraido = extrairNomeDeResposta(reconhecido.valor);
    reconhecido = nomeExtraido ? { ...reconhecido, valor: nomeExtraido } : null;
  }

  let interpretadoPorIA = false;

  // "lista_documentos" tem 3 saídas (completo/incompleto/não-entendi), diferente do encaixe binário
  // genérico logo abaixo — precisa de tratamento próprio, inclusive uma mensagem de retomada
  // customizada (pergunta de esclarecimento da IA) quando "incompleto" (suporte a "pacote", Bloco C).
  if (!reconhecido && conteudo.tipo_resposta === "lista_documentos" && interpretarListaDocumentos) {
    const resultado = await interpretarListaDocumentos({ etapaAtual, respostaLead, dados });
    interpretadoPorIA = true;

    if (resultado.status === "completo") {
      reconhecido = { valor: resultado.itens.map((item) => item.tipo).join(",") };
    } else if (resultado.status === "incompleto") {
      const retomada: MensagemEtapa = { tipo: "texto", texto: resultado.perguntaEsclarecimento };
      return {
        mensagens: [empacotar(substituirVariaveisMensagem(retomada, dados, variaveisGlobais), conteudo)],
        etapaFinal: etapaAtual,
        dadosNovos: resultado.dadosParciais ?? {},
        efeitos: [],
        naoReconhecido: true,
        interpretadoPorIA: true,
        kanbanSubetapa: conteudo.kanban_subetapa ?? null,
      };
    }
    // "nao_entendi" deixa `reconhecido` null — cai no bloco genérico abaixo (repete a pergunta original).
  }

  // "faixas_documentos" — menu fechado com confirmação (correção 18/08/2026, Luiz: mesma faixa
  // assumida pra TODOS os documentos, uma pergunta só). "incompleto" carrega `dadosParciais`
  // (índice da faixa escolhida aguardando confirmação, ou sinal de que caiu no modo livre por
  // documento) — precisa ir pra `dadosNovos` mesmo sem avançar de checkpoint, senão o interpretador
  // não teria como saber em que rodada está no próximo turno (mesmo problema/solução de
  // negociacao_pagamento, já que o interpretador só recebe `dados`, sem histórico de turnos).
  if (!reconhecido && conteudo.tipo_resposta === "faixas_documentos" && contexto.interpretarFaixasDocumentos) {
    const resultado = await contexto.interpretarFaixasDocumentos({ etapaAtual, respostaLead, dados });
    interpretadoPorIA = true;

    if (resultado.status === "completo") {
      reconhecido = {
        valor: resultado.itens.map((item) => (item.valorAproximado === null ? "nao_sei" : String(item.valorAproximado))).join(","),
      };
    } else if (resultado.status === "incompleto") {
      const retomada: MensagemEtapa = { tipo: "texto", texto: resultado.perguntaEsclarecimento };
      return {
        mensagens: [empacotar(substituirVariaveisMensagem(retomada, dados, variaveisGlobais), conteudo)],
        etapaFinal: etapaAtual,
        dadosNovos: resultado.dadosParciais ?? {},
        efeitos: [],
        naoReconhecido: true,
        interpretadoPorIA: true,
        kanbanSubetapa: conteudo.kanban_subetapa ?? null,
      };
    } else if (resultado.status === "escalar_consulta_paga") {
      // Lead pediu a consulta oficial paga (R$39/documento) em vez de seguir por estimativa — sai
      // do automatizado e escala pro humano (sem dizer isso ao lead, como pedido por Luiz).
      const mensagem: MensagemEtapa = { tipo: "texto", texto: resultado.mensagem };
      return {
        mensagens: [empacotar(substituirVariaveisMensagem(mensagem, dados, variaveisGlobais), conteudo)],
        etapaFinal: null,
        dadosNovos: {},
        efeitos: [{ tipo: "escalar_supervisor", motivo: "Lead pediu a consulta oficial paga (R$39/documento) em vez de estimativa por faixa" }],
        naoReconhecido: false,
        interpretadoPorIA: true,
        kanbanSubetapa: conteudo.kanban_subetapa ?? null,
      };
    } else if (resultado.status === "acima_do_corte") {
      // Lead escolheu a opção virtual "Acima de X mil" (spec 2026-08-20-agendamento-consultor-alto-valor.md)
      // — pula o resto da coleta de faixas do pacote (não tem preço fixo pra somar com o que falta)
      // e vai direto pro fluxo de agendamento com consultor, marcando `alto_valor=sim` (mesmo campo
      // que o gatilho normal usa, então o motivo mostrado pro lead fica correto). Reaproveita
      // `percorrerAPartirDe` em vez de montar a mensagem na mão, pra herdar toda a lógica de mensagem
      // dinâmica/kanban/efeitos que um checkpoint normal já tem.
      const dadosComAltoValor: DadosConversa = { ...dados, alto_valor: "sim" };
      const derivadosAltoValor = calcularDadosDerivados?.(dadosComAltoValor) ?? {};
      const dadosNovosAcimaDoCorte: DadosConversa = { alto_valor: "sim", ...derivadosAltoValor };
      const dadosParaPercurso = { ...dados, ...dadosNovosAcimaDoCorte };
      const percurso = percorrerAPartirDe(
        "ln_agendamento_oferta",
        etapasPorCodigo,
        dadosParaPercurso,
        resolverMensagensDinamicas,
        variaveisGlobais,
      );
      return {
        mensagens: percurso.mensagens,
        etapaFinal: percurso.etapaFinal,
        dadosNovos: dadosNovosAcimaDoCorte,
        efeitos: percurso.efeitos,
        naoReconhecido: false,
        interpretadoPorIA: true,
        kanbanSubetapa: percurso.kanbanSubetapa,
      };
    }
    // "nao_entendi" deixa `reconhecido` null — cai no bloco genérico abaixo (repete a pergunta original).
  }

  // "negociacao_pagamento" — confirmação/negociação natural do detalhe de pagamento no fechamento
  // (spec: docs/superpowers/specs/2026-08-18-captura-detalhe-pagamento-fechamento-design.md). Ao
  // contrário de lista_documentos/faixas_documentos, "ajuste_valido" PERSISTE o ajuste (dadosNovos
  // não fica vazio) mesmo permanecendo no checkpoint — é assim que a negociação lembra o que já foi
  // combinado na próxima rodada, já que o interpretador só recebe `dados` (sem histórico de turnos).
  if (!reconhecido && conteudo.tipo_resposta === "negociacao_pagamento" && contexto.interpretarNegociacaoPagamento) {
    const resultado = await contexto.interpretarNegociacaoPagamento({ etapaAtual, respostaLead, dados });
    interpretadoPorIA = true;

    if (resultado.status === "confirmado") {
      const composto = [
        dados.forma_pagamento_detalhe ?? "boleto_pix",
        dados.data_primeira_parcela ?? "",
        dados.dia_ancora_parcelas ?? "",
        dados.parcelas_valores ?? "",
        dados.parcelas_vencimentos ?? "",
      ].join("|");
      reconhecido = { valor: composto };
      // cai pro bloco genérico abaixo, que grava em campoSalvo e segue pro próximo código
    } else if (resultado.status === "ajuste_valido") {
      const tiers: ParcelaTier[] = (dados.parcelas_valores ?? "")
        .split(",")
        .filter(Boolean)
        .map((valor) => ({ quantidade: 1, valor: Number(valor) }));
      const diaAncora = resultado.diaAncora ?? 10;
      const parcelasRecalculadas = tiers.length > 0 ? expandirParcelas(tiers, resultado.dataPrimeiraParcela, diaAncora) : [];

      const dadosAjustados: DadosConversa = {
        forma_pagamento_detalhe: resultado.formaPagamento,
        data_primeira_parcela: resultado.dataPrimeiraParcela,
        parcelas_vencimentos: parcelasRecalculadas.map((p) => p.vencimento).join(","),
      };
      if (resultado.diaAncora !== null) dadosAjustados.dia_ancora_parcelas = String(resultado.diaAncora);

      const retomada: MensagemEtapa = { tipo: "texto", texto: resultado.mensagemConfirmando };
      return {
        mensagens: [empacotar(substituirVariaveisMensagem(retomada, dados, variaveisGlobais), conteudo)],
        etapaFinal: etapaAtual,
        dadosNovos: dadosAjustados,
        efeitos: [],
        naoReconhecido: true,
        interpretadoPorIA: true,
        kanbanSubetapa: conteudo.kanban_subetapa ?? null,
      };
    } else {
      const retomada: MensagemEtapa = { tipo: "texto", texto: resultado.mensagemNegociacao };
      return {
        mensagens: [empacotar(substituirVariaveisMensagem(retomada, dados, variaveisGlobais), conteudo)],
        etapaFinal: etapaAtual,
        dadosNovos: {},
        efeitos: [],
        naoReconhecido: true,
        interpretadoPorIA: true,
        kanbanSubetapa: conteudo.kanban_subetapa ?? null,
      };
    }
  }

  if (!reconhecido && conteudo.interpretacao_ia?.habilitado && interpretarComIA) {
    reconhecido = await interpretarComIA({ etapaAtual, respostaLead, dados });
    interpretadoPorIA = reconhecido !== null;
  }

  if (!reconhecido) {
    // Checkpoint "opcional" (opcional_apos_tentativas, PLANO_MESTRE seção 8.12) — depois de N
    // tentativas seguidas sem reconhecer a resposta, desiste em vez de travar o funil indefinidamente.
    // O contador vive em `dados` (chave reservada, prefixo "_" — não colide com campo de negócio
    // nenhum), incrementado a cada tentativa e nunca lido de novo depois que a etapa avança.
    const chaveTentativas = `_tentativas:${conteudo.codigo}`;
    const tentativas = Number(dados[chaveTentativas] ?? "0") + 1;
    const desiste = conteudo.opcional_apos_tentativas != null && tentativas >= conteudo.opcional_apos_tentativas;

    if (!desiste) {
      // Passa o contador já incrementado pro resolver dinâmico — sem isso, a 1ª retomada via
      // resolverMensagensDinamicas via `dados` idêntico ao da entrada nova no checkpoint (o
      // contador só é persistido em `dadosNovos` no final deste bloco), impossibilitando um
      // checkpoint distinguir "primeira pergunta" de "retomada" (achado real, 18/08/2026 —
      // abertura_email mostrava a justificativa do e-mail junto da pergunta, na 1ª vez).
      const dadosComTentativas = { ...dados, [chaveTentativas]: String(tentativas) };
      const dinamicas = resolverMensagensDinamicas?.(conteudo.codigo, dadosComTentativas) ?? undefined;
      const retomada = substituirVariaveisMensagem(
        mensagemRetomada(conteudo, dinamicas ?? undefined),
        dados,
        variaveisGlobais,
      );
      return {
        mensagens: [empacotar(retomada, conteudo)],
        etapaFinal: etapaAtual,
        dadosNovos: { [chaveTentativas]: String(tentativas) },
        efeitos: [],
        naoReconhecido: true,
        interpretadoPorIA,
        kanbanSubetapa: conteudo.kanban_subetapa ?? null,
      };
    }

    // Desistiu — segue o resto do turno exatamente como se o lead tivesse respondido de verdade,
    // só que com valor vazio (nenhuma opção escolhida, então nem `proximo_condicional` nem
    // `opcoes` são afetados; checkpoints assim usam `proximo_codigo` linear).
    reconhecido = { valor: "" };
  }

  const dadosNovosBrutos: DadosConversa = etapaAtual.campoSalvo
    ? { [etapaAtual.campoSalvo]: reconhecido.valor }
    : {};

  if (reconhecido.opcaoEscolhida?.encerra_com_perda) {
    return {
      mensagens: [],
      etapaFinal: null,
      dadosNovos: dadosNovosBrutos,
      efeitos: [
        {
          tipo: "marcar_perdida",
          motivo: reconhecido.opcaoEscolhida.motivo_perda ?? "LEAD DESISTIU",
        },
      ],
      naoReconhecido: false,
      interpretadoPorIA,
      kanbanSubetapa: KANBAN_SUBETAPA_PERDIDA,
    };
  }

  const dadosAcumulados = { ...dados, ...dadosNovosBrutos };
  const derivados = calcularDadosDerivados?.(dadosAcumulados) ?? {};
  const dadosCompletos = { ...dadosAcumulados, ...derivados };
  const dadosNovos = { ...dadosNovosBrutos, ...derivados };

  let proximoCodigo: string | undefined;
  if (reconhecido.opcaoEscolhida?.proximo_codigo) {
    proximoCodigo = reconhecido.opcaoEscolhida.proximo_codigo;
  } else if (conteudo.proximo_condicional) {
    const normalizado = respostaLead.toLowerCase();
    const bateu = conteudo.proximo_condicional.contem_qualquer.some((termo) =>
      normalizado.includes(termo.toLowerCase()),
    );
    proximoCodigo = bateu
      ? conteudo.proximo_condicional.se_sim
      : conteudo.proximo_condicional.se_nao;
  } else {
    proximoCodigo = resolverProximoLinear(conteudo, dadosCompletos);
  }

  if (!proximoCodigo) {
    return {
      mensagens: [],
      etapaFinal: null,
      dadosNovos,
      efeitos: [
        {
          tipo: "encerrar_fluxo_automatizado",
          etapaKanban: conteudo.kanban_subetapa ?? KANBAN_SUBETAPA_PADRAO,
          sobSupervisor: conteudo.encerramento?.sob_supervisor ?? false,
        },
      ],
      naoReconhecido: false,
      interpretadoPorIA,
      kanbanSubetapa: conteudo.kanban_subetapa ?? null,
    };
  }

  const percurso = percorrerAPartirDe(
    proximoCodigo,
    etapasPorCodigo,
    dadosCompletos,
    resolverMensagensDinamicas,
    variaveisGlobais,
  );

  // Lead escolheu um dos 2 horários oferecidos (ln_agendamento_horario, spec
  // 2026-08-20-agendamento-consultor-alto-valor.md) — o horário em si já foi calculado antes
  // (criarCalculadoraDadosDerivados) e viaja em `dados._agendamento_opcao_N_inicio/_fim`; aqui só
  // decide qual das 2 opções foi escolhida e dispara o efeito que grava/notifica de verdade.
  const efeitosExtras: EfeitoNegocio[] = [];
  if (etapaAtual.campoSalvo === "horario_agendamento_escolhido") {
    const escolha = reconhecido.valor === "2" ? "2" : "1";
    const inicio = dadosCompletos[`_agendamento_opcao_${escolha}_inicio`];
    const fim = dadosCompletos[`_agendamento_opcao_${escolha}_fim`];
    if (inicio && fim) {
      const motivo = dadosCompletos.alto_valor === "sim" ? "divida_alta" : "pacote_caro";
      efeitosExtras.push({ tipo: "agendar_consultor", inicio, fim, motivo });
    }
  }

  return {
    mensagens: percurso.mensagens,
    etapaFinal: percurso.etapaFinal,
    dadosNovos,
    efeitos: [...percurso.efeitos, ...efeitosExtras],
    naoReconhecido: false,
    interpretadoPorIA,
    kanbanSubetapa: percurso.kanbanSubetapa,
  };
}

/**
 * Saudação por horário (script pede "bom dia/tarde/noite conforme envio") — função do relógio, por isso fica de fora do motor puro e é injetada via `variaveisGlobais`.
 *
 * Usa o fuso de São Paulo explicitamente (mesmo padrão de `dentroJanelaComercial` em
 * motor-followup.ts) — `agora.getHours()` lia o fuso do processo, que em produção na Vercel é UTC,
 * então a saudação batia errado boa parte do dia (ex.: meio-dia em SP = 15h UTC = "boa noite").
 */
export function saudacaoPorHorario(agora: Date = new Date()): string {
  const hora = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hourCycle: "h23",
    }).format(agora),
  );
  if (hora < 12) return "bom dia";
  if (hora < 18) return "boa tarde";
  return "boa noite";
}

export type { CalcularDadosDerivados };
