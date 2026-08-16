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
  | "numero_ou_nao_sei"; // valor livre (ex.: "10 mil") ou "não sei"

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
  /** placeholders tipo `[saudacao]` que não vêm de `dados` (ex.: hora do dia) — computados por quem chama o motor, pra manter o motor determinístico/testável */
  variaveisGlobais?: Record<string, string>;
};

export type EfeitoNegocio =
  | { tipo: "marcar_perdida"; motivo: string }
  | { tipo: "escalar_supervisor"; motivo: string }
  | { tipo: "encerrar_fluxo_automatizado"; etapaKanban: string; sobSupervisor: boolean };

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
