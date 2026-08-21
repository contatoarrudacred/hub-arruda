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

/** 20s — sem isso, uma chamada que a Assinafy nunca responde trava indefinidamente (só cortaria no
 * limite da função inteira, muito depois, e sem mensagem de erro clara pro usuário). Achado real:
 * botão "Configurar webhook" ficou preso em "Configurando..." pra sempre. */
const TIMEOUT_MS = 20_000;

async function chamarApi(caminho: string, opcoes: RequestInit = {}): Promise<unknown> {
  const resposta = await fetch(`${BASE_URL}${caminho}`, {
    ...opcoes,
    headers: { "X-Api-Key": apiKey(), ...opcoes.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
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
 * Upload de um documento (o PDF do contrato já gerado).
 *
 * A doc (docs/api_reference/Assinafy-API-Reference.md) mostra a resposta desse endpoint sem
 * envelope, com `id` no topo — **não bate com a resposta real** (confirmado em produção,
 * 20/08/2026: veio envelopada em {status,message,data}, igual todo o resto da API, com o `id`
 * dentro de `data`). Doc desatualizada/errada só pra esse endpoint específico — corrigido com
 * base na resposta real, não na doc.
 */
export async function uploadDocumento(nomeArquivo: string, conteudo: Buffer): Promise<AssinafyDocumento> {
  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(conteudo)], { type: "application/pdf" }), nomeArquivo);

  const bruto = (await chamarApi(`/accounts/${accountId()}/documents`, {
    method: "POST",
    body: formData,
  })) as { data?: Record<string, unknown> };

  const documento = bruto.data;

  // Guarda mantida (mesmo já sabendo o formato certo agora) — se a Assinafy voltar a mudar o
  // formato de novo, falha aqui com a resposta bruta no erro (guardado em contratos.ultimo_erro,
  // visível no card do Kanban) em vez de um 404 confuso 2 chamadas depois.
  if (!documento?.id) {
    throw new Error(`Assinafy não retornou um id de documento após o upload — resposta bruta: ${JSON.stringify(bruto)}`);
  }

  return mapearDocumento(documento);
}

export type AssinafySignatario = { id: string; fullName: string; email: string };

type SignatarioBruto = { id: string; full_name: string; email: string };

/** `search` filtra por full_name OU email (confirmado na doc) — por isso confere o e-mail exato
 * no resultado em vez de confiar que o primeiro item bateu certinho. */
async function buscarSignatarioPorEmail(email: string): Promise<AssinafySignatario | null> {
  const bruto = (await chamarApi(`/accounts/${accountId()}/signers?search=${encodeURIComponent(email)}`, {
    method: "GET",
  })) as { data: SignatarioBruto[] };

  const encontrado = bruto.data.find((s) => s.email.toLowerCase() === email.toLowerCase());
  return encontrado ? { id: encontrado.id, fullName: encontrado.full_name, email: encontrado.email } : null;
}

/**
 * Cria um signatário — idempotente. Achado real em produção: a Assinafy rejeita (400, "Um
 * signatário com este e-mail já existe") criar de novo um e-mail já cadastrado, e o signatário da
 * ArrudaCred é o MESMO e-mail em todo contrato — sem isso, toda emissão a partir da segunda
 * falhava aqui. Busca por e-mail exato primeiro e reaproveita se já existir; só cria de fato se
 * não encontrar. Fallback: se mesmo assim a criação bater nesse erro específico (corrida rara —
 * duas emissões concorrentes pro mesmo e-mail), busca de novo em vez de propagar o erro.
 */
export async function criarSignatario(fullName: string, email: string): Promise<AssinafySignatario> {
  const existente = await buscarSignatarioPorEmail(email);
  if (existente) return existente;

  try {
    const bruto = (await chamarApi(`/accounts/${accountId()}/signers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: fullName, email }),
    })) as { data: SignatarioBruto };

    return { id: bruto.data.id, fullName: bruto.data.full_name, email: bruto.data.email };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "";
    if (!mensagem.includes("já existe")) throw erro;

    const encontradoAgora = await buscarSignatarioPorEmail(email);
    if (!encontradoAgora) throw erro;
    return encontradoAgora;
  }
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

/**
 * Baixa o artifact "certificated" — o PDF final, com o certificado de assinatura embutido pela
 * Assinafy, disponível assim que o documento chega em `certificated` (mesmo momento do evento de
 * webhook `document_ready`, já tratado em processarDocumentoAssinado). Diferente de chamarApi: a
 * resposta é o binário do PDF (`Content-Type: application/pdf`), não JSON — por isso não reaproveita
 * aquele helper, que sempre chama `.json()`.
 */
export async function baixarDocumentoCertificado(documentId: string): Promise<Buffer> {
  const resposta = await fetch(`${BASE_URL}/documents/${documentId}/download/certificated`, {
    headers: { "X-Api-Key": apiKey() },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resposta.ok) {
    throw new Error(`Assinafy respondeu ${resposta.status} ao baixar o PDF certificado do documento ${documentId}.`);
  }
  return Buffer.from(await resposta.arrayBuffer());
}

export type StatusWebhookAssinafy = { events: string[]; ativo: boolean; url: string; email: string; atualizadoEm: string };

/** Consulta o estado atual da assinatura de webhook da conta — usado pra mostrar na tela se o
 * setup já foi feito (e pra quê), sem precisar confiar só na mensagem do momento em que o botão
 * "Configurar" foi clicado. */
export async function buscarStatusWebhook(): Promise<StatusWebhookAssinafy | null> {
  const bruto = (await chamarApi(`/accounts/${accountId()}/webhooks/subscriptions`, { method: "GET" })) as {
    data: { events: string[]; is_active: boolean; url: string; email: string; updated_at: string } | null;
  };
  if (!bruto.data) return null;
  return {
    events: bruto.data.events,
    ativo: bruto.data.is_active,
    url: bruto.data.url,
    email: bruto.data.email,
    atualizadoEm: bruto.data.updated_at,
  };
}

/** Registra/atualiza a assinatura de webhook da conta — precisa rodar uma vez (setup manual, não
 * automático) pra Assinafy começar a mandar `document_ready`/`signer_rejected_document` pra nós.
 * Sem HMAC nativo (confirmado na doc) — o segredo vai como query param na própria `url`. */
export async function configurarWebhook(url: string, email: string): Promise<void> {
  await chamarApi(`/accounts/${accountId()}/webhooks/subscriptions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: ["document_ready", "signer_rejected_document"],
      is_active: true,
      url,
      email,
    }),
  });
}
