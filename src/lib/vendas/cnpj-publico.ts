import { normalizarDocumento } from "./documento";

export async function buscarRazaoSocialPorCnpj(cnpj: string): Promise<{ razaoSocial: string } | null> {
  const cnpjNormalizado = normalizarDocumento(cnpj);
  if (cnpjNormalizado.length !== 14) return null;

  try {
    const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjNormalizado}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resposta.ok) return null;

    const dados = (await resposta.json()) as { razao_social?: string };
    if (!dados.razao_social) return null;

    return { razaoSocial: dados.razao_social };
  } catch {
    return null;
  }
}
