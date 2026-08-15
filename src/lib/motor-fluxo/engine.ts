// O motor de fluxo — lê o formato genérico de `etapas_fluxo.conteudo` (ConteudoEtapa) e decide o
// próximo passo. Não sabe nada sobre "Limpeza de Nome" nem sobre nenhum produto específico —
// isso é o que permite reaproveitar o mesmo motor para os próximos produtos (PLANO_MESTRE
// seção 8.9). Função pura (exceto o hook opcional de IA, que é assíncrono) — o Supabase entra só
// na camada de repositório.

import { extrairNomeDeResposta } from "./extracao";
import { parseResposta } from "./parser";
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

// Parâmetros do delay automático (Luiz, 15/08/2026) — ainda fixos no código; migram pra
// `configuracoes` (editável pelo admin) quando a tela de Configurações gerais existir (item #9).
const DELAY_AUTOMATICO_BASE_SEGUNDOS = 0.6;
const DELAY_AUTOMATICO_POR_CARACTERE = 0.016;
const DELAY_AUTOMATICO_MIN_SEGUNDOS = 0.8;
const DELAY_AUTOMATICO_MAX_SEGUNDOS = 4.0;
const DELAY_AUTOMATICO_JITTER_SEGUNDOS = 0.5;

/** Extrai um texto legível de qualquer tipo de mensagem — usado só pra retomar a pergunta quando a resposta não é reconhecida (não faz sentido re-perguntar "aqui está uma imagem", precisa de um resumo). */
function textoDeMensagem(msg: MensagemEtapa): string {
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

function mensagemRetomada(conteudo: ConteudoEtapa): MensagemEtapa {
  const ultima = conteudo.mensagens[conteudo.mensagens.length - 1];
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

/** `[Primeiro_Nome]` vem de `dados.nome` (regra de negócio fixa); os demais placeholders (ex.: `[saudacao]`) vêm de `variaveisGlobais`, calculados por quem chama o motor (ex.: hora do dia) — mantém o motor determinístico/testável. */
function substituirVariaveisTexto(
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
    reconhecido = { ...reconhecido, valor: extrairNomeDeResposta(reconhecido.valor) };
  }

  let interpretadoPorIA = false;
  if (!reconhecido && conteudo.interpretacao_ia?.habilitado && interpretarComIA) {
    reconhecido = await interpretarComIA({ etapaAtual, respostaLead, dados });
    interpretadoPorIA = reconhecido !== null;
  }

  if (!reconhecido) {
    const retomada = substituirVariaveisMensagem(mensagemRetomada(conteudo), dados, variaveisGlobais);
    return {
      mensagens: [empacotar(retomada, conteudo)],
      etapaFinal: etapaAtual,
      dadosNovos: {},
      efeitos: [],
      naoReconhecido: true,
      interpretadoPorIA: false,
      kanbanSubetapa: conteudo.kanban_subetapa ?? null,
    };
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

  return {
    mensagens: percurso.mensagens,
    etapaFinal: percurso.etapaFinal,
    dadosNovos,
    efeitos: percurso.efeitos,
    naoReconhecido: false,
    interpretadoPorIA,
    kanbanSubetapa: percurso.kanbanSubetapa,
  };
}

/** Saudação por horário (script pede "bom dia/tarde/noite conforme envio") — função do relógio, por isso fica de fora do motor puro e é injetada via `variaveisGlobais`. */
export function saudacaoPorHorario(agora: Date = new Date()): string {
  const hora = agora.getHours();
  if (hora < 12) return "bom dia";
  if (hora < 18) return "boa tarde";
  return "boa noite";
}

export type { CalcularDadosDerivados };
