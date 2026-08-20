// src/lib/marketing/imagens/revisor-imagem.ts
// Revisor de imagem (Fase 4b, spec docs/superpowers/specs/2026-08-19-fase4-precisao-imagens-distribuicao-design.md
// seção 4.4) — compartilhado por capa (capa.ts) e imagens secundárias (secundarias.ts). Primeiro
// agente deste módulo com input multimodal: recebe a URL/imagem gerada (OpenAI GPT Image 2) + o
// trecho-fonte ("banco fechado" — post inteiro pra capa, trecho específico pra secundária, ver
// especificacao_automacao_capa_post_persona.md / especificacao_automacao_imagens_secundarias_post.md
// em docs/insumos-externos/) e julga se a imagem é fiel ao texto.
//
// Sintaxe de imagem confirmada nos tipos instalados do SDK (@anthropic-ai/sdk@0.117.1,
// node_modules/.pnpm/@anthropic-ai+sdk@0.117.1_zod@4.4.3/.../resources/messages/messages.d.ts):
// `ImageBlockParam.source` aceita `Base64ImageSource | URLImageSource`. `MessageParam.content`
// aceita `Array<ContentBlockParam>`, então a mensagem sai como [bloco de imagem, bloco de texto]
// em vez da string única usada por revisor.ts/escritor.ts (que não têm input de imagem).
//
// Ajuste da Task 7 (gerador-imagem-openai.ts/capa.ts): quando este arquivo foi escrito (Task 6) a
// suposição era que a OpenAI devolveria uma URL fetchable e o caminho `URLImageSource` bastaria.
// A investigação real da Task 7 nos tipos instalados de `openai@7.5.0` mostrou o contrário: os
// modelos GPT Image (`gpt-image-1`/`gpt-image-1.5`/`gpt-image-2`) **sempre** devolvem
// `b64_json` — o campo `url` da resposta é "Unsupported for the GPT image models" (comentário
// literal em `resources/images.d.ts`). Não existe URL fetchable pra passar como
// `URLImageSource`. Em vez de reabrir a assinatura de `revisarImagem` (usada por
// capa.ts e, futuramente, secundarias.ts), `construirBlocoImagem` abaixo detecta uma data URL
// (`data:image/...;base64,...`, o formato que `gerarImagemOpenAI` produz) e monta um
// `Base64ImageSource` em vez de tentar buscar a "URL" por HTTP — a Anthropic API busca `type:
// "url"` como uma URL de verdade; uma data URL ali provavelmente falharia ou seria rejeitada,
// então não arriscamos. Uma URL http(s) de verdade (o caso já coberto pelos testes da Task 6)
// continua indo pelo caminho `URLImageSource`, sem mudança de comportamento.
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

const MEDIA_TYPES_SUPORTADOS = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type MediaTypeSuportado = (typeof MEDIA_TYPES_SUPORTADOS)[number];

/**
 * Aceita tanto uma URL http(s) de verdade (bloco `URLImageSource`, comportamento original da
 * Task 6) quanto uma data URL base64 (`data:image/png;base64,...`, o formato que
 * `gerarImagemOpenAI` — Task 7 — produz porque a OpenAI nunca devolve URL pros modelos GPT
 * Image). Ver nota no cabeçalho do arquivo.
 */
function construirBlocoImagem(imagemUrl: string): { type: "url"; url: string } | { type: "base64"; media_type: MediaTypeSuportado; data: string } {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(imagemUrl);
  if (!match) {
    return { type: "url", url: imagemUrl };
  }
  const [, mediaType, data] = match;
  if (!(MEDIA_TYPES_SUPORTADOS as readonly string[]).includes(mediaType)) {
    throw new Error(`Revisor de imagem: media_type "${mediaType}" não suportado (esperado jpeg/png/gif/webp).`);
  }
  return { type: "base64", media_type: mediaType as MediaTypeSuportado, data };
}

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
          { type: "image", source: construirBlocoImagem(imagemUrl) },
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
