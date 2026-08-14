"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { referenciasDeConteudo } from "@/lib/motor-fluxo/db";
import {
  carregarResumoDeTodasEtapas,
  excluirEtapa as excluirEtapaRepo,
  salvarEtapa as salvarEtapaRepo,
  type EntradaSalvarEtapa,
} from "@/lib/motor-fluxo/repositorio-admin";
import type { ConteudoEtapa } from "@/lib/motor-fluxo/tipos";

export type ResultadoSalvar = { sucesso: true; id: string } | { sucesso: false; erro: string };

export async function salvarEtapaAction(entrada: EntradaSalvarEtapa): Promise<ResultadoSalvar> {
  const todasEtapas = await carregarResumoDeTodasEtapas();

  const colisao = todasEtapas.find(
    (e) => e.codigo === entrada.conteudo.codigo && e.id !== entrada.id,
  );
  if (colisao) {
    return {
      sucesso: false,
      erro: `Já existe outra etapa com o código "${entrada.conteudo.codigo}" — o código precisa ser único.`,
    };
  }

  const referencias = referenciasDeConteudo(entrada.conteudo);
  if (referencias.length > 0) {
    const codigosExistentes = new Set(todasEtapas.map((e) => e.codigo));
    // o próprio código desta etapa conta como válido mesmo que ainda não tenha sido salvo
    codigosExistentes.add(entrada.conteudo.codigo);
    const faltando = referencias.filter((codigo) => !codigosExistentes.has(codigo));
    if (faltando.length > 0) {
      return {
        sucesso: false,
        erro: `Esta etapa aponta para etapa(s) que não existem: ${faltando.join(", ")}. Crie-as antes ou corrija o código.`,
      };
    }
  }

  const resultado = await salvarEtapaRepo(entrada);
  revalidatePath(`/admin/fluxos/${entrada.fluxoId}`);
  return { sucesso: true, id: resultado.id };
}

export type ResultadoExcluir = { sucesso: true } | { sucesso: false; erro: string };

export async function excluirEtapaAction(id: string, fluxoId: string): Promise<ResultadoExcluir> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("etapas_fluxo").select("id, conteudo");
  if (error) {
    return { sucesso: false, erro: `Falha ao validar exclusão: ${error.message}` };
  }

  const etapaAlvo = (data ?? []).find((linha) => linha.id === id);
  if (!etapaAlvo) {
    return { sucesso: false, erro: "Etapa não encontrada." };
  }
  const codigoAlvo = (etapaAlvo.conteudo as ConteudoEtapa).codigo;

  const outrasReferenciando = (data ?? [])
    .filter((linha) => linha.id !== id)
    .map((linha) => linha.conteudo as ConteudoEtapa)
    .filter((conteudo) => referenciasDeConteudo(conteudo).includes(codigoAlvo))
    .map((conteudo) => conteudo.codigo);

  if (outrasReferenciando.length > 0) {
    return {
      sucesso: false,
      erro: `Não dá pra excluir — as etapas ${outrasReferenciando.join(", ")} apontam pra esta. Ajuste-as primeiro.`,
    };
  }

  await excluirEtapaRepo(id);
  revalidatePath(`/admin/fluxos/${fluxoId}`);
  return { sucesso: true };
}
