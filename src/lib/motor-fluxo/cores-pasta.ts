// Paleta fechada de cores pra Pasta de Fluxo — mesmo padrão de cores-atendimento.ts (chave
// nomeada, não hex livre — troca de tom no futuro não exige migrar dado), com 16 opções em vez de
// 7 (ver docs/superpowers/specs/2026-08-19-fluxos-pastas-design.md seção 3).

export type CorPasta =
  | "vermelho"
  | "laranja"
  | "amber"
  | "amarelo"
  | "lima"
  | "verde"
  | "esmeralda"
  | "teal"
  | "ciano"
  | "azul"
  | "indigo"
  | "violeta"
  | "roxo"
  | "fucsia"
  | "rosa"
  | "cinza";

export type TomPasta = { bg: string; texto: string; borda: string; nome: string };

export const CORES_PASTA: Record<CorPasta, TomPasta> = {
  vermelho: { bg: "bg-red-100 dark:bg-red-900", texto: "text-red-700 dark:text-red-300", borda: "border-red-300 dark:border-red-700", nome: "Vermelho" },
  laranja: { bg: "bg-orange-100 dark:bg-orange-900", texto: "text-orange-700 dark:text-orange-300", borda: "border-orange-300 dark:border-orange-700", nome: "Laranja" },
  amber: { bg: "bg-amber-100 dark:bg-amber-900", texto: "text-amber-700 dark:text-amber-300", borda: "border-amber-300 dark:border-amber-700", nome: "Âmbar" },
  amarelo: { bg: "bg-yellow-100 dark:bg-yellow-900", texto: "text-yellow-700 dark:text-yellow-300", borda: "border-yellow-300 dark:border-yellow-700", nome: "Amarelo" },
  lima: { bg: "bg-lime-100 dark:bg-lime-900", texto: "text-lime-700 dark:text-lime-300", borda: "border-lime-300 dark:border-lime-700", nome: "Lima" },
  verde: { bg: "bg-green-100 dark:bg-green-900", texto: "text-green-700 dark:text-green-300", borda: "border-green-300 dark:border-green-700", nome: "Verde" },
  esmeralda: { bg: "bg-emerald-100 dark:bg-emerald-900", texto: "text-emerald-700 dark:text-emerald-300", borda: "border-emerald-300 dark:border-emerald-700", nome: "Esmeralda" },
  teal: { bg: "bg-teal-100 dark:bg-teal-900", texto: "text-teal-700 dark:text-teal-300", borda: "border-teal-300 dark:border-teal-700", nome: "Teal" },
  ciano: { bg: "bg-cyan-100 dark:bg-cyan-900", texto: "text-cyan-700 dark:text-cyan-300", borda: "border-cyan-300 dark:border-cyan-700", nome: "Ciano" },
  azul: { bg: "bg-blue-100 dark:bg-blue-900", texto: "text-blue-700 dark:text-blue-300", borda: "border-blue-300 dark:border-blue-700", nome: "Azul" },
  indigo: { bg: "bg-indigo-100 dark:bg-indigo-900", texto: "text-indigo-700 dark:text-indigo-300", borda: "border-indigo-300 dark:border-indigo-700", nome: "Índigo" },
  violeta: { bg: "bg-violet-100 dark:bg-violet-900", texto: "text-violet-700 dark:text-violet-300", borda: "border-violet-300 dark:border-violet-700", nome: "Violeta" },
  roxo: { bg: "bg-purple-100 dark:bg-purple-900", texto: "text-purple-700 dark:text-purple-300", borda: "border-purple-300 dark:border-purple-700", nome: "Roxo" },
  fucsia: { bg: "bg-fuchsia-100 dark:bg-fuchsia-900", texto: "text-fuchsia-700 dark:text-fuchsia-300", borda: "border-fuchsia-300 dark:border-fuchsia-700", nome: "Fúcsia" },
  rosa: { bg: "bg-pink-100 dark:bg-pink-900", texto: "text-pink-700 dark:text-pink-300", borda: "border-pink-300 dark:border-pink-700", nome: "Rosa" },
  cinza: { bg: "bg-stone-200 dark:bg-stone-800", texto: "text-stone-700 dark:text-stone-300", borda: "border-stone-400 dark:border-stone-600", nome: "Cinza" },
};

export const CORES_PASTA_LISTA = Object.keys(CORES_PASTA) as CorPasta[];

export function ehCorPastaValida(valor: string): valor is CorPasta {
  return (CORES_PASTA_LISTA as string[]).includes(valor);
}

export const COR_PASTA_PADRAO: CorPasta = "cinza";
