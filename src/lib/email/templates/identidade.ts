// Constantes de identidade visual compartilhadas por todo e-mail da ArrudaCred — cores, logo,
// ícones. Ver layout-base.tsx pro layout compartilhado (cabeçalho/rodapé) que usa isto.

export const NAVY = "#141e33";
export const DOURADO = "#c8a55d";

export const BUCKET_EMAIL = "https://mzvaqjhalynaceecnayt.supabase.co/storage/v1/object/public/midia-fluxo/email";

// Convertido de .webp (único formato disponível no site) pra .png e hospedado no Storage do
// próprio projeto — Outlook desktop não renderiza .webp de forma confiável em e-mail.
//
// Fundo do cabeçalho continua claro (não navy) até termos o logo com versão pra fundo escuro que
// Luiz vai mandar (15/08/2026) — esse logo aqui tem partes pretas que somem contra fundo escuro,
// era exatamente o bug que a troca pra fundo claro já corrigiu uma vez. Trocar os dois valores
// juntos (LOGO_URL + FUNDO_CABECALHO) assim que o arquivo novo estiver hospedado.
export const LOGO_URL = `${BUCKET_EMAIL}/logo-arrudacred-horizontal.png`;
export const FUNDO_CABECALHO = "#f8f1e4";

export const ICONES = {
  site: `${BUCKET_EMAIL}/icones/site.png`,
  whatsapp: `${BUCKET_EMAIL}/icones/whatsapp.png`,
  instagram: `${BUCKET_EMAIL}/icones/instagram.png`,
  facebook: `${BUCKET_EMAIL}/icones/facebook.png`,
  youtube: `${BUCKET_EMAIL}/icones/youtube.png`,
};

export type RedesSociais = { site: string; instagram: string; facebook: string; youtube: string };
