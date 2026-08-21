"use server";

// Agenda de Posts — "Novo Post Manual" (21/08/2026, pedido do Luiz): cria uma pauta à mão, com
// TODOS os ingredientes que o Estrategista normalmente decide sozinho controlados pelo usuário —
// incluindo um tema totalmente livre (ex.: "limpeza de nome no Natal") e, opcionalmente, um
// horário exato de publicação. Entra como "pendente" e segue o pipeline normal (Escritor → Revisor
// → Publicar/Agendar), puxada pelo cron do jeito de sempre.

import { revalidatePath } from "next/cache";
import { criarPautaManual, listarMatrizes, listarPersonasAtivasComAngulosDisponiveis } from "@/lib/marketing/repositorio";
import type { DadosPautaManual, MatrizAdmin, PersonaAtiva } from "@/lib/marketing/tipos";

const ROTA = "/admin/marketing/agenda";

export async function listarMatrizesAtivasAction(propriedadeId: string): Promise<MatrizAdmin[]> {
  const matrizes = await listarMatrizes(propriedadeId);
  return matrizes.filter((m) => m.ativo);
}

export async function listarPersonasParaPautaManualAction(propriedadeId: string): Promise<PersonaAtiva[]> {
  return listarPersonasAtivasComAngulosDisponiveis(propriedadeId);
}

export type ResultadoCriarPautaManual = { sucesso: true; pautaId: string } | { sucesso: false; erro: string };

export async function criarPautaManualAction(dados: DadosPautaManual): Promise<ResultadoCriarPautaManual> {
  if (!dados.matrizConteudoId) return { sucesso: false, erro: "Selecione uma matriz de conteúdo." };
  if (!dados.angulo.trim()) return { sucesso: false, erro: "Descreva o tema/ângulo do post." };
  if (!dados.palavraChavePrincipal.trim()) return { sucesso: false, erro: "Informe a palavra-chave principal." };
  if (dados.agendamentoForcado) {
    const data = new Date(dados.agendamentoForcado);
    if (Number.isNaN(data.getTime()) || data <= new Date()) {
      return { sucesso: false, erro: "O horário de publicação precisa ser no futuro." };
    }
  }

  try {
    const pauta = await criarPautaManual(dados);
    revalidatePath(ROTA);
    return { sucesso: true, pautaId: pauta.id };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha ao criar a pauta.";
    return { sucesso: false, erro: mensagem };
  }
}
