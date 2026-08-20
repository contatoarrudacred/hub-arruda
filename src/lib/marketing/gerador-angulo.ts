// src/lib/marketing/gerador-angulo.ts
// Novo agente (Fase 3, Task 3) — fallback de IA que roda só quando uma persona esgota os ângulos
// pré-escritos do Bloco 11 (ver PersonaCarregada.conteudoCompleto em tipos.ts). Mesmo padrão de
// cliente/ferramenta de escritor.ts/revisor.ts, modelo Sonnet porque é geração criativa (achar um
// ângulo novo e coerente com a voz da persona), não classificação.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AnguloGerado, FunilPauta, PersonaCarregada, TipoConteudo, UsageTokens } from "./tipos";

const MODELO_GERADOR_ANGULO = "claude-sonnet-5";

const FUNIS_VALIDOS: FunilPauta[] = ["topo", "meio", "fundo"];
const TIPOS_CONTEUDO_VALIDOS: TipoConteudo[] = [
  "post_padrao",
  "post_storytelling",
  "pagina_servico",
  "pagina_geografica",
  "homepage",
];

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

const FERRAMENTA_GERADOR_ANGULO = {
  name: "registrar_angulo",
  description: "Registra o novo ângulo de conteúdo gerado para a persona.",
  input_schema: {
    type: "object" as const,
    properties: {
      angulo_texto: {
        type: "string",
        description: "O novo ângulo de conteúdo, coerente com a voz, as dores e o vocabulário da persona. Não pode repetir nenhum ângulo já usado.",
      },
      palavra_chave_principal: { type: "string", description: "Palavra-chave principal de SEO para esse ângulo." },
      palavras_secundarias: {
        type: "array",
        items: { type: "string" },
        description: "Palavras-chave secundárias relacionadas ao ângulo.",
      },
      funil: { type: "string", enum: FUNIS_VALIDOS, description: "Etapa do funil de conteúdo para esse ângulo." },
      tipo_conteudo: { type: "string", enum: TIPOS_CONTEUDO_VALIDOS, description: "Formato de conteúdo mais adequado para esse ângulo." },
    },
    required: ["angulo_texto", "palavra_chave_principal", "palavras_secundarias", "funil", "tipo_conteudo"],
  },
};

function montarPrompt(persona: PersonaCarregada, angulosUsados: string[]): string {
  const linhasAngulosUsados = angulosUsados.length ? angulosUsados.map((a) => `- ${a}`).join("\n") : "(nenhum ainda)";
  return [
    "Você é o Agente Gerador de Ângulo de um pipeline de geração de conteúdo. Esta persona esgotou os ângulos pré-escritos e você precisa criar UM ângulo novo, original, coerente com a voz, as dores e o vocabulário dela.",
    "",
    `Persona: ${persona.nome}`,
    "Conteúdo completo da persona (11 blocos):",
    '"""',
    persona.conteudoCompleto,
    '"""',
    "",
    "Ângulos já usados por essa persona — o ângulo novo não pode repetir nenhum deles, nem no texto nem na ideia central:",
    linhasAngulosUsados,
    "",
    "Gere UM ângulo novo, junto com a palavra-chave principal de SEO, as palavras-chave secundárias, o funil (topo/meio/fundo) e o tipo de conteúdo mais adequado. Use a ferramenta para registrar o resultado.",
  ].join("\n");
}

export async function gerarAngulo(
  persona: PersonaCarregada,
  angulosUsados: string[],
): Promise<{ resultado: AnguloGerado; usage: UsageTokens }> {
  const cliente = obterCliente();
  const prompt = montarPrompt(persona, angulosUsados);

  const resposta = await cliente.messages.create({
    model: MODELO_GERADOR_ANGULO,
    max_tokens: 2000,
    tools: [FERRAMENTA_GERADOR_ANGULO],
    tool_choice: { type: "tool", name: "registrar_angulo" },
    messages: [{ role: "user", content: prompt }],
  });

  if (resposta.stop_reason === "max_tokens") {
    throw new Error("Gerador de Ângulo: resposta truncada por limite de tokens.");
  }

  const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
  if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") {
    throw new Error("Gerador de Ângulo não retornou resultado estruturado.");
  }

  const bruta = blocoFerramenta.input as {
    angulo_texto: string;
    palavra_chave_principal: string;
    palavras_secundarias: string[];
    funil: string;
    tipo_conteudo: string;
  };

  const camposTextoObrigatorios: Array<"angulo_texto" | "palavra_chave_principal"> = [
    "angulo_texto",
    "palavra_chave_principal",
  ];
  for (const campo of camposTextoObrigatorios) {
    if (typeof bruta[campo] !== "string" || bruta[campo].trim() === "") {
      throw new Error(`Gerador de Ângulo: campo obrigatório "${campo}" ausente ou vazio na resposta.`);
    }
  }
  if (!Array.isArray(bruta.palavras_secundarias)) {
    throw new Error('Gerador de Ângulo: campo obrigatório "palavras_secundarias" ausente ou inválido na resposta.');
  }
  // O tool_choice força o schema com enum, mas validamos de novo em runtime: um valor fora do
  // enum não pode virar silenciosamente uma pauta com funil/tipo_conteudo inválido no banco.
  if (!FUNIS_VALIDOS.includes(bruta.funil as FunilPauta)) {
    throw new Error(`Gerador de Ângulo: campo "funil" com valor inválido na resposta: "${bruta.funil}".`);
  }
  if (!TIPOS_CONTEUDO_VALIDOS.includes(bruta.tipo_conteudo as TipoConteudo)) {
    throw new Error(`Gerador de Ângulo: campo "tipo_conteudo" com valor inválido na resposta: "${bruta.tipo_conteudo}".`);
  }

  return {
    resultado: {
      anguloTexto: bruta.angulo_texto,
      palavraChavePrincipal: bruta.palavra_chave_principal,
      palavrasSecundarias: bruta.palavras_secundarias,
      funil: bruta.funil as FunilPauta,
      tipoConteudo: bruta.tipo_conteudo as TipoConteudo,
    },
    usage: {
      inputTokens: resposta.usage?.input_tokens ?? 0,
      outputTokens: resposta.usage?.output_tokens ?? 0,
    },
  };
}
