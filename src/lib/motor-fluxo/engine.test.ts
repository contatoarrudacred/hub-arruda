import { describe, expect, it } from "vitest";
import {
  CONFIG_PRECIFICACAO_LIMPEZA_NOME as CONFIG,
  FAIXAS_PRECOS_LIMPEZA_NOME as FAIXAS_PRECOS,
} from "./dados-referencia-limpeza-nome";
import { avancarConversa, iniciarFluxo, saudacaoPorHorario } from "./engine";
import {
  construirEtapasPorCodigo,
  criarCalculadoraDadosDerivados,
  criarExtratorAbertura,
  criarResolverMensagensDinamicas,
  ETAPAS_ABERTURA_TRIAGEM,
  ETAPAS_LIMPEZA_NOME,
} from "./fluxo-limpeza-nome";
import type { DadosConversa, MensagemEnviada } from "./tipos";

const etapasPorCodigo = construirEtapasPorCodigo([
  { definicoes: ETAPAS_ABERTURA_TRIAGEM, fluxoId: "fluxo-geral" },
  { definicoes: ETAPAS_LIMPEZA_NOME, fluxoId: "fluxo-limpeza-nome" },
]);

const calcularDadosDerivados = criarCalculadoraDadosDerivados(CONFIG, FAIXAS_PRECOS);
const resolverMensagensDinamicas = criarResolverMensagensDinamicas(FAIXAS_PRECOS, CONFIG);

const VARIAVEIS_GLOBAIS = { saudacao: "bom dia" };

/** Mensagens de teste são sempre texto puro — extrai a string pra facilitar as asserções. */
function txt(e: MensagemEnviada): string {
  return e.mensagem.tipo === "texto" ? e.mensagem.texto : "";
}

function responder(etapaId: string, dados: DadosConversa, resposta: string) {
  return avancarConversa({
    etapaAtual: etapasPorCodigo[etapaId],
    etapasPorCodigo,
    dados,
    respostaLead: resposta,
    resolverMensagensDinamicas,
    calcularDadosDerivados,
    variaveisGlobais: VARIAVEIS_GLOBAIS,
  });
}

describe("iniciarFluxo", () => {
  it("sempre manda a foto + saudação, depois pausa esperando o nome", () => {
    const resultado = iniciarFluxo("saudacao_inicial", etapasPorCodigo);
    expect(resultado.mensagens[0].mensagem.tipo).toBe("imagem");
    expect(txt(resultado.mensagens[1])).toContain("eu sou Malala");
    expect(resultado.etapaFinal?.conteudo.codigo).toBe("pergunta_nome");
    expect(txt(resultado.mensagens[2])).toContain("Com quem eu falo?");
  });

  it("pula a pergunta do nome quando já veio da extração da abertura", () => {
    const resultado = iniciarFluxo("saudacao_inicial", etapasPorCodigo, { nome: "Luiz" });
    expect(resultado.mensagens.some((m) => txt(m).includes("Com quem eu falo?"))).toBe(false);
    // telefone e email ainda são desconhecidos, então a próxima pausa é no telefone
    expect(resultado.etapaFinal?.conteudo.codigo).toBe("abertura_telefone");
  });

  it("pula nome, telefone, e-mail e o menu de triagem quando tudo já é conhecido", () => {
    const resultado = iniciarFluxo(
      "saudacao_inicial",
      etapasPorCodigo,
      {
        nome: "Luiz",
        telefone: "11999999999",
        email: "luiz@example.com",
        produto_interesse: "limpeza_nome",
      },
      resolverMensagensDinamicas,
      VARIAVEIS_GLOBAIS,
    );
    expect(resultado.mensagens.some((m) => txt(m).includes("Com quem eu falo?"))).toBe(false);
    expect(resultado.mensagens.some((m) => txt(m).includes("informe o número da opção"))).toBe(
      false,
    );
    // a saudação personalizada dispara mesmo pulando a pergunta — o nome só ficou pronto mais cedo
    expect(resultado.mensagens.some((m) => txt(m).includes("Oi Luiz, bom dia!"))).toBe(true);
    // direto pro fluxo do produto — ln_passo2 é a primeira pausa real do produto
    expect(resultado.etapaFinal?.conteudo.codigo).toBe("ln_passo2");
  });
});

describe("extração determinística da abertura", () => {
  it("reconhece nome e produto quando o lead se antecipa", () => {
    const extrator = criarExtratorAbertura();
    const dados = extrator("Oi, sou Luiz e quero limpar meu nome");
    expect(dados.nome).toBe("Luiz");
    expect(dados.produto_interesse).toBe("limpeza_nome");
  });

  it("não inventa nada quando não reconhece nenhum padrão", () => {
    const extrator = criarExtratorAbertura();
    expect(criarExtratorAbertura()("oi")).toEqual({});
    expect(extrator("boa tarde")).toEqual({});
  });

  it("reconhece nome mesmo sem maiúscula, como no WhatsApp real", () => {
    const extrator = criarExtratorAbertura();
    expect(extrator("oi, sou luiz e quero limpar meu nome").nome).toBe("Luiz");
  });

  it("não gruda o artigo antes do nome (bug real, 17/08/2026: 'sou a Renata' virou nome 'A Renata')", () => {
    const extrator = criarExtratorAbertura();
    expect(extrator("Oi, sou a Renata, quero limpar meu nome").nome).toBe("Renata");
    expect(extrator("Oi, sou o Carlos, quero limpar meu nome").nome).toBe("Carlos");
  });

  it("reconhece valor de dívida mencionado de cara, sem repetir a pergunta de faixa depois (achado real, 17/08/2026)", () => {
    // Antes desta correção, "sou joao, devo 10 mil e quero limpar meu nome" ignorava o "devo 10
    // mil" — a Malala perguntava a faixa de novo em ln_passo6, repetindo o que o lead já tinha dito.
    const extrator = criarExtratorAbertura();
    const dados = extrator("sou joao, devo 10 mil e quero limpar meu nome");
    expect(dados.faixa_valor).toBe("10_30mil");
  });

  it("não deixa a vírgula da frase virar o valor por engano", () => {
    // Bug real encontrado ao corrigir o achado acima: "sou pedro, devo 10 mil..." — o regex
    // [\d.,]+ casava a vírgula depois de "pedro" antes de chegar no "10" de verdade, resultando em
    // NaN e nenhum valor extraído.
    const extrator = criarExtratorAbertura();
    const dados = extrator("sou pedro, devo 10 mil e quero limpar meu nome");
    expect(dados.faixa_valor).toBe("10_30mil");
  });

  it("exige sinal de valor (mil/R$/reais) antes de tentar extrair um número — não confunde outro número da frase", () => {
    const extrator = criarExtratorAbertura();
    expect(extrator("preciso limpar meu nome, moro há 10 anos aqui").faixa_valor).toBeUndefined();
  });

  it("classifica corretamente as faixas baixa e alta com refinamento", () => {
    const extrator = criarExtratorAbertura();
    expect(extrator("quero limpar meu nome, devo uns 2 mil").faixa_valor_detalhe).toBe("menos_3mil");
    expect(extrator("quero limpar meu nome, devo R$ 200.000").valor_aproximado).toBe("200000");
  });
});

describe("extração de nome — resposta direta a 'Com quem eu falo?'", () => {
  it("resposta com frase de apresentação não vira o nome inteiro (bug reportado por Luiz)", async () => {
    // Antes desta correção, "sou luiz, boa tarde!" virava dados.nome = "sou luiz, boa tarde!" (a
    // resposta crua inteira), e [Primeiro_Nome] usava só a primeira palavra bruta ("sou") — a
    // Malala respondia "Oi sou, bom dia!".
    const r = await responder("pergunta_nome", {}, "sou luiz, boa tarde!");
    expect(r.dadosNovos.nome).toBe("Luiz");
    expect(r.mensagens.some((m) => txt(m).includes("Oi Luiz"))).toBe(true);
  });

  it("resposta só com o nome, sem frase de apresentação, continua funcionando", async () => {
    const r = await responder("pergunta_nome", {}, "luiz");
    expect(r.dadosNovos.nome).toBe("Luiz");
  });

  it("reconhece 'me chamo' e 'meu nome é' em minúscula também", async () => {
    let r = await responder("pergunta_nome", {}, "me chamo luiz");
    expect(r.dadosNovos.nome).toBe("Luiz");

    // Nome composto todo em minúsculo só captura o primeiro nome — regex não tem como saber onde
    // o nome termina sem depender de maiúscula (ver comentário em extracao.ts). Capitalizado
    // funciona normalmente ("meu nome é Luiz Silva" capturaria "Luiz Silva" inteiro).
    r = await responder("pergunta_nome", {}, "meu nome é luiz silva");
    expect(r.dadosNovos.nome).toBe("Luiz");
  });

  it("não trata cumprimento como nome (bug real: 'oi' virou nome no WhatsApp de produção)", async () => {
    for (const cumprimento of ["oi", "Olá!!", "bom dia", "boa tarde"]) {
      const r = await responder("pergunta_nome", {}, cumprimento);
      expect(r.naoReconhecido).toBe(true);
      expect(r.dadosNovos.nome).toBeUndefined();
    }
  });
});

describe("saudacaoPorHorario", () => {
  it("usa o horário de São Paulo, não o fuso do processo (bug real: UTC na Vercel dava 'boa noite' ao meio-dia)", () => {
    // 9h em São Paulo = 12h UTC (sem horário de verão) — se a função lesse a hora em UTC direto
    // (meio-dia), já cairia no ramo "boa tarde" em vez de "bom dia".
    expect(saudacaoPorHorario(new Date("2026-08-16T12:00:00.000Z"))).toBe("bom dia");
    // 14h em SP = 17h UTC — "boa tarde".
    expect(saudacaoPorHorario(new Date("2026-08-16T17:00:00.000Z"))).toBe("boa tarde");
    // 20h em SP = 23h UTC — "boa noite".
    expect(saudacaoPorHorario(new Date("2026-08-16T23:00:00.000Z"))).toBe("boa noite");
  });
});

describe("abertura e triagem", () => {
  it("captura nome, telefone e email, depois pausa no menu de triagem", async () => {
    let dados: DadosConversa = {};
    let r = await responder("pergunta_nome", dados, "Maria Silva");
    expect(r.naoReconhecido).toBe(false);
    dados = { ...dados, ...r.dadosNovos };
    expect(dados.nome).toBe("Maria Silva");
    // a saudação personalizada emenda logo em seguida, antes de pausar no telefone
    expect(r.mensagens.some((m) => txt(m).includes("Oi Maria, bom dia!"))).toBe(true);
    expect(r.etapaFinal?.conteudo.codigo).toBe("abertura_telefone");

    r = await responder("abertura_telefone", dados, "11988887777");
    dados = { ...dados, ...r.dadosNovos };
    expect(dados.telefone).toBe("11988887777");
    expect(r.etapaFinal?.conteudo.codigo).toBe("abertura_email");

    r = await responder("abertura_email", dados, "maria@example.com");
    dados = { ...dados, ...r.dadosNovos };
    expect(dados.email).toBe("maria@example.com");
    expect(r.etapaFinal?.conteudo.codigo).toBe("triagem_menu");
  });

  it("rejeita e-mail inválido sem avançar", async () => {
    const r = await responder("abertura_email", {}, "nao e um email");
    expect(r.naoReconhecido).toBe(true);
    expect(r.etapaFinal?.conteudo.codigo).toBe("abertura_email");
  });

  it("produto fora do MVP1 (ex.: Score) escala pra atendimento humano", async () => {
    const r = await responder("triagem_menu", {}, "2");
    expect(r.etapaFinal).toBeNull();
    expect(r.efeitos).toEqual([
      {
        tipo: "encerrar_fluxo_automatizado",
        etapaKanban: "novo_lead_triagem",
        sobSupervisor: true,
        etapaCodigo: "handoff_humano",
      },
    ]);
    expect(txt(r.mensagens[0])).toContain("consultores");
    expect(r.kanbanSubetapa).toBe("novo_lead_triagem");
  });

  it("Limpeza de Nome entra direto na pergunta de permissão do produto (sem saudação duplicada)", async () => {
    const r = await responder("triagem_menu", {}, "1");
    expect(txt(r.mensagens[0])).toContain("4 perguntas rápidas");
    expect(r.etapaFinal?.conteudo.codigo).toBe("ln_passo2");
    expect(r.kanbanSubetapa).toBe("qualificacao");
  });
});

describe("delay automático (baseado no tamanho da mensagem, Luiz 15/08/2026)", () => {
  it("digitando fica ativo e o delay resolvido é sempre do tipo aleatório, dentro dos limites", async () => {
    const r = await responder("triagem_menu", {}, "1");
    expect(r.mensagens.length).toBeGreaterThan(0);
    for (const m of r.mensagens) {
      expect(m.digitando).toBe(true);
      expect(m.delay.tipo).toBe("aleatorio");
      if (m.delay.tipo !== "aleatorio") continue;
      expect(m.delay.min_segundos).toBeGreaterThanOrEqual(3.0);
      expect(m.delay.max_segundos).toBeLessThanOrEqual(6.0);
      expect(m.delay.min_segundos).toBeLessThanOrEqual(m.delay.max_segundos);
    }
  });

  it("mensagem mais longa recebe uma faixa de delay maior que uma mensagem curta", async () => {
    const curta = await responder("pergunta_nome", {}, "Maria"); // "Oi Maria, bom dia!..." — resposta curta
    const longa = await responder("triagem_menu", {}, "1"); // bloco de qualificação do LN — bem mais longo

    const delayCurta = curta.mensagens[0].delay;
    const delayLonga = longa.mensagens[0].delay;
    expect(delayCurta.tipo).toBe("aleatorio");
    expect(delayLonga.tipo).toBe("aleatorio");
    if (delayCurta.tipo !== "aleatorio" || delayLonga.tipo !== "aleatorio") return;
    expect(delayLonga.min_segundos).toBeGreaterThan(delayCurta.min_segundos);
  });

  it("nunca repete exatamente a mesma faixa — sempre sorteia um intervalo, não um valor fixo", async () => {
    const r = await responder("triagem_menu", {}, "1");
    const delay = r.mensagens[0].delay;
    expect(delay.tipo).toBe("aleatorio");
    if (delay.tipo !== "aleatorio") return;
    expect(delay.max_segundos).toBeGreaterThan(delay.min_segundos);
  });
});

describe("Limpeza de Nome — passo 8, mensagem condicional por origem", () => {
  it("inclui a mensagem extra quando o lead menciona ter encontrado pela internet", async () => {
    const r = await responder("ln_passo8", {}, "Já contratei antes e achei vocês pelo Instagram");
    // ln_passo11 não aguarda resposta — o percurso emenda direto até ln_passo12, que aguarda.
    expect(r.etapaFinal?.conteudo.codigo).toBe("ln_passo12");
    expect(r.mensagens.some((m) => txt(m).includes("mecanismos de busca"))).toBe(true);
  });

  it("pula a mensagem extra quando não há menção a canal digital", async () => {
    const r = await responder("ln_passo8", {}, "Nunca contratei, foi indicação de um amigo");
    expect(r.etapaFinal?.conteudo.codigo).toBe("ln_passo12");
    expect(r.mensagens.some((m) => txt(m).includes("mecanismos de busca"))).toBe(false);
  });
});

describe("variáveis de mensagem", () => {
  it("substitui [Primeiro_Nome] pelo primeiro nome e [saudacao] pela saudação da hora", async () => {
    const r = await responder("pergunta_nome", {}, "Maria Aparecida Silva");
    expect(r.mensagens.some((m) => txt(m) === "Oi Maria, bom dia! É um prazer atender você!")).toBe(
      true,
    );
  });
});

describe("Limpeza de Nome — baixo valor (<R$3 mil)", () => {
  it("resposta negativa à orientação de baixo valor marca oportunidade perdida", async () => {
    const dados: DadosConversa = { faixa_valor: "menos_10mil", faixa_valor_detalhe: "menos_3mil" };
    const r = await responder("ln_passo7", dados, "não");
    expect(r.etapaFinal).toBeNull();
    expect(r.efeitos).toEqual([
      { tipo: "marcar_perdida", motivo: "LEAD OPTOU POR NEGOCIAR DÍVIDA DIRETAMENTE" },
    ]);
    expect(r.kanbanSubetapa).toBe("perdida");
  });

  it("resposta positiva segue o fluxo e a proposta final usa o valor mínimo fixo", async () => {
    let dados: DadosConversa = { faixa_valor: "menos_10mil", faixa_valor_detalhe: "menos_3mil" };
    let r = await responder("ln_passo7", dados, "sim");
    dados = { ...dados, ...r.dadosNovos };

    // percorre o resto do fluxo linear até o roteador de proposta
    r = await responder("ln_passo8", dados, "primeira vez, indicação de amigo");
    dados = { ...dados, ...r.dadosNovos };
    r = await responder("ln_passo12", dados, "2"); // urgente
    dados = { ...dados, ...r.dadosNovos };
    r = await responder("ln_passo14", dados, "2"); // não é prioridade fechar hoje

    expect(r.etapaFinal?.conteudo.codigo).toBe("ln_passo15_normal");
    expect(r.mensagens.some((m) => txt(m).includes("899"))).toBe(true);
    expect(r.mensagens.some((m) => txt(m).includes("299"))).toBe(true);
  });
});

describe("Limpeza de Nome — faixa intermediária (10-30 mil)", () => {
  it("monta a proposta com os valores da tabela de preço, sem bloco de voucher se não pediu prioridade", async () => {
    const dados: DadosConversa = { faixa_valor: "10_30mil" };
    const r = await responder("ln_passo14", dados, "2"); // não
    expect(r.etapaFinal?.conteudo.codigo).toBe("ln_passo15_normal");
    expect(r.mensagens.some((m) => txt(m).includes("1.800"))).toBe(true);
    expect(r.mensagens.some((m) => txt(m).includes("Condição Especial"))).toBe(false);
  });

  it("inclui o bloco de voucher quando o lead topa prioridade hoje", async () => {
    const dados: DadosConversa = { faixa_valor: "10_30mil" };
    const r = await responder("ln_passo14", dados, "1"); // sim
    expect(r.mensagens.some((m) => txt(m).includes("Condição Especial"))).toBe(true);
    expect(r.mensagens.some((m) => txt(m).includes("1.290"))).toBe(true);
  });

  it("chega até o encerramento automatizado do MVP1 depois de coletar dados e documentos", async () => {
    let dados: DadosConversa = { faixa_valor: "10_30mil" };
    let r = await responder("ln_passo14", dados, "2");
    dados = { ...dados, ...r.dadosNovos };
    r = await responder("ln_passo15_normal", dados, "avista");
    dados = { ...dados, ...r.dadosNovos };
    r = await responder("ln_passo16_1", dados, "dia 20");
    dados = { ...dados, ...r.dadosNovos };
    r = await responder("ln_passo17a", dados, "CPF 111.111.111-11, João da Silva");
    dados = { ...dados, ...r.dadosNovos };
    r = await responder("ln_passo17b", dados, "dados completos do assinante...");
    dados = { ...dados, ...r.dadosNovos };
    r = await responder("ln_passo18", dados, "vou enviar os documentos depois");

    expect(r.etapaFinal).toBeNull();
    expect(r.efeitos).toEqual([
      {
        tipo: "encerrar_fluxo_automatizado",
        etapaKanban: "dados_contrato",
        sobSupervisor: true,
        etapaCodigo: "ln_encerramento",
      },
    ]);
    expect(txt(r.mensagens[0])).toContain("Perfeito");
    expect(r.kanbanSubetapa).toBe("dados_contrato");
  });
});

describe("Limpeza de Nome — alto valor (>R$500 mil)", () => {
  it("classifica como alto valor e oferece a call em vez da proposta direto", async () => {
    const interpretarFaixasDocumentos = async () => ({
      status: "completo" as const,
      itens: [{ tipo: "cpf" as const, valorAproximado: 800_000 }],
    });
    let dados: DadosConversa = { documentos_tipos: "cpf" };
    let r = await avancarConversa({
      etapaAtual: etapasPorCodigo["ln_passo6"],
      etapasPorCodigo,
      dados,
      respostaLead: "uns 800 mil",
      resolverMensagensDinamicas,
      calcularDadosDerivados,
      interpretarFaixasDocumentos,
      variaveisGlobais: VARIAVEIS_GLOBAIS,
    });
    dados = { ...dados, ...r.dadosNovos };
    expect(dados.alto_valor).toBe("sim");

    r = await responder("ln_passo8", dados, "primeira vez, achei no Google");
    dados = { ...dados, ...r.dadosNovos };
    r = await responder("ln_passo12", dados, "2");
    dados = { ...dados, ...r.dadosNovos };
    r = await responder("ln_passo14", dados, "1");

    // Substitui a antiga oferta de call — spec 2026-08-20-agendamento-consultor-alto-valor.md.
    expect(r.etapaFinal?.conteudo.codigo).toBe("ln_agendamento_oferta");
    expect(r.mensagens.some((m) => txt(m).includes("ligação"))).toBe(true);
  });

  it("quando aceita agendar, vai pro checkpoint de escolha de horário (não escala direto)", async () => {
    const dados: DadosConversa = { alto_valor: "sim", valor_restricao_estimado: "800000" };
    const r = await responder("ln_agendamento_oferta", dados, "1");
    // Sem `agenda` (disponibilidadeConsultor/agendamentosExistentes) neste calcularDadosDerivados de
    // teste, nenhum horário é pré-calculado — o checkpoint é alcançado mesmo assim, só sem opções
    // reais (coberto à parte no describe de agendamento, com `agenda` fornecida).
    expect(r.etapaFinal?.conteudo.codigo).toBe("ln_agendamento_horario");
    expect(r.efeitos).toEqual([]);
  });

  it("dívida alta: recusar 1x não escala direto — a Malala insiste antes de aceitar a recusa", async () => {
    // Achado via editor de fluxo (spec 2026-08-21): recusar não pode ir direto pro handoff quando o
    // motivo é dívida alta — a ligação é obrigatória nesse caso (decisão de Luiz).
    const dados: DadosConversa = { alto_valor: "sim", valor_restricao_estimado: "800000" };
    const r = await responder("ln_agendamento_oferta", dados, "2");
    expect(r.etapaFinal?.conteudo.codigo).toBe("ln_agendamento_insistencia");
    expect(r.efeitos).toEqual([]);
    expect(r.mensagens.some((m) => txt(m).includes("consultor especializado"))).toBe(true);
  });

  it("dívida alta: recusar 2x (insiste e recusa de novo) escala pro supervisor e encerra o automatizado", async () => {
    const dados: DadosConversa = { alto_valor: "sim", valor_restricao_estimado: "800000" };
    const r = await responder("ln_agendamento_insistencia", dados, "2");
    expect(r.etapaFinal).toBeNull();
    expect(r.efeitos).toEqual([
      {
        tipo: "encerrar_fluxo_automatizado",
        etapaKanban: "negociacao_duvidas",
        sobSupervisor: true,
        etapaCodigo: "ln_call_agendada",
      },
    ]);
    expect(r.kanbanSubetapa).toBe("negociacao_duvidas");
    expect(r.mensagens.some((m) => txt(m).includes("especialista"))).toBe(true);
  });

  it("dívida alta: aceitar na insistência vai pro checkpoint de escolha de horário, não escala", async () => {
    const dados: DadosConversa = { alto_valor: "sim", valor_restricao_estimado: "800000" };
    const r = await responder("ln_agendamento_insistencia", dados, "1");
    expect(r.etapaFinal?.conteudo.codigo).toBe("ln_agendamento_horario");
    expect(r.efeitos).toEqual([]);
  });

  it("pacote caro (sem dívida alta): recusar vai direto pro self-service, sem insistência nem handoff", async () => {
    const dados: DadosConversa = { pacote_caro: "sim", alto_valor: "nao", valor_restricao_estimado: "2000" };
    const r = await responder("ln_agendamento_oferta", dados, "2");
    expect(r.etapaFinal?.conteudo.codigo).toBe("ln_passo15_selfservice");
    expect(r.efeitos).toEqual([]);
  });
});

describe("Agendamento com consultor (spec 2026-08-20-agendamento-consultor-alto-valor.md)", () => {
  it("escolher 'Acima de X mil' no menu do ln_passo6 pula direto pro agendamento, sem perguntar os outros documentos", async () => {
    const interpretarFaixasDocumentos = async () => ({ status: "acima_do_corte" as const });
    const r = await avancarConversa({
      etapaAtual: etapasPorCodigo["ln_passo6"],
      etapasPorCodigo,
      dados: { documentos_tipos: "cpf,cnpj" },
      respostaLead: "acima de 500 mil",
      resolverMensagensDinamicas,
      calcularDadosDerivados,
      interpretarFaixasDocumentos,
      variaveisGlobais: VARIAVEIS_GLOBAIS,
    });
    expect(r.dadosNovos.alto_valor).toBe("sim");
    expect(r.etapaFinal?.conteudo.codigo).toBe("ln_agendamento_oferta");
    expect(r.naoReconhecido).toBe(false);
  });

  it("ponta a ponta: aceita agendar, escolhe um dos 2 horários, e dispara o efeito agendar_consultor com o horário certo", async () => {
    const agora = new Date("2026-08-20T11:00:00Z"); // quinta, 08h São Paulo — mesma base de agenda-consultor.test.ts
    const calcularComAgenda = criarCalculadoraDadosDerivados(CONFIG, FAIXAS_PRECOS, {
      disponibilidadeConsultor: [
        { diaSemana: 1, horaInicio: 10, horaFim: 21 },
        { diaSemana: 2, horaInicio: 10, horaFim: 21 },
        { diaSemana: 3, horaInicio: 10, horaFim: 21 },
        { diaSemana: 4, horaInicio: 10, horaFim: 21 },
        { diaSemana: 5, horaInicio: 10, horaFim: 21 },
      ],
      agendamentosExistentes: [],
    });

    let dados: DadosConversa = { alto_valor: "sim", valor_restricao_estimado: "800000" };
    let r = await avancarConversa({
      etapaAtual: etapasPorCodigo["ln_agendamento_oferta"],
      etapasPorCodigo,
      dados,
      respostaLead: "1",
      resolverMensagensDinamicas,
      calcularDadosDerivados: calcularComAgenda,
      variaveisGlobais: VARIAVEIS_GLOBAIS,
    });
    dados = { ...dados, ...r.dadosNovos };
    expect(r.etapaFinal?.conteudo.codigo).toBe("ln_agendamento_horario");
    expect(dados._agendamento_opcao_1_inicio).toBeDefined();
    expect(r.mensagens.some((m) => txt(m).includes("horários"))).toBe(true);

    // Nota: as datas concretas dependem de `new Date()` real (agora não é injetável neste ponto do
    // motor) — a asserção verifica só que a escolha "1" propaga o horário calculado de verdade pro
    // efeito, não um valor fixo (agenda-consultor.test.ts já cobre o cálculo isolado com `agora` fixo).
    void agora;
    r = await responder("ln_agendamento_horario", dados, "1");
    // ln_agendamento_confirmado não espera resposta (aguarda_resposta: false) — termina o turno
    // como etapaFinal null, igual qualquer checkpoint de encerramento (ex.: ln_call_agendada acima).
    expect(r.etapaFinal).toBeNull();
    expect(r.efeitos).toEqual([
      {
        tipo: "encerrar_fluxo_automatizado",
        etapaKanban: "negociacao_duvidas",
        sobSupervisor: true,
        etapaCodigo: "ln_agendamento_confirmado",
      },
      { tipo: "agendar_consultor", inicio: dados._agendamento_opcao_1_inicio, fim: dados._agendamento_opcao_1_fim, motivo: "divida_alta" },
    ]);
    expect(r.mensagens.some((m) => txt(m).includes("Agendado"))).toBe(true);
  });
});

describe("regra de desvio (resposta não reconhecida)", () => {
  it("repete a pergunta original em vez de avançar", async () => {
    const r = await responder("ln_passo4", {}, "qual o site de vocês?");
    expect(r.naoReconhecido).toBe(true);
    expect(r.etapaFinal?.conteudo.codigo).toBe("ln_passo4");
    expect(txt(r.mensagens[0])).toContain("CPF");
  });

  it("com o interpretador de faixas por documento, usa os valores que ele retorna em vez de repetir a pergunta", async () => {
    const interpretarFaixasDocumentos = async () => ({
      status: "completo" as const,
      itens: [{ tipo: "cpf" as const, valorAproximado: 250_000 }],
    });
    const r = await avancarConversa({
      etapaAtual: etapasPorCodigo["ln_passo6"],
      etapasPorCodigo,
      dados: { documentos_tipos: "cpf" },
      respostaLead: "umas duzentas e cinquenta mil, mais ou menos",
      resolverMensagensDinamicas,
      calcularDadosDerivados,
      interpretarFaixasDocumentos,
      variaveisGlobais: VARIAVEIS_GLOBAIS,
    });
    expect(r.naoReconhecido).toBe(false);
    expect(r.interpretadoPorIA).toBe(true);
    expect(r.dadosNovos.documentos_valores).toBe("250000");
  });

  it("aceita 'não sei' pra um documento do pacote sem bloquear o checkpoint", async () => {
    const interpretarFaixasDocumentos = async () => ({
      status: "completo" as const,
      itens: [
        { tipo: "cpf" as const, valorAproximado: 15_000 },
        { tipo: "cnpj" as const, valorAproximado: null },
      ],
    });
    const r = await avancarConversa({
      etapaAtual: etapasPorCodigo["ln_passo6"],
      etapasPorCodigo,
      dados: { documentos_tipos: "cpf,cnpj" },
      respostaLead: "o CPF tem uns 15 mil, o CNPJ não sei",
      resolverMensagensDinamicas,
      calcularDadosDerivados,
      interpretarFaixasDocumentos,
      variaveisGlobais: VARIAVEIS_GLOBAIS,
    });
    expect(r.naoReconhecido).toBe(false);
    expect(r.dadosNovos.documentos_valores).toBe("15000,nao_sei");
  });
});

describe("lista_documentos — memória entre turnos (correção 19/08/2026, log real de produção)", () => {
  it("incompleto com contagem proposta: dadosNovos carrega a proposta pro próximo turno confirmar", async () => {
    const interpretarListaDocumentos = async () => ({
      status: "incompleto" as const,
      perguntaEsclarecimento: "Perfeito! Você quer limpar 1 CPF e 1 CNPJ, é isso?",
      dadosParciais: {
        _doc_pergunta_pendente: "Perfeito! Você quer limpar 1 CPF e 1 CNPJ, é isso?",
        _doc_cpf_proposto: "1",
        _doc_cnpj_proposto: "1",
      },
    });
    const r = await avancarConversa({
      etapaAtual: etapasPorCodigo["ln_passo4"],
      etapasPorCodigo,
      dados: {},
      respostaLead: "meu cpf e o cnpj da minha mulher",
      resolverMensagensDinamicas,
      calcularDadosDerivados,
      interpretarListaDocumentos,
      variaveisGlobais: VARIAVEIS_GLOBAIS,
    });
    expect(r.naoReconhecido).toBe(true);
    expect(r.etapaFinal?.conteudo.codigo).toBe("ln_passo4");
    expect(r.dadosNovos).toEqual({
      _doc_pergunta_pendente: "Perfeito! Você quer limpar 1 CPF e 1 CNPJ, é isso?",
      _doc_cpf_proposto: "1",
      _doc_cnpj_proposto: "1",
    });
    expect(txt(r.mensagens[0])).toContain("1 CPF e 1 CNPJ");
  });

  it("no turno seguinte, a proposta e a pergunta pendente chegam em `dados` pro interpretador confirmar", async () => {
    let dadosRecebidos: DadosConversa | undefined;
    const interpretarListaDocumentos = async ({ dados }: { dados: DadosConversa }) => {
      dadosRecebidos = dados;
      return { status: "completo" as const, itens: [{ tipo: "cpf" as const }, { tipo: "cnpj" as const }] };
    };
    await avancarConversa({
      etapaAtual: etapasPorCodigo["ln_passo4"],
      etapasPorCodigo,
      dados: {
        _doc_pergunta_pendente: "Perfeito! Você quer limpar 1 CPF e 1 CNPJ, é isso?",
        _doc_cpf_proposto: "1",
        _doc_cnpj_proposto: "1",
      },
      respostaLead: "sim",
      resolverMensagensDinamicas,
      calcularDadosDerivados,
      interpretarListaDocumentos,
      variaveisGlobais: VARIAVEIS_GLOBAIS,
    });
    expect(dadosRecebidos?._doc_pergunta_pendente).toBe("Perfeito! Você quer limpar 1 CPF e 1 CNPJ, é isso?");
    expect(dadosRecebidos?._doc_cpf_proposto).toBe("1");
    expect(dadosRecebidos?._doc_cnpj_proposto).toBe("1");
  });
});

describe("checkpoint opcional (opcional_apos_tentativas, PLANO_MESTRE seção 8.12)", () => {
  it("abertura_email: pergunta inicial NÃO inclui a justificativa (correção 18/08/2026 — saía junto antes do lead poder responder)", async () => {
    const r = await responder("abertura_telefone", {}, "11988887777");
    expect(r.etapaFinal?.conteudo.codigo).toBe("abertura_email");
    expect(r.mensagens.some((m) => txt(m).includes("proposta por escrito"))).toBe(false);
  });

  it("abertura_email: 1ª tentativa não reconhecida repete a pergunta, MOSTRA a justificativa, e conta a tentativa em dados", async () => {
    const r = await responder("abertura_email", {}, "pra que vocês querem meu e-mail?");
    expect(r.naoReconhecido).toBe(true);
    expect(r.etapaFinal?.conteudo.codigo).toBe("abertura_email");
    expect(r.dadosNovos["_tentativas:abertura_email"]).toBe("1");
    expect(r.mensagens.some((m) => txt(m).includes("proposta por escrito"))).toBe(true);
  });

  it("abertura_email: desiste na 2ª tentativa e segue em frente com e-mail vazio, sem travar o funil", async () => {
    const r = await responder("abertura_email", { "_tentativas:abertura_email": "1" }, "não tenho e-mail não");
    expect(r.naoReconhecido).toBe(false);
    expect(r.dadosNovos.email).toBe("");
    expect(r.etapaFinal?.conteudo.codigo).toBe("triagem_menu");
  });

  it("checkpoint sem opcional_apos_tentativas nunca desiste, mesmo depois de muitas tentativas", async () => {
    const r = await responder("ln_passo4", { "_tentativas:ln_passo4": "99" }, "sei lá");
    expect(r.naoReconhecido).toBe(true);
    expect(r.etapaFinal?.conteudo.codigo).toBe("ln_passo4");
  });
});

describe("negociacao_pagamento", () => {
  const dadosBase: DadosConversa = {
    forma_pagamento: "parcelado",
    forma_pagamento_detalhe: "boleto_pix",
    data_primeira_parcela: "2026-08-18",
    dia_ancora_parcelas: "10",
    parcelas_valores: "640.00,640.00,640.00,640.00,640.00,640.00",
    parcelas_vencimentos: "2026-08-18,2026-09-10,2026-10-10,2026-11-10,2026-12-10,2027-01-10",
  };

  it("confirmado: grava o composto final em campoSalvo e avanca", async () => {
    const resultado = await avancarConversa({
      etapaAtual: etapasPorCodigo["ln_passo16_1"],
      etapasPorCodigo,
      dados: dadosBase,
      respostaLead: "confirmo",
      resolverMensagensDinamicas,
      calcularDadosDerivados,
      interpretarNegociacaoPagamento: async () => ({ status: "confirmado" }),
      variaveisGlobais: VARIAVEIS_GLOBAIS,
    });
    expect(resultado.naoReconhecido).toBe(false);
    expect(resultado.dadosNovos.detalhe_pagamento_confirmado_bruto).toBe(
      "boleto_pix|2026-08-18|10|640.00,640.00,640.00,640.00,640.00,640.00|2026-08-18,2026-09-10,2026-10-10,2026-11-10,2026-12-10,2027-01-10",
    );
    expect(resultado.etapaFinal?.conteudo.codigo).toBe("ln_passo17a");
  });

  it("ajuste_valido: persiste o ajuste, permanece no checkpoint", async () => {
    const resultado = await avancarConversa({
      etapaAtual: etapasPorCodigo["ln_passo16_1"],
      etapasPorCodigo,
      dados: dadosBase,
      respostaLead: "pode ser no cartão?",
      resolverMensagensDinamicas,
      calcularDadosDerivados,
      interpretarNegociacaoPagamento: async () => ({
        status: "ajuste_valido",
        formaPagamento: "cartao",
        dataPrimeiraParcela: "2026-08-18",
        diaAncora: 10,
        mensagemConfirmando: "Combinado, ajustei pra cartão!",
      }),
      variaveisGlobais: VARIAVEIS_GLOBAIS,
    });
    expect(resultado.etapaFinal?.conteudo.codigo).toBe("ln_passo16_1");
    expect(resultado.naoReconhecido).toBe(true);
    expect(resultado.dadosNovos.forma_pagamento_detalhe).toBe("cartao");
    expect(resultado.dadosNovos.parcelas_vencimentos).toBe(dadosBase.parcelas_vencimentos);
    expect(txt(resultado.mensagens[0])).toBe("Combinado, ajustei pra cartão!");
  });

  it("ajuste_valido com nova data: recalcula parcelas_vencimentos a partir da nova 1a parcela", async () => {
    const resultado = await avancarConversa({
      etapaAtual: etapasPorCodigo["ln_passo16_1"],
      etapasPorCodigo,
      dados: dadosBase,
      respostaLead: "posso pagar a primeira daqui a 10 dias?",
      resolverMensagensDinamicas,
      calcularDadosDerivados,
      interpretarNegociacaoPagamento: async () => ({
        status: "ajuste_valido",
        formaPagamento: "boleto_pix",
        dataPrimeiraParcela: "2026-08-28",
        diaAncora: 10,
        mensagemConfirmando: "Fechado, dia 28!",
      }),
      variaveisGlobais: VARIAVEIS_GLOBAIS,
    });
    expect(resultado.dadosNovos.data_primeira_parcela).toBe("2026-08-28");
    const vencimentos = resultado.dadosNovos.parcelas_vencimentos?.split(",");
    expect(vencimentos?.[0]).toBe("2026-08-28");
    expect(vencimentos?.[1]).toBe("2026-09-10");
  });

  it("negociando: manda a mensagem de negociacao, nao persiste nada, permanece no checkpoint", async () => {
    const resultado = await avancarConversa({
      etapaAtual: etapasPorCodigo["ln_passo16_1"],
      etapasPorCodigo,
      dados: dadosBase,
      respostaLead: "quero pagar dia 15 de cada mês",
      resolverMensagensDinamicas,
      calcularDadosDerivados,
      interpretarNegociacaoPagamento: async () => ({
        status: "negociando",
        mensagemNegociacao: "Só temos os dias 01, 10 ou 20 como opção — qual prefere?",
      }),
      variaveisGlobais: VARIAVEIS_GLOBAIS,
    });
    expect(resultado.etapaFinal?.conteudo.codigo).toBe("ln_passo16_1");
    expect(resultado.naoReconhecido).toBe(true);
    expect(resultado.dadosNovos).toEqual({});
    expect(txt(resultado.mensagens[0])).toBe("Só temos os dias 01, 10 ou 20 como opção — qual prefere?");
  });
});

describe("Desvio (spec 2026-08-21-desvio-escalar-quando-nao-sabe.md) — regra de Luiz: nunca adivinhar nem protelar", () => {
  const etapaGenerica = {
    id: "etapa-teste-desvio",
    fluxoId: "fluxo-limpeza-nome",
    ordem: 1,
    campoSalvo: "confirmacao_teste",
    agendaFollowupId: null,
    conteudo: {
      codigo: "checkpoint_teste_desvio",
      mensagens: [{ tipo: "texto" as const, texto: "Com quem eu falo?" }],
      aguarda_resposta: true,
      tipo_resposta: "menu" as const,
      opcoes: [
        { valor: "sim", rotulos: ["sim"], proximo_codigo: "proxima_etapa" },
        { valor: "nao", rotulos: ["nao"], proximo_codigo: "proxima_etapa" },
      ],
      interpretacao_ia: { habilitado: true },
    },
  };

  it("FAQ bate: responde com o texto oficial + retoma a pergunta pendente na mesma mensagem, sem avançar", async () => {
    const resultado = await avancarConversa({
      etapaAtual: etapaGenerica,
      etapasPorCodigo,
      dados: {},
      respostaLead: "vocês trabalham com CNPJ também?",
      resolverMensagensDinamicas,
      calcularDadosDerivados,
      interpretarComIA: async () => null,
      interpretarDesvio: async () => ({ status: "faq", faq: { pergunta: "Trabalham com CNPJ?", resposta: "Sim, atendemos CPF e CNPJ." } }),
      variaveisGlobais: VARIAVEIS_GLOBAIS,
    });
    expect(resultado.etapaFinal?.conteudo.codigo).toBe("checkpoint_teste_desvio");
    expect(resultado.naoReconhecido).toBe(true);
    expect(resultado.efeitos).toEqual([]);
    expect(resultado.dadosNovos).toEqual({});
    expect(txt(resultado.mensagens[0])).toBe("Sim, atendemos CPF e CNPJ.\n\nCom quem eu falo?");
  });

  it("nada bate (escalar): encerra o automatizado e escala pro supervisor com o motivo certo, sem repetir a pergunta ignorando o lead", async () => {
    const resultado = await avancarConversa({
      etapaAtual: etapaGenerica,
      etapasPorCodigo,
      dados: {},
      respostaLead: "vocês fazem consórcio de imóveis?",
      resolverMensagensDinamicas,
      calcularDadosDerivados,
      interpretarComIA: async () => null,
      interpretarDesvio: async () => ({ status: "escalar" }),
      variaveisGlobais: VARIAVEIS_GLOBAIS,
    });
    expect(resultado.etapaFinal).toBeNull();
    expect(resultado.naoReconhecido).toBe(false);
    expect(resultado.efeitos).toEqual([
      { tipo: "escalar_supervisor", motivo: 'Pergunta fora do escopo ou desconhecida: "vocês fazem consórcio de imóveis?"' },
    ]);
    expect(resultado.mensagens.length).toBeGreaterThan(0);
  });
});
