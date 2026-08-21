import { notFound } from "next/navigation";
import { carregarPostDetalhado } from "@/lib/marketing/repositorio";
import { EditarPostClient } from "./editar-post-client";

export default async function EditarPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;

  const post = await carregarPostDetalhado(postId);
  if (!post) notFound();

  return <EditarPostClient post={post} />;
}
