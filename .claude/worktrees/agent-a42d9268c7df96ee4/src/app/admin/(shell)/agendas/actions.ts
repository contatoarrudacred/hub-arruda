"use server";

import { revalidatePath } from "next/cache";
import {
  excluirAgenda as excluirAgendaRepo,
  excluirAgendaItem as excluirAgendaItemRepo,
  salvarAgenda as salvarAgendaRepo,
  salvarAgendaItem as salvarAgendaItemRepo,
  type EntradaSalvarAgendaItem,
} from "@/lib/motor-fluxo/repositorio-admin";

export type ResultadoSalvar = { sucesso: true; id: string } | { sucesso: false; erro: string };

export async function salvarAgendaAction(id: string | null, nome: string): Promise<ResultadoSalvar> {
  if (!nome.trim()) {
    return { sucesso: false, erro: "O nome da agenda é obrigatório." };
  }
  const resultado = await salvarAgendaRepo(id, nome.trim());
  revalidatePath("/admin/agendas");
  return { sucesso: true, id: resultado.id };
}

export type ResultadoExcluir = { sucesso: true } | { sucesso: false; erro: string };

export async function excluirAgendaAction(id: string): Promise<ResultadoExcluir> {
  await excluirAgendaRepo(id);
  revalidatePath("/admin/agendas");
  return { sucesso: true };
}

export async function salvarAgendaItemAction(entrada: EntradaSalvarAgendaItem): Promise<ResultadoSalvar> {
  if (!entrada.conteudo.trim()) {
    return { sucesso: false, erro: "O conteúdo da mensagem de retomada é obrigatório." };
  }
  if (entrada.intervaloValor <= 0) {
    return { sucesso: false, erro: "O intervalo precisa ser maior que zero." };
  }
  const resultado = await salvarAgendaItemRepo(entrada);
  revalidatePath("/admin/agendas");
  return { sucesso: true, id: resultado.id };
}

export async function excluirAgendaItemAction(id: string): Promise<ResultadoExcluir> {
  await excluirAgendaItemRepo(id);
  revalidatePath("/admin/agendas");
  return { sucesso: true };
}
