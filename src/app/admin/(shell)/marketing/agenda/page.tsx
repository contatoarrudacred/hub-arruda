import { listarPostsAgenda, listarPostsPendentesAgendamento, listarPropriedades } from "@/lib/marketing/repositorio";
import { AgendaClient } from "./agenda-client";

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ propriedadeId?: string }>;
}) {
  const { propriedadeId } = await searchParams;

  // Mesmo padrão de filtro server-side por propriedade que a antiga tela "Posts Publicados" já
  // usava (posts têm propriedade_id na própria linha, diferente de pautas).
  const [propriedades, posts, pendentes] = await Promise.all([
    listarPropriedades(),
    listarPostsAgenda(propriedadeId || undefined),
    listarPostsPendentesAgendamento(propriedadeId || undefined),
  ]);

  return (
    <AgendaClient
      posts={posts}
      pendentes={pendentes}
      propriedades={propriedades.map((p) => ({ id: p.id, nome: p.nome, horariosPublicacao: p.horariosPublicacao ?? undefined }))}
      propriedadeIdSelecionada={propriedadeId ?? ""}
    />
  );
}
