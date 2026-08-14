"use client";

import "@xyflow/react/dist/style.css";
import { modoNavegacao } from "@/lib/motor-fluxo/db";
import type { AgendaAdmin, EtapaAdmin } from "@/lib/motor-fluxo/repositorio-admin";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useMemo, useState } from "react";
import { salvarEtapaAction } from "../actions";
import { EditorEtapaModal } from "./editor-etapa-modal";
import { NoEtapa } from "./no-etapa";
import { NoStub } from "./no-stub";

const NODE_TYPES = { etapa: NoEtapa, stub: NoStub };

// Cores por opção — só aplicadas quando uma etapa tem mais de uma saída, pra deixar visualmente
// óbvio que os caminhos se separam ali (etapas de saída única continuam com seta neutra).
const PALETA_ARESTAS = ["#3b82f6", "#f97316", "#10b981", "#a855f7", "#ec4899", "#eab308"];

// Cores dos marcadores sintéticos (início/fim/perda/referência externa) — mesma paleta de
// "gravidade" usada na borda das caixinhas reais (ver no-etapa.tsx), mais verde pro início e
// índigo pra referência a outro fluxo.
const COR_INICIO = "#22c55e";
const COR_HANDOFF = "#64748b";
const COR_PAUSA = "#f59e0b";
const COR_PERDIDA = "#ef4444";
const COR_EXTERNO = "#6366f1";

function posicaoPadrao(indice: number) {
  const colunas = 4;
  const col = indice % colunas;
  const linha = Math.floor(indice / colunas);
  return { x: col * 320, y: linha * 220 };
}

/** Todo código que uma etapa referencia por navegação normal (não inclui as opções que marcam perda — essas não têm próxima etapa). */
function codigosReferenciados(etapa: EtapaAdmin): { alvo: string; rotulo?: string }[] {
  const c = etapa.conteudo;
  const refs: { alvo: string; rotulo?: string }[] = [];

  if (c.proximo_codigo) refs.push({ alvo: c.proximo_codigo });

  for (const o of c.opcoes ?? []) {
    if (o.proximo_codigo) refs.push({ alvo: o.proximo_codigo, rotulo: o.valor });
  }

  if (c.proximo_condicional) {
    refs.push({ alvo: c.proximo_condicional.se_sim, rotulo: "contém" });
    refs.push({ alvo: c.proximo_condicional.se_nao, rotulo: "não contém" });
  }

  if (c.proximo_por_dado) {
    refs.push({
      alvo: c.proximo_por_dado.entao,
      rotulo: `${c.proximo_por_dado.campo}=${c.proximo_por_dado.se_igual}`,
    });
    refs.push({ alvo: c.proximo_por_dado.senao, rotulo: "senão" });
  }

  return refs;
}

function EditorFluxoInterno({
  fluxoId,
  etapasIniciais,
  agendas,
  todosOsCodigos,
}: {
  fluxoId: string;
  etapasIniciais: EtapaAdmin[];
  agendas: AgendaAdmin[];
  todosOsCodigos: string[];
}) {
  const [etapas, setEtapas] = useState(etapasIniciais);
  const [modalAberto, setModalAberto] = useState<"nova" | EtapaAdmin | null>(null);
  const [busca, setBusca] = useState("");

  // Inclui os códigos das etapas deste fluxo mesmo que `todosOsCodigos` ainda não tenha sido
  // revalidado (ex.: logo depois de criar uma etapa nova, antes do reload do servidor).
  const codigosDisponiveis = useMemo(
    () => Array.from(new Set([...todosOsCodigos, ...etapas.map((e) => e.conteudo.codigo)])),
    [todosOsCodigos, etapas],
  );
  const codigoParaId = useMemo(
    () => Object.fromEntries(etapas.map((e) => [e.conteudo.codigo, e.id])),
    [etapas],
  );
  const posicaoDoId = useMemo(() => {
    const mapa: Record<string, { x: number; y: number }> = {};
    etapas.forEach((etapa, indice) => {
      mapa[etapa.id] = etapa.conteudo.posicao_canvas ?? posicaoPadrao(indice);
    });
    return mapa;
  }, [etapas]);

  const buscaNormalizada = busca.trim().toLowerCase();
  const idsFiltrados = useMemo(() => {
    if (!buscaNormalizada) return null;
    const filtradas = etapas.filter((e) => {
      const primeira = e.conteudo.mensagens[0];
      const textoPrimeira = primeira?.tipo === "texto" ? primeira.texto : "";
      return (
        e.conteudo.codigo.toLowerCase().includes(buscaNormalizada) ||
        textoPrimeira.toLowerCase().includes(buscaNormalizada)
      );
    });
    return new Set(filtradas.map((e) => e.id));
  }, [etapas, buscaNormalizada]);

  const nodesReais: Node[] = etapas.map((etapa) => ({
    id: etapa.id,
    type: "etapa",
    position: posicaoDoId[etapa.id],
    data: { etapa, onClick: () => setModalAberto(etapa) },
    style: !idsFiltrados || idsFiltrados.has(etapa.id) ? undefined : { opacity: 0.15 },
  }));

  // --- Marcadores sintéticos (início / fim / perdida / referência externa) ------------------
  const nodesStub: Node[] = [];
  const edgesStub: Edge[] = [];
  const contadorPorFonte: Record<string, number> = {};

  function proximaPosicaoStub(sourceId: string) {
    const i = contadorPorFonte[sourceId] ?? 0;
    contadorPorFonte[sourceId] = i + 1;
    const base = posicaoDoId[sourceId] ?? { x: 0, y: 0 };
    return { x: base.x + i * 190, y: base.y + 170 };
  }

  function adicionarStubSaida(sourceId: string, rotulo: string, cor: string) {
    const id = `stub-${sourceId}-${nodesStub.length}`;
    nodesStub.push({
      id,
      type: "stub",
      position: proximaPosicaoStub(sourceId),
      data: { rotulo, cor },
      draggable: false,
      selectable: false,
    });
    edgesStub.push({
      id: `edge-${id}`,
      source: sourceId,
      target: id,
      style: { stroke: cor, strokeWidth: 1.5, strokeDasharray: "4 3" },
    });
  }

  const referenciadosInternamente = new Set<string>();

  for (const etapa of etapas) {
    const refs = codigosReferenciados(etapa);

    // agrupa por alvo — quando várias opções levam pro mesmo lugar (ex.: 6 produtos → handoff
    // humano), isso vira UMA seta só, não 6 sobrepostas e invisíveis.
    const porAlvo = new Map<string, string[]>();
    for (const ref of refs) {
      const lista = porAlvo.get(ref.alvo) ?? [];
      if (ref.rotulo) lista.push(ref.rotulo);
      porAlvo.set(ref.alvo, lista);
    }

    for (const [alvo, rotulos] of porAlvo) {
      if (codigoParaId[alvo]) {
        referenciadosInternamente.add(codigoParaId[alvo]);
      } else {
        // referência a uma etapa que não está neste canvas — provavelmente outro fluxo.
        const rotulo = rotulos.length > 0 ? `↗ ${rotulos.join(", ")} → ${alvo}` : `↗ ${alvo}`;
        adicionarStubSaida(etapa.id, rotulo, COR_EXTERNO);
      }
    }

    for (const opcao of etapa.conteudo.opcoes ?? []) {
      if (opcao.encerra_com_perda) {
        const rotulo = opcao.motivo_perda ? `⛔ Perdida: ${opcao.motivo_perda}` : "⛔ Perdida";
        adicionarStubSaida(etapa.id, rotulo, COR_PERDIDA);
      }
    }

    if (modoNavegacao(etapa.conteudo) === "terminal") {
      const sobSupervisor = etapa.conteudo.encerramento?.sob_supervisor ?? false;
      adicionarStubSaida(
        etapa.id,
        sobSupervisor ? "🧑‍💼 Atendimento humano" : "⏸ Aguardando retomada",
        sobSupervisor ? COR_HANDOFF : COR_PAUSA,
      );
    }
  }

  // Início — etapas deste fluxo que ninguém aqui dentro aponta pra elas.
  for (const etapa of etapas) {
    if (referenciadosInternamente.has(etapa.id)) continue;
    const posEntrada = posicaoDoId[etapa.id];
    const idInicio = `stub-inicio-${etapa.id}`;
    nodesStub.push({
      id: idInicio,
      type: "stub",
      position: { x: posEntrada.x, y: posEntrada.y - 110 },
      data: { rotulo: "▶ Início", cor: COR_INICIO },
      draggable: false,
      selectable: false,
    });
    edgesStub.push({
      id: `edge-${idInicio}`,
      source: idInicio,
      target: etapa.id,
      style: { stroke: COR_INICIO, strokeWidth: 1.5, strokeDasharray: "4 3" },
    });
  }

  // --- Arestas reais (dentro deste canvas), mescladas por alvo -------------------------------
  const edgesReais: Edge[] = etapas.flatMap((etapa) => {
    const refs = codigosReferenciados(etapa).filter((ref) => codigoParaId[ref.alvo]);
    const porAlvo = new Map<string, string[]>();
    for (const ref of refs) {
      const lista = porAlvo.get(ref.alvo) ?? [];
      if (ref.rotulo) lista.push(ref.rotulo);
      porAlvo.set(ref.alvo, lista);
    }
    const entradas = Array.from(porAlvo.entries());
    return entradas.map(([alvo, rotulos], i) => {
      const cor = entradas.length > 1 ? PALETA_ARESTAS[i % PALETA_ARESTAS.length] : undefined;
      const label = rotulos.length > 3 ? `${rotulos.length} opções` : rotulos.join(" / ") || undefined;
      return {
        id: `${etapa.id}-${alvo}`,
        source: etapa.id,
        target: codigoParaId[alvo],
        label,
        style: cor ? { stroke: cor, strokeWidth: 2 } : undefined,
        labelStyle: cor ? { fill: cor, fontWeight: 600 } : undefined,
      };
    });
  });

  const nodes = [...nodesReais, ...nodesStub];
  const edges = [...edgesReais, ...edgesStub];

  async function salvarPosicao(id: string, posicao: { x: number; y: number }) {
    const etapa = etapas.find((e) => e.id === id);
    if (!etapa) return;
    const conteudo = { ...etapa.conteudo, posicao_canvas: posicao };
    setEtapas((atual) => atual.map((e) => (e.id === id ? { ...e, conteudo } : e)));
    await salvarEtapaAction({
      id: etapa.id,
      fluxoId: etapa.fluxoId,
      ordem: etapa.ordem,
      campoSalvo: etapa.campoSalvo,
      agendaFollowupId: etapa.agendaFollowupId,
      conteudo,
    });
  }

  function aoSalvarEtapa(etapaSalva: EtapaAdmin) {
    setEtapas((atual) => {
      const existe = atual.some((e) => e.id === etapaSalva.id);
      return existe
        ? atual.map((e) => (e.id === etapaSalva.id ? etapaSalva : e))
        : [...atual, etapaSalva];
    });
    setModalAberto(null);
  }

  function aoExcluirEtapa(id: string) {
    setEtapas((atual) => atual.filter((e) => e.id !== id));
    setModalAberto(null);
  }

  const ultimaEtapa = etapas[etapas.length - 1];

  return (
    <div className="relative h-screen w-full bg-zinc-100 dark:bg-zinc-950">
      <div className="absolute left-4 top-4 z-10 flex gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por código ou texto..."
          className="w-64 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm shadow dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          onClick={() => setModalAberto("nova")}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow dark:bg-zinc-50 dark:text-zinc-900"
        >
          + Nova etapa
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeDragStop={(_, node) => salvarPosicao(node.id, node.position)}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>

      {modalAberto && (
        <EditorEtapaModal
          etapaExistente={modalAberto === "nova" ? null : modalAberto}
          fluxoId={fluxoId}
          agendas={agendas}
          codigosDisponiveis={codigosDisponiveis}
          codigoSugerido={
            modalAberto === "nova" ? `nova_etapa_${etapas.length + 1}` : modalAberto.conteudo.codigo
          }
          subetapaSugerida={ultimaEtapa?.conteudo.kanban_subetapa}
          ordem={etapas.length + 1}
          onFechar={() => setModalAberto(null)}
          onSalvo={aoSalvarEtapa}
          onExcluido={aoExcluirEtapa}
        />
      )}
    </div>
  );
}

export function EditorFluxo(props: {
  fluxoId: string;
  etapasIniciais: EtapaAdmin[];
  agendas: AgendaAdmin[];
  todosOsCodigos: string[];
}) {
  return (
    <ReactFlowProvider>
      <EditorFluxoInterno {...props} />
    </ReactFlowProvider>
  );
}
