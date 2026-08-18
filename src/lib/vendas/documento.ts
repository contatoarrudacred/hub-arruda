export function normalizarDocumento(valor: string): string {
  return valor.replace(/\D/g, "");
}

function calcularDigitoCpf(digitos: number[], pesoInicial: number): number {
  const soma = digitos.reduce((acc, digito, indice) => acc + digito * (pesoInicial - indice), 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function validarCpf(documento: string): boolean {
  if (documento.length !== 11 || /^(\d)\1{10}$/.test(documento)) return false;
  const digitos = documento.split("").map(Number);
  const digito1 = calcularDigitoCpf(digitos.slice(0, 9), 10);
  const digito2 = calcularDigitoCpf(digitos.slice(0, 10), 11);
  return digito1 === digitos[9] && digito2 === digitos[10];
}

function calcularDigitoCnpj(digitos: number[], pesos: number[]): number {
  const soma = digitos.reduce((acc, digito, indice) => acc + digito * pesos[indice], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function validarCnpj(documento: string): boolean {
  if (documento.length !== 14 || /^(\d)\1{13}$/.test(documento)) return false;
  const digitos = documento.split("").map(Number);
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const digito1 = calcularDigitoCnpj(digitos.slice(0, 12), pesos1);
  const digito2 = calcularDigitoCnpj(digitos.slice(0, 13), pesos2);
  return digito1 === digitos[12] && digito2 === digitos[13];
}

export function validarDocumento(valor: string): boolean {
  const documento = normalizarDocumento(valor);
  if (documento.length === 11) return validarCpf(documento);
  if (documento.length === 14) return validarCnpj(documento);
  return false;
}

export function tipoPessoaPorDocumento(valor: string): "pf" | "pj" | null {
  if (!validarDocumento(valor)) return null;
  const documento = normalizarDocumento(valor);
  return documento.length === 11 ? "pf" : "pj";
}
