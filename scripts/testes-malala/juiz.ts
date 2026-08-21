// "Juiz" — uma chamada de IA separada (não a mesma que roda dentro do motor) que lê a transcrição
// inteira de um cenário simulado + a persona real da Malala e dá um veredito estruturado. Não
// avalia só se seguiu o prompt — avalia se a conversa ficou humanizada e coerente com o propósito
// (pedido explícito do Luiz, spec 2026-08-21-testes-conversa-malala-e-nota-handoff.md).

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "node:fs";
import * as path from "node:path";
import type { EspelhoConversa, VeredictoJuiz } from "./tipos";

const MODELO_JUIZ = "claude-sonnet-5";

let clienteSingleton: Anthropic | null = null;
function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

let personaMalalaCache: string | null = null;
function carregarPersonaMalala(): string {
  if (personaMalalaCache === null) {
    personaMalalaCache = fs.readFileSync(path.resolve(process.cwd(), "docs/PERSONA_MALALA_PROMPT_SISTEMA.md"), "utf8");
  }
  return personaMalalaCache;
}

const FERRAMENTA_VEREDITO = {
  name: "registrar_veredito",
  description: "Registra a avaliação de qualidade desta conversa simulada de teste com a Malala.",
  input_schema: {
    type: "object" as const,
    properties: {
      respondeu_o_que_foi_perguntado: {
        type: "boolean",
        description: "A Malala respondeu de fato o que o lead perguntou/disse, em vez de ignorar ou fugir do assunto?",
      },
      repetiu_pergunta_identica: {
        type: "boolean",
        description: "Em algum momento ela repetiu a MESMA pergunta com o texto idêntico/quase idêntico, em vez de variar ou reconhecer que já tinha perguntado (loop)?",
      },
      alucinou: {
        type: "boolean",
        description: "Ela inventou alguma informação (valor, prazo, processo, política) que não está no script/persona fornecidos?",
      },
      tom_humanizado: {
        type: "boolean",
        description: "O tom ficou humanizado, empático e alinhado ao propósito da Malala (ajudar o lead com limpeza de nome), em vez de soar robótico ou fora de contexto?",
      },
      handoff_correto: {
        type: ["boolean", "null"],
        description: "Só relevante se o cenário envolve handoff pra humano: a sequência esperada (avisar o lead, pedir confirmação quando aplicável, só transferir depois, deixar registrado) aconteceu corretamente? Use null se o cenário não envolve handoff.",
      },
      resumo: { type: "string", description: "1-2 frases resumindo a avaliação geral desta conversa." },
      problemas_encontrados: {
        type: "array",
        items: { type: "string" },
        description: "Lista curta de problemas concretos encontrados (vazio se nenhum).",
      },
      citacoes: {
        type: "array",
        items: { type: "string" },
        description: "Trechos EXATOS da transcrição que evidenciam os problemas apontados (vazio se nenhum problema).",
      },
    },
    required: [
      "respondeu_o_que_foi_perguntado",
      "repetiu_pergunta_identica",
      "alucinou",
      "tom_humanizado",
      "handoff_correto",
      "resumo",
      "problemas_encontrados",
      "citacoes",
    ],
  },
};

type VereditoBruto = {
  respondeu_o_que_foi_perguntado: boolean;
  repetiu_pergunta_identica: boolean;
  alucinou: boolean;
  tom_humanizado: boolean;
  handoff_correto: boolean | null;
  resumo: string;
  problemas_encontrados: string[];
  citacoes: string[];
};

export async function julgarConversa(espelho: EspelhoConversa): Promise<VeredictoJuiz> {
  const transcricao = espelho.turnos
    .map((t) => `Lead: ${t.mensagemLead}\nMalala: ${t.mensagensMalala.join(" / ") || "(sem resposta — conversa escalada pro supervisor)"}`)
    .join("\n\n");

  const prompt = [
    "Você é um avaliador de qualidade de um atendimento automatizado de WhatsApp feito por uma IA chamada Malala (ArrudaCred, empresa de limpeza de nome/crédito). Vai analisar uma conversa SIMULADA de teste (não é lead real) e avaliar o comportamento dela com rigor.",
    "",
    "Prompt de sistema real da Malala (propósito e regras que ela deve seguir):",
    "\"\"\"",
    carregarPersonaMalala(),
    "\"\"\"",
    "",
    `Cenário testado: ${espelho.descricao}`,
    "",
    "Transcrição da conversa simulada:",
    "\"\"\"",
    transcricao,
    "\"\"\"",
    "",
    `O que de fato foi gravado no banco ao final: sob_supervisor=${espelho.efeitos.sobSupervisor}, notas internas geradas=${JSON.stringify(espelho.efeitos.notasInternas)}, notificações geradas=${JSON.stringify(espelho.efeitos.notificacoes)}, agendamento=${JSON.stringify(espelho.efeitos.agendamento)}.`,
    espelho.expectativaHandoff ? `\nExpectativa específica de handoff pra este cenário: ${espelho.expectativaHandoff}` : "",
    "",
    "Avalie com rigor: não marque tom_humanizado=true só porque tem emoji; não marque handoff_correto=true sem checar se o registro no banco realmente confirma a transferência. Prefira apontar um problema real a deixar passar. Use a ferramenta pra registrar o veredito, citando trechos EXATOS da transcrição como evidência de qualquer problema apontado.",
  ]
    .filter(Boolean)
    .join("\n");

  const resposta = await obterCliente().messages.create({
    model: MODELO_JUIZ,
    max_tokens: 1500,
    tools: [FERRAMENTA_VEREDITO],
    tool_choice: { type: "tool", name: "registrar_veredito" },
    messages: [{ role: "user", content: prompt }],
  });

  const bloco = resposta.content.find((b) => b.type === "tool_use");
  if (!bloco || bloco.type !== "tool_use") throw new Error(`Juiz não retornou veredito pro cenário "${espelho.cenario}".`);
  const bruto = bloco.input as VereditoBruto;

  return {
    cenario: espelho.cenario,
    descricao: espelho.descricao,
    respondeuOQueFoiPerguntado: bruto.respondeu_o_que_foi_perguntado,
    repetiuPerguntaIdentica: bruto.repetiu_pergunta_identica,
    alucinou: bruto.alucinou,
    tomHumanizado: bruto.tom_humanizado,
    handoffCorreto: bruto.handoff_correto,
    resumo: bruto.resumo,
    problemasEncontrados: bruto.problemas_encontrados ?? [],
    citacoes: bruto.citacoes ?? [],
  };
}
