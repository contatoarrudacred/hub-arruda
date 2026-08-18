"use server";

import { revalidatePath } from "next/cache";
import { salvarPersona } from "@/lib/marketing/repositorio";
import type { NivelConhecimento, PersonaFormulario } from "@/lib/marketing/tipos";

const ROTA = "/admin/configuracoes/marketing/personas";

const NIVEIS_VALIDOS: NivelConhecimento[] = ["iniciante", "intermediario", "avancado"];

export type EntradaSalvarPersona = {
  matrizId: string;
  persona: PersonaFormulario;
};

export type ResultadoSalvarPersona = { sucesso: true; persona: PersonaFormulario } | { sucesso: false; erro: string };

export async function salvarPersonaAction(entrada: EntradaSalvarPersona): Promise<ResultadoSalvarPersona> {
  if (!entrada.matrizId) return { sucesso: false, erro: "Selecione uma matriz." };

  const nome = entrada.persona.nome.trim();
  if (!nome) return { sucesso: false, erro: "Nome da persona é obrigatório." };

  if (!NIVEIS_VALIDOS.includes(entrada.persona.nivelConhecimento)) {
    return { sucesso: false, erro: "Nível de conhecimento inválido." };
  }

  const persona: PersonaFormulario = {
    nome,
    perfilDemografico: entrada.persona.perfilDemografico.trim(),
    tomDeVoz: entrada.persona.tomDeVoz.trim(),
    nivelConhecimento: entrada.persona.nivelConhecimento,
    doresNecessidades: entrada.persona.doresNecessidades.trim(),
    objecoesTipicas: entrada.persona.objecoesTipicas.map((item) => item.trim()).filter(Boolean),
    vocabularioPreferido: entrada.persona.vocabularioPreferido.map((item) => item.trim()).filter(Boolean),
    vocabularioEvitar: entrada.persona.vocabularioEvitar.map((item) => item.trim()).filter(Boolean),
  };

  await salvarPersona(entrada.matrizId, persona);

  revalidatePath(ROTA);
  return { sucesso: true, persona };
}
