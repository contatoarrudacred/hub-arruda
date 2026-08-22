// Cenários da bateria de testes — ver docs/superpowers/specs/2026-08-21-testes-conversa-malala-e-nota-handoff.md.
// Todo cenário começa do zero (saudacao_inicial) com um telefone de teste próprio, pra não haver
// nenhum resquício entre um cenário e outro.
//
// Roteirizados: mensagens fixas em português natural (não números de menu "crus") — o
// `interpretacao_ia` já está habilitado em praticamente todo checkpoint do script, então usar
// linguagem natural testa exatamente a camada que Luiz quer validar, em vez de só a extração
// determinística. A sequência exata de cada um foi conferida direto contra o `etapas_fluxo` REAL de
// produção (não contra `fluxo-limpeza-nome.ts` — o banco diverge da semente TS em alguns pontos,
// ex.: existe um `ln_passo1` e um `ln_fazsentido` que não estavam na semente, e `ln_passo2` não tem
// mais o ramo "não" pra `ln_aguardar_melhor_momento`). Ver comentário logo abaixo pro grafo completo
// conferido em 21/08/2026.
//
// Grafo real (ordem → codigo → destino), conferido via leitura direta do banco:
//   pergunta_nome → abertura_email (telefone pulado, já vem do canal) → triagem_menu →
//   [limpeza_nome] → ln_passo1(auto) → ln_passo2 → ln_passo3(auto) → ln_fazsentido → ln_passo4 →
//   ln_passo5(auto) → ln_passo6 → [baixo: ln_passo7 | normal: ln_passo8 → ...auto... → ln_passo12 →
//   ln_passo13(auto) → ln_passo14 → ln_passo15_router → [normal: ln_passo15_normal | escalar:
//   ln_agendamento_oferta → [sim: ln_agendamento_horario → ln_agendamento_confirmado | não:
//   ln_call_agendada]]]
//
// IMPORTANTE — caveat vivo (remover quando o passo 3 da spec 2026-08-21 for concluído): a correção
// da recusa de agendamento (insistência pra dívida alta / self-service pra pacote caro,
// `ln_agendamento_router_recusa`/`ln_agendamento_insistencia`) só existe no código local — o
// `etapas_fluxo` real AINDA aponta "não" direto pra `ln_call_agendada` (comportamento antigo) até
// esse código ir pra `main` e o `etapas_fluxo` ser patcheado (mesma regra de sequenciamento do
// agendamento em si). Cenários de recusa testados agora refletem o comportamento ANTIGO.
//
// Adversariais: só a persona/objetivo é fixo — quem decide o que escrever a cada turno é uma 2ª IA
// fazendo o papel do lead (ator-ia.ts), reagindo de verdade ao que a Malala respondeu. É o que pega
// repetição/alucinação que um roteiro fixo não provoca — e são imunes a esse tipo de divergência
// entre semente e banco real, já que reagem ao que a Malala realmente pergunta.

import type { Cenario } from "./tipos";

const NOME_E_EMAIL = ["João Pedro Silva", "joaopedro@testandodasilva.com.br"];
// "sim, pode ser" (ln_passo2) → "sim, faz sentido" (ln_fazsentido) — 2 confirmações distintas antes
// de ln_passo4, confirmadas contra o banco real (não é uma questão só, são duas).
const CONFIRMACOES_ATE_LN_PASSO4 = ["sim, pode ser", "sim, faz sentido"];

export const CENARIOS_ROTEIRIZADOS: Cenario[] = [
  {
    tipo: "roteirizado",
    nome: "triagem_handoff_outro_assunto",
    descricao: "Lead pede um assunto fora de Limpeza de Nome no menu de triagem — deve escalar pro handoff_humano (ponto A) sem inventar ajuda que não pode dar.",
    expectativaHandoff:
      "Não precisa pedir confirmação (o próprio pedido do lead já é a confirmação) — mas precisa avisar que vai encaminhar, e o registro no banco (sob_supervisor + nota interna) precisa confirmar que a transferência de fato aconteceu.",
    mensagens: ["Oi, tudo bem?", ...NOME_E_EMAIL, "na verdade eu queria saber sobre consórcio, vocês trabalham com isso?"],
  },
  {
    tipo: "roteirizado",
    nome: "desvio_pergunta_lateral_com_faq",
    descricao:
      "Lead faz uma pergunta lateral (coberta por FAQ) no meio de um checkpoint comum (ln_fazsentido) — testa o interpretador de desvio (spec 2026-08-21-desvio-escalar-quando-nao-sabe.md): deve responder com o texto oficial da FAQ e retomar a pergunta pendente na mesma mensagem, sem escalar nem travar.",
    expectativaHandoff: null,
    mensagens: [
      "Oi",
      ...NOME_E_EMAIL,
      "quero limpar meu nome",
      "as restrições podem voltar depois de limpo? o que é esse seguro garantia que vocês oferecem?",
      "sim, pode ser",
      "sim, faz sentido",
    ],
  },
  {
    tipo: "roteirizado",
    nome: "duvida_baixa_negocia_direto",
    descricao: "Dívida baixa (<R$3.000) — a Malala recomenda negociar direto e o lead aceita a recomendação, encerrando com perda (não é bug, é o desenho do script).",
    expectativaHandoff: null,
    mensagens: [
      "Oi",
      ...NOME_E_EMAIL,
      "quero limpar meu nome mesmo",
      ...CONFIRMACOES_ATE_LN_PASSO4,
      "só o meu CPF",
      "tenho uma dívida de uns 1500 reais no cartão de crédito",
      "faz sentido, vou tentar negociar direto com o banco então",
    ],
  },
  {
    tipo: "roteirizado",
    nome: "duvida_media_fecha_avista",
    descricao: "Faixa intermediária (10-30 mil) — percorre o funil inteiro até o encerramento normal do MVP1, pagando à vista.",
    expectativaHandoff: null,
    mensagens: [
      "Oi",
      ...NOME_E_EMAIL,
      "quero limpar meu nome",
      ...CONFIRMACOES_ATE_LN_PASSO4,
      "só CPF",
      "minha dívida hoje deve estar uns 20 mil",
      // Grafo real conferido 21/08/2026 direto no banco (fluxo_id 7e410b97...): ln_passo6(confirma) →
      // ln_passo8(experiencia_e_origem, texto livre) → auto x3 (ln_passo9/10/11) → ln_passo12(urgencia,
      // menu) → auto (ln_passo13) → ln_passo14(prioridade_fechar_hoje, sim/nao) → auto
      // (ln_passo15_router) → ln_passo15_normal. Cada uma dessas precisa da própria resposta — antes só
      // 3 mensagens cobriam esse trecho inteiro, e a confirmação de ln_passo6 só "colava" por sorte via
      // modo_livre (sem valor de correção real), o que fazia a resposta de urgência real (`é urgente...`)
      // ser engolida por ln_passo8 (texto livre aceita qualquer coisa) em vez de responder ln_passo12.
      "sim, está correto",
      "já tentei antes com outra empresa e não deu certo, vi vocês no Google",
      "é urgente pra mim, preciso resolver rápido",
      "sim, quero aproveitar essa condição hoje mesmo",
      "à vista mesmo",
      "pode ser dia 25",
      "sim, confirmo assim",
      "CPF 111.111.111-11, meu nome completo é João Pedro Silva",
      // ln_passo17b real pede a lista completa de dados de quem assina (confirmado 21/08/2026 —
      // a mensagem antiga aqui ("email e senha do gov.br") era de uma versão bem anterior do
      // fluxo, não bate com o ln_passo17b atual).
      "CPF 111.111.111-11, nome completo João Pedro Silva, RG 12.345.678-9, solteiro, autônomo, brasileiro, nascido em 10/05/1990, email joaopedro@testandodasilva.com.br, whatsapp (11) 99999-0000, endereço Rua Exemplo 123, Centro, São Paulo-SP, CEP 01310-100",
      "combinado, vou enviar os documentos depois",
    ],
  },
  {
    tipo: "roteirizado",
    nome: "divida_alta_aceita_agendamento",
    descricao: "Dívida alta (>R$500 mil) — percorre o funil normal (o valor exato reportado é quem decide alto_valor em ln_passo15_router), aceita a ligação, escolhe o 1º horário, chega no agendamento confirmado (ponto D).",
    expectativaHandoff:
      "Precisa avisar que esse caso exige um consultor especializado, perguntar se topa agendar, esperar a confirmação, oferecer 2 horários, e só depois de escolhido confirmar o agendamento — e isso precisa estar gravado no banco (agendamentos_consultor + nota interna + sob_supervisor).",
    mensagens: [
      "Oi",
      ...NOME_E_EMAIL,
      "quero limpar meu nome",
      ...CONFIRMACOES_ATE_LN_PASSO4,
      "só CPF",
      // dívida alta pula direto de ln_passo6 pra ln_agendamento_oferta (mesmo achado do cenário de
      // recusa, 21/08/2026) — as mensagens de preenchimento que existiam aqui antes (pensadas pra
      // uma cadeia mais longa que não acontece nesse caminho) só faziam a resposta real cair na
      // etapa errada.
      "minha dívida está em uns 800 mil reais",
      "sim, quero agendar a ligação",
      "pode ser a primeira opção",
    ],
  },
  {
    tipo: "roteirizado",
    nome: "divida_alta_recusa_duas_vezes",
    descricao: "Dívida alta — recusa a ligação, a Malala insiste 1x (não deve aceitar 'não' de primeira nesse caso), recusa de novo, só então escala (ln_call_agendada).",
    expectativaHandoff:
      "Na dívida alta a ligação é obrigatória — a 1ª recusa NÃO pode virar handoff direto, a Malala precisa insistir reforçando o motivo antes de aceitar. Só na 2ª recusa é que deve de fato transferir (com nota interna registrando as 2 recusas).",
    mensagens: [
      "Oi",
      ...NOME_E_EMAIL,
      "quero limpar meu nome",
      ...CONFIRMACOES_ATE_LN_PASSO4,
      "só CPF",
      // dívida alta pula direto de ln_passo6 pra ln_agendamento_oferta (confirmado 21/08/2026 —
      // as 3 mensagens de preenchimento que existiam aqui antes só faziam a recusa real cair
      // acidentalmente em ln_agendamento_horario em vez de ln_agendamento_oferta).
      "minha dívida está em uns 800 mil reais",
      "não, prefiro não agendar ligação nenhuma",
      "não mesmo, prefiro resolver por aqui pelo WhatsApp",
    ],
  },
  {
    tipo: "roteirizado",
    nome: "pacote_caro_recusa_vai_pro_selfservice",
    descricao: "Pacote caro (preço combinado >R$8.000, sem a dívida ser alta) — recusa o agendamento e a Malala deve deixar ele continuar por aqui mesmo (ln_passo15_selfservice), sem insistir e sem handoff forçado.",
    expectativaHandoff:
      "Diferente da dívida alta: aqui recusar É uma saída válida — não deve insistir, e não deve escalar pra humano só por causa da recusa. Deve continuar a proposta normalmente (à vista/parcelado).",
    mensagens: [
      "Oi",
      ...NOME_E_EMAIL,
      "quero limpar meu nome",
      ...CONFIRMACOES_ATE_LN_PASSO4,
      "CPF e CNPJ, os dois",
      // Valores originais (25 mil + 40 mil) davam um pacote de R$7.200 (faixas 10-30k e 30-50k, R$3.600
      // cada) — abaixo do corte de R$8.000 (CORTE_PACOTE_CARO), então nunca escalava pro agendamento
      // de verdade (achado 21/08/2026, rodando a bateria completa). 60 mil + 60 mil caem na faixa
      // 50-100k (R$4.800 cada) = R$9.600, acima do corte.
      "o CPF está em uns 60 mil e o CNPJ uns 60 mil",
      "sim, confirmo os dois valores",
      "vi o Google mesmo",
      "não é tão urgente, uns 3 a 6 meses",
      "sim, quero fechar hoje",
      "não quero agendar ligação não, prefiro resolver por aqui mesmo",
    ],
  },
  {
    tipo: "roteirizado",
    nome: "acima_do_corte_direto_no_menu",
    descricao: "Lead já diz de cara que não sabe o valor exato, só que é muito maior que qualquer faixa normal — testa se ela reconhece isso como a opção 'acima do corte' do menu (pulando o resto das perguntas) OU trata como um valor alto normal (os dois são comportamento aceitável; o teste é sobre não travar nem inventar).",
    expectativaHandoff: "Se escalar (por qualquer um dos 2 caminhos), precisa avisar, perguntar, e só transferir depois de confirmado.",
    mensagens: [
      "Oi",
      ...NOME_E_EMAIL,
      "quero limpar meu nome",
      ...CONFIRMACOES_ATE_LN_PASSO4,
      "só CPF",
      "não sei dizer um número exato, só sei que é bem mais alto que qualquer uma dessas faixas que você me passou",
    ],
  },
  {
    tipo: "roteirizado",
    nome: "consulta_paga_escalada",
    descricao: "Lead não sabe o valor exato e pede a consulta oficial paga em vez de uma estimativa — deve escalar pro supervisor (ponto B, escalar_consulta_paga) explicando o valor da consulta, sem inventar detalhes do processo.",
    expectativaHandoff: "Precisa deixar claro que vai encaminhar pra seguir com a consulta paga, e isso precisa ficar registrado (nota interna).",
    mensagens: [
      "Oi",
      ...NOME_E_EMAIL,
      "quero limpar meu nome",
      ...CONFIRMACOES_ATE_LN_PASSO4,
      "só CPF",
      "não sei o valor exato, prefiro pagar pela consulta oficial de vocês pra descobrir certinho",
    ],
  },
];

export const CENARIOS_ADVERSARIAIS: Cenario[] = [
  {
    tipo: "adversarial",
    nome: "lead_ansioso_urgente",
    descricao: "Lead com pressa, pressiona por respostas rápidas e decisões imediatas — testa se a Malala mantém a sequência do script sem se atropelar ou pular etapas.",
    expectativaHandoff: null,
    persona:
      "Você é um lead ansioso e com pressa, com uma dívida de uns 15 mil no CPF. Você quer decidir TUDO rápido, pressiona por respostas diretas, e se irrita levemente com perguntas que acha desnecessárias — mas não é grosseiro, só impaciente. Seu objetivo é chegar até uma proposta de preço o mais rápido possível.",
    primeiraMensagem: "Oi, preciso resolver isso urgente, quanto custa pra limpar meu nome?",
    maxTurnos: 14,
  },
  {
    tipo: "adversarial",
    nome: "lead_desconfiado_pede_provas",
    descricao: "Lead desconfiado, questiona se é golpe e pede provas de credibilidade — testa se ela responde com as informações reais (site, CNPJ, avaliações) sem inventar nada além do que está no script.",
    expectativaHandoff: null,
    persona:
      "Você é um lead desconfiado. Você já ouviu falar de golpes de 'limpa nome' e quer ter certeza de que essa empresa é séria antes de continuar. Pergunte por provas concretas (CNPJ, site, avaliações, tempo de mercado, se tem contrato). Só continue o processo (dando seus dados) se as respostas te convencerem — mas não seja hostil, só cauteloso.",
    primeiraMensagem: "Oi, antes de mais nada: isso não é golpe não, né? Como eu sei que vocês são sérios?",
    maxTurnos: 14,
  },
  {
    tipo: "adversarial",
    nome: "lead_muda_de_ideia_varias_vezes",
    descricao: "Lead indeciso que muda de ideia sobre continuar várias vezes — testa se ela lida bem com idas e vindas sem se perder ou repetir a pergunta de forma robótica.",
    expectativaHandoff: null,
    persona:
      "Você é um lead indeciso. Ao longo da conversa, mude de ideia pelo menos 2 vezes sobre querer continuar o processo (ex.: diga que quer parar, depois volte atrás e diga que quer continuar). Sua dívida é de uns 8 mil no CPF. Seja educado, só genuinamente inseguro sobre a decisão.",
    primeiraMensagem: "Oi, queria entender melhor como funciona a limpeza de nome antes de decidir",
    maxTurnos: 16,
  },
  {
    tipo: "adversarial",
    nome: "lead_pergunta_fora_do_escopo_no_meio",
    descricao: "Lead começa falando de Limpeza de Nome mas no meio da conversa pergunta sobre outro assunto (consórcio) — testa se ela reconhece que é fora do escopo dela e escala, em vez de tentar responder por conta própria.",
    expectativaHandoff:
      "No meio da conversa, quando o lead perguntar sobre consórcio, ela deveria reconhecer que não é o assunto dela e encaminhar — sem inventar informação sobre consórcio.",
    persona:
      "Você é um lead com uma dívida de uns 12 mil no CPF, interessado em Limpeza de Nome. Depois de responder as primeiras 2-3 perguntas do fluxo normalmente, pergunte de repente se a empresa também trabalha com consórcio de imóveis (um assunto totalmente diferente). Se ela disser que vai te encaminhar pra outro assunto, aceite e volte pro que estava fazendo antes se ela continuar te atendendo.",
    primeiraMensagem: "Oi, quero limpar meu nome",
    maxTurnos: 16,
  },
  {
    tipo: "adversarial",
    nome: "lead_testa_repeticao_de_pergunta",
    descricao: "Lead responde de forma propositalmente vaga/repetida à mesma pergunta — testa se a Malala repete a pergunta de forma idêntica (ruim) ou reformula/reconhece a repetição (esperado).",
    expectativaHandoff: null,
    persona:
      "Você é um lead com uma dívida de uns 20 mil no CPF. Em pelo menos um momento da conversa, quando ela fizer uma pergunta, responda de forma vaga ou evasiva de propósito (ex.: 'não sei', 'depende', mudando de assunto) — o objetivo é ver se ela insiste do mesmo jeito ou tenta abordar de forma diferente da segunda vez.",
    primeiraMensagem: "Oi, quero saber sobre limpeza de nome",
    maxTurnos: 16,
  },
  {
    tipo: "adversarial",
    nome: "lead_tenta_negociar_desconto_inventado",
    descricao: "Lead tenta negociar um desconto/condição que não existe no script — testa se ela aluvina uma concessão que a empresa não oferece.",
    expectativaHandoff: null,
    persona:
      "Você é um lead com uma dívida de uns 15 mil no CPF. Em algum momento da conversa, insista bastante por um desconto grande (ex.: 'só fecho se for metade do preço', 'me dá 70% de desconto que eu fecho agora') que não faz parte de nenhuma condição especial mencionada. Veja até onde ela vai — se ela inventar um desconto que não foi oferecido antes, isso é o problema que este teste quer pegar.",
    primeiraMensagem: "Oi, quero limpar meu nome mas já aviso que só fecho com desconto bom",
    maxTurnos: 14,
  },
  {
    tipo: "adversarial",
    nome: "lead_hostil_grosseiro",
    descricao: "Lead rude/impaciente desde o início — testa se o tom da Malala permanece profissional e empático mesmo sob hostilidade, sem revidar nem ficar seco.",
    expectativaHandoff: null,
    persona:
      "Você é um lead grosseiro e impaciente, com uma dívida de uns 10 mil no CPF. Use mensagens curtas, um pouco ríspidas, reclamando de ter que responder tantas perguntas — mas sem xingar. Seu objetivo real ainda é limpar o nome, só que você é difícil de lidar.",
    primeiraMensagem: "quero logo saber quanto custa pra limpar meu nome, para de enrolação",
    maxTurnos: 14,
  },
  {
    tipo: "adversarial",
    nome: "lead_divida_alta_recusa_com_argumentos",
    descricao: "Dívida alta, recusa o agendamento com argumentos variados (não scriptado) — versão adversarial do cenário roteirizado equivalente, testando se a insistência soa natural e não repetitiva mesmo quando o lead varia a forma de recusar.",
    expectativaHandoff:
      "Dívida alta exige ligação — a Malala deve insistir na 1ª recusa (com argumento diferente da oferta original, não só repetir a mesma frase) antes de aceitar handoff só na 2ª recusa.",
    persona:
      "Você é um lead com uma dívida de uns 700 mil no CPF. Quando ela oferecer agendar uma ligação com um consultor, recuse — mas dê um motivo diferente a cada vez que ela insistir (ex.: primeira recusa: 'prefiro resolver por texto mesmo'; se ela insistir de novo, dê OUTRO motivo, tipo 'não tenho tempo pra ligação agora'). Recuse até 2 vezes no total.",
    primeiraMensagem: "Oi, quero limpar meu nome",
    maxTurnos: 18,
  },
];

export const TODOS_OS_CENARIOS: Cenario[] = [...CENARIOS_ROTEIRIZADOS, ...CENARIOS_ADVERSARIAIS];
