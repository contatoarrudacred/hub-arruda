// Interpretador especializado de `tipo_resposta: "lista_documentos"` (suporte a "pacote" de N
// CPF/CNPJ — Bloco C, PLANO_MESTRE seção 11). Diferente de interpretacao-ia.ts (2 saídas), este
// tem 3: completo / incompleto (pede esclarecimento específico) / não entendi — decisão de Luiz
// (17/08/2026): "a IA só pode dar checkpoint depois de ter entendido exatamente o que o lead
// precisa e ter informações suficientes pra gerar proposta".
//
// Reescrito 19/08/2026 (Luiz, "corrigir tudo de forma global", log real de produção) — 2 problemas
// achados num atendimento real ("meu cpf e o cnpj da minha mulher" → a Malala questionou de quem
// era a empresa, depois confirmou "1 CPF e 1 CNPJ, é isso?" e ainda assim voltou a perguntar
// quantos CPFs/CNPJs depois do lead responder "sim"):
// 1. O prompt pedia "certeza real" demais, puxando detalhe irrelevante (de quem é a empresa, se
//    ela também precisa limpar) que não muda quantos documentos limpar — corrigido com instrução
//    explícita pra inferir direto e nunca perguntar isso.
// 2. O interpretador não recebia `dados` (zero memória entre turnos) — "sim" confirmando uma
//    contagem proposta no turno anterior caía contra a pergunta ORIGINAL estática, sem sentido
//    nenhum pra IA. Corrigido com o mesmo padrão de `dadosParciais` já usado em
//    `interpretar-faixas-documentos.ts`: quando propõe uma contagem específica pra confirmar, essa
//    proposta (e a pergunta feita) atravessam o turno em `dados`.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { textoDeMensagem } from "./engine";
import { blocoPromptConteudoExtra, propriedadesSchemaConteudoExtra } from "./interpretar-desvio-validacao";
import {
  validarRespostaListaDocumentos,
  type RespostaBrutaListaDocumentos,
} from "./interpretar-lista-documentos-validacao";
import type { DadosConversa, EtapaCarregada, FaqParaDesvio, InterpretadorListaDocumentos, ObjecaoParaDesvio } from "./tipos";

const MODELO_INTERPRETACAO = "claude-haiku-4-5-20251001";

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

function ferramenta(qtdFaqs: number, qtdObjecoes: number) {
  return {
    name: "interpretar_lista_documentos",
    description:
      "Registra quantos documentos (CPF/CNPJ) o lead quer limpar, ou pede esclarecimento quando a resposta não deixa isso claro.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["completo", "incompleto", "nao_entendi"],
          description:
            "'completo' quando der pra inferir com confiança razoável quantos CPFs e quantos CNPJs (não precisa certeza absoluta — 'meu cpf e o cnpj da minha mulher' já é 1 CPF + 1 CNPJ). 'incompleto' só quando genuinamente não der pra saber a contagem — gere uma pergunta de esclarecimento bem específica. 'nao_entendi' quando a resposta não tem nada a ver com quantidade/tipo de documento.",
        },
        quantidade_cpf: {
          type: "integer",
          description:
            "Quantos CPFs o lead quer limpar. Preencha com o valor final quando status=completo. Quando status=incompleto E você estiver propondo uma contagem específica pra confirmar (ex.: pergunta 'Você quer limpar 1 CPF e 1 CNPJ, é isso?'), preencha com o número PROPOSTO — o sistema lembra disso pro próximo turno. Nos outros casos, 0.",
        },
        quantidade_cnpj: {
          type: "integer",
          description: "Mesma regra de quantidade_cpf, mas pra CNPJ.",
        },
        pergunta_esclarecimento: {
          type: "string",
          description:
            "Só quando status=incompleto: uma pergunta curta e específica em português, no tom da Malala. Se for confirmar uma contagem que você já entendeu (o caso mais comum), faça UMA pergunta simples de sim/não (ex.: 'Perfeito! Você quer limpar 1 CPF e 1 CNPJ, é isso?') — nunca acrescente alternativa extra tipo 'ou precisa limpar mais documentos?', isso só confunde. Nunca repita a pergunta original genérica.",
        },
        ...propriedadesSchemaConteudoExtra(qtdFaqs, qtdObjecoes),
      },
      required: ["status", "quantidade_cpf", "quantidade_cnpj", "pergunta_esclarecimento"],
    },
  };
}

function montarPrompt(params: {
  etapaAtual: EtapaCarregada;
  respostaLead: string;
  dados: DadosConversa;
  faqsAtivas: FaqParaDesvio[];
  objecoesAtivas: ObjecaoParaDesvio[];
}): string {
  const { etapaAtual, respostaLead, dados, faqsAtivas, objecoesAtivas } = params;
  const pergunta = etapaAtual.conteudo.mensagens.map(textoDeMensagem).join("\n");

  const linhas: string[] = [
    "Você ajuda a entender quantos documentos (CPF e/ou CNPJ) um lead quer limpar num atendimento automatizado de WhatsApp (ArrudaCred, empresa de limpeza de nome/crédito). O lead pode pedir só 1 documento, ou um 'pacote' com vários (ex.: '2 CPF e 1 CNPJ da minha empresa').",
    "",
    `Pergunta feita ao lead:\n"""\n${pergunta}\n"""`,
  ];

  // Memória entre turnos (19/08/2026) — sem isto, uma resposta tipo "sim" confirmando uma proposta
  // do turno anterior cai contra a pergunta ORIGINAL acima, sem contexto nenhum do que está sendo
  // confirmado.
  const perguntaPendente = dados._doc_pergunta_pendente;
  if (perguntaPendente) {
    const cpfProposto = dados._doc_cpf_proposto ?? "0";
    const cnpjProposto = dados._doc_cnpj_proposto ?? "0";
    linhas.push(
      "",
      `Você já tinha perguntado ao lead: "${perguntaPendente}" — propondo ${cpfProposto} CPF(s) e ${cnpjProposto} CNPJ(s). Se a resposta abaixo confirma isso (mesmo que seja só "sim", "isso", "correto" ou parecido), marque completo usando esses números. Se o lead corrigir ou der informação nova, use o que ele disse agora em vez da proposta.`,
    );
  }

  linhas.push(
    "",
    `Resposta do lead: "${respostaLead}"`,
    "",
    "Use a ferramenta pra registrar o resultado. PREFIRA marcar completo sempre que conseguir inferir a contagem com confiança razoável — não perca tempo perguntando detalhe que não muda QUANTOS documentos limpar (de quem é a empresa, se outra pessoa também precisa limpar o nome dela, etc. — isso não importa aqui, não pergunte). Só marque incompleto quando genuinamente não der pra saber quantos CPFs e quantos CNPJs.",
    blocoPromptConteudoExtra(faqsAtivas, objecoesAtivas),
  );

  return linhas.join("\n");
}

/** FAQs/objeções ativas capturadas por closure (mesmo padrão de `criarInterpretadorFaixasDocumentos`) — detecção de conteúdo extra (achado 22/08/2026) só relevante quando status=completo. */
export function criarInterpretadorListaDocumentos(
  faqsAtivas: FaqParaDesvio[] = [],
  objecoesAtivas: ObjecaoParaDesvio[] = [],
): InterpretadorListaDocumentos {
  return async ({ etapaAtual, respostaLead, dados }) => {
    const prompt = montarPrompt({ etapaAtual, respostaLead, dados, faqsAtivas, objecoesAtivas });

    try {
      // obterCliente() dentro do try de propósito (achado real, 18/08/2026, ver interpretacao-ia.ts).
      const cliente = obterCliente();
      const resposta = await cliente.messages.create({
        model: MODELO_INTERPRETACAO,
        max_tokens: 400,
        tools: [ferramenta(faqsAtivas.length, objecoesAtivas.length)],
        tool_choice: { type: "tool", name: "interpretar_lista_documentos" },
        messages: [{ role: "user", content: prompt }],
      });

      const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
      if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") return { status: "nao_entendi" };

      const bruta = blocoFerramenta.input as RespostaBrutaListaDocumentos;
      return validarRespostaListaDocumentos(bruta, faqsAtivas, objecoesAtivas);
    } catch (e) {
      console.error("[interpretar-lista-documentos] erro ao chamar Claude:", e);
      return { status: "nao_entendi" };
    }
  };
}

/** Compatibilidade: uso sem FAQ/objeção (comportamento idêntico a antes de 22/08/2026). */
export const interpretarListaDocumentos: InterpretadorListaDocumentos = criarInterpretadorListaDocumentos();
