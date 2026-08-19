import { carregarPersonaFormulario, listarMatrizes, listarPropriedades } from "@/lib/marketing/repositorio";
import type { PersonaFormulario } from "@/lib/marketing/tipos";
import { PersonasClient } from "./personas-client";

export type MatrizParaPersona = { id: string; nome: string; propriedadeNome: string };

export default async function PersonasPage() {
  const propriedades = await listarPropriedades();

  // Mesma limitação de listarMatrizes que a tela de Matrizes (Task 8): não existe "listar todas",
  // então busca por propriedade em paralelo e junta. Número pequeno de propriedades/matrizes —
  // tela de setup, não caminho quente.
  const matrizesPorPropriedade = await Promise.all(propriedades.map((p) => listarMatrizes(p.id)));
  const nomePropriedadePorId = new Map(propriedades.map((p) => [p.id, p.nome]));

  const matrizes: MatrizParaPersona[] = matrizesPorPropriedade
    .flat()
    .map((m) => ({ id: m.id, nome: m.nome, propriedadeNome: nomePropriedadePorId.get(m.propriedadeId) ?? "" }));

  // Carrega a persona de cada matriz de antemão (em vez de buscar sob demanda ao trocar a seleção
  // no cliente) — evita precisar de uma server action só de leitura pra alternar seleção; volume é
  // pequeno (uma tela de configuração, não uma lista operacional).
  const personasCarregadas = await Promise.all(matrizes.map((m) => carregarPersonaFormulario(m.id)));
  const personasPorMatrizId: Record<string, PersonaFormulario | null> = {};
  matrizes.forEach((m, i) => {
    personasPorMatrizId[m.id] = personasCarregadas[i];
  });

  return <PersonasClient matrizes={matrizes} personasPorMatrizId={personasPorMatrizId} />;
}
