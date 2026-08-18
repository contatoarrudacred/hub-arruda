import { listarMatrizes, listarPautasPorStatus, listarPropriedades } from "@/lib/marketing/repositorio";
import { PautasClient } from "./pautas-client";

export default async function PautasPage() {
  const propriedades = await listarPropriedades();

  // listarPautasPorStatus devolve PautaCarregada, que só carrega matrizConteudoId (pautas não têm
  // propriedade_id direto no banco) — sem propriedadeId em cada pauta não dá pra filtrar por
  // propriedade no cliente. Busca as matrizes de cada propriedade em paralelo (mesmo padrão de N
  // queries pequenas já usado pelas telas de Checklist/Matrizes, Task 8/9 — número de propriedades é
  // pequeno, config de setup) só pra montar um mapa matrizId -> propriedade e anexar
  // propriedadeId/propriedadeNome em cada pauta abaixo, permitindo filtro 100% client-side (sem
  // round-trip ao servidor a cada troca de filtro). Chama listarPautasPorStatus() sem filtros —
  // busca tudo de uma vez, filtro fica por conta do cliente.
  const [pautas, matrizesPorPropriedade] = await Promise.all([
    listarPautasPorStatus(),
    Promise.all(propriedades.map((p) => listarMatrizes(p.id))),
  ]);

  const propriedadePorMatriz = new Map<string, { id: string; nome: string }>();
  propriedades.forEach((propriedade, indice) => {
    for (const matriz of matrizesPorPropriedade[indice]) {
      propriedadePorMatriz.set(matriz.id, { id: propriedade.id, nome: propriedade.nome });
    }
  });

  const pautasComPropriedade = pautas.map((pauta) => {
    const propriedade = propriedadePorMatriz.get(pauta.matrizConteudoId);
    return {
      ...pauta,
      propriedadeId: propriedade?.id ?? null,
      propriedadeNome: propriedade?.nome ?? "(propriedade desconhecida)",
    };
  });

  return (
    <PautasClient
      pautasIniciais={pautasComPropriedade}
      propriedades={propriedades.map((p) => ({ id: p.id, nome: p.nome }))}
    />
  );
}
