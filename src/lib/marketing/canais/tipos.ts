// src/lib/marketing/canais/tipos.ts
// Contrato comum de canal de distribuição — mesmo princípio do adaptador de canal de atendimento
// já usado em src/lib/whatsapp/enviar.ts: tradução fina entre um formato canal-agnóstico e a API
// específica de cada provedor.

export type ConteudoCanal = {
  titulo: string;
  corpoHtml: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
};

export type ResultadoRascunho = { idRemoto: string; status: "rascunho" | "falhou" };
export type ResultadoVerificacao = { ok: boolean; detalhes?: string };
export type ResultadoPublicacao = { urlPublicada: string };

export interface AdaptadorCanal {
  criarRascunho(conteudo: ConteudoCanal): Promise<ResultadoRascunho>;
  verificarRascunho(idRemoto: string): Promise<ResultadoVerificacao>;
  aprovarPublicar(idRemoto: string): Promise<ResultadoPublicacao>;
}
