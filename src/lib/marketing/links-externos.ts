// src/lib/marketing/links-externos.ts
// Verificação de links externos citados pelo Escritor (19/08/2026, pedido do Luiz) — achado real
// de teste em produção: o Revisor gastava tentativas inteiras reprovando por "fonte específica"
// quando o link nem sequer existia (ex.: uma URL do BACEN saiu com o caminho duplicado,
// "supervisaosupervisao"). Este módulo faz um request HTTP real em cada link ANTES da etapa
// "revisar" (ver registrarEtapa "verificar_links" em processar-pauta.ts), pra pegar isso mais cedo
// e mais barato do que um ciclo de revisão inteiro.

import "server-only";

const TIMEOUT_MS = 6000;

/** Extrai as URLs http(s) únicas de todo `<a href="...">` no HTML — mailto:/tel: (não são links
 * "externos" verificáveis por HTTP) e âncoras internas (`href="#..."`) ficam de fora naturalmente
 * (não batem no regex, que exige o esquema http(s) explícito). */
export function extrairLinksExternos(html: string): string[] {
  const encontrados = new Set<string>();
  const regex = /<a\s[^>]*href\s*=\s*"(https?:\/\/[^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    encontrados.add(m[1]);
  }
  return [...encontrados];
}

export type ResultadoVerificacaoLink = { url: string; ok: boolean; motivo?: string };

/** Um único link: HEAD primeiro (mais barato); alguns servidores não aceitam HEAD (405/501) ou
 * bloqueiam por user-agent — cai pra GET nesses casos antes de desistir. `fetch` segue redirects
 * por padrão, então `response.ok` já reflete o status FINAL da cadeia (200-299). */
async function verificarUmLink(url: string): Promise<ResultadoVerificacaoLink> {
  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    let resposta: Response;
    try {
      resposta = await fetch(url, { method: "HEAD", signal: controlador.signal, redirect: "follow" });
      if (resposta.status === 405 || resposta.status === 501) {
        resposta = await fetch(url, { method: "GET", signal: controlador.signal, redirect: "follow" });
      }
    } catch {
      // Alguns sites recusam HEAD de forma menos "educada" (conexão derrubada, não um status HTTP
      // limpo) — tenta GET antes de desistir de vez.
      resposta = await fetch(url, { method: "GET", signal: controlador.signal, redirect: "follow" });
    }
    return resposta.ok ? { url, ok: true } : { url, ok: false, motivo: `HTTP ${resposta.status}` };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "erro desconhecido";
    const timeoutOuAbort = erro instanceof Error && erro.name === "AbortError";
    return { url, ok: false, motivo: timeoutOuAbort ? `sem resposta em ${TIMEOUT_MS / 1000}s` : mensagem };
  } finally {
    clearTimeout(timeout);
  }
}

/** Verifica todos os links em paralelo — a lista tende a ter só 2-4 URLs (o checklist pede "2 a 3
 * links externos"), então não há necessidade de limitar concorrência. */
export async function verificarLinksExternos(urls: string[]): Promise<ResultadoVerificacaoLink[]> {
  return Promise.all(urls.map(verificarUmLink));
}
