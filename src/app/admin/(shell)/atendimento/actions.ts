"use server";

import { revalidatePath } from "next/cache";
import {
  alternarFavorita,
  assumirConversa,
  atribuirParaAtendente,
  atribuirParaMalala,
  ativarFollowupManual,
  carregarConversaDetalhe,
  carregarTextoEtapaScript,
  contarNaoLidas,
  contarNotificacoesNaoLidas,
  criarNotaInterna,
  listarConversasAtendimento,
  listarNotificacoes,
  listarUsuariosSistema,
  marcarNotificacaoLida,
  obterUsuarioSistemaAtual,
  registrarMensagemHumana,
  type ContagemNaoLidas,
  type ConversaDetalhe,
  type ConversaResumo,
  type FiltroConversas,
  type Notificacao,
  type UsuarioSistema,
} from "@/lib/motor-fluxo/repositorio-atendimento";
import { listarAgendasFollowup, type AgendaAdmin } from "@/lib/motor-fluxo/repositorio-admin";
import { uploadMidiaAction } from "../fluxos/actions";
import { enviarMensagemMidia, enviarMensagemTexto } from "@/lib/whatsapp/zapster";

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

export type ResultadoCriarNota = { sucesso: true } | { sucesso: false; erro: string };

export async function criarNotaAction(conversaId: string, texto: string): Promise<ResultadoCriarNota> {
  if (!texto.trim()) return { sucesso: false, erro: "Nota vazia." };
  await criarNotaInterna(conversaId, texto.trim());
  revalidatePath("/admin/atendimento");
  return { sucesso: true };
}

export async function listarNotificacoesAction(usuarioId: string): Promise<Notificacao[]> {
  return listarNotificacoes(usuarioId);
}

export async function contarNotificacoesNaoLidasAction(usuarioId: string): Promise<number> {
  return contarNotificacoesNaoLidas(usuarioId);
}

export async function marcarNotificacaoLidaAction(id: string): Promise<void> {
  await marcarNotificacaoLida(id);
  revalidatePath("/admin/atendimento");
}

export async function carregarTextoEtapaScriptAction(etapaId: string): Promise<string | null> {
  return carregarTextoEtapaScript(etapaId);
}

export async function listarAgendasFollowupAction(): Promise<AgendaAdmin[]> {
  return listarAgendasFollowup();
}

export async function ativarFollowupManualAction(conversaId: string, agendaId: string): Promise<void> {
  await ativarFollowupManual(conversaId, agendaId);
  revalidatePath("/admin/atendimento");
}

export async function alternarFavoritaAction(conversaId: string, favorita: boolean): Promise<void> {
  await alternarFavorita(conversaId, favorita);
  revalidatePath("/admin/atendimento");
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
    const { messageId } = await enviarMensagemTexto(telefone, texto);
    await registrarMensagemHumana(conversaId, texto, messageId || null);
    revalidatePath("/admin/atendimento");
    return { sucesso: true };
  } catch (e) {
    return { sucesso: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Envia um anexo (documento/foto/vídeo/áudio) de verdade via WhatsApp — menu "+" do composer
 * (Bloco B2, Fase 5). Reaproveita o mesmo upload pro Supabase Storage já usado no editor de fluxo
 * (`uploadMidiaAction`, bucket `midia-fluxo`) — não existe endpoint de upload próprio da Zapster,
 * a mídia precisa estar numa URL pública antes de ser enviada.
 */
/** Deriva imagem/audio/video/documento a partir do mimetype do arquivo escolhido — mesmo vocabulário de `MensagemEtapa` (tipos.ts), pra a timeline saber como renderizar. */
function midiaTipoDoMimetype(mimetype: string): string {
  if (mimetype.startsWith("image/")) return "imagem";
  if (mimetype.startsWith("audio/")) return "audio";
  if (mimetype.startsWith("video/")) return "video";
  return "documento";
}

export async function enviarMidiaAction(
  conversaId: string,
  telefone: string,
  formData: FormData,
  legenda: string,
): Promise<ResultadoEnviarMensagem> {
  const arquivo = formData.get("arquivo");
  const midiaTipo = arquivo instanceof File ? midiaTipoDoMimetype(arquivo.type) : "documento";
  const upload = await uploadMidiaAction(formData);
  if (!upload.sucesso) return { sucesso: false, erro: upload.erro };
  try {
    const { messageId } = await enviarMensagemMidia(telefone, upload.url, legenda || undefined);
    await registrarMensagemHumana(conversaId, legenda, messageId || null, upload.url, midiaTipo);
    revalidatePath("/admin/atendimento");
    return { sucesso: true };
  } catch (e) {
    return { sucesso: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
