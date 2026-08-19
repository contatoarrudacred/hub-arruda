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
// Como o interpretador só recebe `dados` (sem histórico de turnos), o estado das 2 rodadas
// atravessa o turno via 2 campos provisórios em `dados` (mesmo padrão de negociacao_pagamento):
// `_faixa_provisoria_indice` (índice escolhido, aguardando confirmação) e `_faixas_modo_livre`
// ("1" depois que o lead não confirma — a partir daí sempre extrai texto livre, nunca mais volta
// a tratar a resposta como escolha de menu).

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { textoDeMensagem } from "./engine";
import {
  validarConfirmacaoFaixa,
  validarEscolhaFaixaMenu,
  validarRespostaFaixasDocumentos,
  type RespostaBrutaConfirmacaoFaixa,
  type RespostaBrutaEscolhaFaixaMenu,
  type RespostaBrutaFaixasDocumentos,
} from "./interpretar-faixas-documentos-validacao";
import { formatarMenuFaixas, montarMensagemConfirmacaoFaixa, ordenarFaixasPreco, valorRepresentativoFaixa, type FaixaPreco } from "./regras-limpeza-nome";
import type { DadosConversa, EtapaCarregada, InterpretadorFaixasDocumentos, ResultadoInterpretacaoFaixasDocumentos } from "./tipos";

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

function ferramentaEscolhaMenu(qtdFaixas: number) {
  return {
    name: "interpretar_escolha_faixa",
    description:
      "Identifica qual opção do menu numerado o lead escolheu pra descrever a faixa de restrição (a mesma faixa vale pra todos os documentos dele), ou se ele quer a consulta oficial paga, ou se a resposta não bate com nenhuma opção do menu.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["faixa_escolhida", "quer_consulta_paga", "nao_entendi"],
          description:
            "'faixa_escolhida' quando o lead indicou claramente uma das opções do menu (por número, ou descrevendo um valor que cai numa faixa). 'quer_consulta_paga' quando ele pede a consulta oficial/paga em vez de estimar. 'nao_entendi' quando a resposta não tem nada a ver com isso.",
        },
        indice_faixa: {
          type: "number",
          description: `Número da opção escolhida no menu, de 1 a ${qtdFaixas} — só preencher com certeza quando status=faixa_escolhida.`,
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
}): Promise<ReturnType<typeof validarEscolhaFaixaMenu>> {
  try {
    // obterCliente() dentro do try de propósito (achado real, 18/08/2026, ver interpretacao-ia.ts).
    const cliente = obterCliente();
    const resposta = await cliente.messages.create({
      model: MODELO_INTERPRETACAO,
      max_tokens: 400,
      tools: [ferramentaEscolhaMenu(params.qtdFaixas)],
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

function ferramentaConfirmacaoFaixa() {
  return {
    name: "interpretar_confirmacao_faixa",
    description:
      "Identifica se o lead confirmou a faixa de restrição proposta pela Malala, se ele pediu a consulta oficial paga, ou se ele não confirmou (nesse caso ele provavelmente está explicando os valores reais, que serão tratados à parte).",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["confirmado", "quer_consulta_paga", "nao_confirmado"] },
      },
      required: ["status"],
    },
  };
}

function montarPromptConfirmacaoFaixa(params: { perguntaConfirmacao: string; respostaLead: string }): string {
  return [
    "Você ajuda a entender se um lead confirmou uma faixa de restrição estimada, num atendimento automatizado de WhatsApp (ArrudaCred, empresa de limpeza de nome/crédito). A Malala perguntou:",
    "",
    `"""\n${params.perguntaConfirmacao}\n"""`,
    "",
    `Resposta do lead: "${params.respostaLead}"`,
    "",
    "Use a ferramenta pra registrar se ele confirmou, se pediu a consulta oficial paga (R$39/documento), ou se não confirmou (qualquer coisa diferente de uma confirmação clara — inclusive quando ele começa a explicar valores diferentes).",
  ].join("\n");
}

async function interpretarConfirmacao(params: {
  perguntaConfirmacao: string;
  respostaLead: string;
}): Promise<ReturnType<typeof validarConfirmacaoFaixa>> {
  try {
    const cliente = obterCliente();
    const resposta = await cliente.messages.create({
      model: MODELO_INTERPRETACAO,
      max_tokens: 200,
      tools: [ferramentaConfirmacaoFaixa()],
      tool_choice: { type: "tool", name: "interpretar_confirmacao_faixa" },
      messages: [{ role: "user", content: montarPromptConfirmacaoFaixa(params) }],
    });

    const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
    if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") return "nao_confirmado";

    const bruta = blocoFerramenta.input as RespostaBrutaConfirmacaoFaixa;
    return validarConfirmacaoFaixa(bruta);
  } catch (e) {
    console.error("[interpretar-faixas-documentos] erro ao chamar Claude (confirmação):", e);
    return "nao_confirmado";
  }
}

// --- Modo livre (lógica original, pré-18/08/2026): extrai valor por documento de texto livre --

function ferramentaModoLivre(tiposEsperados: ("cpf" | "cnpj")[]) {
  return {
    name: "interpretar_faixas_documentos",
    description:
      "Registra a faixa de valor aproximada de cada documento que o lead quer limpar, ou pede esclarecimento quando falta informação de algum.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["completo", "incompleto", "nao_entendi"],
          description:
            "'completo' só quando tiver um valor aproximado (ou 'não sei' explícito) pra CADA UM dos documentos. 'incompleto' quando faltar informação de pelo menos um documento — gere uma pergunta de esclarecimento específica pedindo só o que falta. 'nao_entendi' quando a resposta não tem nada a ver com valores de restrição.",
        },
        itens: {
          type: "array",
          description: `Exatamente ${tiposEsperados.length} item(ns), nesta ordem exata de tipo: ${tiposEsperados.join(", ")}. Só preencher com certeza quando status=completo.`,
          items: {
            type: "object",
            properties: {
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
            required: ["tipo", "sabe_valor", "valor_aproximado"],
          },
        },
        pergunta_esclarecimento: {
          type: "string",
          description:
            "Só quando status=incompleto: pergunta curta e específica em português, no tom da Malala, pedindo só a informação que falta (não repita a pergunta original inteira).",
        },
      },
      required: ["status", "itens", "pergunta_esclarecimento"],
    },
  };
}

function montarPromptModoLivre(params: { etapaAtual: EtapaCarregada; respostaLead: string; tiposEsperados: ("cpf" | "cnpj")[] }): string {
  const { etapaAtual, respostaLead, tiposEsperados } = params;
  const pergunta = etapaAtual.conteudo.mensagens.map(textoDeMensagem).join("\n");
  const listaDocumentos = tiposEsperados.map((tipo, i) => `${i + 1}. ${tipo.toUpperCase()}`).join("\n");

  return [
    "Você ajuda a entender a faixa de valor de restrição de cada documento que um lead quer limpar, num atendimento automatizado de WhatsApp (ArrudaCred, empresa de limpeza de nome/crédito). O lead não confirmou uma estimativa por faixa e está explicando os valores reais.",
    "",
    `Documentos já confirmados nesta conversa, nesta ordem:\n${listaDocumentos}`,
    "",
    `Pergunta feita ao lead:\n"""\n${pergunta}\n"""`,
    "",
    `Resposta do lead: "${respostaLead}"`,
    "",
    "O lead pode responder com valores aproximados por extenso, com gírias, ou dizer 'não sei' pra qualquer documento (isso é uma resposta válida, não bloqueia o status completo). Use a ferramenta pra registrar o resultado, na mesma ordem dos documentos listados acima. Só marque 'completo' quando tiver informação (valor OU 'não sei' explícito) de TODOS os documentos — é melhor pedir esclarecimento do que assumir errado.",
  ].join("\n");
}

async function interpretarModoLivre(params: {
  etapaAtual: EtapaCarregada;
  respostaLead: string;
  tiposEsperados: ("cpf" | "cnpj")[];
}): Promise<ResultadoInterpretacaoFaixasDocumentos> {
  const { tiposEsperados } = params;
  try {
    const cliente = obterCliente();
    const resposta = await cliente.messages.create({
      model: MODELO_INTERPRETACAO,
      max_tokens: 800,
      tools: [ferramentaModoLivre(tiposEsperados)],
      tool_choice: { type: "tool", name: "interpretar_faixas_documentos" },
      messages: [{ role: "user", content: montarPromptModoLivre(params) }],
    });

    const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
    if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") return { status: "nao_entendi" };

    const bruta = blocoFerramenta.input as RespostaBrutaFaixasDocumentos;
    return validarRespostaFaixasDocumentos(bruta, tiposEsperados);
  } catch (e) {
    console.error("[interpretar-faixas-documentos] erro ao chamar Claude (modo livre):", e);
    return { status: "nao_entendi" };
  }
}

/** Sempre sai do modo livre com `incompleto` ou `completo` — nunca `nao_entendi` bruto, senão o sentinel de estado (`_faixas_modo_livre`) fica pendurado e o próximo turno cai no fallback genérico (repete o menu) sem saber que já estava em modo livre. */
function normalizarSaidaModoLivre(resultado: ResultadoInterpretacaoFaixasDocumentos, dadosExtras: DadosConversa): ResultadoInterpretacaoFaixasDocumentos {
  if (resultado.status === "completo" || resultado.status === "escalar_consulta_paga") return resultado;
  if (resultado.status === "incompleto") {
    return { ...resultado, dadosParciais: { ...dadosExtras, ...(resultado.dadosParciais ?? {}) } };
  }
  return {
    status: "incompleto",
    perguntaEsclarecimento: "Desculpa, não entendi — pode me dizer o valor aproximado de restrição (ou 'não sei') pra cada documento?",
    dadosParciais: dadosExtras,
  };
}

// --- Fábrica -----------------------------------------------------------------------------------

export function criarInterpretadorFaixasDocumentos(faixasPrecos: FaixaPreco[]): InterpretadorFaixasDocumentos {
  const faixasOrdenadas = ordenarFaixasPreco(faixasPrecos);
  const menu = formatarMenuFaixas(faixasPrecos);

  return async ({ etapaAtual, respostaLead, dados }) => {
    const tiposEsperados = (dados.documentos_tipos ?? "")
      .split(",")
      .filter((t): t is "cpf" | "cnpj" => t === "cpf" || t === "cnpj");
    if (tiposEsperados.length === 0) return { status: "nao_entendi" };

    const saindoDeRodada: DadosConversa = { _faixa_provisoria_indice: "", _faixas_modo_livre: "1" };

    if (dados._faixas_modo_livre === "1") {
      const resultado = await interpretarModoLivre({ etapaAtual, respostaLead, tiposEsperados });
      return normalizarSaidaModoLivre(resultado, { _faixas_modo_livre: "1" });
    }

    if (dados._faixa_provisoria_indice) {
      const indice = Number(dados._faixa_provisoria_indice);
      const faixa = faixasOrdenadas[indice];
      if (!faixa) {
        // estado provisório inconsistente (defensivo) — trata como se a rodada de confirmação não existisse.
        return await escolherFaixaDoMenu({ menu, faixasOrdenadas, respostaLead, tiposEsperados });
      }

      const perguntaConfirmacao = montarMensagemConfirmacaoFaixa(faixa, indice === 0, tiposEsperados);
      const confirmacao = await interpretarConfirmacao({ perguntaConfirmacao, respostaLead });

      if (confirmacao === "confirmado") {
        const valor = valorRepresentativoFaixa(faixa);
        return { status: "completo", itens: tiposEsperados.map((tipo) => ({ tipo, valorAproximado: valor })) };
      }
      if (confirmacao === "quer_consulta_paga") {
        return { status: "escalar_consulta_paga", mensagem: MENSAGEM_CONSULTA_PAGA };
      }

      // não confirmado — a resposta provavelmente já é a explicação dos valores reais, então
      // tenta extrair direto (em vez de descartar o turno), já entrando em modo livre daqui pra frente.
      const resultadoLivre = await interpretarModoLivre({ etapaAtual, respostaLead, tiposEsperados });
      return normalizarSaidaModoLivre(resultadoLivre, saindoDeRodada);
    }

    return await escolherFaixaDoMenu({ menu, faixasOrdenadas, respostaLead, tiposEsperados });
  };
}

async function escolherFaixaDoMenu(params: {
  menu: string;
  faixasOrdenadas: FaixaPreco[];
  respostaLead: string;
  tiposEsperados: ("cpf" | "cnpj")[];
}): Promise<ResultadoInterpretacaoFaixasDocumentos> {
  const { menu, faixasOrdenadas, respostaLead, tiposEsperados } = params;
  const escolha = await interpretarEscolhaMenu({ menu, respostaLead, qtdFaixas: faixasOrdenadas.length });

  if (escolha.tipo === "quer_consulta_paga") {
    return { status: "escalar_consulta_paga", mensagem: MENSAGEM_CONSULTA_PAGA };
  }
  if (escolha.tipo === "nao_entendi") return { status: "nao_entendi" };

  const faixa = faixasOrdenadas[escolha.indice];
  const perguntaEsclarecimento = montarMensagemConfirmacaoFaixa(faixa, escolha.indice === 0, tiposEsperados);
  return {
    status: "incompleto",
    perguntaEsclarecimento,
    dadosParciais: { _faixa_provisoria_indice: String(escolha.indice) },
  };
}
