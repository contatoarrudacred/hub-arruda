export type TurnoEspelho = {
  turno: number;
  mensagemLead: string;
  mensagensMalala: string[];
  etapaCodigo: string | null;
  naoReconhecido: boolean;
  interpretadoPorIA: boolean;
};

export type EfeitosBancoEspelho = {
  sobSupervisor: boolean;
  etapaKanban: string | null;
  notasInternas: { autor: string; texto: string }[];
  notificacoes: { tipo: string }[];
  agendamento: { motivo: string; inicio: string; fim: string } | null;
};

export type EspelhoConversa = {
  cenario: string;
  descricao: string;
  tipo: "roteirizado" | "adversarial";
  telefone: string;
  /** o que se espera verificar de handoff neste cenário, ou null se não envolve handoff — vira
   * contexto extra pro juiz (ver juiz.ts). */
  expectativaHandoff: string | null;
  turnos: TurnoEspelho[];
  efeitos: EfeitosBancoEspelho;
  encerradoPorLimiteDeTurnos: boolean;
  erro: string | null;
};

export type CenarioRoteirizado = {
  tipo: "roteirizado";
  nome: string;
  descricao: string;
  expectativaHandoff: string | null;
  /** sequência fixa de mensagens do lead, na ordem — cada uma dispara um turno do motor. */
  mensagens: string[];
};

export type CenarioAdversarial = {
  tipo: "adversarial";
  nome: string;
  descricao: string;
  expectativaHandoff: string | null;
  /** instrução de papel pra IA que atua como o lead — objetivo, tom, o que tentar provocar. */
  persona: string;
  primeiraMensagem: string;
  maxTurnos: number;
};

export type Cenario = CenarioRoteirizado | CenarioAdversarial;

export type VeredictoJuiz = {
  cenario: string;
  descricao: string;
  respondeuOQueFoiPerguntado: boolean;
  repetiuPerguntaIdentica: boolean;
  alucinou: boolean;
  tomHumanizado: boolean;
  /** null quando o cenário não envolve handoff. */
  handoffCorreto: boolean | null;
  resumo: string;
  problemasEncontrados: string[];
  citacoes: string[];
};
