"use client";

import { useCallback, useEffect, useState } from "react";
import {
  avancarFollowupTeste,
  obterEstadoFollowupTeste,
  type EstadoFollowupTeste,
} from "./actions-followup";

// Quadrinho de teste do motor de disparo de follow-up (Fase 6) — deixa avançar manualmente pela
// agenda (10min → 45min → 4h → 24h → 3d → 7d → 10d → 30d → 60d → 90d) sem esperar o tempo real
// passar, disparando pelo MESMO caminho que o cron de produção usa (dispararItemFollowup). O
// cronômetro só é visual: mostra o tempo já decorrido desde que a Malala ficou esperando resposta
// (conversas.aguardando_resposta_desde) — só zera quando uma resposta de verdade chega ou uma
// nova pergunta passa a aguardar resposta, nunca quando um follow-up dispara (Luiz, 15/08/2026:
// os intervalos da agenda são contados sempre a partir da mesma origem).

const UNIDADE_SINGULAR: Record<string, string> = { minutos: "minuto", horas: "hora", dias: "dia" };
const UNIDADE_PLURAL: Record<string, string> = { minutos: "minutos", horas: "horas", dias: "dias" };

function rotuloIntervalo(valor: number, unidade: string): string {
  const rotulo = valor === 1 ? UNIDADE_SINGULAR[unidade] : UNIDADE_PLURAL[unidade];
  return `${valor} ${rotulo}`;
}

function formatarDecorrido(ms: number): string {
  const segundosTotais = Math.max(0, Math.floor(ms / 1000));
  const MES = 30 * 86_400;
  const SEMANA = 7 * 86_400;

  const meses = Math.floor(segundosTotais / MES);
  let resto = segundosTotais % MES;
  const semanas = Math.floor(resto / SEMANA);
  resto %= SEMANA;
  const dias = Math.floor(resto / 86_400);
  resto %= 86_400;
  const horas = Math.floor(resto / 3600);
  resto %= 3600;
  const minutos = Math.floor(resto / 60);
  const segundos = resto % 60;

  const dois = (n: number) => String(n).padStart(2, "0");
  const partesGraudas = [
    meses > 0 ? `${meses} ${meses === 1 ? "mês" : "meses"}` : null,
    semanas > 0 ? `${semanas} sem` : null,
    dias > 0 ? `${dias} d` : null,
  ].filter(Boolean);

  return [...partesGraudas, `${dois(horas)}:${dois(minutos)}:${dois(segundos)}`].join(" ");
}

export function TesteFollowup({
  conversaId,
  oportunidadeId,
  turno,
  desabilitado,
  onDisparoWhatsapp,
  onDisparoEmail,
  onEncerrouAtendimento,
}: {
  conversaId: string | null;
  oportunidadeId: string | null;
  /** muda a cada turno real da conversa — sinaliza pro quadrinho recarregar seu estado */
  turno: number;
  desabilitado: boolean;
  onDisparoWhatsapp: (texto: string) => void;
  onDisparoEmail: (descricao: string) => void;
  onEncerrouAtendimento: () => void;
}) {
  const [estado, setEstado] = useState<EstadoFollowupTeste | null>(null);
  const [agora, setAgora] = useState(() => new Date());
  const [avancando, setAvancando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setEstado(conversaId ? await obterEstadoFollowupTeste(conversaId) : null);
  }, [conversaId]);

  useEffect(() => {
    let ativo = true;
    const promessa = conversaId ? obterEstadoFollowupTeste(conversaId) : Promise.resolve(null);
    promessa.then((novoEstado) => {
      if (ativo) setEstado(novoEstado);
    });
    return () => {
      ativo = false;
    };
  }, [conversaId, turno]);

  useEffect(() => {
    if (!estado?.aguardandoDesde) return;
    const id = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(id);
  }, [estado?.aguardandoDesde]);

  async function avancar() {
    if (!conversaId || !oportunidadeId) return;
    setAvancando(true);
    setErro(null);
    try {
      const resultado = await avancarFollowupTeste(conversaId, oportunidadeId);
      if (resultado.disparado && resultado.conteudo) {
        if (resultado.canal === "whatsapp") onDisparoWhatsapp(resultado.conteudo);
        else onDisparoEmail(resultado.conteudo);
      }
      if (resultado.encerrouAtendimento) onEncerrouAtendimento();
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao avançar o follow-up.");
    } finally {
      setAvancando(false);
    }
  }

  if (!conversaId) return null;

  const aguardando = !!estado?.aguardandoDesde;
  const proximoItem = estado?.proximoItem ?? null;
  const decorridoMs = aguardando ? agora.getTime() - new Date(estado!.aguardandoDesde!).getTime() : 0;

  return (
    <div className="mx-4 mb-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900/50">
      <p className="mb-1.5 font-medium text-zinc-600 dark:text-zinc-400">🧪 Teste do follow-up</p>

      {!aguardando && (
        <p className="text-zinc-400">
          {estado?.proximoItem === null && estado.aguardandoDesde === null
            ? "Nada aguardando resposta agora."
            : "Aguardando a Malala perguntar algo..."}
        </p>
      )}

      {aguardando && !proximoItem && (
        <p className="text-emerald-700 dark:text-emerald-400">✅ Régua de follow-up concluída (todos os itens já passaram).</p>
      )}

      {aguardando && proximoItem && (
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-zinc-500 dark:text-zinc-400">{formatarDecorrido(decorridoMs)}</span>
          <button
            onClick={avancar}
            disabled={avancando || desabilitado}
            className="shrink-0 rounded-full bg-zinc-800 px-3 py-1 text-white disabled:opacity-40 dark:bg-zinc-200 dark:text-zinc-900"
          >
            {avancando
              ? "Avançando..."
              : `Avançar ${rotuloIntervalo(proximoItem.intervaloValor, proximoItem.intervaloUnidade)}`}
          </button>
        </div>
      )}

      {erro && <p className="mt-1.5 text-red-600 dark:text-red-400">⚠️ {erro}</p>}
    </div>
  );
}
