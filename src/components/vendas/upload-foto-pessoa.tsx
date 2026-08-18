"use client";

import { useEffect, useState } from "react";
import { buscarFotoMaisRecenteAction, enviarFotoPessoaAction } from "./upload-pessoa-actions";

export function UploadFotoPessoa({ pessoaId }: { pessoaId: string }) {
  const [urlFoto, setUrlFoto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    buscarFotoMaisRecenteAction(pessoaId).then(setUrlFoto);
  }, [pessoaId]);

  async function enviar(arquivo: File) {
    setErro(null);
    const formData = new FormData();
    formData.append("pessoaId", pessoaId);
    formData.append("arquivo", arquivo);
    const resultado = await enviarFotoPessoaAction(formData);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    setUrlFoto(resultado.url);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">🖼️ Foto (opcional)</p>
      <div className="flex items-center gap-3">
        {urlFoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urlFoto} alt="Foto da pessoa" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-200 text-xs text-zinc-500 dark:bg-zinc-700">
            sem foto
          </div>
        )}
        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])} />
      </div>
      {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}
