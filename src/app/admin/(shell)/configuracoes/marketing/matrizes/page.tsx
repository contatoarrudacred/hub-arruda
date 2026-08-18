import { listarMatrizes, listarPropriedades } from "@/lib/marketing/repositorio";
import { MatrizesClient } from "./matrizes-client";

export default async function MatrizesPage() {
  const propriedades = await listarPropriedades();

  // listarMatrizes exige propriedadeId (Task 3) — não existe "listar todas" no repositório. Como
  // esta tela precisa mostrar as matrizes de todas as propriedades (com filtro por propriedade no
  // cliente), busca uma matriz por propriedade em paralelo e junta tudo aqui. Número de propriedades
  // é pequeno (config de setup, não tela de alto tráfego), então N queries paralelas é aceitável.
  const matrizesPorPropriedade = await Promise.all(propriedades.map((p) => listarMatrizes(p.id)));
  const matrizes = matrizesPorPropriedade.flat();

  return <MatrizesClient matrizesIniciais={matrizes} propriedades={propriedades.map((p) => ({ id: p.id, nome: p.nome }))} />;
}
