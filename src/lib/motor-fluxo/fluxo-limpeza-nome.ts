// Conteúdo real do script de atendimento (docs/SCRIPT_LIMPANOME_SERASA_SPC.md) traduzido pro
// formato genérico do motor de fluxo. Isto é o que, no sistema rodando, mora em `etapas_fluxo`
// (editável pelo admin sem deploy) — aqui é a fonte usada para (a) os testes do motor
// (engine.test.ts) e (b) gerar o seed inicial dessas tabelas (scripts/gerar-seed.ts). Depois do
// primeiro seed, o banco é que manda — este arquivo só volta a ser referência se precisarmos
// re-semear do zero.
//
// Escopo automatizado do MVP1 (confirmado com Luiz em 13/08/2026): a Malala conduz o atendimento
// até a etapa "ln_encerramento" (solicitação de dados e documentos para o contrato, Passos 17-18).
// Elaboração do contrato e cobrança continuam manuais nesta versão — ver PLANO_MESTRE seção 8.10.
//
// `kanban_subetapa` de cada etapa segue o vocabulário de KANBAN_COMERCIAL_LIMPANOME.md (mesmos
// slugs usados em `oportunidades.etapa_kanban`): novo_lead_triagem (1.1) → qualificacao (1.2) →
// faixa_divida (2.1) → envio_proposta (2.2) → negociacao_duvidas (2.3) → dados_contrato (3.1).
// 3.2/3.3/4.1/4.2 (assinatura_digital/pagamento/ganha/perdida) ficam fora do automatizado do MVP1,
// exceto "perdida" que o motor já atribui sozinho quando `encerra_com_perda` dispara (engine.ts).

import { dataDeHojeISO, expandirParcelas, type DiaAncora } from "./calculo-vencimentos-pagamento";
import { tipoEtapaDb } from "./db";
import { extrairDadosAbertura } from "./extracao";
import type { ConteudoEtapa, DadosConversa, EtapaCarregada, MensagemEtapa } from "./tipos";
import {
  calcularFormulaAltoValor,
  classificarAltoValor,
  combinarFaixasPacote,
  CORTE_PACOTE_CARO,
  type ConfigPrecificacaoLimpaNome,
  type FaixaPreco,
  formatarDataBr,
  formatarMenuFaixas,
  formatarReais,
  type ParcelaTier,
  montarConfirmacaoAgendamento,
  montarHorariosAgendamento,
  montarInsistenciaAgendamento,
  montarOfertaAgendamentoConsultor,
  montarPropostaAltoValorSelfService,
  montarPropostaBaixoValor,
  montarPropostaPorFaixa,
  resolverValorRestricao,
} from "./regras-limpeza-nome";
import { calcularHorariosDisponiveis, type JanelaDisponibilidade, type PeriodoOcupado } from "./agenda-consultor";

export type DefinicaoEtapa = {
  codigo: string;
  ordem: number;
  campoSalvo: string | null;
  conteudo: ConteudoEtapa;
};

/** Atalho pra mensagem de texto simples — a maioria do script é só isso; mídia/pix/localização/contato usam o formato completo direto. */
function t(texto: string): MensagemEtapa {
  return { tipo: "texto", texto };
}

// Slugs do Kanban (mesmo vocabulário de oportunidades.etapa_kanban) — ver cabeçalho do arquivo.
const KANBAN_TRIAGEM = "novo_lead_triagem";
const KANBAN_QUALIFICACAO = "qualificacao";
const KANBAN_FAIXA_DIVIDA = "faixa_divida";
const KANBAN_ENVIO_PROPOSTA = "envio_proposta";
const KANBAN_NEGOCIACAO_DUVIDAS = "negociacao_duvidas";
const KANBAN_DADOS_CONTRATO = "dados_contrato";

// ---------------------------------------------------------------------------
// Fluxo geral — Abertura + Triagem (roda antes do produto ser conhecido, produto_id nulo)
// ---------------------------------------------------------------------------

export const NOME_FLUXO_ABERTURA_TRIAGEM = "Abertura e Triagem";

export const ETAPAS_ABERTURA_TRIAGEM: DefinicaoEtapa[] = [
  {
    // Sempre dispara, independente do que o lead já disse — é só cortesia/marca, não coleta dado
    // nenhum, então nunca é pulada pela regra de "checkpoint já respondido" (só se aplica a etapas
    // que aguardam resposta).
    codigo: "saudacao_inicial",
    ordem: 1,
    campoSalvo: null,
    conteudo: {
      codigo: "saudacao_inicial",
      mensagens: [
        {
          tipo: "imagem",
          midia_url: "",
          legenda: "Foto da Malala (avatar/mascote — moldura navy/dourado, ver referência visual do script)",
        },
        t(
          "🙋‍♂️🙋‍♂️ Olá, eu sou Malala, consultora digital especializada em recuperação e acesso a crédito aqui na ArrudaCred!",
        ),
      ],
      aguarda_resposta: false,
      proximo_codigo: "pergunta_nome",
      kanban_subetapa: KANBAN_TRIAGEM,
    },
  },
  {
    // Pulada automaticamente se `dados.nome` já veio da primeira mensagem do lead (regra de
    // checkpoint já respondido — ver extracao.ts e o hook `proximoSeJaConhecido` do motor).
    codigo: "pergunta_nome",
    ordem: 2,
    campoSalvo: "nome",
    conteudo: {
      codigo: "pergunta_nome",
      mensagens: [t("👉 *Com quem eu falo?*")],
      aguarda_resposta: true,
      tipo_resposta: "texto_livre",
      proximo_codigo: "saudacao_personalizada",
      kanban_subetapa: KANBAN_TRIAGEM,
      interpretacao_ia: {
        habilitado: true,
        instrucao:
          "O lead pode responder de formas que a extração automática de nome não reconhece (ex.: nome com escrita incomum, ou frase mista tipo 'aqui é o zé, blz?'). Extraia só o primeiro nome da pessoa. Se a mensagem for só uma saudação sem nome nenhum (ex.: 'oi', 'bom dia'), marque como não interpretado.",
      },
    },
  },
  {
    // Sempre dispara assim que o nome é conhecido — seja porque o lead acabou de responder
    // `pergunta_nome`, seja porque o nome já veio pronto da extração da abertura (nesse caso, o
    // motor pula `pergunta_nome` silenciosamente e cai direto aqui). Corrige um erro do desenho
    // original do script: esta saudação estava duplicada como "Passo 1" do fluxo de Limpeza de
    // Nome (ln_passo1, removido) — ela é única, acontece uma vez na abertura, não de novo por
    // produto (ajuste de 14/08/2026, ver SCRIPT_LIMPANOME_SERASA_SPC.md).
    codigo: "saudacao_personalizada",
    ordem: 3,
    campoSalvo: null,
    conteudo: {
      codigo: "saudacao_personalizada",
      mensagens: [t("Oi [Primeiro_Nome], [saudacao]! É um prazer atender você!")],
      aguarda_resposta: false,
      proximo_codigo: "abertura_telefone",
      kanban_subetapa: KANBAN_TRIAGEM,
    },
  },
  {
    // Pulada quando o canal já fornece o telefone (WhatsApp/Telegram) — o adaptador daquele canal
    // pré-preenche `dados.telefone` antes do motor rodar (Fase 7). Em canais sem número nativo
    // (widget do site, Instagram Direct) ela pergunta normalmente.
    codigo: "abertura_telefone",
    ordem: 4,
    campoSalvo: "telefone",
    conteudo: {
      codigo: "abertura_telefone",
      mensagens: [t("Pra eu continuar seu atendimento, me confirma um WhatsApp ou telefone de contato:")],
      aguarda_resposta: true,
      tipo_resposta: "texto_livre",
      proximo_codigo: "abertura_email",
      kanban_subetapa: KANBAN_TRIAGEM,
    },
  },
  {
    // Justificativa de valor + limite de tentativas — PLANO_MESTRE seção 8.12 (decisão de Luiz,
    // 17/08/2026): pedir e-mail sem dizer pra quê gerava resistência, e o checkpoint não tinha
    // saída quando o lead recusava/insistia que não tinha. `opcional_apos_tentativas: 2` garante
    // que nunca trava o funil.
    // Correção 18/08/2026 (Luiz, teste ao vivo): a justificativa saía junto da pergunta, no mesmo
    // turno, antes do lead ter chance de responder — parecia forçado. Agora só a pergunta é fixa
    // aqui; a justificativa vira a mensagem de retomada (2ª tentativa em diante), gerada por
    // criarResolverMensagensDinamicas com base em `dados["_tentativas:abertura_email"]` — só
    // aparece se o lead não respondeu (ou recusou/questionou o motivo, o que também não bate como
    // e-mail válido e cai no mesmo caminho de retomada).
    codigo: "abertura_email",
    ordem: 5,
    campoSalvo: "email",
    conteudo: {
      codigo: "abertura_email",
      mensagens: [t("Pra eu te atender melhor, me confirma também seu e-mail:")],
      aguarda_resposta: true,
      tipo_resposta: "email",
      proximo_codigo: "triagem_menu",
      kanban_subetapa: KANBAN_TRIAGEM,
      opcional_apos_tentativas: 2,
      interpretacao_ia: {
        habilitado: true,
        instrucao:
          "O lead pode escrever o e-mail com erros de digitação, espaços, ou por extenso (ex.: 'joao arroba gmail ponto com'). Extraia e normalize para o formato padrão nome@dominio.com. Se a mensagem claramente não contém um e-mail (ex.: pergunta 'pra quê', diz que não tem, ou ignora o pedido), marque como não interpretado — não insista nem invente um e-mail.",
      },
    },
  },
  {
    codigo: "triagem_menu",
    ordem: 6,
    campoSalvo: "produto_interesse",
    conteudo: {
      codigo: "triagem_menu",
      mensagens: [
        t(
          "Para agilizar seu atendimento, informe o número da opção:\n\n1️⃣ Limpeza de Nome (CPF/CNPJ)\n2️⃣ Aumento de Score / Rating\n3️⃣ BACEN / SCR / CCF\n4️⃣ Jusbrasil / Escavador\n5️⃣ Conta Protegida (Bloqueio Judicial)\n6️⃣ Consórcio\n7️⃣ Crédito / Financiamento\n8️⃣ Outro assunto\n\n👉 *É só responder com o número da opção* 😊",
        ),
      ],
      aguarda_resposta: true,
      tipo_resposta: "menu",
      opcoes: [
        { valor: "limpeza_nome", rotulos: ["1", "1️⃣"], proximo_codigo: "ln_passo2" },
        { valor: "score", rotulos: ["2", "2️⃣"], proximo_codigo: "handoff_humano" },
        { valor: "bacen_scr_ccf", rotulos: ["3", "3️⃣"], proximo_codigo: "handoff_humano" },
        { valor: "jusbrasil_escavador", rotulos: ["4", "4️⃣"], proximo_codigo: "handoff_humano" },
        { valor: "conta_protegida", rotulos: ["5", "5️⃣"], proximo_codigo: "handoff_humano" },
        { valor: "consorcio", rotulos: ["6", "6️⃣"], proximo_codigo: "handoff_humano" },
        { valor: "credito", rotulos: ["7", "7️⃣"], proximo_codigo: "handoff_humano" },
        { valor: "outro_assunto", rotulos: ["8", "8️⃣"], proximo_codigo: "handoff_humano" },
      ],
      kanban_subetapa: KANBAN_TRIAGEM,
      interpretacao_ia: {
        habilitado: true,
        instrucao:
          "O lead pode responder em texto livre em vez do número da opção (ex.: 'preciso limpar meu nome' em vez de '1', 'quero saber sobre o score' em vez de '2'). Escolha a opção que melhor corresponde à intenção dele — se a mensagem não tiver relação clara com nenhuma das 8 opções, não force uma escolha.",
      },
    },
  },
  {
    codigo: "handoff_humano",
    ordem: 7,
    campoSalvo: null,
    conteudo: {
      codigo: "handoff_humano",
      mensagens: [
        t(
          "Perfeito! Esse assunto eu já vou encaminhar direto para um de nossos consultores te ajudar — só um instante 🙋‍♂️",
        ),
      ],
      aguarda_resposta: false,
      encerramento: { sob_supervisor: true },
      kanban_subetapa: KANBAN_TRIAGEM,
    },
  },
];

// ---------------------------------------------------------------------------
// Fluxo do produto — Limpeza de Nome (CPF/CNPJ) Serasa/SPC
// ---------------------------------------------------------------------------

export const NOME_FLUXO_LIMPEZA_NOME = "Atendimento — Limpeza de Nome Serasa/SPC";

export const ETAPAS_LIMPEZA_NOME: DefinicaoEtapa[] = [
  {
    codigo: "ln_passo2",
    ordem: 2,
    campoSalvo: null,
    conteudo: {
      codigo: "ln_passo2",
      mensagens: [
        t(
          "🤔 Se você responder 4 perguntas rápidas, em menos de um minuto eu já consigo informar o valor exato para limpar o seu nome. Depois disso, tiro todas as suas dúvidas e, se preferir, também podemos conversar por ligação.\n\n👉 *Podemos começar?*",
        ),
      ],
      aguarda_resposta: true,
      tipo_resposta: "sim_nao",
      opcoes: [
        { valor: "sim", rotulos: ["sim", "s"], proximo_codigo: "ln_passo3" },
        { valor: "nao", rotulos: ["nao", "n"], proximo_codigo: "ln_aguardar_melhor_momento" },
      ],
      kanban_subetapa: KANBAN_QUALIFICACAO,
      interpretacao_ia: {
        habilitado: true,
        instrucao:
          "O lead pode responder de forma livre em vez de 'sim'/'não' (ex.: 'claro', 'pode perguntar', 'não quero agora', 'depois'). Escolha 'sim' ou 'nao' conforme a intenção.",
      },
    },
  },
  {
    codigo: "ln_aguardar_melhor_momento",
    ordem: 3,
    campoSalvo: null,
    conteudo: {
      codigo: "ln_aguardar_melhor_momento",
      mensagens: [t("Sem problema! Fico por aqui e retomo com você mais tarde, combinado? 🙂")],
      aguarda_resposta: false,
      encerramento: { sob_supervisor: false },
      kanban_subetapa: KANBAN_QUALIFICACAO,
    },
  },
  {
    codigo: "ln_passo3",
    ordem: 4,
    campoSalvo: null,
    conteudo: {
      codigo: "ln_passo3",
      mensagens: [
        t(
          "✅ A proposta do nosso trabalho é remover as restrições que estão negativando seu CPF ou CNPJ — independentemente da origem: contas não pagas, cartão de crédito, empréstimos, financiamentos, protestos, cheques devolvidos ou ações de cobrança.\n\n👉 O objetivo é que seu nome fique limpo, permitindo que você recupere sua reputação financeira e consiga voltar a pleitear acesso a crédito no mercado.",
        ),
        t(
          "⚖️ O procedimento é realizado por meio de ação judicial coletiva via associação de proteção ao consumidor, garantindo direitos previstos em lei, removendo as restrições no SERASA, SPC Brasil, SCPC Boa Vista e CENPROT (Central Nacional de Protestos).\n\n📌 O serviço conta com seguro-garantia de manutenção do nome limpo pelo período de 1 ANO, conforme condições contratuais (após 12 meses as restrições podem retornar se não forem negociadas ou pagas neste período).",
        ),
        t(
          "⚠️ Importante entender: RESTRIÇÃO é uma coisa, DÍVIDA é outra! As restrições que hoje estão negativando seu nome nestes orgãos serão 100% removidas. Já as dívidas, continuarão existindo de forma interna no credor e nos sistemas do Banco Central.\n\n✅ Em resumo: uma forma rápida e legal de obter CPF ou CNPJ limpo no sistema Serasa/SPC por um custo menor do que se fosse pagar as dívidas.",
        ),
      ],
      aguarda_resposta: false,
      proximo_codigo: "ln_passo4",
      kanban_subetapa: KANBAN_QUALIFICACAO,
    },
  },
  {
    // Suporte a "pacote" (Bloco C, PLANO_MESTRE seção 11) — o lead pode pedir mais de um documento
    // (ex.: 2 CPFs, ou CPF + CNPJ). `tipo_resposta: "lista_documentos"` cai sempre pro interpretador
    // especializado (interpretar-lista-documentos.ts), nunca pro parser determinístico.
    codigo: "ln_passo4",
    ordem: 5,
    campoSalvo: "documentos_tipos",
    conteudo: {
      codigo: "ln_passo4",
      mensagens: [
        t(
          "👉 Você precisa limpar o *CPF*, o *CNPJ*, ou mais de um documento (ex.: 2 CPFs, ou CPF e CNPJ juntos)? Me conta quantos e quais.",
        ),
      ],
      aguarda_resposta: true,
      tipo_resposta: "lista_documentos",
      proximo_codigo: "ln_passo5",
      kanban_subetapa: KANBAN_QUALIFICACAO,
    },
  },
  {
    codigo: "ln_passo5",
    ordem: 6,
    campoSalvo: null,
    conteudo: {
      codigo: "ln_passo5",
      mensagens: [t("Ótimo! Podemos auxiliar sim com o processo limpa nome.")],
      aguarda_resposta: false,
      proximo_codigo: "ln_passo6",
      kanban_subetapa: KANBAN_QUALIFICACAO,
    },
  },
  {
    // Reformulado (17/08/2026, decisão de Luiz): uma pergunta só cobrindo TODOS os documentos de
    // ln_passo4, em vez de repetir a mesma pergunta uma vez por documento (gerava fricção/evasão
    // real num pacote de N documentos). "não sei" é resposta válida por documento — a Malala
    // oferece a consulta oficial paga (mencionando a alternativa gratuita). `tipo_resposta:
    // "faixas_documentos"` cai sempre pro interpretador especializado (interpretar-faixas-
    // documentos.ts), que só dá checkpoint como reconhecido quando tiver valor (ou "não sei"
    // explícito) pra CADA documento.
    codigo: "ln_passo6",
    ordem: 7,
    campoSalvo: "documentos_valores",
    conteudo: {
      codigo: "ln_passo6",
      mensagens: [t("(pergunta de faixa por documento gerada dinamicamente conforme ln_passo4 — ver criarResolverMensagensDinamicas)")],
      aguarda_resposta: true,
      tipo_resposta: "faixas_documentos",
      proximo_por_dado: { campo: "documentos_valor_baixo", se_igual: "sim", entao: "ln_passo7", senao: "ln_passo8" },
      kanban_subetapa: KANBAN_FAIXA_DIVIDA,
    },
  },
  {
    codigo: "ln_passo7",
    ordem: 10,
    campoSalvo: null,
    conteudo: {
      codigo: "ln_passo7",
      mensagens: [
        t(
          "😊 Aqui na ArrudaCred nós sempre buscamos orientar o cliente da forma que entendemos ser mais vantajosa para ele.\n\nComo o valor total das restrições é inferior a R$ 3.000, vale a pena considerar que nosso serviço de limpeza de nome tem um investimento mínimo de R$ 899 à vista ou 6x de R$ 299. Além disso, é importante lembrar que as dívidas continuam existindo, ou seja, a ação remove as restrições, mas não quita os débitos.\n\nPor isso, nesse cenário, nossa recomendação é que você avalie a possibilidade de negociar e quitar diretamente essas dívidas, pois, financeiramente, essa costuma ser a opção mais vantajosa.\n\nSe, ainda assim, você preferir seguir com a ação para remover as restrições do seu nome, será um prazer ajudar. Podemos continuar?",
        ),
      ],
      aguarda_resposta: true,
      tipo_resposta: "sim_nao",
      opcoes: [
        { valor: "sim", rotulos: ["sim", "s"], proximo_codigo: "ln_passo8" },
        {
          valor: "nao",
          rotulos: ["nao", "n"],
          encerra_com_perda: true,
          motivo_perda: "LEAD OPTOU POR NEGOCIAR DÍVIDA DIRETAMENTE",
        },
      ],
      kanban_subetapa: KANBAN_FAIXA_DIVIDA,
      interpretacao_ia: {
        habilitado: true,
        instrucao:
          "O lead pode responder de forma livre (ex.: 'vou negociar direto', 'prefiro não', 'sim, pode seguir'). Escolha 'sim' ou 'nao' com base na intenção clara dele — se a mensagem for ambígua sobre continuar ou desistir, não force uma escolha, já que 'nao' aqui encerra o atendimento.",
      },
    },
  },
  {
    codigo: "ln_passo8",
    ordem: 11,
    campoSalvo: "experiencia_e_origem",
    conteudo: {
      codigo: "ln_passo8",
      mensagens: [
        t(
          "👍 Entendido! Me conta: você já contratou algum serviço de limpeza de nome antes? E como conheceu a ArrudaCred? Foi indicação de alguém? 🤔",
        ),
      ],
      aguarda_resposta: true,
      tipo_resposta: "texto_livre",
      proximo_condicional: {
        contem_qualquer: ["google", "internet", "site", "instagram", "facebook", "busca", "pesquis"],
        se_sim: "ln_passo9",
        se_nao: "ln_passo10",
      },
      kanban_subetapa: KANBAN_FAIXA_DIVIDA,
    },
  },
  {
    codigo: "ln_passo9",
    ordem: 12,
    campoSalvo: null,
    conteudo: {
      codigo: "ln_passo9",
      mensagens: [
        t(
          "Obrigado por nos informar, estamos bem posicionados nos mecanismos de busca justamente por conta da nossa reputação e boa avaliação de clientes que já nos contrataram...",
        ),
      ],
      aguarda_resposta: false,
      proximo_codigo: "ln_passo10",
      kanban_subetapa: KANBAN_FAIXA_DIVIDA,
    },
  },
  {
    codigo: "ln_passo10",
    ordem: 13,
    campoSalvo: null,
    conteudo: {
      codigo: "ln_passo10",
      mensagens: [
        t(
          "Pergunto porque para nós a relação com nossos clientes vale mais que uma venda isolada, assim ganhamos indicações com a confiança estabelecida. Entendemos a preocupação de quem ainda não nos conhece e tem medo de cair num golpe ou na mão de gente desonesta...",
        ),
      ],
      aguarda_resposta: false,
      proximo_codigo: "ln_passo11",
      kanban_subetapa: KANBAN_FAIXA_DIVIDA,
    },
  },
  {
    codigo: "ln_passo11",
    ordem: 14,
    campoSalvo: null,
    conteudo: {
      codigo: "ln_passo11",
      mensagens: [
        t(
          "⭐⭐⭐⭐⭐\nSomos uma empresa com 5 anos de atuação no mercado de recuperação de crédito, trabalhando sempre com contrato para prestação de serviços, que deixa claro os direitos e deveres tanto do cliente quanto da empresa.\n\n👉 *Não existe milagre. O que existe é processo dentro da lei, contrato, prazo e compromisso.*\n👉 No último ano, auxiliamos mais de 5 mil clientes em processos de regularização de crédito.\n👉 Atualmente temos avaliação 4,9 no Google (o máximo é nota 5,0) e avaliação 9,5 no Reclame Aqui (máximo é nota 10).",
        ),
        t(
          "📌 Dados da empresa:\nARRUDACRED – HUB ARRUDA DE NEGÓCIOS E SERVIÇOS\nL.H. DE ARRUDA D. DO VALLE SERVIÇOS LTDA\nCNPJ: 40.342.851/0001-37\n\n🌐 Site: https://www.arrudacred.com.br\n\n📷 Instagram:\nhttps://instagram.com/arrudacred.br\n\n*Trabalhamos com foco em transparência e segurança para o cliente, oferecendo*:\n\n✅ Contrato de prestação de serviços\n✅ Google com avaliação 5 estrelas\n✅ Reclame Aqui com avaliação 9,5 (ótima)\n✅ Mais de 5 mil clientes atendidos\n✅ Seguro Garantia de 12 meses incluso",
        ),
        {
          tipo: "imagem",
          midia_url: "",
          legenda: "Selo do Prêmio Reclame Aqui 2026 (círculo verde escuro, \"Melhores empresas para o consumidor 2026\")",
        },
        t(
          "A *ARRUDACRED* está concorrendo ao *Prêmio Reclame AQUI*. Nossa empresa foi indicada na categoria RECUPERAÇÃO DE CRÉDITO, junto de outras grandes no segmento, como CENPROT NACIONAL E SPC BRASIL.\n\nVeja você mesmo:\n📌 https://www.reclameaqui.com.br/premio/classificadas-indicadas/financeiras/",
        ),
      ],
      aguarda_resposta: false,
      proximo_codigo: "ln_passo12",
      kanban_subetapa: KANBAN_FAIXA_DIVIDA,
    },
  },
  {
    codigo: "ln_passo12",
    ordem: 15,
    campoSalvo: "urgencia",
    conteudo: {
      codigo: "ln_passo12",
      mensagens: [t("(pergunta de urgência calculada dinamicamente conforme CPF/CNPJ escolhido em ln_passo4)")],
      aguarda_resposta: true,
      tipo_resposta: "menu",
      opcoes: [
        { valor: "pesquisando", rotulos: ["1", "1️⃣"], proximo_codigo: "ln_passo13" },
        { valor: "urgente", rotulos: ["2", "2️⃣"], proximo_codigo: "ln_passo13" },
        { valor: "30_45_dias", rotulos: ["3", "3️⃣"], proximo_codigo: "ln_passo13" },
        { valor: "3_6_meses", rotulos: ["4", "4️⃣"], proximo_codigo: "ln_passo13" },
        { valor: "outro", rotulos: ["5", "5️⃣"], proximo_codigo: "ln_passo12_explique" },
      ],
      kanban_subetapa: KANBAN_FAIXA_DIVIDA,
      interpretacao_ia: {
        habilitado: true,
        instrucao:
          "O lead pode responder em texto livre (ex.: 'preciso pra ontem' → urgente, 'só olhando por enquanto' → pesquisando, 'em uns 2 meses' → 3 a 6 meses). Se a resposta descrever uma situação que não se encaixa bem nas 4 primeiras opções, escolha 'outro'.",
      },
    },
  },
  {
    codigo: "ln_passo12_explique",
    ordem: 16,
    campoSalvo: "urgencia_detalhe",
    conteudo: {
      codigo: "ln_passo12_explique",
      mensagens: [t("Pode me explicar melhor a sua situação de prazo?")],
      aguarda_resposta: true,
      tipo_resposta: "texto_livre",
      proximo_codigo: "ln_passo13",
      kanban_subetapa: KANBAN_FAIXA_DIVIDA,
    },
  },
  {
    codigo: "ln_passo13",
    ordem: 17,
    campoSalvo: null,
    conteudo: {
      codigo: "ln_passo13",
      mensagens: [
        t(
          "Vejo que não tem tempo sobrando, o prazo normal para o resultado é de 7 a 45 dias úteis mas depende de um processo judicial, portanto pode variar. Entender que, quanto antes der entrada mais rápido sai o resultado, pode ajudar na sua situação...",
        ),
      ],
      aguarda_resposta: false,
      proximo_codigo: "ln_passo14",
      kanban_subetapa: KANBAN_FAIXA_DIVIDA,
    },
  },
  {
    codigo: "ln_passo14",
    ordem: 18,
    campoSalvo: "prioridade_fechar_hoje",
    conteudo: {
      codigo: "ln_passo14",
      mensagens: [t("(pergunta de voucher calculada dinamicamente conforme CPF/CNPJ escolhido em ln_passo4)")],
      aguarda_resposta: true,
      tipo_resposta: "menu",
      opcoes: [
        { valor: "sim", rotulos: ["1", "1️⃣", "sim"], proximo_codigo: "ln_passo15_router" },
        { valor: "nao", rotulos: ["2", "2️⃣", "nao"], proximo_codigo: "ln_passo15_router" },
      ],
      kanban_subetapa: KANBAN_FAIXA_DIVIDA,
      interpretacao_ia: {
        habilitado: true,
        instrucao:
          "O lead pode responder em texto livre (ex.: 'sim, quero começar agora', 'prefiro pensar mais'). Escolha 'sim' ou 'nao' conforme a intenção.",
      },
    },
  },
  {
    codigo: "ln_passo15_router",
    ordem: 19,
    campoSalvo: null,
    conteudo: {
      codigo: "ln_passo15_router",
      mensagens: [],
      aguarda_resposta: false,
      // `escalar_agendamento` (criarCalculadoraDadosDerivados) resume os 2 gatilhos do agendamento
      // com consultor — dívida acima do corte (`alto_valor`) OU preço do pacote acima de R$8.000
      // (`pacote_caro`) — spec 2026-08-20-agendamento-consultor-alto-valor.md.
      proximo_por_dado: {
        campo: "escalar_agendamento",
        se_igual: "sim",
        entao: "ln_agendamento_oferta",
        senao: "ln_passo15_normal",
      },
      kanban_subetapa: KANBAN_ENVIO_PROPOSTA,
    },
  },
  {
    // Conteúdo real gerado em tempo de execução por criarResolverMensagensDinamicas
    // (varia por faixa de preço e voucher) — ver mais abaixo neste arquivo.
    codigo: "ln_passo15_normal",
    ordem: 20,
    campoSalvo: "forma_pagamento",
    conteudo: {
      codigo: "ln_passo15_normal",
      mensagens: [t("(proposta calculada dinamicamente pela faixa de preço)")],
      aguarda_resposta: true,
      tipo_resposta: "menu",
      opcoes: [
        { valor: "avista", rotulos: ["avista", "a vista", "à vista"], proximo_codigo: "ln_passo16_1" },
        { valor: "parcelado", rotulos: ["parcelado", "parcela"], proximo_codigo: "ln_passo16_1" },
      ],
      kanban_subetapa: KANBAN_ENVIO_PROPOSTA,
      interpretacao_ia: {
        habilitado: true,
        instrucao:
          "O lead pode responder em texto livre (ex.: 'posso pagar tudo de uma vez' → à vista, 'prefiro dividir' → parcelado). Escolha a forma de pagamento correspondente.",
      },
    },
  },
  {
    // Substitui o antigo "ln_passo15_alto_valor" (spec 2026-08-20-agendamento-consultor-alto-valor.md)
    // — em vez de só perguntar "call ou WhatsApp", oferece agendamento de verdade com um consultor.
    // Chegada por 2 caminhos: direto do ln_passo6 (lead escolheu "Acima de X mil" no menu, pulando a
    // precificação inteira — engine.ts trata isso fora do fluxo normal) ou via ln_passo15_router
    // (soma das faixas ultrapassou o corte, ou o pacote ficou caro). Mensagem dinâmica (motivo varia
    // por gatilho) gerada em criarResolverMensagensDinamicas.
    codigo: "ln_agendamento_oferta",
    ordem: 21,
    campoSalvo: "aceitou_agendamento",
    conteudo: {
      codigo: "ln_agendamento_oferta",
      mensagens: [t("(oferta de agendamento gerada dinamicamente)")],
      aguarda_resposta: true,
      tipo_resposta: "menu",
      opcoes: [
        { valor: "sim", rotulos: ["1", "1️⃣"], proximo_codigo: "ln_agendamento_horario" },
        { valor: "nao", rotulos: ["2", "2️⃣"], proximo_codigo: "ln_agendamento_router_recusa" },
      ],
      kanban_subetapa: KANBAN_ENVIO_PROPOSTA,
      interpretacao_ia: {
        habilitado: true,
        instrucao:
          "O lead pode responder em texto livre (ex.: 'quero sim, pode marcar' → sim, 'prefiro seguir por aqui mesmo' → nao). Escolha a opção correspondente.",
      },
    },
  },
  {
    // Decide o destino da recusa (spec 2026-08-21, achado ao revisar o editor de fluxo: recusar
    // sempre ia direto pro handoff, mesmo quando o motivo era pacote caro — nesse caso não faz
    // sentido forçar humano, o lead pode seguir no self-service). Só pra dívida alta (`alto_valor`)
    // a ligação é obrigatória — mesma precedência usada em `motivo` (criarResolverMensagensDinamicas):
    // `alto_valor` vence `pacote_caro` quando os dois são "sim".
    codigo: "ln_agendamento_router_recusa",
    ordem: 21.1,
    campoSalvo: null,
    conteudo: {
      codigo: "ln_agendamento_router_recusa",
      mensagens: [],
      aguarda_resposta: false,
      proximo_por_dado: {
        campo: "alto_valor",
        se_igual: "sim",
        entao: "ln_agendamento_insistencia",
        senao: "ln_passo15_selfservice",
      },
      kanban_subetapa: KANBAN_ENVIO_PROPOSTA,
    },
  },
  {
    // Dívida alta: a ligação é obrigatória (decisão de Luiz, 21/08/2026) — insiste 1x reforçando o
    // motivo antes de aceitar a recusa. Recusando de novo, transfere mesmo assim (ln_call_agendada,
    // nunca libera self-service pra esse motivo — diferente de pacote caro).
    codigo: "ln_agendamento_insistencia",
    ordem: 21.2,
    campoSalvo: "aceitou_agendamento_apos_insistencia",
    conteudo: {
      codigo: "ln_agendamento_insistencia",
      mensagens: [t("(reforço de agendamento gerado dinamicamente)")],
      aguarda_resposta: true,
      tipo_resposta: "menu",
      opcoes: [
        { valor: "sim", rotulos: ["1", "1️⃣"], proximo_codigo: "ln_agendamento_horario" },
        { valor: "nao", rotulos: ["2", "2️⃣"], proximo_codigo: "ln_call_agendada" },
      ],
      kanban_subetapa: KANBAN_ENVIO_PROPOSTA,
      interpretacao_ia: {
        habilitado: true,
        instrucao:
          "O lead já recusou o agendamento uma vez. Se ele aceitar agora (ex.: 'tá bom, pode ligar' → sim) ou recusar/reforçar que não quer (ex.: 'não, prefiro assim mesmo' → nao). Escolha a opção correspondente.",
      },
    },
  },
  {
    codigo: "ln_call_agendada",
    ordem: 22,
    campoSalvo: null,
    conteudo: {
      codigo: "ln_call_agendada",
      mensagens: [
        t(
          "Combinado! Já vou avisar nosso especialista pra entrar em contato com você e agendar a ligação. 🙋‍♂️",
        ),
      ],
      aguarda_resposta: false,
      encerramento: { sob_supervisor: true },
      kanban_subetapa: KANBAN_NEGOCIACAO_DUVIDAS,
    },
  },
  {
    // Horários oferecidos já calculados em `_agendamento_opcao_1/2_inicio/fim` por
    // criarCalculadoraDadosDerivados, assim que `aceitou_agendamento=sim` — mensagem dinâmica lê
    // esses 2 valores prontos (criarResolverMensagensDinamicas), nenhuma consulta ao banco aqui.
    codigo: "ln_agendamento_horario",
    ordem: 21.5,
    campoSalvo: "horario_agendamento_escolhido",
    conteudo: {
      codigo: "ln_agendamento_horario",
      mensagens: [t("(horários disponíveis gerados dinamicamente)")],
      aguarda_resposta: true,
      tipo_resposta: "menu",
      opcoes: [
        { valor: "1", rotulos: ["1", "1️⃣"], proximo_codigo: "ln_agendamento_confirmado" },
        { valor: "2", rotulos: ["2", "2️⃣"], proximo_codigo: "ln_agendamento_confirmado" },
      ],
      kanban_subetapa: KANBAN_ENVIO_PROPOSTA,
      interpretacao_ia: {
        habilitado: true,
        instrucao:
          "O lead pode responder com o número da opção, ou descrevendo o horário preferido (ex.: 'prefiro o de amanhã', 'o da tarde' — combine com o texto das opções mostradas). Se ele disser que nenhum dos dois funciona, escolha a opção 1 mesmo assim SÓ SE ele não tiver deixado claro que recusa — quando ele recusar claramente as duas, não escolha nenhuma (deixe a Malala repetir a pergunta).",
      },
    },
  },
  {
    // A confirmação lê `horario_agendamento_escolhido` + a opção correspondente pra montar a frase
    // (criarResolverMensagensDinamicas) — o EfeitoNegocio "agendar_consultor" (engine.ts,
    // persistencia.ts) é quem de fato grava o agendamento e notifica o consultor.
    codigo: "ln_agendamento_confirmado",
    ordem: 21.6,
    campoSalvo: null,
    conteudo: {
      codigo: "ln_agendamento_confirmado",
      mensagens: [t("(confirmação de agendamento gerada dinamicamente)")],
      aguarda_resposta: false,
      encerramento: { sob_supervisor: true },
      kanban_subetapa: KANBAN_NEGOCIACAO_DUVIDAS,
    },
  },
  {
    codigo: "ln_passo15_selfservice",
    ordem: 23,
    campoSalvo: "forma_pagamento",
    conteudo: {
      codigo: "ln_passo15_selfservice",
      mensagens: [t("(proposta self-service de alto valor gerada dinamicamente)")],
      aguarda_resposta: true,
      tipo_resposta: "menu",
      opcoes: [
        { valor: "avista", rotulos: ["avista", "a vista", "à vista"], proximo_codigo: "ln_passo16_1" },
        { valor: "parcelado", rotulos: ["parcelado", "parcela"], proximo_codigo: "ln_passo16_1" },
      ],
      kanban_subetapa: KANBAN_ENVIO_PROPOSTA,
      interpretacao_ia: {
        habilitado: true,
        instrucao:
          "O lead pode responder em texto livre (ex.: 'posso pagar tudo de uma vez' → à vista, 'prefiro dividir' → parcelado). Escolha a forma de pagamento correspondente.",
      },
    },
  },
  {
    // Conteúdo real (mensagem de confirmação de pagamento) gerado em tempo de execução por
    // criarResolverMensagensDinamicas — varia por valores/vencimentos calculados.
    codigo: "ln_passo16_1",
    ordem: 24,
    campoSalvo: "detalhe_pagamento_confirmado_bruto",
    conteudo: {
      codigo: "ln_passo16_1",
      mensagens: [t("(mensagem de confirmação de pagamento gerada dinamicamente)")],
      aguarda_resposta: true,
      tipo_resposta: "negociacao_pagamento",
      proximo_codigo: "ln_passo17a",
      kanban_subetapa: KANBAN_NEGOCIACAO_DUVIDAS,
    },
  },
  {
    codigo: "ln_passo17a",
    ordem: 25,
    campoSalvo: "dados_pessoa_limpar",
    conteudo: {
      codigo: "ln_passo17a",
      mensagens: [
        t(
          "👍 Entendido! Agora vou enviar os dados necessários para a emissão do contrato, em 2 minutinhos vc consegue preencher:",
        ),
        t("📌 *DADOS PARA LIMPEZA DE NOME:*\n\nCPF:\nNome Completo:"),
      ],
      aguarda_resposta: true,
      tipo_resposta: "texto_livre",
      proximo_codigo: "ln_passo17b",
      kanban_subetapa: KANBAN_DADOS_CONTRATO,
    },
  },
  {
    codigo: "ln_passo17b",
    ordem: 26,
    campoSalvo: "dados_assinante",
    conteudo: {
      codigo: "ln_passo17b",
      mensagens: [
        t(
          "📌 *DADOS DE QUEM VAI ASSINAR CONTRATO:*\n\n** CPF:\n** Nome Completo:\n** RG:\n** Estado Civil:\n** Profissão:\n** Nacionalidade:\n** Data Nascimento:\n** E-mail:\n** Whatsapp:\n** Endereço completo com cep:",
        ),
      ],
      aguarda_resposta: true,
      tipo_resposta: "texto_livre",
      proximo_codigo: "ln_passo18",
      kanban_subetapa: KANBAN_DADOS_CONTRATO,
    },
  },
  {
    codigo: "ln_passo18",
    ordem: 27,
    campoSalvo: "documentos_status",
    conteudo: {
      codigo: "ln_passo18",
      mensagens: [
        t(
          "Estamos quase concluindo! Agora falta somente a foto ou PDF de um documento válido (RG ou CNH) + comprovante de residência da pessoa que vai assinar o contrato. (se não tiver em mãos para enviar neste momento, me avise que anotamos aqui para você enviar depois.)",
        ),
      ],
      aguarda_resposta: true,
      tipo_resposta: "texto_livre",
      proximo_codigo: "ln_encerramento",
      kanban_subetapa: KANBAN_DADOS_CONTRATO,
    },
  },
  {
    codigo: "ln_encerramento",
    ordem: 28,
    campoSalvo: null,
    conteudo: {
      codigo: "ln_encerramento",
      mensagens: [
        t(
          "😊 Perfeito! Já anotei tudo aqui. Nossa equipe vai preparar seu contrato e te aviso por aqui assim que estiver tudo pronto pra você assinar. Muito obrigada pela confiança! 🙌",
        ),
      ],
      aguarda_resposta: false,
      encerramento: { sob_supervisor: true },
      kanban_subetapa: KANBAN_DADOS_CONTRATO,
    },
  },
];

// ---------------------------------------------------------------------------
// Extração da abertura — reconhecimento por palavra-chave de qual produto o lead já mencionou de
// cara (regra de checkpoint já respondido, aplicada ao menu de triagem especificamente). Fica aqui
// porque as palavras-chave são do menu deste fluxo, não algo genérico do motor (ver extracao.ts).
// ---------------------------------------------------------------------------

const PALAVRAS_CHAVE_PRODUTO: { termos: string[]; valor: string }[] = [
  {
    termos: ["limpar meu nome", "limpeza de nome", "limpar nome", "nome sujo", "nome negativado", "spc", "serasa"],
    valor: "limpeza_nome",
  },
  { termos: ["score", "rating"], valor: "score" },
  { termos: ["bacen", "scr", "ccf"], valor: "bacen_scr_ccf" },
  { termos: ["jusbrasil", "escavador"], valor: "jusbrasil_escavador" },
  { termos: ["conta protegida", "bloqueio judicial"], valor: "conta_protegida" },
  { termos: ["consórcio", "consorcio"], valor: "consorcio" },
  { termos: ["crédito", "credito", "financiamento", "empréstimo", "emprestimo"], valor: "credito" },
];

function extrairProdutoInteresse(mensagem: string): string | null {
  const normalizado = mensagem.toLowerCase();
  for (const { termos, valor } of PALAVRAS_CHAVE_PRODUTO) {
    if (termos.some((termo) => normalizado.includes(termo))) return valor;
  }
  return null;
}

/**
 * Achado real (17/08/2026, lead "João"): "sou joao, devo 10 mil e quero limpar meu nome" ignorava
 * completamente o "devo 10 mil" — a Malala perguntava a faixa de novo mais adiante (ln_passo6),
 * repetindo informação que o lead já tinha dado de cara. Exige um sinal explícito de valor (R$/mil/
 * reais) antes de tentar extrair um número — evita confundir outro número solto na frase (ex.: "há
 * 10 anos moro aqui") com valor de dívida.
 */
function extrairValorMencionadoNaAbertura(mensagem: string): number | null {
  const normalizado = mensagem.toLowerCase();
  if (!/\br\$|\bmil\b|\breais?\b/.test(normalizado)) return null;

  const semSimbolos = mensagem.replace(/[Rr]\$/g, "").trim();
  // Precisa começar por um dígito — sem isso, "sou pedro, devo 10 mil..." casava a vírgula depois
  // de "pedro" antes de chegar no "10" de verdade (achado real, 17/08/2026).
  const numeroMatch = semSimbolos.match(/\d[\d.,]*/);
  if (!numeroMatch) return null;

  const numero = Number(numeroMatch[0].replace(/\./g, "").replace(",", "."));
  if (Number.isNaN(numero)) return null;

  return /\bmil\b/.test(normalizado) ? numero * 1000 : numero;
}

/** Classifica um valor bruto nos mesmos buckets das opções de ln_passo6/ln_passo6_refino_baixo — pra que a regra de "checkpoint já respondido" (engine.ts) pule essas perguntas sozinha quando os campos batem com uma opção conhecida. */
function dadosDaFaixaPorValor(valor: number): DadosConversa {
  if (valor < 3000) return { faixa_valor: "menos_10mil", faixa_valor_detalhe: "menos_3mil" };
  if (valor < 10000) return { faixa_valor: "menos_10mil", faixa_valor_detalhe: "3_10mil" };
  if (valor < 30000) return { faixa_valor: "10_30mil" };
  if (valor < 50000) return { faixa_valor: "30_50mil" };
  if (valor < 100000) return { faixa_valor: "50_100mil" };
  return { faixa_valor: "mais_100mil", valor_aproximado: String(valor) };
}

/** Combina a extração genérica (nome, ver extracao.ts) com as específicas deste menu (produto, valor mencionado de cara) — usado na primeira mensagem da conversa, antes do motor começar a perguntar. */
export function criarExtratorAbertura() {
  return (mensagem: string): DadosConversa => {
    const dados = extrairDadosAbertura(mensagem);
    const produto = extrairProdutoInteresse(mensagem);
    if (produto) dados.produto_interesse = produto;
    const valor = extrairValorMencionadoNaAbertura(mensagem);
    if (valor !== null) Object.assign(dados, dadosDaFaixaPorValor(valor));
    return dados;
  };
}

// ---------------------------------------------------------------------------
// Regras dinâmicas específicas deste produto — plugadas no motor genérico via os hooks
// `resolverMensagensDinamicas` e `calcularDadosDerivados` (ver engine.ts / tipos.ts).
// ---------------------------------------------------------------------------

/**
 * Valor usado quando o lead responde "não sei" pra um documento em ln_passo6, sem nenhum outro
 * sinal de contexto — decisão interina (17/08/2026), nem o piso nem o teto, pra não sub nem
 * sobre-precificar às cegas. Revisar com Luiz quando fizer sentido usar a consulta paga de verdade
 * (R$39/documento nos 4 órgãos) em vez de só assumir um valor médio.
 */
export const VALOR_PADRAO_DOCUMENTO_NAO_SEI = 75_000;

function resumoTipoDocumento(documentosTiposCsv: string): string {
  const tipos = new Set(documentosTiposCsv.split(",").filter(Boolean));
  if (tipos.size === 1) return tipos.has("cnpj") ? "cnpj" : "cpf";
  return "cpf_e_cnpj";
}

/** Cada valor bruto capturado em ln_passo6 (`documentos_valores`) já normalizado — "não sei" cai no valor padrão conservador (`VALOR_PADRAO_DOCUMENTO_NAO_SEI`), mesma regra pra todo mundo que usa este CSV. */
function parseValoresDocumentos(documentosValoresCsv: string): number[] {
  return documentosValoresCsv
    .split(",")
    .filter(Boolean)
    .map((valorBruto) => {
      if (valorBruto === "nao_sei") return VALOR_PADRAO_DOCUMENTO_NAO_SEI;
      const numero = Number(valorBruto);
      return Number.isFinite(numero) ? numero : VALOR_PADRAO_DOCUMENTO_NAO_SEI;
    });
}

/** Soma o valor de cada documento — usado pra classificar alto valor/baixo valor do pacote inteiro (`criarCalculadoraDadosDerivados`), não pra precificar (isso usa a faixa de cada documento, ver `valoresPorDocumento` + `combinarFaixasPacote`, pacote Fase 4, 17/08/2026). */
function somarValoresDocumentos(documentosValoresCsv: string): number {
  return parseValoresDocumentos(documentosValoresCsv).reduce((soma, valor) => soma + valor, 0);
}

/**
 * Valor de CADA documento do pacote, um item por documento — pacote Fase 4 (17/08/2026): antes, o
 * preço vinha de uma faixa única sobre a soma de todos os documentos; agora cada documento é
 * precificado pela sua própria faixa (`combinarFaixasPacote`, regras-limpeza-nome.ts), somadas.
 * Sem `documentos_valores` (fluxo antigo/single-valor, `resolverValorRestricao`), cai num array de
 * um item só — comportamento idêntico ao de antes desta mudança.
 */
function valoresPorDocumento(dados: DadosConversa): number[] {
  if (dados.documentos_valores) return parseValoresDocumentos(dados.documentos_valores);
  const valor = resolverValorRestricao(dados);
  return valor === null ? [] : [valor];
}

export function criarCalculadoraDadosDerivados(
  config: Pick<ConfigPrecificacaoLimpaNome, "altoValorFixo" | "altoValorPercentual" | "corteAltoValor">,
  faixasPrecos: FaixaPreco[],
  agenda?: { disponibilidadeConsultor: JanelaDisponibilidade[]; agendamentosExistentes: PeriodoOcupado[] },
) {
  return (dados: DadosConversa): DadosConversa => {
    const derivados: DadosConversa = {};

    if (dados.documentos_tipos) {
      derivados.tipo_documento = resumoTipoDocumento(dados.documentos_tipos);
    }

    if (dados.documentos_valores) {
      const total = somarValoresDocumentos(dados.documentos_valores);
      derivados.valor_restricao_estimado = String(total);
      derivados.alto_valor = classificarAltoValor(total, config.corteAltoValor) ? "sim" : "nao";
      derivados.documentos_valor_baixo = total < 3000 ? "sim" : "nao";

      // Gatilho B (pacote caro, spec 2026-08-20-agendamento-consultor-alto-valor.md) — preço
      // COMBINADO do pacote (o que o lead pagaria pra ArrudaCred), não a dívida dele. `alto_valor`
      // acima é sobre a dívida (gatilho A); os dois convergem em `escalar_agendamento`, que é o que
      // `ln_passo15_router` de fato usa pra decidir se vai pro fluxo normal ou pro de agendamento.
      const faixaCombinadaPreco = combinarFaixasPacote(valoresPorDocumento(dados), faixasPrecos);
      derivados.pacote_caro = (faixaCombinadaPreco?.precoCheio ?? 0) > CORTE_PACOTE_CARO ? "sim" : "nao";
      derivados.escalar_agendamento = derivados.alto_valor === "sim" || derivados.pacote_caro === "sim" ? "sim" : "nao";
    }

    // Horários oferecidos pro agendamento (ln_agendamento_horario) — calculados UMA vez, assim que
    // o lead aceita agendar (`aceitou_agendamento=sim`), nunca recalculados depois (senão os 2
    // horários mudariam sob os pés do lead entre a pergunta e a resposta dele). Guardados em `dados`
    // como strings ISO — mesmo padrão de estado provisório já usado em `_faixa_provisoria_indice`.
    if (dados.aceitou_agendamento === "sim" && !dados._agendamento_opcao_1_inicio && agenda) {
      const [opcao1, opcao2] = calcularHorariosDisponiveis({
        disponibilidade: agenda.disponibilidadeConsultor,
        agendamentosExistentes: agenda.agendamentosExistentes,
        agora: new Date(),
      });
      if (opcao1) {
        derivados._agendamento_opcao_1_inicio = opcao1.inicio.toISOString();
        derivados._agendamento_opcao_1_fim = opcao1.fim.toISOString();
      }
      if (opcao2) {
        derivados._agendamento_opcao_2_inicio = opcao2.inicio.toISOString();
        derivados._agendamento_opcao_2_fim = opcao2.fim.toISOString();
      }
    }

    // Defaults do detalhe de pagamento (spec 2026-08-18) — calculados UMA vez, assim que
    // forma_pagamento é escolhida (ln_passo15_normal/selfservice); se parcelas_valores já existe,
    // é porque já foi calculado antes (ou já foi ajustado pela negociação) — nunca sobrescreve,
    // senão perderia um ajuste que o lead já tinha feito.
    if (dados.forma_pagamento && !dados.parcelas_valores) {
      const parcelado = dados.forma_pagamento === "parcelado";
      const faixaCombinada = combinarFaixasPacote(valoresPorDocumento(dados), faixasPrecos);

      // Achado real (21/08/2026, bateria de testes da Malala): quando o lead topa a Condição
      // Especial (prioridade_fechar_hoje=sim) e existe voucher pra faixa dele, a parcela cobrada
      // precisa usar o preço COM o desconto do voucher — antes disso, sempre usava o preço normal
      // aqui, cobrando mais do que `montarPropostaPorFaixa` (que já respeita esse flag) tinha
      // acabado de oferecer. Sem voucher parcelado pra essa faixa (raro, mas `voucherParcelas` pode
      // vir vazio), cai pro parcelamento normal em vez de travar sem valor nenhum.
      const temVoucher = dados.prioridade_fechar_hoje === "sim" && faixaCombinada?.voucherAvista != null;
      const tiers: ParcelaTier[] = parcelado
        ? (temVoucher && (faixaCombinada?.voucherParcelas.length ?? 0) > 0
            ? faixaCombinada?.voucherParcelas
            : faixaCombinada?.parcelasBoleto) ?? []
        : [{ quantidade: 1, valor: (temVoucher ? faixaCombinada?.voucherAvista : faixaCombinada?.precoAvista) ?? 0 }];

      if (tiers.length > 0) {
        const hojeISO = dataDeHojeISO();
        const diaAncora: DiaAncora = 10;
        const parcelas = expandirParcelas(tiers, hojeISO, diaAncora);

        derivados.forma_pagamento_detalhe = "boleto_pix";
        derivados.data_primeira_parcela = hojeISO;
        if (parcelado) derivados.dia_ancora_parcelas = String(diaAncora);
        derivados.parcelas_valores = parcelas.map((p) => p.valor.toFixed(2)).join(",");
        derivados.parcelas_vencimentos = parcelas.map((p) => p.vencimento).join(",");
      }
    }

    return derivados;
  };
}

/** Lê o valor já derivado (calcularDadosDerivados) e só recalcula a partir das respostas brutas se, por algum motivo, ainda não tiver sido derivado nesta conversa. */
function obterValorRestricao(dados: DadosConversa): number | null {
  if (dados.valor_restricao_estimado) {
    const numero = Number(dados.valor_restricao_estimado);
    if (!Number.isNaN(numero)) return numero;
  }
  return resolverValorRestricao(dados);
}

// ---------------------------------------------------------------------------
// Texto que muda conforme o lead respondeu CPF/CNPJ em ln_passo4 (`dados.tipo_documento`) — achado
// real (17/08/2026, mesmo lead "João"): 3 mensagens adiante do script citavam "CPF" fixo mesmo
// quando o lead tinha acabado de dizer que era CNPJ. O script original (SCRIPT_LIMPANOME_SERASA_SPC.md,
// Passos 6/12) já previa isso como "pergunta dinâmica conforme tipo capturado" — nunca foi ligado.
// ---------------------------------------------------------------------------

/** "do CPF limpo" / "do CNPJ limpo" / "dos documentos limpos" — usado em ln_passo12. */
function fraseNecessidadeDocumentoLimpo(dados: DadosConversa): string {
  if (dados.tipo_documento === "cnpj") return "do CNPJ limpo";
  if (dados.tipo_documento === "cpf_e_cnpj") return "dos documentos limpos";
  return "do CPF limpo";
}

/** "o CPF" / "o CNPJ" / "os documentos" — usado em ln_passo14. */
function fraseEntrarComDocumento(dados: DadosConversa): string {
  if (dados.tipo_documento === "cnpj") return "o CNPJ";
  if (dados.tipo_documento === "cpf_e_cnpj") return "os documentos";
  return "o CPF";
}

export function criarResolverMensagensDinamicas(
  faixasPrecos: FaixaPreco[],
  config: ConfigPrecificacaoLimpaNome,
) {
  return (codigo: string, dados: DadosConversa): MensagemEtapa[] | null => {
    // Justificativa do e-mail (correção 18/08/2026) — só entra na 2ª tentativa em diante, quando
    // `dados["_tentativas:abertura_email"]` já existe (1ª resposta não reconhecida: recusa,
    // pergunta "pra quê", ou e-mail inválido). Na 1ª pergunta esse campo ainda não existe, então
    // cai no `null` no fim da função e usa só a pergunta fixa (conteudo.mensagens).
    if (codigo === "abertura_email" && dados["_tentativas:abertura_email"]) {
      return [
        t(
          "É por ele que mando a *proposta por escrito*, dicas pra manter nome limpo e score alto, e às vezes cupons de desconto nos nossos produtos 😊 Pode deixar de receber quando quiser.",
        ),
      ];
    }

    if (codigo === "ln_passo6") {
      // Menu fechado (correção 18/08/2026, Luiz) — cabeçalho fixo + lista de faixas gerada do
      // banco (formatarMenuFaixas, regras-limpeza-nome.ts — mesmo texto que o interpretador usa
      // pra saber o que cada número significa). A mensagem de confirmação ("Só confirmando...")
      // e a negociação por documento (se o lead não confirmar) são geradas pelo interpretador
      // especializado (interpretar-faixas-documentos.ts), não aqui.
      return [
        t(
          `👉 *Em qual das faixas abaixo melhor se enquadra o valor das suas restrições atualmente?* (tudo bem se não tiver certeza - depois faremos uma consulta)\n\n${formatarMenuFaixas(faixasPrecos, config.corteAltoValor)}`,
        ),
      ];
    }

    if (codigo === "ln_passo12") {
      return [
        t(
          `📣 *Para eu conseguir te orientar melhor me diz: para quando você tem necessidade ${fraseNecessidadeDocumentoLimpo(dados)}?*\n\n1️⃣ Só está pesquisando\n2️⃣ Urgente\n3️⃣ Em 30-45 dias\n4️⃣ 3 a 6 meses\n5️⃣ Outro, me explique!`,
        ),
      ];
    }

    if (codigo === "ln_passo14") {
      return [
        t(
          `📌 Nós recebemos alguns vouchers da Associação que nos permitem oferecer uma condição especial muito expressiva. Como são limitados, para liberar a proposta com a melhor condição possível, precisamos saber:\n\n👉 *É prioridade para você já entrar com ${fraseEntrarComDocumento(dados)} para ser limpo e começar a contar o prazo hoje?*\n1️⃣ Sim\n2️⃣ Não`,
        ),
      ];
    }

    if (codigo === "ln_passo15_normal") {
      const valorRestricao = obterValorRestricao(dados);
      if (valorRestricao !== null && valorRestricao < 3000) {
        return montarPropostaBaixoValor(config).map(t);
      }
      if (valorRestricao === null) return null;
      // Pacote Fase 4 (17/08/2026): preço pela faixa de CADA documento, somadas — não mais uma
      // faixa única sobre o valor total combinado (ver combinarFaixasPacote).
      const faixaCombinada = combinarFaixasPacote(valoresPorDocumento(dados), faixasPrecos);
      if (!faixaCombinada) return null;
      return montarPropostaPorFaixa(faixaCombinada, dados.prioridade_fechar_hoje === "sim").map(t);
    }

    if (codigo === "ln_agendamento_oferta") {
      const motivo = dados.pacote_caro === "sim" && dados.alto_valor !== "sim" ? "pacote_caro" : "divida_alta";
      return montarOfertaAgendamentoConsultor(motivo).map(t);
    }

    if (codigo === "ln_agendamento_insistencia") {
      return montarInsistenciaAgendamento().map(t);
    }

    if (codigo === "ln_agendamento_horario") {
      const opcao1 = dados._agendamento_opcao_1_inicio;
      const opcao2 = dados._agendamento_opcao_2_inicio;
      if (!opcao1 || !opcao2) return null;
      return [t(montarHorariosAgendamento([opcao1, opcao2]))];
    }

    if (codigo === "ln_agendamento_confirmado") {
      const escolha = dados.horario_agendamento_escolhido === "2" ? "2" : "1";
      const inicio = dados[`_agendamento_opcao_${escolha}_inicio`];
      if (!inicio) return null;
      return [t(montarConfirmacaoAgendamento(inicio))];
    }

    if (codigo === "ln_passo15_selfservice") {
      const valorRestricao = obterValorRestricao(dados);
      if (valorRestricao === null) return null;
      const valorEstimado = calcularFormulaAltoValor(
        valorRestricao,
        config.altoValorFixo,
        config.altoValorPercentual,
      );
      return montarPropostaAltoValorSelfService(valorEstimado).map(t);
    }

    if (codigo === "ln_passo16_1") {
      const valores = (dados.parcelas_valores ?? "").split(",").filter(Boolean).map(Number);
      const vencimentos = (dados.parcelas_vencimentos ?? "").split(",").filter(Boolean);
      if (valores.length === 0 || vencimentos.length !== valores.length) return null;

      const formaTexto = dados.forma_pagamento_detalhe === "cartao" ? "Cartão" : "Boleto/Pix";
      const totalContrato = valores.reduce((soma, v) => soma + v, 0);

      if (valores.length === 1) {
        return [
          t(
            `Valor do Contrato:\n${formatarReais(totalContrato)}\n\nPagamento:\nÀ Vista no ${formaTexto}\n\nVencimento:\n${formatarDataBr(vencimentos[0])}`,
          ),
        ];
      }

      const linhasVencimentos = vencimentos
        .map((venc, i) => `${formatarDataBr(venc)} - ${formatarReais(valores[i])}`)
        .join("\n");
      return [
        t(
          `Valor do Contrato: ${formatarReais(totalContrato)}\n\nPagamento:\nem ${valores.length} vezes - Parcelado no ${formaTexto}\n\nValor da Parcela:\n${formatarReais(valores[0])}\n\nVencimentos:\n${linhasVencimentos}`,
        ),
      ];
    }

    return null;
  };
}

// ---------------------------------------------------------------------------
// Helpers de montagem — usados pelos testes (com fluxoId/ids fabricados) e por
// scripts/gerar-seed.ts (pra escrever as linhas reais de `etapas_fluxo`).
// ---------------------------------------------------------------------------

export function construirEtapaCarregada(def: DefinicaoEtapa, fluxoId: string): EtapaCarregada {
  return {
    id: `${fluxoId}:${def.codigo}`,
    fluxoId,
    ordem: def.ordem,
    campoSalvo: def.campoSalvo,
    agendaFollowupId: null,
    conteudo: def.conteudo,
  };
}

export function construirEtapasPorCodigo(
  grupos: { definicoes: DefinicaoEtapa[]; fluxoId: string }[],
): Record<string, EtapaCarregada> {
  const mapa: Record<string, EtapaCarregada> = {};
  for (const grupo of grupos) {
    for (const def of grupo.definicoes) {
      mapa[def.codigo] = construirEtapaCarregada(def, grupo.fluxoId);
    }
  }
  return mapa;
}

export { tipoEtapaDb };
