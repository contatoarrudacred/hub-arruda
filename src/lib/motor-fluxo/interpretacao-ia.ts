// Implementação real do encaixe `InterpretadorIA` (tipos.ts) — Bloco C / Fase 5, 17/08/2026.
// Só é chamada quando o parser determinístico (parser.ts) não reconhece a resposta do lead E a
// etapa tem `interpretacao_ia.habilitado` (engine.ts, avancarConversa). Estratégia de custo já
// decidida no PLANO_MESTRE seção 2.1: parser primeiro, IA só como fallback, modelo mais barato
// (Haiku) porque isto é classificação/extração, não geração de texto com nuance — não precisa da
// persona da Malala nem da base de FAQ, só do contexto do checkpoint específico.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { textoDeMensagem } from "./engine";
import { validarRespostaIA } from "./interpretacao-ia-validacao";
import { blocoPromptConteudoExtra, propriedadesSchemaConteudoExtra } from "./interpretar-desvio-validacao";
import type { EtapaCarregada, FaqParaDesvio, InterpretadorIA, ObjecaoParaDesvio } from "./tipos";

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

function ferramentaInterpretacao(qtdFaqs: number, qtdObjecoes: number) {
  return {
    name: "interpretar_resposta",
    description: "Registra o resultado da interpretação da resposta do lead para este checkpoint do script.",
    input_schema: {
      type: "object" as const,
      properties: {
        conseguiu_interpretar: {
          type: "boolean",
          description:
            "true só se for possível entender a intenção do lead com confiança razoável; false se a resposta for ambígua, fora do assunto, ou não corresponder a nenhuma opção válida.",
        },
        valor: {
          type: "string",
          description:
            "Quando conseguiu_interpretar=true: para checkpoints com opções, o campo 'valor' EXATO de uma das opções listadas (nunca invente um valor fora da lista); para checkpoints de texto livre, o valor extraído/normalizado da resposta do lead.",
        },
        ...propriedadesSchemaConteudoExtra(qtdFaqs, qtdObjecoes),
      },
      required: ["conseguiu_interpretar", "valor"],
    },
  };
}

function montarPrompt(params: {
  etapaAtual: EtapaCarregada;
  respostaLead: string;
  faqsAtivas: FaqParaDesvio[];
  objecoesAtivas: ObjecaoParaDesvio[];
}): string {
  const { etapaAtual, respostaLead, faqsAtivas, objecoesAtivas } = params;
  const conteudo = etapaAtual.conteudo;
  const pergunta = conteudo.mensagens.map(textoDeMensagem).join("\n");

  const linhas: string[] = [
    "Você ajuda a interpretar respostas de leads num script de atendimento automatizado de WhatsApp (ArrudaCred, empresa de limpeza de nome/crédito). O parser determinístico do sistema não reconheceu a resposta abaixo — sua tarefa é tentar entender o que o lead quis dizer, sem inventar.",
    "",
    `Pergunta feita ao lead:\n"""\n${pergunta}\n"""`,
    "",
    `Tipo de resposta esperada: ${conteudo.tipo_resposta ?? "texto_livre"}`,
  ];

  if (conteudo.opcoes?.length) {
    const listaOpcoes = conteudo.opcoes
      .map((o) => `- valor="${o.valor}" (formas aceitas pelo parser: ${o.rotulos.join(", ")})`)
      .join("\n");
    linhas.push(
      "",
      "Opções válidas — SÓ escolha uma delas (valor exato), nunca invente uma opção fora desta lista:",
      listaOpcoes,
    );
  }

  if (conteudo.interpretacao_ia?.instrucao) {
    linhas.push("", `Instrução específica deste checkpoint: ${conteudo.interpretacao_ia.instrucao}`);
  }

  linhas.push(
    "",
    `Resposta do lead: "${respostaLead}"`,
    "",
    "Use a ferramenta pra registrar o resultado. Prefira marcar conseguiu_interpretar=false a adivinhar errado — quando o sistema não consegue interpretar, ele simplesmente repete a pergunta pro lead, então um falso negativo é seguro, um falso positivo não é.",
    blocoPromptConteudoExtra(faqsAtivas, objecoesAtivas),
  );

  return linhas.join("\n");
}

/**
 * FAQs/objeções ativas capturadas por closure (mesmo padrão de `criarInterpretadorFaixasDocumentos`)
 * — permite detectar conteúdo extra (achado 22/08/2026, ver interpretar-desvio-validacao.ts) na
 * MESMA chamada de IA que já reconhece a resposta, sem custo de uma 2ª chamada.
 */
export function criarInterpretadorIA(faqsAtivas: FaqParaDesvio[] = [], objecoesAtivas: ObjecaoParaDesvio[] = []): InterpretadorIA {
  return async ({ etapaAtual, respostaLead }) => {
    const prompt = montarPrompt({ etapaAtual, respostaLead, faqsAtivas, objecoesAtivas });

    try {
      // obterCliente() dentro do try de propósito (achado real, 18/08/2026): estava fora, e uma
      // API key ausente/inválida derrubava o turno inteiro do webhook sem resposta nenhuma pro lead,
      // em vez de degradar pra "não reconhecido" (mesmo tratamento que qualquer outra falha da IA já
      // tinha aqui embaixo).
      const cliente = obterCliente();
      const resposta = await cliente.messages.create({
        model: MODELO_INTERPRETACAO,
        max_tokens: 300,
        tools: [ferramentaInterpretacao(faqsAtivas.length, objecoesAtivas.length)],
        tool_choice: { type: "tool", name: "interpretar_resposta" },
        messages: [{ role: "user", content: prompt }],
      });

      const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
      if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") return null;

      const bruta = blocoFerramenta.input as {
        conseguiu_interpretar: boolean;
        valor: string;
        indice_faq_extra?: number;
        indice_objecao_extra?: number;
      };
      return validarRespostaIA(bruta, etapaAtual.conteudo.opcoes, faqsAtivas, objecoesAtivas);
    } catch (e) {
      console.error("[interpretacao-ia] erro ao chamar Claude:", e);
      return null;
    }
  };
}

/** Compatibilidade: uso sem FAQ/objeção (comportamento idêntico a antes de 22/08/2026). */
export const interpretarComIA: InterpretadorIA = criarInterpretadorIA();
