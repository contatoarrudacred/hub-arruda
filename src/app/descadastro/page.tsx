import { ConfirmarDescadastro } from "./confirmar-descadastro";

const NAVY = "#141e33";
const DOURADO = "#c8a55d";

export default async function DescadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p: pessoaId } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-black">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div
          className="mb-5 flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium"
          style={{ backgroundColor: DOURADO, color: NAVY }}
        >
          H
        </div>
        <h1 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Descadastro de e-mails
        </h1>
        {pessoaId ? (
          <ConfirmarDescadastro pessoaId={pessoaId} />
        ) : (
          <p className="text-sm text-zinc-500">Link inválido — falta identificar quem está pedindo o descadastro.</p>
        )}
      </div>
    </div>
  );
}
