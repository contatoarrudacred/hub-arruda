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
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import { SimuladorChat } from "@/app/simulador/simulador-chat";
import { EditorEtapaModal } from "./editor-etapa-modal";
import { layoutComDagre } from "./layout-dagre";
import { NoEtapa } from "./no-etapa";
import { NoStub } from "./no-stub";

const NODE_TYPES = { etapa: NoEtapa, stub: NoStub };
// Dourado da identidade visual do Hub Arruda (mesma cor do sidebar.tsx) — usado aqui só no botão
// Preview, pra destacá-lo dos outros botões neutros da barra (pedido de Luiz, 15/08/2026).
const DOURADO = "#c8a55d";
// Arestas retas com cantos de 90° (não curvas) — pedido do Luiz (14/08/2026) pra facilitar
// enxergar as conexões quando o fluxo cresce e o zoom precisa diminuir bastante.
const OPCOES_ARESTA_PADRAO = { type: "step" as const };

// Cores por opção — só aplicadas quando uma etapa tem mais de uma saída, pra deixar visualmente
// óbvio que os caminhos se separam ali (etapas de saída única continuam com seta neutra).
const PALETA_ARESTAS = ["#3b82f6", "#f97316", "#10b981", "#a855f7", "#ec4899", "#eab308"];

// Cores dos marcadores sintéticos (início/fim/perda/referência externa).
const COR_INICIO = "#22c55e";
const COR_HANDOFF = "#64748b";
const COR_PAUSA = "#f59e0b";
const COR_PERDIDA = "#ef4444";
const COR_EXTERNO = "#6366f1";

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

/** Monta a estrutura do grafo (nós + arestas, reais e sintéticos) sem posição — quem posiciona é o dagre, sempre. */
function construirGrafo(
  etapas: EtapaAdmin[],
  onClickEtapa: (etapa: EtapaAdmin) => void,
  idsFiltrados: Set<string> | null,
): { nodes: Node[]; edges: Edge[] } {
  const codigoParaId = Object.fromEntries(etapas.map((e) => [e.conteudo.codigo, e.id]));

  const nodesReais: Node[] = etapas.map((etapa) => ({
    id: etapa.id,
    type: "etapa",
    position: { x: 0, y: 0 },
    data: { etapa, onClick: () => onClickEtapa(etapa) },
    style: !idsFiltrados || idsFiltrados.has(etapa.id) ? undefined : { opacity: 0.15 },
  }));

  const nodesStub: Node[] = [];
  const edgesStub: Edge[] = [];
  let contadorStub = 0;

  function adicionarStub(sourceId: string, rotulo: string, cor: string, direcaoEntrada = false) {
    const id = `stub-${contadorStub++}-${sourceId}`;
    nodesStub.push({
      id,
      type: "stub",
      position: { x: 0, y: 0 },
      data: { rotulo, cor },
      draggable: false,
      selectable: false,
    });
    edgesStub.push({
      id: `edge-${id}`,
      source: direcaoEntrada ? id : sourceId,
      target: direcaoEntrada ? sourceId : id,
      style: { stroke: cor, strokeWidth: 1.5, strokeDasharray: "4 3" },
    });
  }

  const referenciadosInternamente = new Set<string>();
  const edgesReais: Edge[] = [];

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

    const entradas = Array.from(porAlvo.entries());
    entradas.forEach(([alvo, rotulos], i) => {
      if (codigoParaId[alvo]) {
        referenciadosInternamente.add(codigoParaId[alvo]);
        const cor = entradas.length > 1 ? PALETA_ARESTAS[i % PALETA_ARESTAS.length] : undefined;
        const label =
          rotulos.length > 3 ? `${rotulos.length} opções` : rotulos.join(" / ") || undefined;
        edgesReais.push({
          id: `${etapa.id}-${alvo}`,
          source: etapa.id,
          target: codigoParaId[alvo],
          label,
          style: cor ? { stroke: cor, strokeWidth: 2 } : undefined,
          labelStyle: cor ? { fill: cor, fontWeight: 600 } : undefined,
        });
      } else {
        // referência a uma etapa que não está neste canvas — provavelmente outro fluxo.
        const rotulo = rotulos.length > 0 ? `↗ ${rotulos.join(", ")} → ${alvo}` : `↗ ${alvo}`;
        adicionarStub(etapa.id, rotulo, COR_EXTERNO);
      }
    });

    for (const opcao of etapa.conteudo.opcoes ?? []) {
      if (opcao.encerra_com_perda) {
        const rotulo = opcao.motivo_perda ? `⛔ Perdida: ${opcao.motivo_perda}` : "⛔ Perdida";
        adicionarStub(etapa.id, rotulo, COR_PERDIDA);
      }
    }

    if (modoNavegacao(etapa.conteudo) === "terminal") {
      const sobSupervisor = etapa.conteudo.encerramento?.sob_supervisor ?? false;
      adicionarStub(
        etapa.id,
        sobSupervisor ? "🧑‍💼 Atendimento humano" : "⏸ Aguardando retomada",
        sobSupervisor ? COR_HANDOFF : COR_PAUSA,
      );
    }
  }

  // Início — etapas deste fluxo que ninguém aqui dentro aponta pra elas.
  for (const etapa of etapas) {
    if (!referenciadosInternamente.has(etapa.id)) {
      adicionarStub(etapa.id, "▶ Início", COR_INICIO, true);
    }
  }

  return { nodes: [...nodesReais, ...nodesStub], edges: [...edgesReais, ...edgesStub] };
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
  const [simuladorAberto, setSimuladorAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow();

  const codigosDisponiveis = useMemo(
    () => Array.from(new Set([...todosOsCodigos, ...etapas.map((e) => e.conteudo.codigo)])),
    [todosOsCodigos, etapas],
  );

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

  function reorganizar() {
    const grafo = construirGrafo(etapas, setModalAberto, idsFiltrados);
    const posicoes = layoutComDagre(grafo.nodes, grafo.edges);
    setNodes(grafo.nodes.map((n) => ({ ...n, position: posicoes[n.id] ?? { x: 0, y: 0 } })));
    setEdges(grafo.edges);
  }

  // Recalcula o layout sempre que a lista de etapas ou o filtro de busca mudam — o admin pode
  // arrastar nós à vontade durante a sessão (React Flow cuida disso via onNodesChange), mas nunca
  // fica "preso" numa bagunça: qualquer edição ou o botão "Reorganizar" volta pro layout limpo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reorganizar, [etapas, idsFiltrados]);

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
    // Dourado clarinho (light) / dourado bem escurecido (dark) em vez do cinza padrão — pedido de
    // Luiz (15/08/2026), pra gerar contraste com os quadrinhos brancos/escuros e reforçar a
    // identidade navy/dourado também dentro do canvas, não só na sidebar.
    <div className="relative h-full w-full bg-[#F8F1E4] dark:bg-[#1f1912]">
      <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
        <button
          onClick={() => setSimuladorAberto(true)}
          title="Abre o simulador pra testar este fluxo"
          className="rounded-full px-4 py-2 text-sm font-medium text-white shadow hover:brightness-95"
          style={{ backgroundColor: DOURADO }}
        >
          ▶ Preview
        </button>
        <button
          onClick={() => window.location.reload()}
          title="Recarrega a página e busca as etapas de novo"
          className="rounded-full bg-white px-4 py-2 text-sm text-zinc-700 shadow hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-200"
        >
          ↻ Atualizar
        </button>
        <button
          onClick={() => fitView({ padding: 0.2, duration: 300 })}
          title="Ajusta o zoom pra mostrar o fluxo inteiro"
          className="rounded-full bg-white px-4 py-2 text-sm text-zinc-700 shadow hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-200"
        >
          ⛶ Ver tudo
        </button>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por código ou texto..."
          className="w-64 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm shadow dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          onClick={reorganizar}
          title="Reorganiza automaticamente todas as caixinhas"
          className="rounded-full bg-white px-4 py-2 text-sm text-zinc-700 shadow hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-200"
        >
          🔀 Reorganizar
        </button>
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
        onNodesChange={onNodesChange}
        defaultEdgeOptions={OPCOES_ARESTA_PADRAO}
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

      {simuladorAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-black">
            <SimuladorChat aoFechar={() => setSimuladorAberto(false)} />
          </div>
        </div>
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
