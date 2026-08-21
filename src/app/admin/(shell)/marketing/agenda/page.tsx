import { listarPostsPublicados, listarPropriedades } from "@/lib/marketing/repositorio";
import { PostsClient } from "./posts-client";

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ propriedadeId?: string }>;
}) {
  const { propriedadeId } = await searchParams;

  // Ao contrário de listarPautasPorStatus (Task 10, filtro client-side porque pautas não têm
  // propriedade_id direto), listarPostsPublicados aceita propriedadeId como parâmetro e filtra
  // direto no banco (posts têm propriedade_id na própria linha) — o filtro por propriedade desta
  // tela é feito no servidor via searchParams em vez de carregar tudo e filtrar no cliente.
  const [propriedades, posts] = await Promise.all([
    listarPropriedades(),
    listarPostsPublicados(propriedadeId || undefined),
  ]);

  return (
    <PostsClient
      posts={posts}
      propriedades={propriedades.map((p) => ({ id: p.id, nome: p.nome }))}
      propriedadeIdSelecionada={propriedadeId ?? ""}
    />
  );
}
