// Leitura de documento (RG, CNH, cartão CNPJ, comprovante de residência) por IA (Claude, visão),
// pra pré-preencher o formulário de cadastro de venda — Task 11 do plano "Vendas — Cadastro".
// Mesmo padrão de `src/lib/motor-fluxo/interpretacao-ia.ts`: cliente singleton, Haiku, tool-use
// pra forçar saída estruturada, nunca lança — devolve null em caso de erro.
//
// Suporte a PDF nativo (`type: "document"` com `Base64PDFSource`) confirmado contra os tipos reais
// do pacote instalado (@anthropic-ai/sdk 0.117.1, node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts):
// `DocumentBlockParam.source` aceita `Base64PDFSource | PlainTextSource | ContentBlockSource | URLPDFSource`,
// e `Base64PDFSource` é exatamente `{ data: string; media_type: "application/pdf"; type: "base64" }`.
// Ou seja, o formato usado abaixo bate com o pacote instalado — sem necessidade de fallback.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const MODELO_LEITURA_DOCUMENTO = "claude-haiku-4-5-20251001";

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

const FERRAMENTA_LEITURA = {
  name: "registrar_dados_documento",
  description: "Registra os dados extraídos do(s) documento(s) fornecido(s).",
  input_schema: {
    type: "object" as const,
    properties: {
      nome: { type: "string", description: "Nome completo (PF) ou razão social (PJ) encontrado. String vazia se não encontrado." },
      documento: { type: "string", description: "CPF ou CNPJ encontrado, só dígitos. String vazia se não encontrado." },
      cep: { type: "string", description: "CEP do endereço encontrado, só dígitos. String vazia se não encontrado." },
      logradouro: { type: "string", description: "Logradouro encontrado. String vazia se não encontrado." },
      numero: { type: "string", description: "Número do endereço encontrado. String vazia se não encontrado." },
      bairro: { type: "string", description: "Bairro encontrado. String vazia se não encontrado." },
      cidade: { type: "string", description: "Cidade encontrada. String vazia se não encontrado." },
      uf: { type: "string", description: "UF (2 letras) encontrada. String vazia se não encontrado." },
    },
    required: ["nome", "documento", "cep", "logradouro", "numero", "bairro", "cidade", "uf"],
  },
};

export type ArquivoParaLeitura = { base64: string; mediaType: string };

export type DadosExtraidosDocumento = {
  nome: string;
  documento: string;
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export async function lerDocumentoComIA(arquivos: ArquivoParaLeitura[]): Promise<DadosExtraidosDocumento | null> {
  if (arquivos.length === 0) return null;

  const cliente = obterCliente();

  const blocosArquivo: Anthropic.Messages.ContentBlockParam[] = arquivos.map((arquivo) => {
    if (arquivo.mediaType === "application/pdf") {
      return {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: arquivo.base64 },
      };
    }
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: arquivo.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        data: arquivo.base64,
      },
    };
  });

  const blocoTexto: Anthropic.Messages.ContentBlockParam = {
    type: "text",
    text: "Estas imagens/documento(s) são de um documento de identificação ou comprovante de endereço brasileiro (RG, CNH, cartão CNPJ, comprovante de residência, etc. — pode ser mais de uma imagem do mesmo documento, ex.: frente e verso). Extraia nome/razão social, CPF/CNPJ e endereço, quando existirem. Use a ferramenta pra registrar o resultado — nunca invente um dado que não está visível, deixe o campo vazio nesse caso.",
  };

  try {
    const resposta = await cliente.messages.create({
      model: MODELO_LEITURA_DOCUMENTO,
      max_tokens: 500,
      tools: [FERRAMENTA_LEITURA],
      tool_choice: { type: "tool", name: "registrar_dados_documento" },
      messages: [
        {
          role: "user",
          content: [...blocosArquivo, blocoTexto],
        },
      ],
    });

    const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
    if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") return null;

    return blocoFerramenta.input as DadosExtraidosDocumento;
  } catch (e) {
    console.error("[leitura-documento-ia] erro ao chamar Claude:", e);
    return null;
  }
}
