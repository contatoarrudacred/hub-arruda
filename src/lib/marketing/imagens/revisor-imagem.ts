// src/lib/marketing/imagens/revisor-imagem.ts
// Revisor de imagem (Fase 4b, spec docs/superpowers/specs/2026-08-19-fase4-precisao-imagens-distribuicao-design.md
// seção 4.4) — compartilhado por capa (capa.ts) e imagens secundárias (secundarias.ts). Primeiro
// agente deste módulo com input multimodal: recebe a URL da imagem gerada (OpenAI GPT Image 2) +
// o trecho-fonte ("banco fechado" — post inteiro pra capa, trecho específico pra secundária, ver
// especificacao_automacao_capa_post_persona.md / especificacao_automacao_imagens_secundarias_post.md
// em docs/insumos-externos/) e julga se a imagem é fiel ao texto.
//
// Sintaxe de imagem confirmada nos tipos instalados do SDK (@anthropic-ai/sdk@0.117.1,
// node_modules/.pnpm/@anthropic-ai+sdk@0.117.1_zod@4.4.3/.../resources/messages/messages.d.ts):
// `ImageBlockParam.source` aceita `Base64ImageSource | URLImageSource`, e `URLImageSource` é só
// `{ type: "url", url: string }` — não precisamos baixar e converter a imagem pra base64, a URL
// gerada pela OpenAI pode ir direto no bloco de conteúdo. `MessageParam.content` aceita
// `Array<ContentBlockParam>`, então a mensagem sai como [bloco de imagem, bloco de texto] em vez
// da string única usada por revisor.ts/escritor.ts (que não têm input de imagem).
//
// Mesmo padrão de agente do resto do módulo: cliente singleton via obterCliente(), tool_choice
// forçado, validação de campo obrigatório, erro de rede/API propaga (não engole) — quem decide
// engolir falha e regenerar é o chamador (capa.ts/secundarias.ts, tasks futuras), não este arquivo.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { UsageTokens } from "../tipos";

const MODELO_REVISOR_IMAGEM = "claude-sonnet-5";

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

const FERRAMENTA_REVISOR_IMAGEM = {
  name: "registrar_revisao_imagem",
  description: "Registra o resultado da revisão de fidelidade e qualidade da imagem gerada.",
  input_schema: {
    type: "object" as const,
    properties: {
      aprovada: {
        type: "boolean",
        description:
          "false se a imagem contém alucinação (número, prazo, afirmação ou relação que o trecho-fonte não sustenta), foge do que está literalmente no trecho-fonte, ou tem problema de qualidade/design grave (texto em português incorreto, elemento visualmente deformado).",
      },
      motivo: {
        type: "string",
        description:
          "Obrigatório quando reprovada: aponta especificamente o que na imagem não está sustentado pelo trecho-fonte (ou o problema de qualidade/design encontrado), de forma concreta o bastante pra guiar uma regeneração. Null quando aprovada.",
      },
    },
    required: ["aprovada"],
  },
};

function montarPrompt(trechoFonte: string): string {
  return [
    "Você é o Agente Revisor de imagem de um pipeline de geração de conteúdo. Julgue a imagem anexada comparando-a com o trecho-fonte abaixo.",
    "",
    "Critério PRINCIPAL, o mais importante desta revisão: ALUCINAÇÃO. A imagem contém algum número, prazo, afirmação ou relação (ex.: um selo de garantia, uma taxa, um valor em R$, um prazo em dias/anos, uma promessa de resultado) que o trecho-fonte abaixo NÃO sustenta? Se sim, reprove — mesmo que o resto da imagem esteja tecnicamente bom.",
    "",
    "Critério 2 — fidelidade ao trecho-fonte (\"banco fechado\"): a imagem só pode depictar o que está literalmente no trecho-fonte. Qualquer elemento visual (texto, cena, objeto, situação) que não decorra diretamente do trecho-fonte é motivo de reprovação, mesmo que não seja tecnicamente uma \"alucinação numérica\".",
    "",
    "Critério 3 — qualidade/design básica: texto em português correto (sem erros ortográficos ou palavras deformadas) e sem elemento visual deformado (mãos, rostos, objetos com anatomia/geometria quebrada).",
    "",
    `Trecho-fonte (banco fechado — a imagem não pode extrapolar isto):\n"""\n${trechoFonte}\n"""`,
    "",
    "Use a ferramenta para registrar o resultado. Se reprovada (por qualquer um dos três critérios acima), o campo motivo é obrigatório e precisa apontar especificamente o que falhou — se for alucinação ou fuga do trecho-fonte, cite o elemento exato da imagem que não está sustentado pelo texto.",
  ].join("\n");
}

type ResultadoBrutoFerramenta = {
  aprovada: boolean;
  motivo?: string | null;
};

export async function revisarImagem(
  imagemUrl: string,
  trechoFonte: string,
): Promise<{ resultado: { aprovada: boolean; motivo: string | null }; usage: UsageTokens }> {
  const cliente = obterCliente();
  const prompt = montarPrompt(trechoFonte);

  const resposta = await cliente.messages.create({
    model: MODELO_REVISOR_IMAGEM,
    max_tokens: 1000,
    tools: [FERRAMENTA_REVISOR_IMAGEM],
    tool_choice: { type: "tool", name: "registrar_revisao_imagem" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: imagemUrl } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
  if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") {
    throw new Error("Revisor de imagem não retornou resultado estruturado.");
  }

  const bruta = blocoFerramenta.input as ResultadoBrutoFerramenta;
  if (typeof bruta.aprovada !== "boolean") {
    throw new Error('Revisor de imagem: campo obrigatório "aprovada" ausente ou em formato inválido na resposta.');
  }
  if (!bruta.aprovada && (typeof bruta.motivo !== "string" || bruta.motivo.trim() === "")) {
    throw new Error('Revisor de imagem: campo obrigatório "motivo" ausente ao reprovar a imagem.');
  }

  return {
    resultado: {
      aprovada: bruta.aprovada,
      motivo: bruta.aprovada ? null : (bruta.motivo as string),
    },
    usage: {
      inputTokens: resposta.usage?.input_tokens ?? 0,
      outputTokens: resposta.usage?.output_tokens ?? 0,
    },
  };
}
