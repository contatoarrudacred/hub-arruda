// Tipos do motor de fluxo — a peça que interpreta a tabela `etapas_fluxo` (o "editor de fluxo"
// exigido no PLANO_MESTRE seção 8.9) e decide o que fazer a cada resposta do lead.
//
// Cada linha de `etapas_fluxo` guarda seu conteúdo em `conteudo` (jsonb) no formato `ConteudoEtapa`
// abaixo. Isso é o que permite ao admin editar o script sem depender de código/deploy: o motor não
// tem passo nenhum do script "hardcoded" — ele só sabe interpretar este formato genérico.

export type TipoResposta =
  | "menu" // resposta esperada é um número de opção (ou o rótulo de uma opção)
  | "sim_nao"
  | "texto_livre"
  | "email"
  | "numero_ou_nao_sei" // valor livre (ex.: "10 mil") ou "não sei"
  /**
   * Resposta livre descrevendo quantos documentos (CPF/CNPJ) o lead quer limpar — suporte a
   * "pacote" (Bloco C, PLANO_MESTRE seção 11). O parser determinístico nunca reconhece isto (não
   * dá pra regex "2 CPF e 1 CNPJ da empresa" com confiança) — cai sempre pro interpretador
   * especializado (`interpretarListaDocumentos` em ContextoAvanco), que é diferente do
   * `interpretarComIA` genérico porque tem uma 3ª saída: "entendi parte, falta isto aqui" (pede
   * esclarecimento específico em vez de só repetir a pergunta original).
   */
  | "lista_documentos"
  /**
   * Resposta livre com a faixa de restrição de CADA documento já sabido (`dados.documentos_tipos`)
   * de uma vez só — decisão de Luiz (17/08/2026): perguntar tudo numa mensagem só (explicando o
   * porquê) em vez de repetir a mesma pergunta uma vez por documento, pra não gerar fricção/evasão.
   * Aceita "não sei" por documento (a Malala pode oferecer consulta paga nos 4 órgãos, R$39/doc,
   * mencionando a alternativa gratuita pelos apps oficiais). Só dá checkpoint como reconhecido
   * quando tiver uma faixa (ou "não sei") pra TODOS os documentos da lista — mesma filosofia de
   * "lista_documentos" (3 saídas, nunca reconhecido pelo parser determinístico).
   */
  | "faixas_documentos"
  /**
   * Negociação natural do detalhe de pagamento no fechamento (forma, data da 1ª parcela,
   * dia-âncora das seguintes) — spec: docs/superpowers/specs/2026-08-18-captura-detalhe-pagamento-fechamento-design.md.
   * Mesma filosofia de interpretador especializado de lista_documentos/faixas_documentos, mas com
   * 3 saídas diferentes (`ResultadoNegociacaoPagamento`): confirmado / ajuste válido / precisa
   * negociar — nunca binário reconhecido/não-reconhecido.
   */
  | "negociacao_pagamento";

export type Opcao = {
  /** valor persistido em `dados[campo_salvo]` quando esta opção é escolhida */
  valor: string;
  /** formas que o parser determinístico aceita como "o lead escolheu esta opção" */
  rotulos: string[];
  /** próxima etapa (por código) — omitido quando `encerra_com_perda` é true */
  proximo_codigo?: string;
  encerra_com_perda?: boolean;
  motivo_perda?: string;
};

export type ProximoCondicional = {
  /** decide a próxima etapa checando se a resposta em texto livre contém algum destes termos */
  contem_qualquer: string[];
  se_sim: string;
  se_nao: string;
};

export type ProximoPorDado = {
  /** decide a próxima etapa checando um campo já acumulado em `dados` (não a resposta desta etapa) — usado por etapas "roteador" sem mensagem própria, ex.: bifurcar por alto_valor depois de calculado */
  campo: string;
  se_igual: string;
  entao: string;
  senao: string;
};

export type Encerramento = {
  /** true = a partir daqui alguém da equipe assume manualmente (a etapa continua sendo "a subetapa do Kanban" que essa etapa já declara em `kanban_subetapa` — não duplica o dado aqui) */
  sob_supervisor?: boolean;
};

// ---------------------------------------------------------------------------
// Mensagens — formato canal-agnóstico. O motor e o editor só conhecem este
// formato interno; é a Camada de Adaptadores de Canal (MODELAGEM_DADOS_ARRUDACRED.md)
// que traduz cada tipo pro formato nativo de cada canal (WhatsApp, Instagram, Telegram,
// Messenger, widget do site) — nem todo canal suporta todo tipo, o adaptador decide como
// degradar (ex.: localização vira link do Google Maps em texto num canal sem suporte nativo).
// ---------------------------------------------------------------------------

export type MensagemEtapa =
  | { tipo: "texto"; texto: string }
  | { tipo: "imagem" | "audio" | "video" | "documento"; midia_url: string; legenda?: string }
  | { tipo: "localizacao"; latitude: number; longitude: number; nome?: string; endereco?: string }
  | { tipo: "contato"; nome: string; telefone: string }
  | {
      tipo: "pix";
      chave: string;
      tipo_chave: "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";
      nome_beneficiario?: string;
    };

/** Nenhuma config granular por mensagem individual (mantém a edição simples) — digitando/delay são por etapa, ver ConteudoEtapa. */
export type ConfigDelay =
  | { tipo: "nenhum" }
  | { tipo: "fixo"; segundos: number }
  | { tipo: "aleatorio"; min_segundos: number; max_segundos: number }
  /**
   * Delay calculado a partir do tamanho de cada mensagem, não um valor fixo salvo aqui — o motor
   * resolve isto em `{tipo: "aleatorio", ...}` na hora de montar cada mensagem (ver
   * `calcularDelayAutomatico` em engine.ts). Virou o padrão em 15/08/2026 (Luiz): dá um respiro
   * proporcional ao tamanho do texto pro lead pensar, e a margem aleatória evita tempo idêntico
   * em conversas diferentes — sem simular velocidade real de digitação (ficaria devagar demais).
   */
  | { tipo: "automatico" };

/**
 * Toggle por checkpoint pra cair em interpretação por IA quando o parser determinístico não
 * reconhece a resposta (PLANO_MESTRE seção 2.1 — parser primeiro, IA só quando necessário).
 * `instrucao` é o que o admin escreve pra orientar a IA nesse checkpoint específico (ex.: "extraia
 * o valor aproximado mesmo que o lead escreva por extenso ou de forma vaga").
 * A chamada de IA de fato (Fase 5) ainda não existe — isto só declara a intenção; o motor já tem
 * o encaixe (`interpretarComIA` em ContextoAvanco) pronto pra quando ela for ligada.
 */
export type ConfigInterpretacaoIA = {
  habilitado: boolean;
  instrucao?: string;
};

export type ConteudoEtapa = {
  /** código estável da etapa dentro do fluxo — usado para navegação (branches), não é o `id` da linha */
  codigo: string;
  /** uma ou mais mensagens enviadas em sequência (│ no script original) */
  mensagens: MensagemEtapa[];
  /** true = motor pausa aqui até o lead responder; false = já emenda na próxima etapa no mesmo turno */
  aguarda_resposta: boolean;
  tipo_resposta?: TipoResposta;
  opcoes?: Opcao[];
  /** próxima etapa quando não há ramificação por opção (fluxo linear) */
  proximo_codigo?: string;
  proximo_condicional?: ProximoCondicional;
  proximo_por_dado?: ProximoPorDado;
  /** validação extra além do tipo_resposta (hoje só "email" é usado) */
  validacao?: "email";
  /** só relevante quando a etapa é terminal (sem próximo código nenhum) */
  encerramento?: Encerramento;
  /** mostra "digitando..." antes de enviar — default true quando omitido */
  digitando?: boolean;
  /** default {tipo:"nenhum"} quando omitido */
  delay?: ConfigDelay;
  /**
   * Subetapa do Kanban a que esta etapa pertence — mesmo vocabulário de slug usado em
   * `oportunidades.etapa_kanban` (ex.: "novo_lead_triagem", "qualificacao", "faixa_divida",
   * "envio_proposta", "negociacao_duvidas", "dados_contrato", "assinatura_digital", "pagamento",
   * "ganha", "perdida" — ver KANBAN_COMERCIAL_LIMPANOME.md). Toda etapa carrega a sua (não só as
   * terminais): o editor visual pré-preenche herdando da etapa anterior, mas o valor fica salvo
   * explicitamente em cada uma, então mover o card no Kanban conforme a conversa avança não
   * depende de lógica escondida em código — só de ler este campo.
   */
  kanban_subetapa?: string;
  interpretacao_ia?: ConfigInterpretacaoIA;
  /**
   * Checkpoint "opcional": depois de N tentativas seguidas sem reconhecer a resposta do lead
   * (recusa, ignora, insiste que não tem), a etapa desiste e segue em frente como se tivesse sido
   * respondida com valor vazio — nunca fica travando o funil esperando indefinidamente. Genérico,
   * reaproveitável por qualquer checkpoint que precise da mesma regra (não é exclusivo de nenhum
   * campo específico) — primeiro uso: `abertura_email`, PLANO_MESTRE seção 8.12. Omitido = nunca
   * desiste, comportamento de sempre (repete a pergunta indefinidamente).
   */
  opcional_apos_tentativas?: number;
};

export type DadosConversa = Record<string, string>;

export type EtapaCarregada = {
  id: string;
  fluxoId: string;
  ordem: number;
  campoSalvo: string | null;
  /** null = usa a agenda padrão do sistema (agendas_followup.nome = "Padrão") */
  agendaFollowupId: string | null;
  conteudo: ConteudoEtapa;
};

/**
 * Hook pra conteúdo gerado dinamicamente (hoje só o Passo 15 da Limpeza de Nome — a proposta
 * varia por faixa/alto-valor/voucher). Mantém o motor genérico: regras de produto ficam fora dele
 * (ver regras-limpeza-nome.ts), o motor só sabe "se tiver resolver pra este código, use-o".
 */
export type ResolverMensagensDinamicas = (
  codigo: string,
  dados: DadosConversa,
) => MensagemEtapa[] | null;

/**
 * Hook pra campos derivados de regra de produto (hoje só `alto_valor` e `valor_restricao_estimado`
 * da Limpeza de Nome — ver regras-limpeza-nome.ts). Roda a cada turno sobre os dados acumulados;
 * o resultado é mesclado em `dados` antes de resolver `proximo_por_dado` e é persistido junto com
 * `dadosNovos` pra não precisar recalcular do zero no próximo turno.
 */
export type CalcularDadosDerivados = (dados: DadosConversa) => DadosConversa;

/**
 * Encaixe pra interpretação por IA (Fase 5 liga a implementação real) — só é chamado quando o
 * parser determinístico não reconhece a resposta E a etapa tem `interpretacao_ia.habilitado`.
 * Retorna o mesmo formato de "resposta reconhecida" que o parser usaria, pra reaproveitar toda a
 * lógica de ramificação já existente (encerra_com_perda, opcao.proximo_codigo etc.) — ou `null` se
 * nem a IA conseguiu entender (aí sim o motor repete a pergunta).
 */
export type InterpretadorIA = (params: {
  etapaAtual: EtapaCarregada;
  respostaLead: string;
  dados: DadosConversa;
}) => Promise<{ valor: string; opcaoEscolhida?: Opcao } | null>;

/** Um documento (CPF ou CNPJ) que o lead quer limpar, dentro de um pacote com mais de um item. */
export type ItemDocumentoPendente = { tipo: "cpf" | "cnpj" };

/**
 * Resultado do interpretador especializado de `tipo_resposta: "lista_documentos"` — 3 saídas, ao
 * contrário do `InterpretadorIA` genérico (que só tem reconhecido/não-reconhecido):
 * - `completo`: a IA entendeu exatamente quantos documentos de cada tipo — motor segue em frente.
 * - `incompleto`: entendeu parte, mas falta informação (ex.: lead disse "quero limpar uns
 *   documentos" sem dizer quantos/quais) — a IA gera a pergunta de esclarecimento específica
 *   (`perguntaEsclarecimento`), que o motor manda no lugar do texto de retomada padrão.
 * - `nao_entendi`: resposta sem relação nenhuma com a pergunta — motor repete a pergunta original.
 */
export type ResultadoInterpretacaoListaDocumentos =
  | { status: "completo"; itens: ItemDocumentoPendente[] }
  /**
   * `dadosParciais` (19/08/2026, Luiz: "corrigir tudo de forma global") — quando a IA propõe uma
   * contagem específica pra confirmar (ex.: "1 CPF e 1 CNPJ, é isso?"), a pergunta em si precisa
   * atravessar o turno em `dados`, senão o motor não tem como saber, na resposta seguinte ("sim"),
   * o que exatamente está sendo confirmado — mesmo padrão de `dadosParciais` em
   * `ResultadoInterpretacaoFaixasDocumentos`.
   */
  | { status: "incompleto"; perguntaEsclarecimento: string; dadosParciais?: DadosConversa }
  | { status: "nao_entendi" };

export type InterpretadorListaDocumentos = (params: {
  etapaAtual: EtapaCarregada;
  respostaLead: string;
  dados: DadosConversa;
}) => Promise<ResultadoInterpretacaoListaDocumentos>;

/** Faixa de restrição de um documento específico, já resolvida num valor aproximado em reais — ou `null` quando o lead respondeu "não sei" (a Malala pode oferecer consulta paga nos 4 órgãos, ver regras-limpeza-nome.ts pro valor padrão conservador usado nesse caso). */
export type FaixaDocumentoCapturada = { tipo: "cpf" | "cnpj"; valorAproximado: number | null };

/**
 * Resultado do interpretador especializado de `tipo_resposta: "faixas_documentos"` — mesma
 * filosofia de 3 saídas de `ResultadoInterpretacaoListaDocumentos`, mas aqui `itens` precisa ter
 * exatamente uma entrada pra CADA documento de `dados.documentos_tipos`, na mesma ordem — decisão
 * de Luiz (17/08/2026): uma pergunta só pra todos os documentos, não um checkpoint por documento.
 *
 * Reformulado 18/08/2026 (Luiz, menu fechado): o checkpoint agora tem 2 rodadas — o lead escolhe
 * uma faixa do menu (assumida igual pra todos os documentos), a Malala confirma, e só marca
 * "completo" depois da confirmação. `incompleto.dadosParciais` é como esse estado provisório
 * atravessa o turno (mesmo problema/solução da negociação de pagamento: o interpretador só recebe
 * `dados`, sem histórico de turnos — o motor precisa persistir o que já foi entendido).
 */
export type ResultadoInterpretacaoFaixasDocumentos =
  | { status: "completo"; itens: FaixaDocumentoCapturada[] }
  | { status: "incompleto"; perguntaEsclarecimento: string; dadosParciais?: DadosConversa }
  /** Lead pediu a consulta oficial paga (R$39/documento) — escala pra atendimento humano em vez de continuar o automatizado. */
  | { status: "escalar_consulta_paga"; mensagem: string }
  /** Lead escolheu a opção virtual "Acima de X mil" do menu (spec 2026-08-20-agendamento-consultor-alto-valor.md) — encerra a coleta de faixas do pacote na hora, sem perguntar os documentos restantes, e roteia pro fluxo de agendamento com consultor. */
  | { status: "acima_do_corte" }
  | { status: "nao_entendi" };

export type InterpretadorFaixasDocumentos = (params: {
  etapaAtual: EtapaCarregada;
  respostaLead: string;
  dados: DadosConversa;
}) => Promise<ResultadoInterpretacaoFaixasDocumentos>;

/**
 * Resultado do interpretador especializado de `tipo_resposta: "negociacao_pagamento"` — 3 saídas:
 * - `confirmado`: o lead aceitou a mensagem de confirmação como está — motor grava o detalhe final
 *   em `dados` e segue em frente.
 * - `ajuste_valido`: o lead pediu uma mudança dentro das regras (forma, data ≤15 dias, âncora
 *   01/10/20) — motor persiste o ajuste, recalcula vencimentos e reenvia a confirmação atualizada.
 * - `negociando`: o lead pediu algo fora das regras ou ambíguo — a IA explica o limite/opções em
 *   linguagem natural (não uma mensagem fixa) e o motor permanece no checkpoint.
 */
export type ResultadoNegociacaoPagamento =
  | { status: "confirmado" }
  | {
      status: "ajuste_valido";
      formaPagamento: "boleto_pix" | "cartao";
      dataPrimeiraParcela: string; // ISO, já validada contra a regra de +15 dias
      diaAncora: 1 | 10 | 20 | null; // null quando à vista (não se aplica)
      mensagemConfirmando: string; // frase curta, natural, confirmando o que mudou
    }
  | { status: "negociando"; mensagemNegociacao: string };

export type InterpretadorNegociacaoPagamento = (params: {
  etapaAtual: EtapaCarregada;
  respostaLead: string;
  dados: DadosConversa;
}) => Promise<ResultadoNegociacaoPagamento>;

/** Uma FAQ ativa, como o interpretador de desvio precisa pra decidir se a pergunta do lead já tem resposta oficial. */
export type FaqParaDesvio = { pergunta: string; resposta: string };

/**
 * Resultado do interpretador de desvio (spec 2026-08-21-desvio-escalar-quando-nao-sabe.md) — só roda
 * quando o `InterpretadorIA` genérico não reconheceu a resposta do lead como sendo sobre o checkpoint
 * atual, pra decidir se é uma pergunta lateral que já tem resposta (FAQ) ou algo que a Malala
 * genuinamente não sabe responder (escalar pra humano em vez de repetir a pergunta ignorando o lead):
 * - `faq`: a pergunta do lead bate com uma FAQ ativa — motor responde com o texto oficial e retoma a
 *   pergunta pendente na mesma mensagem (regra de desvio), permanece no mesmo checkpoint.
 * - `escalar`: não bate com nada — motor encerra o automatizado e escala pro supervisor, registrando o
 *   motivo (que já vira nota interna automaticamente, ver `escalar_supervisor` em `persistencia.ts`).
 */
export type ResultadoDesvio = { status: "faq"; faq: FaqParaDesvio } | { status: "escalar" };

/** As FAQs ativas são capturadas por closure na fábrica (mesmo padrão de `criarInterpretadorFaixasDocumentos`), não passadas a cada chamada — por isso a assinatura é igual à do `InterpretadorIA` genérico. */
export type InterpretadorDesvio = (params: { etapaAtual: EtapaCarregada; respostaLead: string }) => Promise<ResultadoDesvio>;

/** O que o motor precisa pra decidir o próximo passo — tudo isolado do Supabase, testável puro (exceto o hook de IA, que é assíncrono por natureza). */
export type ContextoAvanco = {
  etapaAtual: EtapaCarregada;
  /** todas as etapas do fluxo ativo, indexadas por código — pra resolver `proximo_codigo` */
  etapasPorCodigo: Record<string, EtapaCarregada>;
  dados: DadosConversa;
  respostaLead: string;
  resolverMensagensDinamicas?: ResolverMensagensDinamicas;
  calcularDadosDerivados?: CalcularDadosDerivados;
  interpretarComIA?: InterpretadorIA;
  interpretarListaDocumentos?: InterpretadorListaDocumentos;
  interpretarFaixasDocumentos?: InterpretadorFaixasDocumentos;
  interpretarNegociacaoPagamento?: InterpretadorNegociacaoPagamento;
  interpretarDesvio?: InterpretadorDesvio;
  /** placeholders tipo `[saudacao]` que não vêm de `dados` (ex.: hora do dia) — computados por quem chama o motor, pra manter o motor determinístico/testável */
  variaveisGlobais?: Record<string, string>;
};

export type EfeitoNegocio =
  | { tipo: "marcar_perdida"; motivo: string }
  | { tipo: "escalar_supervisor"; motivo: string }
  | { tipo: "encerrar_fluxo_automatizado"; etapaKanban: string; sobSupervisor: boolean; etapaCodigo: string }
  /** Lead aceitou e escolheu um horário de agendamento com o consultor (spec 2026-08-20-agendamento-consultor-alto-valor.md) — grava em `agendamentos_consultor` e notifica o consultor. `inicio`/`fim` em ISO 8601. */
  | { tipo: "agendar_consultor"; inicio: string; fim: string; motivo: "divida_alta" | "pacote_caro" };

/** Uma mensagem já emparelhada com o digitando/delay da etapa de onde ela veio — é o que a camada de canal (ou o simulador) usa pra decidir quanto tempo esperar e se mostra "digitando..." antes de revelar cada uma. */
export type MensagemEnviada = {
  mensagem: MensagemEtapa;
  digitando: boolean;
  delay: ConfigDelay;
};

export type ResultadoAvanco = {
  /** mensagens a enviar ao lead neste turno (pode concatenar várias etapas sequenciais) */
  mensagens: MensagemEnviada[];
  /** etapa em que a conversa fica parada aguardando resposta (null = fluxo encerrou) */
  etapaFinal: EtapaCarregada | null;
  /** novos pares campo/valor a gravar em `dados` */
  dadosNovos: DadosConversa;
  efeitos: EfeitoNegocio[];
  /** true = a resposta do lead não bateu com o esperado (nem o parser, nem a IA quando habilitada); motor repetiu a pergunta em vez de avançar */
  naoReconhecido: boolean;
  /** true = a resposta só foi entendida graças à interpretação por IA (útil pra auditoria/custo, Fase 5) */
  interpretadoPorIA: boolean;
  /** subetapa do Kanban de onde a conversa ficou depois deste turno — null só quando ainda não dá pra saber (resposta não reconhecida numa etapa sem kanban_subetapa definido) */
  kanbanSubetapa: string | null;
};
