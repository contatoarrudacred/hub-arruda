import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Derivação de chave criptográfica a partir do segredo env MARKETING_CREDENCIAIS_CHAVE.
 *
 * SEGURANÇA: scryptSync com salt fixo é aceitável **só porque** MARKETING_CREDENCIAIS_CHAVE
 * já é, ela mesma, uma env secreta de alta entropia (gerada via `openssl rand -base64 32`,
 * nunca digitada à mão pelo usuário). Se um dia essa env virar algo digitado manualmente,
 * o salt fixo deixa de ser seguro e permitiria ataques de dicionário — quem for mexer neste
 * código no futuro precisa saber disso antes de "simplificar" removendo scryptSync ou usando
 * um salt público.
 */
function obterChave(): Buffer {
  const segredo = process.env.MARKETING_CREDENCIAIS_CHAVE;
  if (!segredo) throw new Error("MARKETING_CREDENCIAIS_CHAVE não configurada.");
  return scryptSync(segredo, "marketing-credenciais-salt", 32); // deriva 32 bytes fixos de um segredo de qualquer tamanho
}

/**
 * Cifra um texto plano usando AES-256-GCM.
 * Retorna uma string base64 contendo: [12-byte IV][16-byte authTag][ciphertext]
 */
export function cifrar(textoPlano: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", obterChave(), iv);
  const cifrado = Buffer.concat([cipher.update(textoPlano, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, cifrado]).toString("base64");
}

/**
 * Decifra um texto cifrado com cifrar().
 * Espera a string base64 contendo: [12-byte IV][16-byte authTag][ciphertext]
 */
export function decifrar(valorCifrado: string): string {
  const dados = Buffer.from(valorCifrado, "base64");
  const iv = dados.subarray(0, 12);
  const authTag = dados.subarray(12, 28);
  const cifrado = dados.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", obterChave(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString("utf8");
}
