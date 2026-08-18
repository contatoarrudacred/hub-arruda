import "server-only";
import type { AdaptadorCanal, ConteudoCanal, ResultadoPublicacao, ResultadoRascunho, ResultadoVerificacao } from "./tipos";

export type CredenciaisWordPress = { usuario: string; senhaApp: string };

function credenciaisBasicAuth(credenciais: CredenciaisWordPress): string {
  if (!credenciais.usuario || !credenciais.senhaApp) throw new Error("Credenciais de WordPress (usuario/senhaApp) não configuradas.");
  return Buffer.from(`${credenciais.usuario}:${credenciais.senhaApp}`).toString("base64");
}

// Recebe as credenciais como parâmetro em vez de ler process.env diretamente — com mais de um
// site (ex.: roadmap vozdocredito.com.br), credenciais globais vazariam a senha do site A pro
// host do site B. O chamador (processar-pauta.ts) monta as credenciais por propriedade.
export function criarAdaptadorWordPress(urlBase: string, credenciais: CredenciaisWordPress): AdaptadorCanal {
  const baseApi = `${urlBase.replace(/\/$/, "")}/wp-json/wp/v2`;

  async function chamarApi(caminho: string, corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resposta = await fetch(`${baseApi}${caminho}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credenciaisBasicAuth(credenciais)}`,
      },
      body: JSON.stringify(corpo),
    });
    if (!resposta.ok) throw new Error(`WordPress REST API respondeu ${resposta.status} em ${caminho}`);
    return resposta.json();
  }

  return {
    async criarRascunho(conteudo: ConteudoCanal): Promise<ResultadoRascunho> {
      const post = await chamarApi("/posts", {
        title: conteudo.titulo,
        content: conteudo.corpoHtml,
        slug: conteudo.slug,
        status: "draft",
        meta: { _yoast_wpseo_title: conteudo.metaTitle, _yoast_wpseo_metadesc: conteudo.metaDescription },
      });
      return { idRemoto: String(post.id), status: "rascunho" };
    },

    async verificarRascunho(idRemoto: string): Promise<ResultadoVerificacao> {
      const resposta = await fetch(`${baseApi}/posts/${idRemoto}`, {
        headers: { Authorization: `Basic ${credenciaisBasicAuth(credenciais)}` },
      });
      if (!resposta.ok) return { ok: false, detalhes: `REST API respondeu ${resposta.status}` };
      const post = (await resposta.json()) as { status: string; content?: { rendered?: string } };
      const temConteudo = Boolean(post.content?.rendered?.length);
      return temConteudo ? { ok: true } : { ok: false, detalhes: "Rascunho sem conteúdo renderizado." };
    },

    async aprovarPublicar(idRemoto: string): Promise<ResultadoPublicacao> {
      const post = await chamarApi(`/posts/${idRemoto}`, { status: "publish" });
      return { urlPublicada: String(post.link) };
    },
  };
}
