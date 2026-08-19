/**
 * Chamadas HTTP cruas à API da Assinafy — único arquivo do projeto que fala com essa API
 * diretamente (mesmo padrão de src/lib/whatsapp/zapster.ts). Baseado em
 * docs/api_reference/Assinafy-API-Reference.md (regra de ouro: não codar API externa sem doc
 * atual em mãos — essa doc foi trazida pelo Luiz em 18/08/2026).
 */

const BASE_URL = process.env.ASSINAFY_BASE_URL || "https://api.assinafy.com.br/v1";

function accountId(): string {
  const id = process.env.ASSINAFY_ACCOUNT_ID;
  if (!id) throw new Error("ASSINAFY_ACCOUNT_ID não configurada.");
  return id;
}

function apiKey(): string {
  const chave = process.env.ASSINAFY_API_KEY;
  if (!chave) throw new Error("ASSINAFY_API_KEY não configurada.");
  return chave;
}

async function chamarApi(caminho: string, opcoes: RequestInit = {}): Promise<unknown> {
  const resposta = await fetch(`${BASE_URL}${caminho}`, {
    ...opcoes,
    headers: { "X-Api-Key": apiKey(), ...opcoes.headers },
  });
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(`Assinafy respondeu ${resposta.status} em ${caminho}: ${JSON.stringify(corpo)}`);
  }
  return corpo;
}

export type AssinafySignatarioStatus = {
  id: string;
  nome: string;
  email: string;
  completo: boolean;
  url: string | null;
};

export type AssinafyDocumento = {
  id: string;
  status: string;
  isClosed: boolean;
  signatarios: AssinafySignatarioStatus[];
};

type SignerBruto = { id: string; full_name: string; email: string; completed?: boolean };
type SigningUrlBruto = { signer_id: string; url: string };

/**
 * `assignment.summary.signers` (quem assinou) e `signing_urls` (link individual de cada um) só
 * existem depois que a assinatura foi solicitada (solicitarAssinatura) — ausentes logo após o
 * upload, por isso os dois vêm com fallback pra array vazio.
 */
function mapearSignatarios(bruto: Record<string, unknown>): AssinafySignatarioStatus[] {
  const assignment = bruto.assignment as Record<string, unknown> | undefined;
  const summary = assignment?.summary as { signers?: SignerBruto[] } | undefined;
  const signers = summary?.signers ?? [];
  const signingUrls = (bruto.signing_urls as SigningUrlBruto[] | undefined) ?? [];

  return signers.map((signer) => ({
    id: signer.id,
    nome: signer.full_name,
    email: signer.email,
    completo: Boolean(signer.completed),
    url: signingUrls.find((s) => s.signer_id === signer.id)?.url ?? null,
  }));
}

function mapearDocumento(bruto: Record<string, unknown>): AssinafyDocumento {
  return {
    id: String(bruto.id),
    status: String(bruto.status),
    isClosed: Boolean(bruto.is_closed),
    signatarios: mapearSignatarios(bruto),
  };
}

/**
 * Upload de um documento (o PDF do contrato já gerado) — a resposta desse endpoint específico vem
 * como objeto direto, sem o envelope {status,message,data} que os outros endpoints usam
 * (inconsistência real da API, confirmada na doc).
 */
export async function uploadDocumento(nomeArquivo: string, conteudo: Buffer): Promise<AssinafyDocumento> {
  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(conteudo)], { type: "application/pdf" }), nomeArquivo);

  const bruto = (await chamarApi(`/accounts/${accountId()}/documents`, {
    method: "POST",
    body: formData,
  })) as Record<string, unknown>;
  return mapearDocumento(bruto);
}

export type AssinafySignatario = { id: string; fullName: string; email: string };

/** Cria um signatário — esse endpoint vem envelopado em {status,message,data}. */
export async function criarSignatario(fullName: string, email: string): Promise<AssinafySignatario> {
  const bruto = (await chamarApi(`/accounts/${accountId()}/signers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ full_name: fullName, email }),
  })) as { data: { id: string; full_name: string; email: string } };

  return { id: bruto.data.id, fullName: bruto.data.full_name, email: bruto.data.email };
}

/** Solicita assinatura via método "virtual" (sem input do signatário além de assinar — não usa
 * campos de coleta de dado extra, já temos tudo no PDF). */
export async function solicitarAssinatura(documentId: string, signerIds: string[]): Promise<void> {
  await chamarApi(`/documents/${documentId}/assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method: "virtual", signerIds }),
  });
}

export async function buscarDocumento(documentId: string): Promise<AssinafyDocumento> {
  const bruto = (await chamarApi(`/documents/${documentId}`, { method: "GET" })) as { data: Record<string, unknown> };
  return mapearDocumento(bruto.data);
}
