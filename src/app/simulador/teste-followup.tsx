"use client";

import { useCallback, useEffect, useState } from "react";
import type { DadosConversa } from "@/lib/motor-fluxo/tipos";
import { carregarPreviewFollowup, type ItemPreviewFollowup } from "./actions-followup";

// Quadrinho de PREVIEW da régua de follow-up (16/08/2026) — o simulador não persiste nada (ver
// actions.ts), então isso não testa o cron/disparo de verdade, só mostra como cada mensagem da
// régua fica. Sem cronômetro: não existe timestamp real de "aguardando desde" pra contar, já que
// nenhuma conversa é gravada. Testar a régua/cron de verdade é feito na Tela de Atendimento com
// dado real, não aqui.

const UNIDADE_SINGULAR: Record<string, string> = { minutos: "minuto", horas: "hora", dias: "dia" };
const UNIDADE_PLURAL: Record<string, string> = { minutos: "minutos", horas: "horas", dias: "dias" };

function rotuloIntervalo(valor: number, unidade: string): string {
  const rotulo = valor === 1 ? UNIDADE_SINGULAR[unidade] : UNIDADE_PLURAL[unidade];
  return `${valor} ${rotulo}`;
}

export function TesteFollowup({
  etapaAtualCodigo,
  dados,
  turno,
  desabilitado,
  onMostrarWhatsapp,
  onMostrarEmail,
  onFimDaCadencia,
}: {
  etapaAtualCodigo: string | null;
  dados: DadosConversa;
  /** muda a cada turno real da conversa — sinaliza pro quadrinho recarregar o preview */
  turno: number;
  desabilitado: boolean;
  onMostrarWhatsapp: (texto: string) => void;
  onMostrarEmail: (descricao: string) => void;
  onFimDaCadencia: () => void;
}) {
  const [itens, setItens] = useState<ItemPreviewFollowup[] | null>(null);
  const [indice, setIndice] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!etapaAtualCodigo) {
      setItens(null);
      return;
    }
    setCarregando(true);
    try {
      const resultado = await carregarPreviewFollowup(etapaAtualCodigo, dados);
      setItens(resultado);
      setIndice(0);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar o preview do follow-up.");
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapaAtualCodigo, turno]);

  useEffect(() => {
    Promise.resolve().then(() => recarregar());
  }, [recarregar]);

  function mostrarProximo() {
    if (!itens || indice >= itens.length) return;
    const item = itens[indice];
    if (item.canal === "whatsapp") onMostrarWhatsapp(item.conteudo);
    else onMostrarEmail(item.conteudo);
    if (item.encerraAtendimento || item.ultimoDaAgenda) onFimDaCadencia();
    setIndice((i) => i + 1);
  }

  if (!etapaAtualCodigo) return null;

  return (
    <div className="mx-4 mb-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900/50">
      <p className="mb-1.5 font-medium text-zinc-600 dark:text-zinc-400">🧪 Preview da régua de follow-up</p>

      {carregando && <p className="text-zinc-400">Carregando...</p>}

      {!carregando && itens === null && (
        <p className="text-zinc-400">Esta etapa não aguarda resposta — sem régua de follow-up aqui.</p>
      )}

      {!carregando && itens !== null && indice >= itens.length && (
        <p className="text-emerald-700 dark:text-emerald-400">
          ✅ Régua inteira já mostrada (todos os {itens.length} itens).
        </p>
      )}

      {!carregando && itens !== null && indice < itens.length && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-500 dark:text-zinc-400">
            Item {indice + 1} de {itens.length} · {itens[indice].canal === "whatsapp" ? "WhatsApp" : "E-mail"}
          </span>
          <button
            onClick={mostrarProximo}
            disabled={desabilitado}
            className="shrink-0 rounded-full bg-zinc-800 px-3 py-1 text-white disabled:opacity-40 dark:bg-zinc-200 dark:text-zinc-900"
          >
            Ver &quot;{rotuloIntervalo(itens[indice].intervaloValor, itens[indice].intervaloUnidade)}&quot;
          </button>
        </div>
      )}

      {erro && <p className="mt-1.5 text-red-600 dark:text-red-400">⚠️ {erro}</p>}
    </div>
  );
}
