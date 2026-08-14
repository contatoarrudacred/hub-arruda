// Dados de referência do produto Limpeza de Nome que não são "etapas de conversa" — preço por
// faixa, config de precificação, FAQ e a agenda padrão de follow-up. Fonte única usada tanto pelos
// testes do motor (engine.test.ts) quanto pelo gerador de seed (scripts/gerar-seed.ts), pra não
// duplicar os mesmos números em dois lugares.
//
// Fontes: SCRIPT_LIMPANOME_SERASA_SPC.md ("Estrutura da tabela de preços por faixa" e "Agenda
// padrão de follow-up"), FAQ_LIMPANOME_SERASA_SPC.md.

import type { ConfigPrecificacaoLimpaNome, FaixaPreco } from "./regras-limpeza-nome";

export const FAIXAS_PRECOS_LIMPEZA_NOME: FaixaPreco[] = [
  {
    faixaMin: 3_000,
    faixaMax: 10_000,
    precoCheio: 2580,
    precoAvista: 1290,
    parcelasBoletoQtd: 6,
    parcelasBoletoValor: 430,
    parcelasCartaoMax: 12,
    voucherAvista: 899,
    voucherParcelasQtd: 6,
    voucherParcelasValor: 299,
  },
  {
    faixaMin: 10_000,
    faixaMax: 30_000,
    precoCheio: 3600,
    precoAvista: 1800,
    parcelasBoletoQtd: 6,
    parcelasBoletoValor: 600,
    parcelasCartaoMax: 12,
    voucherAvista: 1290,
    voucherParcelasQtd: 6,
    voucherParcelasValor: 399,
  },
  {
    faixaMin: 30_000,
    faixaMax: 50_000,
    precoCheio: 3600,
    precoAvista: 1800,
    parcelasBoletoQtd: 6,
    parcelasBoletoValor: 600,
    parcelasCartaoMax: 12,
    voucherAvista: 1290,
    voucherParcelasQtd: 6,
    voucherParcelasValor: 399,
  },
  {
    faixaMin: 50_000,
    faixaMax: 100_000,
    precoCheio: 4800,
    precoAvista: 2400,
    parcelasBoletoQtd: 6,
    parcelasBoletoValor: 800,
    parcelasCartaoMax: 12,
    voucherAvista: 1790,
    voucherParcelasQtd: 6,
    voucherParcelasValor: 599,
  },
  {
    faixaMin: 100_000,
    faixaMax: 500_000,
    precoCheio: 6000,
    precoAvista: 3000,
    parcelasBoletoQtd: 6,
    parcelasBoletoValor: 1000,
    parcelasCartaoMax: 12,
    voucherAvista: 2390,
    voucherParcelasQtd: 6,
    voucherParcelasValor: 799,
  },
];

export const CONFIG_PRECIFICACAO_LIMPEZA_NOME: ConfigPrecificacaoLimpaNome = {
  investimentoMinimoAvista: 899,
  investimentoMinimoParcelasQtd: 6,
  investimentoMinimoParcelasValor: 299,
  altoValorFixo: 7680,
  altoValorPercentual: 0.015,
  corteAltoValor: 500_000,
};

export const FAQS_LIMPEZA_NOME: { pergunta: string; resposta: string }[] = [
  {
    pergunta: "É certeza que vou conseguir aprovação de crédito após limpar meu nome?",
    resposta:
      "A maioria dos clientes consegue aprovação de crédito/financiamento algumas semanas após a conclusão do processo, mas lojas e principalmente instituições financeiras usam outros critérios além do nome limpo para aprovar crédito — nome limpo não é garantia de aprovação.\n\nA única certeza absoluta: solicitar crédito com nome sujo (situação atual) será negado. A ArrudaCred não controla a avaliação de crédito de terceiros, então não garante aprovação — o que ela garante em contrato é a remoção das restrições no SERASA, SPC Brasil, SPC Boa Vista e CENPROT.",
  },
  {
    pergunta: "O score vai aumentar depois de limpar o nome?",
    resposta:
      "Score é o resultado de um cálculo matemático sobre a situação financeira: restrição = score baixo; nome limpo = tendência de melhora. Sim, o score vai melhorar conforme as dívidas são pagas ou as restrições removidas — de forma gradativa. Exceção: se o cliente tiver contas do mês atual atrasadas/vencidas, o score pode ficar travado ou até cair.",
  },
  {
    pergunta: "Quando e quanto o score aumenta?",
    resposta:
      "Não é possível precisar quanto nem quando — depende do algoritmo do Serasa (hoje usa IA e muda constantemente). Regra geral: se o CPF não tiver contas atrasadas nos últimos 30 dias, já sobe um pouco de cara. O aumento mais relevante é gradativo ao longo dos próximos 90 dias, desde que o cliente mantenha hábitos de bom pagador e poucas consultas no nome.",
  },
  {
    pergunta: "As restrições podem voltar? O que é o seguro-garantia?",
    resposta:
      "O processo é judicial, então é normal os órgãos de proteção ao crédito apresentarem recursos ao longo do tempo — isso pode fazer restrições voltarem (parcial ou totalmente). Não é falha no serviço, é andamento normal do processo.\n\nSeguro-garantia de 12 meses incluso no valor da contratação cobre: reinserção parcial das restrições, reinserção total das restrições, inserção de restrição nova referente a nova dívida.\n\nAcionamento do seguro: a associação entra com novo pedido de remoção, conforme regras do contrato. Taxa de R$ 250,00 por CPF/CNPJ, cobrada sempre que o seguro for acionado.",
  },
  {
    pergunta: "Qual a diferença entre restrição e dívida?",
    resposta:
      "Restrição = anotação negativa referente à dívida que prejudica o nome — a ArrudaCred consegue baixar isso via ação judicial com base no Decreto nº 2.181/97 (art. 13, incisos XIII e XIV), no art. 42 do Código de Defesa do Consumidor e na Súmula 359 do STJ.\n\nDívida = continua existindo internamente na loja/banco onde foi contraída (e no Banco Central) — o cliente pode negociar isso depois, quando tiver fôlego financeiro ou achar melhor.",
  },
  {
    pergunta: "Posso resolver o BACEN/SCR/CCF junto com a Limpeza de Nome Serasa/SPC?",
    resposta:
      "*Bacen depois da proposta Limpa Nome SERASA/SPC!!*\n\nPara dar entrada na ação de atualização do Registrato SCR (Banco Central - BACEN) removendo anotações negativas na coluna \"VENCIDOS\", é necessário estar com nome limpo no SERASA, SPC Brasil, SCPC Boa Vista e CENPROT já que isso faz parte da defesa utilizado no processo.\n\nO caminho é realizar primeiro as baixas nas restrições Serasa/SPC para na sequência, tirar um relatório atualizado do SCR e aí sim, orçar e contratar o serviço correspondente no BACEN, ok?",
  },
  {
    pergunta: "Quais as garantias que eu tenho contratando a ArrudaCred?",
    resposta:
      "Essa é uma ótima pergunta, e eu também faria essa pergunta no seu lugar. 😊\n\nA sua principal garantia é que você está contratando uma empresa com anos de atuação, milhares de clientes atendidos, excelente reputação no Google e no Reclame Aqui, além de um contrato formal de prestação de serviços.\n\nAlém disso, nosso contrato prevê que, caso não consigamos entregar o serviço dentro do prazo máximo contratado, você tem direito ao reembolso previsto contratualmente.",
  },
  {
    pergunta: "Posso ver uma minuta do contrato?",
    resposta:
      "Claro! 😊 Antes da assinatura você receberá o contrato completo para analisar com calma. Como ele é elaborado com os dados do cliente e do serviço contratado, não trabalhamos com uma minuta padrão. Se surgir qualquer dúvida, faço questão de explicar cada cláusula antes da assinatura.",
  },
  {
    pergunta: "Como funciona o processo de limpeza de nome?",
    resposta:
      "A limpeza de nome é realizada por meio de uma ação judicial coletiva, promovida por associações de defesa dos direitos do consumidor, com fundamento no Decreto nº 2.181/97 (art. 13, incisos XIII e XIV), no art. 42 do Código de Defesa do Consumidor e na Súmula 359 do Superior Tribunal de Justiça (STJ). O objetivo da ação é buscar a remoção das restrições dos órgãos de proteção ao crédito, sem quitar ou extinguir as dívidas, que continuam existindo normalmente.\n\nPor envolver uma ação coletiva e dados pessoais sensíveis dos associados (como documentos, informações financeiras e registros de dívidas), o processo tramita sob segredo de justiça, conforme a legislação aplicável. Por esse motivo, não é permitido divulgar o número do processo, fornecer cópias dos autos, decisões judiciais ou permitir consulta às peças processuais, preservando a privacidade e a segurança de todos os participantes.\n\nApós a contratação, nossa equipe acompanha todo o processo até a conclusão e mantém você informado durante as etapas do serviço.",
  },
  {
    pergunta: "Existe chance das restrições voltarem?",
    resposta:
      "Sim, essa possibilidade existe. 😊\n\nComo a remoção das restrições ocorre por meio de uma ação judicial, é perfeitamente normal que, ao longo do processo, os órgãos de proteção ao crédito apresentem recursos ou outras manifestações processuais. Em alguns casos, isso pode fazer com que as restrições voltem a aparecer, parcial ou totalmente.\n\nIsso não significa que houve falha no serviço, mas sim que faz parte do andamento normal de um processo judicial. Pensando nisso, a ArrudaCred oferece uma solução específica para proporcionar ainda mais tranquilidade ao cliente, conforme as condições previstas em contrato.",
  },
];

export type ItemAgendaFollowup = {
  ordem: number;
  intervaloValor: number;
  intervaloUnidade: "minutos" | "horas" | "dias";
  canal: "whatsapp" | "email";
  respeitaJanelaComercial: boolean;
  conteudo: string;
};

/** Agenda padrão (SCRIPT_LIMPANOME_SERASA_SPC.md, premissas gerais) — usada quando uma etapa não define agenda própria. */
export const AGENDA_PADRAO_ITENS: ItemAgendaFollowup[] = [
  {
    ordem: 1,
    intervaloValor: 10,
    intervaloUnidade: "minutos",
    canal: "whatsapp",
    respeitaJanelaComercial: false,
    conteudo: "🙋‍♂️🙋‍♂️ [Primeiro_Nome] ??",
  },
  {
    ordem: 2,
    intervaloValor: 45,
    intervaloUnidade: "minutos",
    canal: "whatsapp",
    respeitaJanelaComercial: true,
    conteudo: "👀 Oi, está por aí ainda? conseguiu ver minha mensagem?",
  },
  {
    ordem: 3,
    intervaloValor: 4,
    intervaloUnidade: "horas",
    canal: "whatsapp",
    respeitaJanelaComercial: true,
    conteudo: "👋 Lembrando: estou por aqui te aguardando...",
  },
  {
    ordem: 4,
    intervaloValor: 24,
    intervaloUnidade: "horas",
    canal: "whatsapp",
    respeitaJanelaComercial: true,
    conteudo:
      "🙂 [Primeiro_Nome], sei que nem sempre é o melhor momento para falar, caso você tenha decidido não continuar com este atendimento, basta me dizer que encerro agora, ok?",
  },
  {
    ordem: 5,
    intervaloValor: 3,
    intervaloUnidade: "dias",
    canal: "whatsapp",
    respeitaJanelaComercial: true,
    conteudo:
      "📌 Como você não respondeu nada, vou tentar mais uma vez: você ainda tem interesse em continuar este atendimento? Se não tiver, por gentileza me informe...",
  },
  {
    ordem: 6,
    intervaloValor: 7,
    intervaloUnidade: "dias",
    canal: "whatsapp",
    respeitaJanelaComercial: true,
    conteudo: "🔔 Última tentativa de contato: Você está por aí?",
  },
  {
    ordem: 7,
    intervaloValor: 10,
    intervaloUnidade: "dias",
    canal: "whatsapp",
    respeitaJanelaComercial: true,
    conteudo:
      "⛔ Este atendimento foi encerrado automaticamente devido falta de resposta. Se precisar, você pode chamar novamente a qualquer momento... Até mais!",
  },
  {
    ordem: 8,
    intervaloValor: 30,
    intervaloUnidade: "dias",
    canal: "email",
    respeitaJanelaComercial: true,
    conteudo: "Nutrição 1 — reengajamento educativo (riscos de nome negativado)",
  },
  {
    ordem: 9,
    intervaloValor: 60,
    intervaloUnidade: "dias",
    canal: "email",
    respeitaJanelaComercial: true,
    conteudo: "Nutrição 2 — reengajamento educativo (nem todo acordo limpa o nome de verdade)",
  },
  {
    ordem: 10,
    intervaloValor: 90,
    intervaloUnidade: "dias",
    canal: "email",
    respeitaJanelaComercial: true,
    conteudo: "Nutrição 3 — última tentativa de reativação",
  },
];
