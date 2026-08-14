"use client";

import { Handle, Position } from "@xyflow/react";

// Nó sintético — não representa uma etapa de verdade, só sinaliza visualmente pra onde uma
// ramificação leva quando não há uma caixinha real pra apontar: início do fluxo, saída pra
// atendimento humano, pausa, oportunidade perdida, ou referência a outro fluxo.
export function NoStub({ data }: { data: { rotulo: string; cor: string } }) {
  return (
    <div
      className="rounded-full border-2 border-dashed px-3 py-1.5 text-center text-xs font-medium shadow-sm"
      style={{ borderColor: data.cor, color: data.cor, backgroundColor: `${data.cor}18` }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      {data.rotulo}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}
