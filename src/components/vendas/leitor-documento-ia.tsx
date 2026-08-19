"use client";

import { useRef, useState } from "react";
import type { DadosExtraidosDocumento } from "@/lib/vendas/leitura-documento-ia";
import { lerDocumentoAction } from "./leitor-documento-ia-actions";

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";

export function LeitorDocumentoIA({
  onDadosExtraidos,
}: {
  // arquivosLidos: os mesmos arquivos que a IA acabou de ler, pra quem chama poder salvá-los junto
  // do cadastro (se a pessoa já for conhecida no momento da leitura) — ver uso em
  // nova-oportunidade-client.tsx.
  onDadosExtraidos: (dados: DadosExtraidosDocumento, arquivosLidos: File[]) => void | Promise<void>;
}) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function adicionarArquivos(novos: FileList | File[]) {
    setArquivos((atual) => [...atual, ...Array.from(novos)]);
  }

  function aoColar(evento: React.ClipboardEvent) {
    const imagens = Array.from(evento.clipboardData.items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((arquivo): arquivo is File => arquivo !== null);
    if (imagens.length > 0) adicionarArquivos(imagens);
  }

  async function ler() {
    if (arquivos.length === 0) return;
    setCarregando(true);
    setErro(null);
    const formData = new FormData();
    arquivos.forEach((arquivo) => formData.append("arquivos", arquivo));

    const resultado = await lerDocumentoAction(formData);
    setCarregando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    const arquivosLidos = arquivos;
    setArquivos([]);
    await onDadosExtraidos(resultado.dados, arquivosLidos);
  }

  return (
    <div
      className="rounded-lg border border-dashed border-zinc-300 p-3 text-sm dark:border-zinc-700"
      onPaste={aoColar}
      tabIndex={0}
      title="Cole (Ctrl+V) uma ou mais imagens do documento aqui, ou escolha os arquivos abaixo"
    >
      <p className="mb-2 font-medium text-zinc-700 dark:text-zinc-300">
        📄 Ler documento com IA <span className="font-normal text-zinc-500">(opcional — só pré-preenche, você confere antes de salvar)</span>
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        onChange={(e) => e.target.files && adicionarArquivos(e.target.files)}
        className={campo}
      />
      {arquivos.length > 0 && (
        <p className="mt-1 text-xs text-zinc-500">{arquivos.length} arquivo(s) selecionado(s) — pode colar (Ctrl+V) mais imagens aqui.</p>
      )}
      {erro && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erro}</p>}
      <button
        onClick={ler}
        disabled={arquivos.length === 0 || carregando}
        className="mt-2 rounded-full bg-zinc-900 px-4 py-1.5 text-xs text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {carregando ? "Lendo..." : "Ler documento"}
      </button>
    </div>
  );
}
