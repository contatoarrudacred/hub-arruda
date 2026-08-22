// Interpretador especializado de `tipo_resposta: "faixas_documentos"` (checkpoint ln_passo6).
//
// Menu fechado (correção 18/08/2026, Luiz) — 2 rodadas, mesma faixa assumida pra TODOS os
// documentos (confirmada por Luiz: "faremos a pergunta dessa forma pressupondo que todos os
// documentos estão na mesma faixa"):
//   1) Lead escolhe uma opção do menu numerado (formatarMenuFaixas) -> Malala confirma
//      (montarMensagemConfirmacaoFaixa), sem gravar nada ainda.
//   2) Lead confirma -> "completo", valor representativo da faixa pra cada documento.
//      Lead NÃO confirma -> cai pro extrator livre por documento (lógica antiga, pré-18/08), que
//      já suporta "explicar até ela entender qual a faixa de cada doc" via incompleto/nao_entendi.
//      Lead pede a consulta paga (R$39/doc) em qualquer rodada -> escala pra atendimento humano.
//
// Como o interpretador só recebe `dados` (sem histórico de turnos), o estado atravessa o turno via
// campos provisórios em `dados` (mesmo padrão de negociacao_pagamento): `_faixa_provisoria_indice`
// (índice escolhido, aguardando confirmação), `_faixas_modo_livre` ("1" depois que o lead não
// confirma — a partir daí sempre extrai texto livre, nunca mais volta a tratar a resposta como
// escolha de menu) e `_faixas_parcial_valores` (19/08/2026 — o valor já entendido de CADA
// documento no modo livre, acumulado entre tentativas; sem isso o interpretador esquecia o que já
// tinha sido dito e ficava em loop pedindo o mesmo documento pra sempre).

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { textoDeMensagem } from "./engine";
import {
  codificarParcialFaixas,
  decodificarParcialFaixas,
  mesclarAtualizacoesParciais,
  validarConfirmacaoFaixa,
  validarEscolhaFaixaMenu,
  type ItemAtualizacaoParcial,
  type RespostaBrutaConfirmacaoFaixa,
  type RespostaBrutaEscolhaFaixaMenu,
  type RespostaBrutaModoLivre,
} from "./interpretar-faixas-documentos-validacao";
import { blocoPromptConteudoExtra, propriedadesSchemaConteudoExtra, resolverConteudoExtra } from "./interpretar-desvio-validacao";
import { formatarMenuFaixas, montarMensagemConfirmacaoFaixa, ordenarFaixasPreco, valorRepresentativoFaixa, type FaixaPreco } from "./regras-limpeza-nome";
import type {
  ConteudoExtraDetectado,
  DadosConversa,
  EtapaCarregada,
  FaixaDocumentoCapturada,
  FaqParaDesvio,
  InterpretadorFaixasDocumentos,
  ObjecaoParaDesvio,
  ResultadoInterpretacaoFaixasDocumentos,
} from "./tipos";

const MODELO_INTERPRETACAO = "claude-haiku-4-5-20251001";

const MENSAGEM_CONSULTA_PAGA =
  "Sem problema! Podemos fazer uma consulta oficial pra saber o valor exato — ela custa R$39 por documento. Se preferir seguir com uma estimativa por faixa, é só me dizer 👍";

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

// --- Rodada 1: escolha de faixa no menu fechado ---------------------------------------------

function ferramentaEscolhaMenu(qtdFaixas: number, temOpcaoAcimaDoCorte: boolean) {
  return {
    name: "interpretar_escolha_faixa",
    description:
      "Identifica qual opção do menu numerado o lead escolheu pra descrever a faixa de restrição (a mesma faixa vale pra todos os documentos dele), ou se ele quer a consulta oficial paga, ou se a resposta não bate com nenhuma opção do menu.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["faixa_escolhida", "acima_do_corte", "quer_consulta_paga", "nao_entendi"],
          description: [
            "'faixa_escolhida' quando o lead indicou claramente uma das opções numeradas de faixa (por número, ou descrevendo um valor que cai numa faixa).",
            temOpcaoAcimaDoCorte
              ? "'acima_do_corte' quando ele escolheu a última opção do menu (a que diz 'Acima de X mil') — nunca preencher indice_faixa nesse caso."
              : null,
            "'quer_consulta_paga' quando ele pede a consulta oficial/paga em vez de estimar. 'nao_entendi' quando a resposta não tem nada a ver com isso.",
          ]
            .filter(Boolean)
            .join(" "),
        },
        indice_faixa: {
          type: "number",
          description: `Número da opção de faixa escolhida no menu, de 1 a ${qtdFaixas} — só preencher com certeza quando status=faixa_escolhida (nunca pra acima_do_corte).`,
        },
      },
      required: ["status", "indice_faixa"],
    },
  };
}

function montarPromptEscolhaMenu(params: { menu: string; respostaLead: string }): string {
  return [
    "Você ajuda a entender qual faixa de valor de restrição um lead escolheu, num atendimento automatizado de WhatsApp (ArrudaCred, empresa de limpeza de nome/crédito). O lead já viu este menu numerado:",
    "",
    params.menu,
    "",
    `Resposta do lead: "${params.respostaLead}"`,
    "",
    "O lead pode responder com o número da opção, escrevendo o texto da opção, ou descrevendo um valor aproximado que se encaixe numa das faixas acima (ex.: 'uns 15 mil' cai na faixa que cobre 15 mil). Use a ferramenta pra registrar o resultado.",
  ].join("\n");
}

async function interpretarEscolhaMenu(params: {
  menu: string;
  respostaLead: string;
  qtdFaixas: number;
  temOpcaoAcimaDoCorte: boolean;
}): Promise<ReturnType<typeof validarEscolhaFaixaMenu>> {
  try {
    // obterCliente() dentro do try de propósito (achado real, 18/08/2026, ver interpretacao-ia.ts).
    const cliente = obterCliente();
    const resposta = await cliente.messages.create({
      model: MODELO_INTERPRETACAO,
      max_tokens: 400,
      tools: [ferramentaEscolhaMenu(params.qtdFaixas, params.temOpcaoAcimaDoCorte)],
      tool_choice: { type: "tool", name: "interpretar_escolha_faixa" },
      messages: [{ role: "user", content: montarPromptEscolhaMenu(params) }],
    });

    const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
    if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") return { tipo: "nao_entendi" };

    const bruta = blocoFerramenta.input as RespostaBrutaEscolhaFaixaMenu;
    return validarEscolhaFaixaMenu(bruta, params.qtdFaixas);
  } catch (e) {
    console.error("[interpretar-faixas-documentos] erro ao chamar Claude (escolha de menu):", e);
    return { tipo: "nao_entendi" };
  }
}

// --- Rodada 2: confirmação da faixa escolhida ------------------------------------------------

function ferramentaConfirmacaoFaixa(qtdFaqs: number, qtdObjecoes: number) {
  return {
    name: "interpretar_confirmacao_faixa",
    description:
      "Identifica se o lead confirmou a faixa de restrição proposta pela Malala, se ele pediu a consulta oficial paga, ou se ele não confirmou (nesse caso ele provavelmente está explicando os valores reais, que serão tratados à parte).",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["confirmado", "quer_consulta_paga", "nao_confirmado"] },
        ...propriedadesSchemaConteudoExtra(qtdFaqs, qtdObjecoes),
      },
      required: ["status"],
    },
  };
}

function montarPromptConfirmacaoFaixa(params: {
  perguntaConfirmacao: string;
  respostaLead: string;
  faqsAtivas: FaqParaDesvio[];
  objecoesAtivas: ObjecaoParaDesvio[];
}): string {
  return [
    "Você ajuda a entender se um lead confirmou uma faixa de restrição estimada, num atendimento automatizado de WhatsApp (ArrudaCred, empresa de limpeza de nome/crédito). A Malala perguntou:",
    "",
    `"""\n${params.perguntaConfirmacao}\n"""`,
    "",
    `Resposta do lead: "${params.respostaLead}"`,
    "",
    "Use a ferramenta pra registrar se ele confirmou, se pediu a consulta oficial paga (R$39/documento), ou se não confirmou (qualquer coisa diferente de uma confirmação clara — inclusive quando ele começa a explicar valores diferentes).",
    blocoPromptConteudoExtra(params.faqsAtivas, params.objecoesAtivas),
  ].join("\n");
}

async function interpretarConfirmacao(params: {
  perguntaConfirmacao: string;
  respostaLead: string;
  faqsAtivas: FaqParaDesvio[];
  objecoesAtivas: ObjecaoParaDesvio[];
}): Promise<{ resultado: ReturnType<typeof validarConfirmacaoFaixa>; conteudoExtra: ConteudoExtraDetectado }> {
  const { faqsAtivas, objecoesAtivas } = params;
  try {
    const cliente = obterCliente();
    const resposta = await cliente.messages.create({
      model: MODELO_INTERPRETACAO,
      max_tokens: 200,
      tools: [ferramentaConfirmacaoFaixa(faqsAtivas.length, objecoesAtivas.length)],
      tool_choice: { type: "tool", name: "interpretar_confirmacao_faixa" },
      messages: [{ role: "user", content: montarPromptConfirmacaoFaixa(params) }],
    });

    const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
    if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") return { resultado: "nao_confirmado", conteudoExtra: null };

    const bruta = blocoFerramenta.input as RespostaBrutaConfirmacaoFaixa & { indice_faq_extra?: number; indice_objecao_extra?: number };
    return {
      resultado: validarConfirmacaoFaixa(bruta),
      conteudoExtra: resolverConteudoExtra(bruta, faqsAtivas, objecoesAtivas),
    };
  } catch (e) {
    console.error("[interpretar-faixas-documentos] erro ao chamar Claude (confirmação):", e);
    return { resultado: "nao_confirmado", conteudoExtra: null };
  }
}

// --- Modo livre: extrai valor por documento de texto livre, acumulando entre tentativas --------
//
// Reescrito 19/08/2026 (Luiz, log real de produção) — a versão anterior pedia TODOS os documentos
// numa resposta só, sem lembrar nada de tentativas passadas: cada resposta caía contra a pergunta
// ORIGINAL do zero, então uma resposta clara tipo "menos de 10" (respondendo "e o segundo CPF?")
// nunca fechava o checkpoint — a Malala esquecia o primeiro CPF (já confirmado 2 mensagens antes)
// e voltava a perguntar "e o segundo CPF?" pra sempre, em loop. Agora o interpretador só precisa
// dizer o que a resposta ATUAL esclarece ou corrige (`atualizacoes`, por índice) — a mesclagem com
// o que já era sabido é feita em código (`mesclarAtualizacoesParciais`), nunca esquecida.

function ferramentaModoLivre(tiposEsperados: ("cpf" | "cnpj")[], qtdFaqs: number, qtdObjecoes: number) {
  const legenda = tiposEsperados.map((t, i) => `${i + 1}=${t.toUpperCase()}`).join(", ");
  return {
    name: "atualizar_faixas_documentos",
    description:
      "Registra as atualizações de valor de restrição que a resposta do lead traz pra cada documento — só o que essa resposta esclarece ou corrige, nunca repetindo o que já era sabido.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["completo", "incompleto", "nao_entendi"],
          description:
            "'completo' se, somando esta resposta ao que já sabíamos, não falta mais nenhum documento. 'incompleto' se ainda faltar pelo menos um. 'nao_entendi' se a resposta não tem nada a ver com valor de restrição — nesse caso 'atualizacoes' fica vazio.",
        },
        atualizacoes: {
          type: "array",
          description: `Só os documentos que ESTA resposta esclarece ou corrige (pode ser 0, 1, ou vários) — índice de 1 a ${tiposEsperados.length}, nesta ordem: ${legenda}.`,
          items: {
            type: "object",
            properties: {
              indice: { type: "integer", description: `Posição do documento, de 1 a ${tiposEsperados.length}.` },
              tipo: { type: "string", enum: ["cpf", "cnpj"] },
              sabe_valor: {
                type: "boolean",
                description: "false quando o lead respondeu 'não sei' (ou equivalente) pra este documento específico.",
              },
              valor_aproximado: {
                type: "number",
                description: "Valor aproximado em reais pra este documento. 0 quando sabe_valor=false.",
              },
            },
            required: ["indice", "tipo", "sabe_valor", "valor_aproximado"],
          },
        },
        pergunta_esclarecimento: {
          type: "string",
          description:
            "Só quando ainda faltar informação depois desta resposta: pergunta curta e específica em português, no tom da Malala, pedindo só o que falta — NUNCA pergunte de novo algo que já sabemos (ver 'o que já sabemos' no prompt).",
        },
        ...propriedadesSchemaConteudoExtra(qtdFaqs, qtdObjecoes),
      },
      required: ["status", "atualizacoes", "pergunta_esclarecimento"],
    },
  };
}

function montarPromptModoLivre(params: {
  etapaAtual: EtapaCarregada;
  respostaLead: string;
  tiposEsperados: ("cpf" | "cnpj")[];
  parcialAnterior: (FaixaDocumentoCapturada | null)[];
  faqsAtivas: FaqParaDesvio[];
  objecoesAtivas: ObjecaoParaDesvio[];
}): string {
  const { etapaAtual, respostaLead, tiposEsperados, parcialAnterior, faqsAtivas, objecoesAtivas } = params;
  const pergunta = etapaAtual.conteudo.mensagens.map(textoDeMensagem).join("\n");
  const linhasConhecidas = tiposEsperados
    .map((tipo, i) => {
      const rotulo = `${i + 1}. ${tipo.toUpperCase()}`;
      const item = parcialAnterior[i];
      if (item === null) return `${rotulo}: ainda não sabemos o valor.`;
      if (item.valorAproximado === null) return `${rotulo}: o lead já disse "não sei" (resposta final, válida).`;
      return `${rotulo}: R$ ${item.valorAproximado} (entendido até agora — se a resposta do lead corrigir ESTE documento, atualize).`;
    })
    .join("\n");

  return [
    "Você ajuda a entender a faixa de valor de restrição de cada documento que um lead quer limpar, num atendimento automatizado de WhatsApp (ArrudaCred, empresa de limpeza de nome/crédito). Esta é uma conversa em andamento — o lead já respondeu sobre alguns documentos antes.",
    "",
    `O que já sabemos sobre cada documento, nesta ordem:\n${linhasConhecidas}`,
    "",
    `Pergunta feita originalmente ao lead:\n"""\n${pergunta}\n"""`,
    "",
    `Resposta do lead agora: "${respostaLead}"`,
    "",
    "Use a ferramenta pra registrar SÓ o que esta resposta esclarece ou corrige — não repita o que já sabíamos e não foi mencionado agora. Se o lead corrigir um valor que já tínhamos (ex.: 'não, o do meu filho é menos de 10'), inclua uma atualização só pra aquele índice. PREFIRA extrair o que der com confiança razoável — não exija precisão além do que o lead deu, e não peça nenhum detalhe que não seja o valor aproximado (não pergunte de quem é o documento, forma de pagamento, ou qualquer coisa que não mude o valor).",
    blocoPromptConteudoExtra(faqsAtivas, objecoesAtivas),
  ].join("\n");
}

async function interpretarModoLivre(params: {
  etapaAtual: EtapaCarregada;
  respostaLead: string;
  tiposEsperados: ("cpf" | "cnpj")[];
  dados: DadosConversa;
  dadosExtras: DadosConversa;
  faqsAtivas: FaqParaDesvio[];
  objecoesAtivas: ObjecaoParaDesvio[];
}): Promise<ResultadoInterpretacaoFaixasDocumentos> {
  const { etapaAtual, respostaLead, tiposEsperados, dados, dadosExtras, faqsAtivas, objecoesAtivas } = params;
  const parcialAnterior = decodificarParcialFaixas(dados._faixas_parcial_valores ?? "", tiposEsperados);
  const nadaSabidoAinda = parcialAnterior.every((item) => item === null);

  const construir = (
    atualizacoes: ItemAtualizacaoParcial[],
    perguntaSugerida: string | undefined,
    conteudoExtra: ConteudoExtraDetectado,
  ): ResultadoInterpretacaoFaixasDocumentos => {
    const mesclado = mesclarAtualizacoesParciais(parcialAnterior, atualizacoes, tiposEsperados);
    if (mesclado.every((item): item is FaixaDocumentoCapturada => item !== null)) {
      return { status: "completo", itens: mesclado, conteudoExtra };
    }
    const pergunta = perguntaSugerida?.trim() || "Só falta confirmar o valor aproximado (ou 'não sei') do(s) documento(s) que ainda faltam — pode me dizer?";
    return {
      status: "incompleto",
      perguntaEsclarecimento: pergunta,
      dadosParciais: { ...dadosExtras, _faixas_parcial_valores: codificarParcialFaixas(mesclado) },
    };
  };

  try {
    const cliente = obterCliente();
    const resposta = await cliente.messages.create({
      model: MODELO_INTERPRETACAO,
      max_tokens: 800,
      tools: [ferramentaModoLivre(tiposEsperados, faqsAtivas.length, objecoesAtivas.length)],
      tool_choice: { type: "tool", name: "atualizar_faixas_documentos" },
      messages: [
        {
          role: "user",
          content: montarPromptModoLivre({ etapaAtual, respostaLead, tiposEsperados, parcialAnterior, faqsAtivas, objecoesAtivas }),
        },
      ],
    });

    const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
    if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") {
      // Falha bruta da IA — se já tínhamos progresso, não descarta: repete o que falta em vez de
      // voltar pro fallback genérico (que reexibiria o menu do ln_passo6, perdendo o contexto).
      if (nadaSabidoAinda) return { status: "nao_entendi" };
      return construir([], undefined, null);
    }

    const bruta = blocoFerramenta.input as RespostaBrutaModoLivre & { indice_faq_extra?: number; indice_objecao_extra?: number };
    if ((!bruta.atualizacoes || bruta.atualizacoes.length === 0) && nadaSabidoAinda) {
      return { status: "nao_entendi" };
    }
    const conteudoExtra = resolverConteudoExtra(bruta, faqsAtivas, objecoesAtivas);
    return construir(bruta.atualizacoes ?? [], bruta.pergunta_esclarecimento, conteudoExtra);
  } catch (e) {
    console.error("[interpretar-faixas-documentos] erro ao chamar Claude (modo livre):", e);
    if (nadaSabidoAinda) return { status: "nao_entendi" };
    return construir([], undefined, null);
  }
}

// --- Fábrica -----------------------------------------------------------------------------------

/**
 * `corteAltoValor`, quando passado, acrescenta a opção virtual "Acima de X mil" no menu (mesma
 * flag de `formatarMenuFaixas`) — spec 2026-08-20-agendamento-consultor-alto-valor.md. Escolher
 * essa opção retorna `{ status: "acima_do_corte" }` direto na rodada 1, sem rodada de confirmação
 * (decisão de Luiz: não faz sentido confirmar um valor que não existe de verdade) — o `engine.ts`
 * roteia isso pro fluxo de agendamento com consultor, sem perguntar a faixa dos outros documentos.
 */
export function criarInterpretadorFaixasDocumentos(
  faixasPrecos: FaixaPreco[],
  corteAltoValor?: number,
  faqsAtivas: FaqParaDesvio[] = [],
  objecoesAtivas: ObjecaoParaDesvio[] = [],
): InterpretadorFaixasDocumentos {
  const faixasOrdenadas = ordenarFaixasPreco(faixasPrecos);
  const menu = formatarMenuFaixas(faixasPrecos, corteAltoValor);
  const temOpcaoAcimaDoCorte = corteAltoValor !== undefined;

  return async ({ etapaAtual, respostaLead, dados }) => {
    const tiposEsperados = (dados.documentos_tipos ?? "")
      .split(",")
      .filter((t): t is "cpf" | "cnpj" => t === "cpf" || t === "cnpj");
    if (tiposEsperados.length === 0) return { status: "nao_entendi" };

    if (dados._faixas_modo_livre === "1") {
      return await interpretarModoLivre({
        etapaAtual,
        respostaLead,
        tiposEsperados,
        dados,
        dadosExtras: { _faixas_modo_livre: "1" },
        faqsAtivas,
        objecoesAtivas,
      });
    }

    if (dados._faixa_provisoria_indice) {
      const indice = Number(dados._faixa_provisoria_indice);
      const faixa = faixasOrdenadas[indice];
      if (!faixa) {
        // estado provisório inconsistente (defensivo) — trata como se a rodada de confirmação não existisse.
        return await escolherFaixaDoMenu({ menu, faixasOrdenadas, respostaLead, tiposEsperados, temOpcaoAcimaDoCorte, etapaAtual, dados, faqsAtivas, objecoesAtivas });
      }

      const perguntaConfirmacao = montarMensagemConfirmacaoFaixa(faixa, indice === 0, tiposEsperados);
      const confirmacao = await interpretarConfirmacao({ perguntaConfirmacao, respostaLead, faqsAtivas, objecoesAtivas });

      if (confirmacao.resultado === "confirmado") {
        const valor = valorRepresentativoFaixa(faixa);
        return {
          status: "completo",
          itens: tiposEsperados.map((tipo) => ({ tipo, valorAproximado: valor })),
          conteudoExtra: confirmacao.conteudoExtra,
        };
      }
      if (confirmacao.resultado === "quer_consulta_paga") {
        return { status: "escalar_consulta_paga", mensagem: MENSAGEM_CONSULTA_PAGA };
      }

      // não confirmado — a resposta provavelmente já é a explicação dos valores reais. Em vez de
      // descartar o turno, entra em modo livre já SEMEADO com o valor que estava sendo proposto pra
      // TODOS os documentos (era a faixa que ia valer "pra cada um deles") — assim "não, o do meu
      // filho é menos de 10" só precisa corrigir o índice mencionado, o resto fica como estava.
      const valorProposto = valorRepresentativoFaixa(faixa);
      const dadosComSeed: DadosConversa = {
        ...dados,
        _faixas_parcial_valores: codificarParcialFaixas(tiposEsperados.map((tipo) => ({ tipo, valorAproximado: valorProposto }))),
      };
      return await interpretarModoLivre({
        etapaAtual,
        respostaLead,
        tiposEsperados,
        dados: dadosComSeed,
        dadosExtras: { _faixa_provisoria_indice: "", _faixas_modo_livre: "1" },
        faqsAtivas,
        objecoesAtivas,
      });
    }

    return await escolherFaixaDoMenu({ menu, faixasOrdenadas, respostaLead, tiposEsperados, temOpcaoAcimaDoCorte, etapaAtual, dados, faqsAtivas, objecoesAtivas });
  };
}

async function escolherFaixaDoMenu(params: {
  menu: string;
  faixasOrdenadas: FaixaPreco[];
  respostaLead: string;
  tiposEsperados: ("cpf" | "cnpj")[];
  temOpcaoAcimaDoCorte: boolean;
  etapaAtual: EtapaCarregada;
  dados: DadosConversa;
  faqsAtivas: FaqParaDesvio[];
  objecoesAtivas: ObjecaoParaDesvio[];
}): Promise<ResultadoInterpretacaoFaixasDocumentos> {
  const { menu, faixasOrdenadas, respostaLead, tiposEsperados, temOpcaoAcimaDoCorte, etapaAtual, dados, faqsAtivas, objecoesAtivas } = params;
  const escolha = await interpretarEscolhaMenu({ menu, respostaLead, qtdFaixas: faixasOrdenadas.length, temOpcaoAcimaDoCorte });

  if (escolha.tipo === "quer_consulta_paga") {
    return { status: "escalar_consulta_paga", mensagem: MENSAGEM_CONSULTA_PAGA };
  }
  if (escolha.tipo === "acima_do_corte") return { status: "acima_do_corte" };
  if (escolha.tipo === "nao_entendi") {
    // Achado 3 (21/08/2026, bateria de testes da Malala): quando o lead pula o menu e já responde
    // com valores específicos por documento (ex.: "o CPF está em uns 25 mil e o CNPJ uns 40 mil"),
    // a IA de rodada 1 não reconhece isso como escolha de menu — sem este fallback, o checkpoint
    // ficava preso pra sempre repetindo a mesma pergunta (nunca chegava a setar
    // `_faixa_provisoria_indice` nem `_faixas_modo_livre`, os dois únicos jeitos de sair do menu).
    // Tenta o extrator de texto livre antes de desistir — é o mesmo caminho que já existe quando o
    // lead REJEITA uma faixa proposta (linhas abaixo), só que aqui sem valor nenhum pra semear.
    return await interpretarModoLivre({
      etapaAtual,
      respostaLead,
      tiposEsperados,
      dados,
      dadosExtras: { _faixas_modo_livre: "1" },
      faqsAtivas,
      objecoesAtivas,
    });
  }

  const faixa = faixasOrdenadas[escolha.indice];
  const perguntaEsclarecimento = montarMensagemConfirmacaoFaixa(faixa, escolha.indice === 0, tiposEsperados);
  return {
    status: "incompleto",
    perguntaEsclarecimento,
    dadosParciais: { _faixa_provisoria_indice: String(escolha.indice) },
  };
}
