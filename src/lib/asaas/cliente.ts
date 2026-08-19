/**
 * Chamadas HTTP cruas à API da Asaas — único arquivo do projeto que fala com essa API
 * diretamente. Baseado na doc oficial (docs.asaas.com/llms.txt, consultada em 18/08/2026 —
 * regra de ouro: não codar API externa sem doc atual em mãos, resumo registrado em
 * docs/COORDENACAO_AGENTES_ARRUDACRED.md).
 */

function baseUrl(): string {
  return process.env.ASAAS_BASE_URL || "https://api.asaas.com/v3";
}

function apiKey(): string {
  const chave = process.env.ASAAS_API_KEY;
  if (!chave) throw new Error("ASAAS_API_KEY não configurada.");
  return chave;
}

async function chamarApi<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const resposta = await fetch(`${baseUrl()}${caminho}`, {
    ...opcoes,
    headers: { access_token: apiKey(), "Content-Type": "application/json", ...opcoes.headers },
  });
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(`Asaas respondeu ${resposta.status} em ${caminho}: ${JSON.stringify(corpo)}`);
  }
  return corpo as T;
}

export type AsaasCliente = { id: string };

/** Busca cliente existente por CPF/CNPJ — confirmado na doc oficial que essa combinação
 * (cpfCnpj, opcionalmente + externalReference) é o jeito recomendado de checar duplicata antes de
 * criar, sem precisar guardar o id da Asaas em nenhuma tabela nossa. */
export async function buscarClientePorCpfCnpj(cpfCnpj: string): Promise<AsaasCliente | null> {
  const resposta = await chamarApi<{ data: AsaasCliente[] }>(`/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}`, {
    method: "GET",
  });
  return resposta.data[0] ?? null;
}

export async function criarCliente(nome: string, cpfCnpj: string, externalReference: string): Promise<AsaasCliente> {
  return chamarApi<AsaasCliente>("/customers", {
    method: "POST",
    body: JSON.stringify({ name: nome, cpfCnpj, externalReference }),
  });
}

export type EntradaCobranca = {
  customerId: string;
  billingType: "BOLETO" | "CREDIT_CARD";
  value: number;
  dueDate: string; // AAAA-MM-DD
  externalReference: string;
  description: string;
};

export type Cobranca = { id: string; invoiceUrl: string };

/**
 * Cria UMA cobrança individual. Decisão importante: **não usamos o `installmentCount`/
 * `totalValue` nativo da Asaas** (que faria ela mesma calcular valor/vencimento de cada parcela) —
 * já temos o valor e o vencimento de cada parcela calculados do nosso lado
 * (calcularVencimentosPorAncora, regra de dia-âncora validada com o Luiz), e a regra de
 * arredondamento/data da Asaas não bate necessariamente com a nossa. O adapter chama esta função
 * uma vez por parcela, com o valor/data exatos que já temos — sem depender do parcelamento nativo
 * deles pra nada além de existir a cobrança em si.
 */
export type CobrancaStatus = Cobranca & { status: string };

/** Consulta o status atual de uma cobrança já criada — usado pelo botão "Atualizar agora" da tela
 * de Detalhes da Venda (decisão: banco/webhook é a fonte padrão, isso é só a checagem manual sob
 * demanda, ver spec seção 3.6). */
export async function buscarCobranca(paymentId: string): Promise<CobrancaStatus> {
  return chamarApi<CobrancaStatus>(`/payments/${paymentId}`, { method: "GET" });
}

export async function criarCobranca(entrada: EntradaCobranca): Promise<Cobranca> {
  return chamarApi<Cobranca>("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: entrada.customerId,
      billingType: entrada.billingType,
      value: entrada.value,
      dueDate: entrada.dueDate,
      externalReference: entrada.externalReference,
      description: entrada.description,
    }),
  });
}
