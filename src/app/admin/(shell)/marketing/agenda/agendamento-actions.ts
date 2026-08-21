"use server";

import { revalidatePath } from "next/cache";
import { agendarPostManualmente } from "@/lib/marketing/publicar-manual";

const ROTA = "/admin/marketing/agenda";

export type ResultadoAgendarPost = { sucesso: true; url: string } | { sucesso: false; erro: string };

export async function agendarPostAction(postId: string, agendadoParaIso: string): Promise<ResultadoAgendarPost> {
  const agendadoPara = new Date(agendadoParaIso);
  if (Number.isNaN(agendadoPara.getTime())) {
    return { sucesso: false, erro: "Horário inválido." };
  }
  if (agendadoPara <= new Date()) {
    return { sucesso: false, erro: "O horário escolhido precisa ser no futuro." };
  }

  try {
    const { url } = await agendarPostManualmente(postId, agendadoPara);
    revalidatePath(ROTA);
    return { sucesso: true, url };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha ao agendar o post.";
    return { sucesso: false, erro: mensagem };
  }
}
