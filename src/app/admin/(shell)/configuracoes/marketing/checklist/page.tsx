import { listarChecklistPorPropriedade, listarPropriedades } from "@/lib/marketing/repositorio";
import { ChecklistClient } from "./checklist-client";

export default async function ChecklistPage() {
  const propriedades = await listarPropriedades();

  // listarChecklistPorPropriedade exige propriedadeId (Task 3) — não existe "listar todos" no
  // repositório. Como esta tela precisa mostrar os itens de todas as propriedades (com filtro por
  // propriedade no cliente), busca os itens de cada propriedade em paralelo e junta tudo aqui. Mesmo
  // padrão da tela de Matrizes (Task 8): número de propriedades é pequeno (config de setup, não tela
  // de alto tráfego), então N queries paralelas é aceitável.
  const itensPorPropriedade = await Promise.all(propriedades.map((p) => listarChecklistPorPropriedade(p.id)));
  const itens = itensPorPropriedade.flat();

  return <ChecklistClient itensIniciais={itens} propriedades={propriedades.map((p) => ({ id: p.id, nome: p.nome }))} />;
}
