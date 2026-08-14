import {
  carregarEtapasDoFluxo,
  carregarResumoDeTodasEtapas,
  listarAgendasFollowup,
} from "@/lib/motor-fluxo/repositorio-admin";
import { EditorFluxo } from "./editor-fluxo";

export default async function EditorFluxoPage({
  params,
}: {
  params: Promise<{ fluxoId: string }>;
}) {
  const { fluxoId } = await params;
  const [etapas, agendas, resumoGlobal] = await Promise.all([
    carregarEtapasDoFluxo(fluxoId),
    listarAgendasFollowup(),
    carregarResumoDeTodasEtapas(),
  ]);

  // As ramificações podem apontar pra etapas de OUTRO fluxo (ex.: triagem → produto), então o
  // seletor de "próxima etapa" precisa conhecer todos os códigos que existem, não só os deste fluxo.
  const todosOsCodigos = resumoGlobal.map((e) => e.codigo);

  return (
    <EditorFluxo
      fluxoId={fluxoId}
      etapasIniciais={etapas}
      agendas={agendas}
      todosOsCodigos={todosOsCodigos}
    />
  );
}
