import "server-only";
import type { AdaptadorCanal, ConteudoCanal, ResultadoPublicacao, ResultadoRascunho, ResultadoVerificacao } from "./tipos";

export type CredenciaisWordPress = { usuario: string; senhaApp: string };

export type ResultadoMidia = { idRemoto: string; url: string };

function credenciaisBasicAuth(credenciais: CredenciaisWordPress): string {
  if (!credenciais.usuario || !credenciais.senhaApp) throw new Error("Credenciais de WordPress (usuario/senhaApp) não configuradas.");
  return Buffer.from(`${credenciais.usuario}:${credenciais.senhaApp}`).toString("base64");
}

// Mesmo padrão de detecção de data URL que src/lib/marketing/imagens/revisor-imagem.ts
// (`construirBlocoImagem`) usa — repetido aqui em vez de extraído pra um util compartilhado
// porque os dois arquivos vivem em módulos diferentes (canais/ vs imagens/) e cada um já segue o
// padrão do resto do seu diretório de não introduzir abstração cross-módulo por uma função de
// uma linha. Ver o comentário de cabeçalho de revisor-imagem.ts pro histórico completo do porquê
// `gerarImagemOpenAI` (Task 7) devolve uma data URL em vez de uma URL http(s) fetchable: os
// modelos GPT Image da OpenAI nunca devolvem `url`, só `b64_json`.
const REGEX_DATA_URL_IMAGEM = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/;

/**
 * Decodifica o payload de imagem a partir de `imagemUrl`. Caminho principal/esperado: uma data
 * URL (`data:image/png;base64,...`), o formato que `gerarImagemOpenAI` sempre produz hoje — não
 * existe uma URL fetchable real no pipeline atual (ver nota acima). Caminho de fallback: uma URL
 * http(s) de verdade é baixada via `fetch` — mantido por precaução caso uma fonte de imagem
 * futura devolva uma URL fetchable de verdade, mas não é o caminho exercitado pelo pipeline hoje.
 */
async function obterBufferImagem(imagemUrl: string): Promise<{ buffer: Buffer; mediaType: string }> {
  const match = REGEX_DATA_URL_IMAGEM.exec(imagemUrl);
  if (match) {
    const [, mediaType, dados] = match;
    return { buffer: Buffer.from(dados, "base64"), mediaType };
  }
  const resposta = await fetch(imagemUrl);
  if (!resposta.ok) throw new Error(`Falha ao baixar imagem de ${imagemUrl}: HTTP ${resposta.status}`);
  const mediaType = resposta.headers.get("content-type") ?? "image/png";
  const arrayBuffer = await resposta.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mediaType };
}

// Recebe as credenciais como parâmetro em vez de ler process.env diretamente — com mais de um
// site (ex.: roadmap vozdocredito.com.br), credenciais globais vazariam a senha do site A pro
// host do site B. O chamador (processar-pauta.ts) monta as credenciais por propriedade.
export function criarAdaptadorWordPress(
  urlBase: string,
  credenciais: CredenciaisWordPress,
): AdaptadorCanal & {
  // Sobrescreve a assinatura de criarRascunho do AdaptadorCanal genérico (que não conhece
  // imagemDestacadaId/agendadoPara — parâmetros específicos do WordPress) — sem isso a interseção
  // manteria só a assinatura de 1 parâmetro e o chamador não conseguiria passar os outros dois.
  // agendadoPara (Fase 4e, 20/08/2026): quando presente, cria o post com `status: "future"` pro
  // WordPress liberar sozinho nesse horário, em vez de `"draft"` (ver processar-pauta.ts).
  criarRascunho(conteudo: ConteudoCanal, imagemDestacadaId?: string, agendadoPara?: Date): Promise<ResultadoRascunho>;
  enviarMidia(imagemUrl: string, nomeArquivo: string, altText: string): Promise<ResultadoMidia>;
  // Agenda de Posts (20/08/2026) — atualiza um post JÁ EXISTENTE no WordPress, campos parciais.
  // Um método único serve os três usos da tela (trocar foto, agendamento manual/reagendamento,
  // edição completa do post) — todos são só "atualiza um subconjunto de campos de um post que já
  // existe", mesmo mecanismo REST que aprovarPublicar (abaixo) já usa pra mudar só o status.
  atualizarPost(
    idRemoto: string,
    corpo: {
      title?: string;
      content?: string;
      slug?: string;
      meta?: { _yoast_wpseo_title?: string; _yoast_wpseo_metadesc?: string };
      featuredMedia?: string;
      status?: "future";
      dateGmt?: string;
    },
  ): Promise<{ link: string }>;
} {
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
    async criarRascunho(conteudo: ConteudoCanal, imagemDestacadaId?: string, agendadoPara?: Date): Promise<ResultadoRascunho> {
      const post = await chamarApi("/posts", {
        title: conteudo.titulo,
        content: conteudo.corpoHtml,
        slug: conteudo.slug,
        // Fase 4e (20/08/2026): com agendadoPara, cria como "future" + date_gmt — o WordPress
        // libera o post sozinho nesse horário (recurso nativo do core, sem cron próprio). UTC
        // explícito (toISOString) porque date_gmt é sempre UTC pro core, independente do fuso
        // configurado no site (diferente de `date`, que seguiria o fuso do WordPress).
        status: agendadoPara ? "future" : "draft",
        ...(agendadoPara ? { date_gmt: agendadoPara.toISOString() } : {}),
        meta: { _yoast_wpseo_title: conteudo.metaTitle, _yoast_wpseo_metadesc: conteudo.metaDescription },
        // Adição puramente aditiva (Task 9): sem imagemDestacadaId a chave nem entra no objeto,
        // então o payload enviado continua idêntico ao de antes desta task (ver regressão em
        // wordpress.test.ts). WordPress espera um inteiro em `featured_media`, mas o REST core
        // já normaliza com absint() no servidor — o resto do módulo trata todo id remoto como
        // string (ver `idRemoto` em ResultadoRascunho/ResultadoMidia), então mantemos o mesmo
        // tipo aqui em vez de converter pra number sem necessidade.
        ...(imagemDestacadaId ? { featured_media: imagemDestacadaId } : {}),
      });
      // `post.link` (Fase 4e): o WordPress calcula o permalink a partir do slug já na criação,
      // mesmo pra status "future" — não precisa esperar aprovarPublicar pra ter a URL final.
      return { idRemoto: String(post.id), status: "rascunho", link: String(post.link) };
    },

    async atualizarPost(
      idRemoto: string,
      corpo: {
        title?: string;
        content?: string;
        slug?: string;
        meta?: { _yoast_wpseo_title?: string; _yoast_wpseo_metadesc?: string };
        featuredMedia?: string;
        status?: "future";
        dateGmt?: string;
      },
    ): Promise<{ link: string }> {
      const post = await chamarApi(`/posts/${idRemoto}`, {
        ...(corpo.title !== undefined ? { title: corpo.title } : {}),
        ...(corpo.content !== undefined ? { content: corpo.content } : {}),
        ...(corpo.slug !== undefined ? { slug: corpo.slug } : {}),
        ...(corpo.meta ? { meta: corpo.meta } : {}),
        ...(corpo.featuredMedia ? { featured_media: corpo.featuredMedia } : {}),
        ...(corpo.status ? { status: corpo.status } : {}),
        ...(corpo.dateGmt ? { date_gmt: corpo.dateGmt } : {}),
      });
      return { link: String(post.link) };
    },

    // POST /wp/v2/media — confirmado via developer.wordpress.org/rest-api/reference/media/
    // (schema: `alt_text` é argumento aceito na criação; `source_url` é a URL final do arquivo
    // no response) e via o código-fonte real do core (WP_REST_Attachments_Controller::create_item,
    // github.com/WordPress/wordpress-develop, wp-includes/rest-api/endpoints/
    // class-wp-rest-attachments-controller.php): quando não há `$_FILES` (upload multipart), o
    // método lê o corpo bruto da requisição (`$request->get_body()`) como os bytes do arquivo —
    // não é JSON nem multipart/form-data — e o nome do arquivo/mime type vêm dos headers
    // `Content-Disposition: attachment; filename="..."` e `Content-Type`. O mesmo create_item já
    // aplica `alt_text` (`update_post_meta(..., '_wp_attachment_image_alt', ...)`) numa única
    // chamada — sem PATCH separado — desde que `$request['alt_text']` esteja presente; como o
    // corpo da requisição é consumido inteiro pelos bytes da imagem, esse campo (e qualquer outro
    // argumento aceito pelo endpoint) só pode chegar como parâmetro de query string, não no corpo.
    async enviarMidia(imagemUrl: string, nomeArquivo: string, altText: string): Promise<ResultadoMidia> {
      const { buffer, mediaType } = await obterBufferImagem(imagemUrl);
      const resposta = await fetch(`${baseApi}/media?alt_text=${encodeURIComponent(altText)}`, {
        method: "POST",
        headers: {
          "Content-Type": mediaType,
          "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
          Authorization: `Basic ${credenciaisBasicAuth(credenciais)}`,
        },
        // Cast necessário: `Buffer` é um `Uint8Array` de verdade em runtime (undici aceita sem
        // problema, é o mesmo mecanismo usado por qualquer upload binário em Node), mas os tipos
        // do lib "dom" (BodyInit) e o `Buffer<ArrayBufferLike>` do @types/node atual não fecham
        // por variância de tipo genérico — problema puramente de tipagem, não de comportamento.
        body: buffer as unknown as BodyInit,
      });
      if (!resposta.ok) throw new Error(`WordPress REST API respondeu ${resposta.status} em /media`);
      const media = (await resposta.json()) as { id: number; source_url: string };
      return { idRemoto: String(media.id), url: media.source_url };
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
