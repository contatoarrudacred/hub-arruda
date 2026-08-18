"use client";

import { useRouter } from "next/navigation";
import { Ajuda } from "@/components/marketing/ajuda";
import type { PostAdmin } from "@/lib/marketing/tipos";

type Propriedade = { id: string; nome: string };

const SCORE_QA_MINIMO = 80;

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotuloCampo = "flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400";

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function BadgeScoreQa({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
  }
  const aprovado = score >= SCORE_QA_MINIMO;
  const classe = aprovado
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
    : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${classe}`}>{score}/100</span>;
}

/**
 * Tela só de consulta (view-only) — sem actions.ts. O filtro por propriedade não é client-side
 * (diferente da Fila de Pautas, Task 10): a troca do select navega pra uma nova URL com
 * ?propriedadeId=..., e page.tsx (Server Component) refaz o fetch já filtrado no banco via
 * listarPostsPublicados(propriedadeId) — ver comentário em page.tsx.
 */
export function PostsClient({
  posts,
  propriedades,
  propriedadeIdSelecionada,
}: {
  posts: PostAdmin[];
  propriedades: Propriedade[];
  propriedadeIdSelecionada: string;
}) {
  const router = useRouter();

  function aoTrocarPropriedade(propriedadeId: string) {
    router.push(propriedadeId ? `/admin/marketing/posts?propriedadeId=${propriedadeId}` : "/admin/marketing/posts");
  }

  return (
    <div className="max-w-6xl space-y-3 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Posts Publicados</h1>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className={rotuloCampo}>Propriedade</label>
          <select
            className={`${campo} max-w-xs`}
            value={propriedadeIdSelecionada}
            onChange={(e) => aoTrocarPropriedade(e.target.value)}
          >
            <option value="">Todas</option>
            {propriedades.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>

        <span className="inline-flex items-center gap-1">
          <span className={rotuloCampo}>Score de QA</span>
          <Ajuda texto={`Nota do Revisor de 0 a 100 — mínimo ${SCORE_QA_MINIMO}/100 pra aprovar e publicar (mesmo threshold usado no pipeline automático).`} />
        </span>
      </div>

      {posts.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum post publicado encontrado com esse filtro.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2.5">Título</th>
                <th className="px-4 py-2.5">Score QA</th>
                <th className="px-4 py-2.5">Publicado em</th>
                <th className="px-4 py-2.5">Tentativas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {posts.map((post) => (
                <tr key={post.id} className="align-top text-zinc-800 dark:text-zinc-100">
                  <td className="px-4 py-2.5">
                    {post.url ? (
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {post.titulo}
                      </a>
                    ) : (
                      <p className="font-medium">{post.titulo}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <BadgeScoreQa score={post.scoreQa} />
                  </td>
                  <td className="px-4 py-2.5">{formatarData(post.publicadoEm)}</td>
                  <td className="px-4 py-2.5">{post.tentativas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
