// src/lib/marketing/imagens/armazenamento.ts
// Arquivamento de imagens no Supabase Storage (bucket marketing-imagens, migration
// 20260819110000) — pedido explícito do Luiz (19/08/2026): as imagens de capa/secundárias hoje só
// são enviadas ao WordPress (canais/wordpress.ts, enviarMidia); ele quer uma cópia arquivada aqui
// também, "possível uso futuro". Estritamente aditivo: nada neste arquivo é lido por nenhuma outra
// parte do pipeline hoje, e uma falha aqui nunca pode impedir o upload ao WordPress nem a
// publicação — quem decide isso é o chamador (processar-pauta.ts, gerarEEmbutirImagens), não este
// arquivo (mesmo contrato "lança em falha, chamador decide" de enviarMidia em canais/wordpress.ts).
//
// Fonte da imagem: sempre a data URL ORIGINAL da OpenAI (a mesma que vai para enviarMidia), nunca
// a URL pública final do WordPress — já temos os bytes em mãos, baixar de novo por HTTP seria
// desnecessário.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "marketing-imagens";

// Mesmo padrão de detecção de data URL que src/lib/marketing/canais/wordpress.ts
// (`obterBufferImagem`) e src/lib/marketing/imagens/revisor-imagem.ts (`construirBlocoImagem`) já
// repetem, cada um no seu próprio módulo — duplicado aqui de propósito, não extraído pra um util
// cross-diretório: é o padrão já estabelecido no repo de repetir esta regex de 1 linha em cada
// módulo que precisa dela em vez de criar uma abstração compartilhada só por isso (ver o
// comentário de cabeçalho de revisor-imagem.ts pro histórico completo do porquê `gerarImagemOpenAI`
// sempre produz uma data URL: os modelos GPT Image da OpenAI nunca devolvem `url`, só `b64_json`).
const REGEX_DATA_URL_IMAGEM = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/;

/**
 * Diferente de `obterBufferImagem` em wordpress.ts, este NÃO tem fallback de `fetch` pra uma URL
 * http(s) de verdade: o contrato deste módulo (ver comentário de cabeçalho) é sempre receber a
 * data URL original da OpenAI, nunca a URL pública pós-upload do WordPress — não existe caminho
 * legítimo, no pipeline atual, em que este módulo receba uma URL http(s). Uma data URL malformada
 * aqui é um bug de quem chamou, não um formato alternativo a suportar silenciosamente.
 */
function obterBufferImagem(dataUrl: string): { buffer: Buffer; mediaType: string } {
  const match = REGEX_DATA_URL_IMAGEM.exec(dataUrl);
  if (!match) {
    throw new Error("Storage: valor recebido não é uma data URL de imagem válida (esperado data:image/...;base64,...).");
  }
  const [, mediaType, dados] = match;
  return { buffer: Buffer.from(dados, "base64"), mediaType };
}

/**
 * Sobe `dataUrl` (data URL base64, ver comentário de cabeçalho) para `caminho` dentro do bucket
 * `marketing-imagens` (público) e devolve a URL pública. `upsert: true` porque `caminho` já é
 * namespaced por propriedade+pauta+slug pelo chamador (nunca colide entre posts diferentes) — um
 * upsert aqui só importa numa reexecução da mesma pauta, onde sobrescrever é o comportamento certo.
 *
 * Lança em caso de falha de upload — mesmo contrato de `enviarMidia` (canais/wordpress.ts): é
 * responsabilidade de QUEM CHAMA decidir se isso bloqueia algo (aqui, não bloqueia — ver
 * processar-pauta.ts, gerarEEmbutirImagens, try/catch próprio e separado do upload ao WordPress).
 */
export async function enviarImagemStorage(dataUrl: string, caminho: string): Promise<{ url: string }> {
  const { buffer, mediaType } = obterBufferImagem(dataUrl);

  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, buffer, { contentType: mediaType, upsert: true });
  if (error) throw new Error(`Falha ao enviar imagem ao Storage (${caminho}): ${error.message}`);

  // getPublicUrl é síncrono no SDK do Supabase Storage (só monta a URL a partir da config do
  // bucket, não bate na rede) e não lança — nenhum try/catch necessário aqui.
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(caminho);
  return { url: data.publicUrl };
}
