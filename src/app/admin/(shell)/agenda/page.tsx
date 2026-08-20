import { listarAgendamentosConsultor, obterUsuarioSistemaAtual } from "@/lib/motor-fluxo/repositorio-atendimento";
import { AgendaClient } from "./agenda-client";

export default async function AgendaPage() {
  const usuario = await obterUsuarioSistemaAtual();
  const agendamentos = await listarAgendamentosConsultor(usuario.id);
  return <AgendaClient agendamentosIniciais={agendamentos} ehConsultor={usuario.ehConsultor} />;
}
