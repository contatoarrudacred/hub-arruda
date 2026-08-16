import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

// Auto-layout hierárquico — substitui o grid ingênuo. O dagre organiza o grafo em camadas na
// direção do fluxo (topo → baixo), minimizando cruzamento de linhas, o que fica essencial quando
// o fluxo cresce bastante (pedido do Luiz, 14/08/2026: "separar em blocos, mínimo de linhas se
// cruzando"). Nós sintéticos (início/fim/perda/externo) entram no mesmo layout — dagre não sabe a
// diferença, só vê o grafo.

const LARGURA_NO = 256;
const ALTURA_NO = 120;
const LARGURA_STUB = 170;
const ALTURA_STUB = 40;

export function layoutComDagre(
  nodes: Node[],
  edges: Edge[],
): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 90 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    const isStub = node.type === "stub";
    g.setNode(node.id, {
      width: isStub ? LARGURA_STUB : LARGURA_NO,
      height: isStub ? ALTURA_STUB : ALTURA_NO,
    });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const posicoes: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    const posicao = g.node(node.id);
    const isStub = node.type === "stub";
    const largura = isStub ? LARGURA_STUB : LARGURA_NO;
    const altura = isStub ? ALTURA_STUB : ALTURA_NO;
    // dagre retorna o CENTRO do nó; React Flow espera o canto superior esquerdo.
    posicoes[node.id] = { x: posicao.x - largura / 2, y: posicao.y - altura / 2 };
  }

  return posicoes;
}
