import Link from "next/link";
import { listarFluxos } from "@/lib/motor-fluxo/repositorio-admin";

export default async function FluxosPage() {
  const fluxos = await listarFluxos();

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Fluxos de atendimento
      </h1>
      <ul className="mt-4 space-y-2">
        {fluxos.map((f) => (
          <li key={f.id}>
            <Link
              href={`/admin/fluxos/${f.id}`}
              className="block rounded-xl bg-white p-4 shadow hover:shadow-md dark:bg-zinc-900"
            >
              <span className="font-medium text-zinc-900 dark:text-zinc-50">{f.nome}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
