// src/lib/marketing/escritor.ts
// Estágio 1 (parte 2) do pipeline — gera o rascunho completo seguindo o checklist da propriedade.
// Mesmo padrão de cliente/ferramenta de src/lib/motor-fluxo/interpretacao-ia.ts, modelo Sonnet
// porque qualidade de escrita é crítica (diferente da classificação simples que usa Haiku).

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ConteudoGerado, ItemChecklistCarregado, PautaCarregada } from "./tipos";

const MODELO_ESCRITOR = "claude-sonnet-5";

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

const FERRAMENTA_ESCRITOR = {
  name: "registrar_conteudo",
  description: "Registra o rascunho completo do post gerado.",
  input_schema: {
    type: "object" as const,
    properties: {
      titulo: { type: "string", description: "Título do post (vira o H1)." },
      conteudo_html: { type: "string", description: "Corpo completo do post em HTML, incluindo headings, FAQ com Schema FAQPage embutido em JSON-LD, e CTA." },
      meta_title: { type: "string", description: "50-60 caracteres, contém a palavra-chave principal." },
      meta_description: { type: "string", description: "130-155 caracteres, contém CTA." },
      slug: { type: "string", description: "Slug em kebab-case, sem acentos, derivado da palavra-chave principal." },
    },
    required: ["titulo", "conteudo_html", "meta_title", "meta_description", "slug"],
  },
};

function montarPrompt(pauta: PautaCarregada, checklist: ItemChecklistCarregado[]): string {
  const linhasChecklist = checklist.map((c) => `- ${c.item}`).join("\n");
  const linhas = [
    "Você é o Agente Escritor de um pipeline de geração de conteúdo para blog, otimizado tanto para SEO tradicional quanto para citação por IAs (AEO/GEO).",
    "",
    `Palavra-chave principal: ${pauta.palavraChavePrincipal}`,
    pauta.palavrasSecundarias.length ? `Palavras secundárias: ${pauta.palavrasSecundarias.join(", ")}` : "",
    `Ângulo: ${pauta.angulo}`,
    pauta.geografia ? `Geografia: ${pauta.geografia}` : "",
    `Funil: ${pauta.funil}`,
    `Formato: ${pauta.tipoConteudo}`,
    "",
    "Checklist de qualidade obrigatório — todo item precisa ser atendido:",
    linhasChecklist,
    "",
    "Regra adicional de citabilidade por IA: logo abaixo de cada H2, inclua uma resposta direta e extraível de 40-60 palavras antes de aprofundar — é a técnica mais concreta para aumentar a chance de citação por ChatGPT/Perplexity/Gemini.",
    "",
    "Use a ferramenta para registrar o resultado.",
  ];
  return linhas.filter(Boolean).join("\n");
}

export async function gerarConteudo(pauta: PautaCarregada, checklist: ItemChecklistCarregado[]): Promise<ConteudoGerado> {
  const cliente = obterCliente();
  const prompt = montarPrompt(pauta, checklist);

  const resposta = await cliente.messages.create({
    model: MODELO_ESCRITOR,
    // Um artigo de 1800+ palavras em HTML com FAQ+JSON-LD pode facilmente passar de 8000 tokens;
    // 16000 dá folga. Mesmo assim checamos stop_reason abaixo — nunca seguir com dado truncado.
    max_tokens: 16000,
    tools: [FERRAMENTA_ESCRITOR],
    tool_choice: { type: "tool", name: "registrar_conteudo" },
    messages: [{ role: "user", content: prompt }],
  });

  if (resposta.stop_reason === "max_tokens") {
    throw new Error("Escritor: resposta truncada por limite de tokens.");
  }

  const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
  if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") {
    throw new Error("Escritor não retornou conteúdo estruturado.");
  }

  const bruta = blocoFerramenta.input as {
    titulo: string;
    conteudo_html: string;
    meta_title: string;
    meta_description: string;
    slug: string;
  };

  const camposObrigatorios: Array<keyof typeof bruta> = ["titulo", "conteudo_html", "meta_title", "meta_description", "slug"];
  for (const campo of camposObrigatorios) {
    if (typeof bruta[campo] !== "string" || bruta[campo].trim() === "") {
      throw new Error(`Escritor: campo obrigatório "${campo}" ausente ou vazio na resposta.`);
    }
  }

  return {
    titulo: bruta.titulo,
    conteudoHtml: bruta.conteudo_html,
    metaTitle: bruta.meta_title,
    metaDescription: bruta.meta_description,
    slug: bruta.slug,
  };
}
