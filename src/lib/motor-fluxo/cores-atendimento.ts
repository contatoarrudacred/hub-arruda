// Sistema de cores por controlador da conversa (Fase 1 do Bloco B) — ver
// docs/superpowers/specs/2026-08-16-bloco-b-tela-atendimento-design.md seção 1.
// Paleta fechada de 7 cores escolhíveis pelo atendente; verde/roxo são reservados
// (não atribuída / Malala) e nunca aparecem em CORES_BADGE.

export type CorBadge = "vermelho" | "laranja" | "marrom" | "rosa" | "ciano" | "azul" | "cinza";

export type Tom = { bg: string; texto: string; nome: string };

export const CORES_BADGE: Record<CorBadge, Tom> = {
  vermelho: { bg: "bg-red-100 dark:bg-red-900", texto: "text-red-700 dark:text-red-300", nome: "Vermelho" },
  laranja: { bg: "bg-orange-100 dark:bg-orange-900", texto: "text-orange-700 dark:text-orange-300", nome: "Laranja" },
  marrom: { bg: "bg-[#F5E3D3] dark:bg-[#3d2b17]", texto: "text-[#78350F] dark:text-[#d8b48a]", nome: "Marrom" },
  rosa: { bg: "bg-pink-100 dark:bg-pink-900", texto: "text-pink-700 dark:text-pink-300", nome: "Rosa" },
  ciano: { bg: "bg-cyan-100 dark:bg-cyan-900", texto: "text-cyan-700 dark:text-cyan-300", nome: "Ciano" },
  azul: { bg: "bg-blue-100 dark:bg-blue-900", texto: "text-blue-700 dark:text-blue-300", nome: "Azul" },
  cinza: { bg: "bg-stone-200 dark:bg-stone-800", texto: "text-stone-700 dark:text-stone-300", nome: "Cinza" },
};

export const CORES_BADGE_LISTA = Object.keys(CORES_BADGE) as CorBadge[];

/** Reservada — conversa escalada pra humano, ainda sem atendente específico. Verde estilo WhatsApp Web (pedido explícito de Luiz, 16/08/2026). */
export const COR_NAO_ATRIBUIDA: Tom = {
  bg: "bg-[#D9FDD3] dark:bg-[#0f2e21]",
  texto: "text-[#128C7E] dark:text-[#6ee7b7]",
  nome: "Não atribuída",
};

/** Reservada — Malala (motor automatizado) no controle. Era verde antes desta mudança. */
export const COR_MALALA: Tom = {
  bg: "bg-violet-100 dark:bg-violet-900",
  texto: "text-violet-700 dark:text-violet-300",
  nome: "Malala",
};

export function ehCorBadgeValida(valor: string): valor is CorBadge {
  return (CORES_BADGE_LISTA as string[]).includes(valor);
}

/** Decide qual tom usar — mesmo par para o badge da lista e o fundo do painel de conversa. */
export function corControlador(params: { sobSupervisor: boolean; atendenteCor: CorBadge | null }): Tom {
  if (!params.sobSupervisor) return COR_MALALA;
  if (params.atendenteCor) return CORES_BADGE[params.atendenteCor];
  return COR_NAO_ATRIBUIDA;
}
