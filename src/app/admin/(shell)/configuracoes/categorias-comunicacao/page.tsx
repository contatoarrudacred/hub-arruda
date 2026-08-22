import { listarCategoriasComunicacao } from "@/lib/comunicacao/categorias-repositorio";
import { CategoriasComunicacaoClient } from "./categorias-comunicacao-client";

export default async function CategoriasComunicacaoPage() {
  const categorias = await listarCategoriasComunicacao();
  return <CategoriasComunicacaoClient categoriasIniciais={categorias} />;
}
