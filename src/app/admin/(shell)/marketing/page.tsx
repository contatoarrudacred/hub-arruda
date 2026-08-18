import { carregarResumoVisaoGeral } from "@/lib/marketing/repositorio";
import { VisaoGeral } from "./visao-geral";

/**
 * Índice do módulo Marketing ("Visão Geral" na sidebar) — dashboard só de leitura, sem
 * actions.ts. carregarResumoVisaoGeral (Task 3) já faz toda a agregação (contagens de pautas por
 * propriedade, posts publicados nos últimos 7 dias, taxa de aprovação do Revisor e soma bruta de
 * tokens); esta tela só formata o resultado em cards. Sem estado de cliente (sem filtro, sem
 * interação) — por isso a renderização fica num Server Component (visao-geral.tsx) em vez de um
 * "-client.tsx" como as outras telas do módulo.
 */
export default async function MarketingPage() {
  const resumo = await carregarResumoVisaoGeral();
  return <VisaoGeral resumo={resumo} />;
}
