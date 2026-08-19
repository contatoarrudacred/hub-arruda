// src/lib/marketing/imagens/gerador-imagem-openai.ts
// Wrapper isolado sobre a API de geração de imagem da OpenAI (Fase 4b, spec seção 4.8) — PRIMEIRA
// vez que este projeto chama a OpenAI (vendor novo). Usado por capa.ts (Task 7) e reaproveitado
// por secundarias.ts (Task 8, ainda não construída) — por isso não tem nenhuma concern específica
// de capa aqui (nada de "banco fechado", revisor, retry — isso é responsabilidade do chamador).
//
// Sintaxe confirmada nos tipos REAIS instalados (openai@7.5.0, resolvido via pnpm em
// node_modules/.pnpm/openai@7.5.0_ws@8.21.3_zod@4.4.3/node_modules/openai/, mesma situação de
// symlink que @anthropic-ai/sdk teve na Task 6 — node_modules/openai é um symlink pro caminho
// acima):
//
// - Método: `client.images.generate(body)` → `APIPromise<ImagesResponse>`
//   (resources/images.d.ts:49, classe `Images extends APIResource`).
// - `ImageModel` (resources/images.d.ts:310) inclui `'gpt-image-2'` — string real, não inventada
//   (o brief avisou que "gpt-image-1" estava depreciando; "gpt-image-2" é o sucessor real,
//   confirmado no union type do SDK instalado, batendo com a menção "GPT Image 2" da spec
//   seção 4.2/4.8).
// - Request (`ImageGenerateParamsBase`, resources/images.d.ts:574-684): `prompt: string`
//   (obrigatório), `model`, `size` (união de strings incluindo `'1536x1024'`,
//   resources/images.d.ts:664), `quality` (`'standard' | 'hd' | 'low' | 'medium' | 'high' |
//   'auto'`, linha 643), `output_format` (`'png' | 'jpeg' | 'webp'`, linha 624).
// - Response (`ImagesResponse`, linhas 314-345 + interface `Image`, linhas 56-73): **decisivo pra
//   este módulo** — pros modelos GPT Image (`gpt-image-1`/`gpt-image-1.5`/`gpt-image-2`/
//   `gpt-image-1-mini`), o campo `url` está documentado como "Unsupported for the GPT image
//   models" (comentário literal na linha 68-71) e `response_format` "isn't supported for the GPT
//   image models, which always return base64-encoded images" (linha 522-524, no doc de
//   ImageEditParamsBase, mesma regra pra generate). O campo que sempre vem preenchido é
//   `b64_json` (linha 58-62: "Returned by default for the GPT image models"). Ou seja: **não há
//   URL fetchable** — a resposta é sempre base64. Por isso este wrapper empacota o base64 como
//   data URL (`data:image/png;base64,...`) no campo `url` do retorno, e `revisor-imagem.ts`
//   (Task 6) foi ajustado nesta mesma task pra aceitar esse formato (ver comentário no cabeçalho
//   daquele arquivo) em vez de tentar buscar a "URL" por HTTP.
//
// Preço (custoUsd): sourced de https://developers.openai.com/api/docs/guides/image-generation
// (guia oficial de geração de imagem, consultado 19/08/2026) — exemplo de preço explícito pra
// gpt-image-2 em 1536x1024: qualidade "medium" = $0.041/imagem, qualidade "high" = $0.165/imagem
// (a página de pricing só lista preço por token de imagem/texto, não por imagem gerada; o guia de
// geração tem o exemplo em dólar já calculado pro tamanho/qualidade que usamos aqui). Escolhemos
// "medium" como default — mais barato, e bate com a estimativa "~R$1,27/post em qualidade média"
// já registrada na spec seção 4.8 (vs. "~R$3,85/post em qualidade alta"). Preço de API muda; a
// spec já avisa "reconferir antes de orçar de verdade" — não é um número inventado, mas também
// não é uma promessa de preço eterno.
//
// Tamanho: pedimos 1536x1024 (tamanho "standard" do SDK, mais próximo de paisagem 16:9 entre os
// tamanhos fixos suportados — na prática é 3:2, não exatamente 16:9; gpt-image-2 aceita
// resoluções arbitrárias tipo "1536x864", que seria 16:9 exato, mas não temos preço sourced pra
// esse tamanho arbitrário, então ficamos com o tamanho documentado no guia de preço pra manter
// custoUsd real em vez de estimado). A spec (seção 8 do doc de capa) já prevê esse cenário:
// "Se o modelo não oferecer exatamente 1200 × 675 px, gere na melhor resolução 16:9 disponível e
// faça redimensionamento posterior preservando a proporção" — redimensionamento fica pra uma task
// futura (upload de mídia WordPress, spec seção 4.6).

import "server-only";
import OpenAI from "openai";

const MODELO_IMAGEM = "gpt-image-2";
const QUALIDADE = "medium" as const;
const CUSTO_USD_POR_IMAGEM = 0.041;

const TAMANHO_POR_FORMATO = {
  "16:9": "1536x1024",
} as const;

let clienteSingleton: OpenAI | null = null;

function obterCliente(): OpenAI {
  if (!clienteSingleton) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");
    clienteSingleton = new OpenAI({ apiKey });
  }
  return clienteSingleton;
}

export async function gerarImagemOpenAI(
  prompt: string,
  formato: "16:9",
): Promise<{ url: string; usage: { custoUsd: number } }> {
  const cliente = obterCliente();

  const resposta = await cliente.images.generate({
    model: MODELO_IMAGEM,
    prompt,
    size: TAMANHO_POR_FORMATO[formato],
    quality: QUALIDADE,
    output_format: "png",
    n: 1,
  });

  const imagem = resposta.data?.[0];
  if (!imagem || typeof imagem.b64_json !== "string" || imagem.b64_json.trim() === "") {
    throw new Error("OpenAI Images: resposta sem b64_json (formato inesperado).");
  }

  return {
    url: `data:image/png;base64,${imagem.b64_json}`,
    usage: { custoUsd: CUSTO_USD_POR_IMAGEM },
  };
}
