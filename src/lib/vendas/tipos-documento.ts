// Fonte única dos tipos de documento de pessoa conhecidos — sem I/O de propósito, pra poder ser
// importado tanto de Client Components (formulário manual de upload) quanto de código server-only
// (classificação automática do Leitor de Documento IA) sem puxar nada de Supabase pro bundle do
// client.
export const TIPOS_DOCUMENTO_PESSOA = [
  { valor: "rg", rotulo: "RG" },
  { valor: "cnh", rotulo: "CNH" },
  { valor: "comprovante_residencia", rotulo: "Comprovante de Residência" },
  { valor: "contrato_social", rotulo: "Contrato Social" },
  { valor: "cartao_cnpj", rotulo: "Cartão CNPJ" },
  { valor: "outro", rotulo: "Outro" },
] as const;

export type TipoDocumentoPessoa = (typeof TIPOS_DOCUMENTO_PESSOA)[number]["valor"];

/** Valida um tipo vindo de fora (ex.: classificação da IA) contra a lista conhecida — cai em
 * "outro" se não bater com nenhum, nunca lança. */
export function normalizarTipoDocumentoPessoa(valor: string): TipoDocumentoPessoa {
  const encontrado = TIPOS_DOCUMENTO_PESSOA.find((t) => t.valor === valor);
  return encontrado?.valor ?? "outro";
}
