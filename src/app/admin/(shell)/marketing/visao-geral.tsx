import Link from "next/link";
import { Ajuda } from "@/components/marketing/ajuda";
import type { ResumoVisaoGeral } from "@/lib/marketing/tipos";

const cartao =
  "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900";
const rotuloCartao = "flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const valorCartao = "mt-1.5 text-2xl font-semibold text-zinc-900 dark:text-zinc-50";

function formatarNumero(n: number): string {
  return n.toLocaleString("pt-BR");
}

function formatarPercentual(taxa: number): string {
  return `${Math.round(taxa * 100)}%`;
}

/**
 * Cards de topo (métricas agregadas do módulo inteiro, não por propriedade). taxaAprovacaoRevisor
 * pode ser null (nenhuma revisão registrada ainda em pautas_execucao_log) — tratado explicitamente
 * abaixo em vez de deixar renderizar "null%". tokensEntradaTotal/tokensSaidaTotal são acumulados
 * DESDE SEMPRE (não filtrado por período — decisão da Task 3, documentada lá: a tabela
 * pautas_execucao_log de onde isso vem ainda não está em produção, então isto lê como 0 até a
 * migration da Task 1 ser aplicada por Luiz — esperado, não é bug desta tela).
 */
function CardsResumo({ resumo }: { resumo: ResumoVisaoGeral }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className={cartao}>
        <span className={rotuloCartao}>
          Publicados na semana
          <Ajuda texto="Posts com status 'publicado' e publicado_em nos últimos 7 dias, somando todas as propriedades." />
        </span>
        <p className={valorCartao}>{formatarNumero(resumo.publicadosNaSemana)}</p>
      </div>

      <div className={cartao}>
        <span className={rotuloCartao}>
          Taxa de aprovação do Revisor
          <Ajuda texto="Aprovados / total de execuções concluídas da etapa 'revisar' no histórico do pipeline (pautas_execucao_log). Não distingue reprovação por score baixo de erro técnico na etapa." />
        </span>
        {resumo.taxaAprovacaoRevisor === null ? (
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">Sem histórico ainda.</p>
        ) : (
          <p className={valorCartao}>{formatarPercentual(resumo.taxaAprovacaoRevisor)}</p>
        )}
      </div>

      <div className={cartao}>
        <span className={rotuloCartao}>
          Custo acumulado
          <Ajuda texto="Soma bruta de tokens de entrada e saída registrados em todo o histórico do pipeline (não filtrado por período). O valor em R$ depende do preço vigente da API Anthropic — não calculado aqui de propósito, pra não ficar desatualizado se o preço mudar." />
        </span>
        <p className={valorCartao}>{formatarNumero(resumo.tokensEntradaTotal + resumo.tokensSaidaTotal)} tokens</p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {formatarNumero(resumo.tokensEntradaTotal)} entrada + {formatarNumero(resumo.tokensSaidaTotal)} saída
        </p>
      </div>
    </div>
  );
}

/** Um card por propriedade digital ativa, com a contagem de pautas em cada status "em aberto"
 * (pendente/em_producao/bloqueada — publicado e rejeitado não entram aqui, ver carregarResumoVisaoGeral).
 * Card com bloqueadas > 0 ganha um link direto pra Fila de Pautas, já que é lá que o admin reabre
 * a pauta manualmente. */
function CardPropriedade({ propriedadeNome, pendentes, emProducao, bloqueadas }: ResumoVisaoGeral["porPropriedade"][number]) {
  return (
    <div className={cartao}>
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{propriedadeNome}</p>
      <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-semibold text-zinc-700 dark:text-zinc-200">{pendentes}</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Pendentes</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-blue-700 dark:text-blue-300">{emProducao}</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Em produção</p>
        </div>
        <div>
          <p className={`text-lg font-semibold ${bloqueadas > 0 ? "text-red-700 dark:text-red-300" : "text-zinc-700 dark:text-zinc-200"}`}>
            {bloqueadas}
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Bloqueadas</p>
        </div>
      </div>
      {bloqueadas > 0 && (
        <Link
          href="/admin/marketing/pautas"
          className="mt-2.5 block text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Ver na Fila de Pautas →
        </Link>
      )}
    </div>
  );
}

export function VisaoGeral({ resumo }: { resumo: ResumoVisaoGeral }) {
  return (
    <div className="max-w-6xl space-y-6 p-8">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Visão Geral</h1>

      <CardsResumo resumo={resumo} />

      <div className="space-y-2">
        <span className="flex items-center gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Pautas por propriedade
          <Ajuda texto="Contagem de pautas nos status 'em aberto' (pendente, em produção, bloqueada) de cada propriedade digital ativa. Pautas publicadas ou rejeitadas não entram nesta contagem." />
        </span>
        {resumo.porPropriedade.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma propriedade digital ativa cadastrada.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {resumo.porPropriedade.map((propriedade) => (
              <CardPropriedade key={propriedade.propriedadeId} {...propriedade} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
