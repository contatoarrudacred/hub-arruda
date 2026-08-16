// Constantes de identidade visual compartilhadas por todo e-mail da ArrudaCred — cores, logo,
// ícones. Ver layout-base.tsx pro layout compartilhado (cabeçalho/rodapé) que usa isto.

export const NAVY = "#141e33";
export const DOURADO = "#c8a55d";
// Dourado bem escurecido — mesma cor já usada no fundo do canvas do editor de fluxo em dark mode
// (identidade estabelecida em 15/08/2026), reaproveitada aqui pro fundo da página do e-mail.
export const DOURADO_ESCURO = "#1f1912";

export const BUCKET_EMAIL = "https://mzvaqjhalynaceecnayt.supabase.co/storage/v1/object/public/midia-fluxo/email";

// Versão do logo preparada por Luiz pra fundo escuro (texto "CRED" e "Assessoria & Crédito" em
// branco, em vez de preto — a versão anterior tinha partes pretas que somiam contra fundo navy).
export const LOGO_URL = `${BUCKET_EMAIL}/logo-arrudacred-horizontal-fundo-escuro.png`;
export const FUNDO_CABECALHO = NAVY;

export const ICONES = {
  site: `${BUCKET_EMAIL}/icones/site.png`,
  whatsapp: `${BUCKET_EMAIL}/icones/whatsapp.png`,
  instagram: `${BUCKET_EMAIL}/icones/instagram.png`,
  facebook: `${BUCKET_EMAIL}/icones/facebook.png`,
  youtube: `${BUCKET_EMAIL}/icones/youtube.png`,
};

export type RedesSociais = { site: string; instagram: string; facebook: string; youtube: string };
