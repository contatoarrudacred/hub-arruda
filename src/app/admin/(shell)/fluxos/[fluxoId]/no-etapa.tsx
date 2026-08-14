"use client";

import { modoNavegacao, type ModoNavegacao } from "@/lib/motor-fluxo/db";
import { corDaSubetapa, rotuloDaSubetapa } from "@/lib/motor-fluxo/kanban";
import type { EtapaAdmin } from "@/lib/motor-fluxo/repositorio-admin";
import { Handle, Position } from "@xyflow/react";

const ICONE_MODO: Record<ModoNavegacao, string> = {
  linear: "",
  opcoes: "🔀",
  condicional_texto: "🔤",
  condicional_dado: "🧮",
  terminal: "🏁",
};

const TITULO_MODO: Record<ModoNavegacao, string> = {
  linear: "Sempre a mesma próxima etapa",
  opcoes: "Ramifica por opção escolhida",
  condicional_texto: "Ramifica pelo texto da resposta",
  condicional_dado: "Ramifica por um dado já calculado",
  terminal: "Termina o fluxo automatizado aqui",
};

// Cor da borda = tipo da etapa (a tag de baixo já mostra a subetapa do Kanban, então a borda fica
// livre pra comunicar outra coisa: "isto é normal" vs "isto é onde o automatizado para").
const COR_BORDA_NEUTRA = "#d4d4d8"; // zinc-300 — etapa comum, o fluxo continua
const COR_BORDA_HANDOFF = "#64748b"; // slate-500 — termina e alguém da equipe assume
const COR_BORDA_PAUSA = "#f59e0b"; // amber-500 — termina sem handoff (ex.: aguardando retomar)

function corBorda(etapa: EtapaAdmin, modo: ModoNavegacao): string {
  if (modo !== "terminal") return COR_BORDA_NEUTRA;
  return etapa.conteudo.encerramento?.sob_supervisor ? COR_BORDA_HANDOFF : COR_BORDA_PAUSA;
}

const ICONE_ANEXO: Record<"audio" | "video" | "documento", string> = {
  audio: "🎵",
  video: "🎬",
  documento: "📄",
};

/** Prévia do conteúdo no quadrinho — mostra thumb de verdade pra imagem e ícone grande pra outros anexos, não só texto genérico "(mensagem de X)". */
function PreviewConteudo({ etapa }: { etapa: EtapaAdmin }) {
  const primeira = etapa.conteudo.mensagens[0];

  if (!primeira) {
    return <p className="italic text-zinc-400">(sem mensagem — roteador automático)</p>;
  }

  if (primeira.tipo === "texto") {
    return <p className="line-clamp-3 text-zinc-800 dark:text-zinc-100">{primeira.texto.slice(0, 90)}</p>;
  }

  if (primeira.tipo === "imagem") {
    return (
      <div className="space-y-1">
        {primeira.midia_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- thumb de conteúdo arbitrário editado pelo admin
          <img
            src={primeira.midia_url}
            alt={primeira.legenda ?? "Prévia da imagem"}
            className="h-16 w-full rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-16 items-center justify-center rounded-lg bg-zinc-100 text-2xl dark:bg-zinc-800">
            🖼️
          </div>
        )}
        {primeira.legenda && (
          <p className="line-clamp-2 text-zinc-800 dark:text-zinc-100">{primeira.legenda}</p>
        )}
      </div>
    );
  }

  if (primeira.tipo === "audio" || primeira.tipo === "video" || primeira.tipo === "documento") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-3xl leading-none">{ICONE_ANEXO[primeira.tipo]}</span>
        <span className="line-clamp-2 text-zinc-800 dark:text-zinc-100">
          {primeira.legenda || `Mensagem de ${primeira.tipo}`}
        </span>
      </div>
    );
  }

  return <p className="line-clamp-3 text-zinc-800 dark:text-zinc-100">{`(mensagem de ${primeira.tipo})`}</p>;
}

export function NoEtapa({ data }: { data: { etapa: EtapaAdmin; onClick: () => void } }) {
  const { etapa, onClick } = data;
  const c = etapa.conteudo;
  const modo = modoNavegacao(c);
  const temPerda = (c.opcoes ?? []).some((o) => o.encerra_com_perda);

  return (
    <button
      onClick={onClick}
      className="w-64 cursor-pointer rounded-xl border-2 bg-white p-3 text-left text-xs shadow transition hover:shadow-md dark:bg-zinc-900"
      style={{ borderColor: corBorda(etapa, modo) }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="truncate font-mono text-[10px] text-zinc-400">{c.codigo}</span>
        <div className="flex shrink-0 gap-1">
          {temPerda && <span title="Uma das opções pode marcar oportunidade como perdida">⚠️</span>}
          {ICONE_MODO[modo] && <span title={TITULO_MODO[modo]}>{ICONE_MODO[modo]}</span>}
        </div>
      </div>
      <PreviewConteudo etapa={etapa} />
      <div className="mt-2 flex items-center justify-between gap-1">
        {c.mensagens.length > 1 ? (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {c.mensagens.length} mensagens
          </span>
        ) : (
          <span />
        )}
        <span
          className="truncate rounded-full px-2 py-0.5 text-[10px] text-white"
          style={{ backgroundColor: corDaSubetapa(c.kanban_subetapa) }}
        >
          {rotuloDaSubetapa(c.kanban_subetapa)}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </button>
  );
}
