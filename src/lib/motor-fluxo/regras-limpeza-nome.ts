// Regras de negócio específicas do produto Limpeza de Nome Serasa/SPC — corte de alto valor,
// cálculo de proposta por faixa e fórmula de alto valor (PLANO_MESTRE seções 8.6-8.9,
// KANBAN_COMERCIAL_LIMPANOME.md, SCRIPT_LIMPANOME_SERASA_SPC.md Passos 6-7 e 15).
//
// Deliberadamente fora do motor de fluxo genérico (engine.ts): isto é lógica do produto, não do
// motor — outros produtos (Fase futura) terão suas próprias regras de qualificação/preço.

import type { DadosConversa } from "./tipos";

/** Preço combinado do pacote (preço cheio) acima disso escala pra agendamento com consultor — spec 2026-08-20-agendamento-consultor-alto-valor.md. Diferente de `corteAltoValor` (configurável, é sobre a DÍVIDA do lead) — este é sobre o preço que ele pagaria pra ArrudaCred, fixo por enquanto (YAGNI — promove pra `configuracoes` se virar pedido de verdade). */
export const CORTE_PACOTE_CARO = 8000;

export type FaixaPreco = {
  faixaMin: number;
  faixaMax: number | null;
  precoCheio: number | null;
  precoAvista: number | null;
  parcelasBoletoQtd: number | null;
  parcelasBoletoValor: number | null;
  parcelasCartaoMax: number | null;
  voucherAvista: number | null;
  voucherParcelasQtd: number | null;
  voucherParcelasValor: number | null;
};

export type ConfigPrecificacaoLimpaNome = {
  investimentoMinimoAvista: number;
  investimentoMinimoParcelasQtd: number;
  investimentoMinimoParcelasValor: number;
  altoValorFixo: number;
  altoValorPercentual: number;
  corteAltoValor: number;
};

/** Converte as respostas já capturadas (faixa_valor / faixa_valor_detalhe / valor_aproximado) num valor representativo em reais. */
export function resolverValorRestricao(dados: DadosConversa): number | null {
  const faixa = dados.faixa_valor;

  if (faixa === "menos_10mil") {
    if (dados.faixa_valor_detalhe === "menos_3mil") return 2000;
    if (dados.faixa_valor_detalhe === "3_10mil") return 6000;
    return null;
  }
  if (faixa === "10_30mil") return 20000;
  if (faixa === "30_50mil") return 40000;
  if (faixa === "50_100mil") return 75000;
  if (faixa === "mais_100mil") {
    const bruto = dados.valor_aproximado;
    if (!bruto || bruto === "nao_sei") {
      // Sem valor informado — trata como alto valor por segurança (aciona qualificação para
      // call com Luiz em vez de arriscar subprecificar uma restrição potencialmente grande).
      return 600_000;
    }
    const numero = Number(bruto);
    return Number.isNaN(numero) ? 600_000 : numero;
  }
  return null;
}

export function classificarAltoValor(
  valorRestricao: number | null,
  corteAltoValor: number,
): boolean {
  if (valorRestricao === null) return false;
  return valorRestricao > corteAltoValor;
}

export function calcularFormulaAltoValor(
  valorRestricao: number,
  fixo: number,
  percentual: number,
): number {
  return fixo + percentual * valorRestricao;
}

export function buscarFaixaPreco(
  valorRestricao: number,
  faixas: FaixaPreco[],
): FaixaPreco | null {
  return (
    faixas.find(
      (f) => valorRestricao >= f.faixaMin && (f.faixaMax === null || valorRestricao <= f.faixaMax),
    ) ?? null
  );
}

export function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Valor em milhares arredondado, sem casas decimais — "10000" -> "10 mil". Toda faixa de preço hoje é múltiplo exato de 1000 (ver migration 013). */
function formatarMil(valor: number): string {
  return `${Math.round(valor / 1000)} mil`;
}

const EMOJIS_NUMERO = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

/** Mesma ordenação usada no menu (formatarMenuFaixas) e no interpretador (pra o índice escolhido "2" apontar sempre pra mesma faixa nos dois lugares). */
export function ordenarFaixasPreco(faixas: FaixaPreco[]): FaixaPreco[] {
  return [...faixas].sort((a, b) => a.faixaMin - b.faixaMin);
}

/**
 * Rótulo de uma faixa pra menu numerado (checkpoint ln_passo6, correção 18/08/2026 — Luiz pediu
 * menu fechado em vez de pergunta de texto livre). A primeira faixa da lista (menor `faixaMin`) é
 * descrita só pelo teto ("Menos de X mil"), a última com `faixaMax` nulo só pelo piso ("Acima de X
 * mil"); as do meio, "Entre X e Y mil".
 */
export function formatarLabelFaixa(faixa: FaixaPreco, ehPrimeira: boolean): string {
  if (ehPrimeira) return `Menos de ${formatarMil(faixa.faixaMax ?? faixa.faixaMin)}`;
  if (faixa.faixaMax === null) return `Acima de ${formatarMil(faixa.faixaMin)}`;
  return `Entre ${formatarMil(faixa.faixaMin)} e ${formatarMil(faixa.faixaMax)}`;
}

/**
 * Lista numerada (1️⃣, 2️⃣...) de todas as faixas, ordenadas por `faixaMin` — usada tanto na
 * mensagem que o lead vê (criarResolverMensagensDinamicas) quanto no prompt do interpretador de IA
 * (pra ele conseguir mapear "2" pro intervalo certo), sempre o mesmo texto nos dois lugares.
 *
 * `corteAltoValor`, quando passado, acrescenta uma última linha virtual "Acima de X mil" — spec
 * 2026-08-20-agendamento-consultor-alto-valor.md. Essa opção **nunca vira uma faixa de
 * `precos_por_faixa`** (não tem preço fixo, escala pra agendamento com consultor) — a posição dela
 * no menu é sempre `faixas.length` (a próxima depois da última faixa real), nunca um número fixo:
 * se alguém adicionar/remover faixa em `/admin/precos`, ela desliza sozinha pro lugar certo.
 */
export function formatarMenuFaixas(faixas: FaixaPreco[], corteAltoValor?: number): string {
  const ordenadas = ordenarFaixasPreco(faixas);
  const linhas = ordenadas.map((faixa, i) => {
    const emoji = EMOJIS_NUMERO[i] ?? `${i + 1}.`;
    return `${emoji} ${formatarLabelFaixa(faixa, i === 0)}`;
  });
  if (corteAltoValor !== undefined) {
    const indice = ordenadas.length;
    const emoji = EMOJIS_NUMERO[indice] ?? `${indice + 1}.`;
    linhas.push(`${emoji} Acima de ${formatarMil(corteAltoValor)}`);
  }
  return linhas.join("\n");
}

/** Valor gravado em `dados` quando o lead escolhe a opção virtual "Acima de X mil" (nunca digitado por ele, nunca exibido) — mesmo padrão conservador já usado em `resolverValorRestricao` pro caso "não consigo converter pra número". Só precisa ficar acima do corte pra `classificarAltoValor` classificar certo; o valor exato não importa pra ninguém além do painel interno. */
export const VALOR_SENTINELA_ACIMA_DO_CORTE = 600_000;

/** Mesmos 3 formatos de `formatarLabelFaixa`, mas minúsculo e sem espaço antes do "mil" — o jeito exato que Luiz pediu pra frase de confirmação do ln_passo6 ("entre 10 e 30mil", não "Entre 10 mil e 30 mil"). */
export function formatarFaixaConfirmacao(faixa: FaixaPreco, ehPrimeira: boolean): string {
  const mil = (v: number) => `${Math.round(v / 1000)}mil`;
  if (ehPrimeira) return `menos de ${mil(faixa.faixaMax ?? faixa.faixaMin)}`;
  if (faixa.faixaMax === null) return `acima de ${mil(faixa.faixaMin)}`;
  return `entre ${Math.round(faixa.faixaMin / 1000)} e ${mil(faixa.faixaMax)}`;
}

/** Valor em reais usado pra representar a faixa inteira (preço/parcelas), depois que o lead confirma — ponto médio da faixa (ou o piso, quando não há teto). */
export function valorRepresentativoFaixa(faixa: FaixaPreco): number {
  if (faixa.faixaMax === null) return faixa.faixaMin;
  return Math.round((faixa.faixaMin + faixa.faixaMax) / 2);
}

/** Conta ocorrências de cada tipo, preservando a ordem de primeira aparição — "cpf,cpf,cnpj" -> [{tipo:"cpf",qtd:2},{tipo:"cnpj",qtd:1}]. */
function contarDocumentosPorTipo(tipos: ("cpf" | "cnpj")[]): { tipo: "cpf" | "cnpj"; qtd: number }[] {
  const ordem: ("cpf" | "cnpj")[] = [];
  const contagem = new Map<"cpf" | "cnpj", number>();
  for (const tipo of tipos) {
    if (!contagem.has(tipo)) ordem.push(tipo);
    contagem.set(tipo, (contagem.get(tipo) ?? 0) + 1);
  }
  return ordem.map((tipo) => ({ tipo, qtd: contagem.get(tipo) ?? 0 }));
}

/**
 * Mensagem de confirmação do ln_passo6 (formato exato pedido por Luiz, 18/08/2026) — depois que o
 * lead escolhe uma faixa do menu, a Malala confirma antes de seguir assumindo que TODOS os
 * documentos estão nesta mesma faixa. Ex.: "Só confirmando: Limpeza de nome para *01 CPF e 01
 * CNPJ* com restrições entre 10 e 30mil em *cada um deles*.\n👉 *Está correto?*"
 */
export function montarMensagemConfirmacaoFaixa(faixa: FaixaPreco, ehPrimeira: boolean, tiposDocumentos: ("cpf" | "cnpj")[]): string {
  const listaDocs = contarDocumentosPorTipo(tiposDocumentos)
    .map((g) => `${String(g.qtd).padStart(2, "0")} ${g.tipo.toUpperCase()}`)
    .join(" e ");
  const sufixo = tiposDocumentos.length > 1 ? " em *cada um deles*" : "";
  return `Só confirmando: Limpeza de nome para *${listaDocs}* com restrições ${formatarFaixaConfirmacao(faixa, ehPrimeira)}${sufixo}.\n👉 *Está correto?*`;
}

/** Data ISO (YYYY-MM-DD) formatada como DD/MM/AA — usado na mensagem de confirmação de pagamento. */
export function formatarDataBr(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano.slice(2)}`;
}

/** Bloco de proposta (Passo 15) para restrição abaixo de R$3 mil — usa o valor mínimo fixo, não a tabela por faixa. */
export function montarPropostaBaixoValor(config: ConfigPrecificacaoLimpaNome): string[] {
  return [
    `📎 PROPOSTA LIMPA NOME - SPC/SERASA\nComo o valor das restrições é menor, aplicamos nosso investimento mínimo:\n\n📌 *Á vista*: ${formatarReais(config.investimentoMinimoAvista)}\nou\n📌 *Parcelado*: ${config.investimentoMinimoParcelasQtd}x de ${formatarReais(config.investimentoMinimoParcelasValor)}`,
    `🙋‍♂️Como fica melhor para você fechar HOJE?\n\n👉 *À vista ou parcelado?*`,
  ];
}

/** Bloco de proposta (Passo 15) padrão — restrição dentro da tabela por faixa (até R$500 mil). */
/**
 * Recebe a faixa já combinada por documento (`combinarFaixasPacote`) — com 1 documento só (caso
 * mais comum) o resultado é idêntico ao de uma faixa única, sem mudança de comportamento.
 */
export function montarPropostaPorFaixa(
  faixaPreco: FaixaCombinadaPacote,
  quisPrioridadeHoje: boolean,
): string[] {
  const mensagens: string[] = [
    `A proposta é elaborada de acordo com as suas restrições e as condições de pagamento variam ao longo do mês. Se você já decidiu limpar seu nome, aproveite a condição especial que conseguimos liberar hoje utilizando por conta do fechamento da nossa meta`,
    `📎 PROPOSTA LIMPA NOME - SPC/SERASA\nPacote fechado para limpar seu nome nos 4 maiores órgãos de proteção de crédito: SERASA, SPC BOA VISTA, SPC BRASIL e CENPROT. Todos os tipos de restrições inclusos: boletos, duplicadas, ações judicias, protestos, cartões de crédito e restrições bancárias. Preço já engloba custas processuais, honorários, despesas gerais e blindagem:\n\n👉 Prazo: De 7 até 45 dias úteis\n👉 Seguro-Garantia: 1 ano\n👉 Bacen: não incluso.`,
  ];

  if (faixaPreco.precoCheio && faixaPreco.precoAvista) {
    const linhaParcelado =
      faixaPreco.parcelasBoleto.length > 0 ? `\n\nou\n\n📌 *Parcelado Boleto/Pix*:\n${formatarParcelas(faixaPreco.parcelasBoleto)}` : "";
    const linhaCartao = faixaPreco.parcelasCartaoMax ? ` ou ainda em até ${faixaPreco.parcelasCartaoMax}x no cartão.` : "";
    mensagens.push(
      `👉 *PREÇO JÁ COM DESCONTO para pagamento Boleto/Pix sendo primeira parcela imediata junto com a assinatura do contrato*:\n\n📌 *Especial à vista*:\n~De: ${formatarReais(faixaPreco.precoCheio)}~\nPor: ${formatarReais(faixaPreco.precoAvista)} parcela única${linhaParcelado}${linhaCartao}`,
    );
  }

  if (quisPrioridadeHoje && faixaPreco.voucherAvista) {
    const linhaVoucherParcelado =
      faixaPreco.voucherParcelas.length > 0 ? ` ou ${formatarParcelas(faixaPreco.voucherParcelas)}` : "";
    mensagens.push(
      `💥💥 *Condição Especial*\n_Fechando agora com voucher especial (válido por 24h):_\n\n👉 *${formatarReais(faixaPreco.voucherAvista)}* à vista${linhaVoucherParcelado} 🤩`,
    );
  }

  mensagens.push(`🙋‍♂️Como fica melhor para você fechar HOJE?\n\n👉 *À vista ou parcelado?*`);

  return mensagens;
}

export type ParcelaTier = { quantidade: number; valor: number };

/**
 * Combina as parcelas de N documentos numa régua só, mês a mês — decisão de Luiz (pacote Fase 4,
 * 17/08/2026): o total de parcelas é o maior entre os documentos; em cada mês, soma o valor de todo
 * documento que ainda tem parcela devida naquele mês (documento com menos parcelas "sai" da soma
 * assim que termina). Ex.: CPF 6x R$100 + CNPJ 3x R$200 vira 2 tiers — 3x R$300 (meses 1-3, os dois
 * ainda pagando) + 3x R$100 (meses 4-6, só o CPF) —, 6 parcelas no total. Com um documento só (caso
 * mais comum), degenera num tier único (mesmo resultado de hoje, sem pacote).
 */
export function combinarParcelas(itens: ParcelaTier[]): ParcelaTier[] {
  const cortes = [...new Set(itens.map((i) => i.quantidade))].filter((q) => q > 0).sort((a, b) => a - b);
  const tiers: ParcelaTier[] = [];
  let mesAnterior = 0;
  for (const corte of cortes) {
    const duracao = corte - mesAnterior;
    const valorMes = itens.filter((i) => i.quantidade >= corte).reduce((soma, i) => soma + i.valor, 0);
    if (duracao > 0 && valorMes > 0) tiers.push({ quantidade: duracao, valor: valorMes });
    mesAnterior = corte;
  }
  return tiers;
}

export type FaixaCombinadaPacote = {
  precoCheio: number | null;
  precoAvista: number | null;
  parcelasBoleto: ParcelaTier[];
  parcelasCartaoMax: number | null;
  voucherAvista: number | null;
  voucherParcelas: ParcelaTier[];
};

/**
 * Preço do pacote pela faixa de CADA documento, somadas — decisão de Luiz (pacote Fase 4,
 * 17/08/2026): antes disto, o preço vinha de uma única faixa sobre o VALOR total combinado
 * (`somarValoresDocumentos` + `buscarFaixaPreco`), o que sub/sobre-precificava pacotes com
 * documentos de portes bem diferentes (ex.: 1 CPF de R$10 mil + 1 CNPJ de R$80 mil virava uma faixa
 * só, em vez da faixa de cada um). Preço cheio/à vista/voucher à vista somam direto; parcelamento
 * usa `combinarParcelas` (régua mês a mês, não simples soma de quantidade de parcelas). Documentos
 * sem faixa encontrada são ignorados na soma (defensivo — não deveria acontecer com valores dentro
 * do corte de alto valor, que é sempre <= o teto da tabela de faixas).
 */
export function combinarFaixasPacote(valoresPorDocumento: number[], faixasPrecos: FaixaPreco[]): FaixaCombinadaPacote | null {
  const faixas = valoresPorDocumento
    .map((valor) => buscarFaixaPreco(valor, faixasPrecos))
    .filter((f): f is FaixaPreco => f !== null);
  if (faixas.length === 0) return null;

  const somarSeTodasTiverem = (extrair: (f: FaixaPreco) => number | null): number | null =>
    faixas.every((f) => extrair(f) != null) ? faixas.reduce((soma, f) => soma + (extrair(f) ?? 0), 0) : null;

  return {
    precoCheio: somarSeTodasTiverem((f) => f.precoCheio),
    precoAvista: somarSeTodasTiverem((f) => f.precoAvista),
    parcelasCartaoMax: faixas.some((f) => f.parcelasCartaoMax != null)
      ? Math.max(...faixas.map((f) => f.parcelasCartaoMax ?? 0))
      : null,
    voucherAvista: somarSeTodasTiverem((f) => f.voucherAvista),
    parcelasBoleto: combinarParcelas(
      faixas
        .filter((f) => f.parcelasBoletoQtd != null && f.parcelasBoletoValor != null)
        .map((f) => ({ quantidade: f.parcelasBoletoQtd as number, valor: f.parcelasBoletoValor as number })),
    ),
    voucherParcelas: combinarParcelas(
      faixas
        .filter((f) => f.voucherParcelasQtd != null && f.voucherParcelasValor != null)
        .map((f) => ({ quantidade: f.voucherParcelasQtd as number, valor: f.voucherParcelasValor as number })),
    ),
  };
}

/** Formata uma régua de parcelas — "Nx de R$X" quando só tem um tier (caso comum, 1 documento), ou "Nx de R$X + Mx de R$Y" encadeado quando o pacote combina documentos com prazos diferentes. */
export function formatarParcelas(tiers: ParcelaTier[]): string {
  return tiers.map((t) => `${t.quantidade}x ${formatarReais(t.valor)}`).join(" + ");
}

/** Bloco de qualificação para alto valor (>R$500 mil) — PLANO_MESTRE seção 8.6: qualifica e tenta agendar call com Luiz antes de propor. Mantida pra referência histórica; substituída em produção por `montarOfertaAgendamentoConsultor` (spec 2026-08-20-agendamento-consultor-alto-valor.md). */
export function montarQualificacaoAltoValor(): string[] {
  return [
    `Pelo que você me contou, esse é um caso que merece atenção especial — vale a pena conversarmos por ligação para eu te apresentar a proposta com todo o cuidado que ela precisa.`,
    `👉 *Podemos agendar uma ligação com nosso especialista, ou prefere já receber a proposta por aqui mesmo?*\n\n1️⃣ Quero agendar a ligação\n2️⃣ Prefiro receber por WhatsApp`,
  ];
}

/** Oferta de agendamento com consultor — checkpoint `ln_agendamento_oferta` (spec 2026-08-20-agendamento-consultor-alto-valor.md). O motivo varia por gatilho: dívida acima do corte configurável, ou preço do pacote acima de R$8.000. */
export function montarOfertaAgendamentoConsultor(motivo: "divida_alta" | "pacote_caro"): string[] {
  const frase =
    motivo === "divida_alta"
      ? "Pelo que você me contou, essa dívida é um valor mais alto — nesses casos, quem te atende é um consultor especializado, não eu."
      : "Como esse é um pacote maior, quem cuida da negociação nesses casos é um consultor especializado, não eu.";
  return [frase, `👉 *Quer agendar uma ligação/vídeo-chamada com ele?*\n\n1️⃣ Sim, quero agendar\n2️⃣ Prefiro continuar por aqui mesmo`];
}

/** Data/hora de um horário oferecido, no formato "quinta (20/08) às 15h" — usado tanto pra listar as 2 opções quanto pra confirmar a escolhida. `isoInstant` é o instante UTC gravado em `dados`. */
export function formatarDataHoraAgendamento(isoInstant: string): string {
  const data = new Date(isoInstant);
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(data);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  const diaSemana = valor("weekday");
  return `${diaSemana} (${valor("day")}/${valor("month")}) às ${valor("hour")}h`;
}

/** Lista os 2 horários oferecidos — checkpoint `ln_agendamento_horario`. `opcoes` já vêm calculadas (`_agendamento_opcao_N_inicio`, `criarCalculadoraDadosDerivados`). */
export function montarHorariosAgendamento(opcoes: [string, string]): string {
  return `Consigo te encaixar em um desses horários com nosso consultor:\n\n1️⃣ ${formatarDataHoraAgendamento(opcoes[0])}\n2️⃣ ${formatarDataHoraAgendamento(opcoes[1])}\n\nQual prefere? Se nenhum funcionar, me avisa que vejo outra opção com ele.`;
}

/** Confirmação final — checkpoint `ln_agendamento_confirmado`. */
export function montarConfirmacaoAgendamento(isoInstant: string): string {
  return `Perfeito! Agendado com nosso consultor pra ${formatarDataHoraAgendamento(isoInstant)}. Ele já foi avisado e vai te chamar nesse horário. 🙋‍♂️`;
}

/** Bloco de proposta self-service para quem recusou a call de alto valor — usa a mesma fórmula de previsibilidade do Kanban. */
export function montarPropostaAltoValorSelfService(
  valorEstimado: number,
): string[] {
  return [
    `Sem problema! Com base no que você me passou, o investimento estimado para o seu caso é de ${formatarReais(valorEstimado)}.`,
    `🙋‍♂️Como fica melhor para você fechar HOJE?\n\n👉 *À vista ou parcelado?*`,
  ];
}
