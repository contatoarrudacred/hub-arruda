"use server";

import { revalidatePath } from "next/cache";
import {
  assumirConversa,
  atribuirParaAtendente,
  atribuirParaMalala,
  atualizarCorBadge,
  carregarConversaDetalhe,
  contarNaoLidas,
  listarConversasAtendimento,
  listarUsuariosSistema,
  obterUsuarioSistemaAtual,
  registrarMensagemHumana,
  type ContagemNaoLidas,
  type ConversaDetalhe,
  type ConversaResumo,
  type FiltroConversas,
  type UsuarioSistema,
} from "@/lib/motor-fluxo/repositorio-atendimento";
import { ehCorBadgeValida } from "@/lib/motor-fluxo/cores-atendimento";
import { enviarMensagemTexto } from "@/lib/whatsapp/zapster";

export async function listarConversasAction(filtro: FiltroConversas, busca: string): Promise<ConversaResumo[]> {
  return listarConversasAtendimento(filtro, busca);
}

export async function carregarConversaAction(conversaId: string): Promise<ConversaDetalhe> {
  return carregarConversaDetalhe(conversaId);
}

export async function contarNaoLidasAction(usuarioId: string): Promise<ContagemNaoLidas> {
  return contarNaoLidas(usuarioId);
}

export async function contextoAtendimentoAction(): Promise<{ usuarioAtual: UsuarioSistema; atendentes: UsuarioSistema[] }> {
  const [usuarioAtual, atendentes] = await Promise.all([obterUsuarioSistemaAtual(), listarUsuariosSistema()]);
  return { usuarioAtual, atendentes };
}

export async function assumirConversaAction(conversaId: string): Promise<void> {
  const usuario = await obterUsuarioSistemaAtual();
  await assumirConversa(conversaId, usuario.id);
  revalidatePath("/admin/atendimento");
}

export async function atribuirParaMalalaAction(conversaId: string): Promise<void> {
  await atribuirParaMalala(conversaId);
  revalidatePath("/admin/atendimento");
}

export async function atribuirParaAtendenteAction(conversaId: string, atendenteId: string): Promise<void> {
  await atribuirParaAtendente(conversaId, atendenteId);
  revalidatePath("/admin/atendimento");
}

export type ResultadoAtualizarCor = { sucesso: true } | { sucesso: false; erro: string };

/** Só troca a cor do próprio usuário logado — nunca aceita usuarioId do cliente, pra ninguém trocar a cor de outro atendente. */
export async function atualizarMinhaCorAction(cor: string): Promise<ResultadoAtualizarCor> {
  if (!ehCorBadgeValida(cor)) return { sucesso: false, erro: "Cor inválida." };
  const usuario = await obterUsuarioSistemaAtual();
  await atualizarCorBadge(usuario.id, cor);
  revalidatePath("/admin/atendimento");
  return { sucesso: true };
}

export type ResultadoEnviarMensagem = { sucesso: true } | { sucesso: false; erro: string };

/** Envia de verdade via WhatsApp (Zapster) e registra na conversa. Só deve ser chamado quando o atendimento está com um humano (composer desabilitado com a Malala no controle, ver Tela de Atendimento seção 5). */
export async function enviarMensagemAction(
  conversaId: string,
  telefone: string,
  texto: string,
): Promise<ResultadoEnviarMensagem> {
  if (!texto.trim()) return { sucesso: false, erro: "Mensagem vazia." };
  try {
    await enviarMensagemTexto(telefone, texto);
    await registrarMensagemHumana(conversaId, texto);
    revalidatePath("/admin/atendimento");
    return { sucesso: true };
  } catch (e) {
    return { sucesso: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
