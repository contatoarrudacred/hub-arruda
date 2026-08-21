"use server";

import { revalidatePath } from "next/cache";
import { salvarCredencialCanal, salvarPropriedade } from "@/lib/marketing/repositorio";
import type { JanelaPublicacao, PropriedadeAdmin } from "@/lib/marketing/tipos";

const ROTA = "/admin/configuracoes/marketing/propriedades";

export type EntradaSalvarPropriedade = {
  id: string | null;
  nome: string;
  urlBase: string;
  tipoCms: "wordpress";
  maxTentativas: number;
  postsPorDia: number | null;
  janelaPublicacao: JanelaPublicacao | null;
  /** Fase 4e (20/08/2026) — `null`/vazio = publica na hora, sem agendar (ver agendador.ts). */
  horariosPublicacao: string[] | null;
  /** Só é lido/exigido na criação (id === null) — uma vez criada, o dono não muda por esta tela. */
  unidadeNegocioId: string | null;
  ativo: boolean;
};

export type ResultadoSalvarPropriedade = { sucesso: true; propriedade: PropriedadeAdmin } | { sucesso: false; erro: string };

export async function salvarPropriedadeAction(entrada: EntradaSalvarPropriedade): Promise<ResultadoSalvarPropriedade> {
  const nome = entrada.nome.trim();
  const urlBase = entrada.urlBase.trim();
  const criando = entrada.id === null;

  if (!nome) return { sucesso: false, erro: "Nome é obrigatório." };
  if (!urlBase) return { sucesso: false, erro: "URL base é obrigatória." };
  try {
    new URL(urlBase);
  } catch {
    return { sucesso: false, erro: "URL base inválida — inclua o protocolo (ex.: https://exemplo.com)." };
  }

  // Constraint chk_propriedade_tem_dono do banco: propriedades_digitais exige pessoa_id OU
  // unidade_negocio_id preenchido. Esta tela só oferece o segundo (decisão YAGNI da Task 7) e só
  // na criação — depois de criada, o dono não é editável por aqui.
  if (criando && !entrada.unidadeNegocioId) {
    return { sucesso: false, erro: "Unidade de Negócio é obrigatória ao criar uma propriedade." };
  }

  if (!Number.isInteger(entrada.maxTentativas) || entrada.maxTentativas <= 0) {
    return { sucesso: false, erro: "Máximo de tentativas deve ser um número inteiro positivo." };
  }

  if (entrada.postsPorDia !== null && (!Number.isInteger(entrada.postsPorDia) || entrada.postsPorDia <= 0)) {
    return { sucesso: false, erro: "Posts por dia deve ser um número inteiro positivo (ou vazio para sem limite)." };
  }

  if (entrada.janelaPublicacao) {
    const { inicio, fim } = entrada.janelaPublicacao;
    if (!inicio || !fim) return { sucesso: false, erro: "Informe início e fim da janela de publicação, ou deixe os dois em branco." };
    if (inicio >= fim) return { sucesso: false, erro: "O início da janela de publicação deve ser antes do fim." };
  }

  // Fase 4e (20/08/2026) — HH:MM 24h, mesmo formato do `type="time"` da janela de publicação
  // acima. Ordenado antes de salvar: decidirProximoHorario (agendador.ts) espera a lista já em
  // ordem crescente.
  let horariosPublicacaoOrdenados: string[] | null = null;
  if (entrada.horariosPublicacao?.length) {
    const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
    const invalido = entrada.horariosPublicacao.find((h) => !REGEX_HORA.test(h));
    if (invalido) return { sucesso: false, erro: `Horário de publicação inválido: "${invalido}" (use o formato HH:MM, ex.: 09:00).` };
    horariosPublicacaoOrdenados = [...entrada.horariosPublicacao].sort();
  }

  const propriedade = await salvarPropriedade({
    ...(entrada.id ? { id: entrada.id } : {}),
    nome,
    urlBase,
    tipoCms: entrada.tipoCms,
    maxTentativas: entrada.maxTentativas,
    postsPorDia: entrada.postsPorDia,
    janelaPublicacao: entrada.janelaPublicacao,
    horariosPublicacao: horariosPublicacaoOrdenados,
    ativo: entrada.ativo,
    // unidadeNegocioId só é repassado na criação — em atualização, omiti-lo (undefined) faz
    // salvarPropriedade não tocar na coluna unidade_negocio_id (ver comentário lá), preservando
    // o dono original mesmo que esta tela nem envie o campo.
    ...(criando ? { unidadeNegocioId: entrada.unidadeNegocioId } : {}),
  });

  revalidatePath(ROTA);
  return { sucesso: true, propriedade };
}

export type ResultadoSalvarCredencial = { sucesso: true } | { sucesso: false; erro: string };

/**
 * Sempre chama salvarCredencialCanal (mesmo com senha vazia) — a própria função do repositório já
 * trata "vazio" como "não mexer" tanto pra usuario quanto pra senha (ver repositorio.ts), então
 * pular a chamada quando só a senha está vazia deixaria uma troca de usuário (sem trocar senha)
 * sem ser salva. Só recusa quando os dois campos vêm vazios (nada pra fazer).
 */
export async function salvarCredencialAction(propriedadeId: string, canal: string, usuario: string, senha: string): Promise<ResultadoSalvarCredencial> {
  const usuarioTratado = usuario.trim();
  const senhaTratada = senha.trim();

  if (!usuarioTratado && !senhaTratada) {
    return { sucesso: false, erro: "Informe usuário e/ou senha para salvar a credencial." };
  }

  await salvarCredencialCanal(propriedadeId, canal, usuarioTratado, senhaTratada);
  revalidatePath(ROTA);
  return { sucesso: true };
}
