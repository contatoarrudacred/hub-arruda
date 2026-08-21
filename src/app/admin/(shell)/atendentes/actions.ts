"use server";

import { revalidatePath } from "next/cache";
import { ehCorBadgeValida } from "@/lib/motor-fluxo/cores-atendimento";
import {
  atualizarCorBadge,
  definirConsultor,
  listarDisponibilidadeConsultor,
  salvarDisponibilidadeConsultor,
  type LinhaDisponibilidade,
} from "@/lib/motor-fluxo/repositorio-atendimento";

// Cor de badge por atendente — decisão de Luiz (16/08/2026): o próprio atendente NÃO escolhe a
// cor dele na Tela de Atendimento; é o admin do sistema que define aqui, em Configurações
// (`/admin/atendentes`). Nível único ADMIN/MASTER hoje, então qualquer admin logado pode mudar a
// cor de qualquer atendente — diferente da antiga atualizarMinhaCorAction (removida), que só
// deixava trocar a própria.

export type ResultadoAtualizarCorAtendente = { sucesso: true } | { sucesso: false; erro: string };

export async function atualizarCorAtendenteAction(
  usuarioId: string,
  cor: string,
): Promise<ResultadoAtualizarCorAtendente> {
  if (!ehCorBadgeValida(cor)) return { sucesso: false, erro: "Cor inválida." };
  await atualizarCorBadge(usuarioId, cor);
  revalidatePath("/admin/atendentes");
  revalidatePath("/admin/atendimento");
  return { sucesso: true };
}

// --- Agendamento com consultor (spec 2026-08-20-agendamento-consultor-alto-valor.md) -----------

export type ResultadoAcaoConsultor = { sucesso: true } | { sucesso: false; erro: string };

export async function definirConsultorAction(usuarioId: string, ehConsultor: boolean): Promise<ResultadoAcaoConsultor> {
  try {
    await definirConsultor(usuarioId, ehConsultor);
    revalidatePath("/admin/atendentes");
    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, erro: erro instanceof Error ? erro.message : "Falha ao atualizar consultor." };
  }
}

export async function listarDisponibilidadeAction(usuarioId: string): Promise<LinhaDisponibilidade[]> {
  return listarDisponibilidadeConsultor(usuarioId);
}

export async function salvarDisponibilidadeAction(usuarioId: string, linhas: LinhaDisponibilidade[]): Promise<ResultadoAcaoConsultor> {
  try {
    await salvarDisponibilidadeConsultor(usuarioId, linhas);
    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, erro: erro instanceof Error ? erro.message : "Falha ao salvar disponibilidade." };
  }
}
