"use client";

import { useEffect, useRef, useState } from "react";
import type { DadosExtraidosDocumento } from "@/lib/vendas/leitura-documento-ia";
import { lerDocumentoAction } from "./leitor-documento-ia-actions";

function ehImagem(arquivo: File): boolean {
  return arquivo.type.startsWith("image/");
}

type ArquivoComPreview = { arquivo: File; previewUrl: string | null };

export function LeitorDocumentoIA({
  onDadosExtraidos,
}: {
  // arquivosLidos: os mesmos arquivos que a IA acabou de ler, pra quem chama poder salvá-los junto
  // do cadastro (se a pessoa já for conhecida no momento da leitura) — ver uso em
  // nova-oportunidade-client.tsx.
  onDadosExtraidos: (dados: DadosExtraidosDocumento, arquivosLidos: File[]) => void | Promise<void>;
}) {
  const [arquivos, setArquivos] = useState<ArquivoComPreview[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [arrastandoSobre, setArrastandoSobre] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Limpa os object URLs de preview ao desmontar, pra não vazar memória.
  useEffect(() => {
    return () => {
      arquivos.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function adicionarArquivos(novos: FileList | File[]) {
    const comPreview = Array.from(novos).map((arquivo) => ({
      arquivo,
      previewUrl: ehImagem(arquivo) ? URL.createObjectURL(arquivo) : null,
    }));
    setArquivos((atual) => [...atual, ...comPreview]);
  }

  function removerArquivo(indice: number) {
    setArquivos((atual) => {
      const alvo = atual[indice];
      if (alvo?.previewUrl) URL.revokeObjectURL(alvo.previewUrl);
      return atual.filter((_, i) => i !== indice);
    });
  }

  function aoColar(evento: React.ClipboardEvent) {
    const imagens = Array.from(evento.clipboardData.items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((arquivo): arquivo is File => arquivo !== null);
    if (imagens.length > 0) adicionarArquivos(imagens);
  }

  function aoSoltarArquivos(evento: React.DragEvent<HTMLDivElement>) {
    evento.preventDefault();
    setArrastandoSobre(false);
    if (evento.dataTransfer.files.length > 0) adicionarArquivos(evento.dataTransfer.files);
  }

  async function ler() {
    if (arquivos.length === 0) return;
    setCarregando(true);
    setErro(null);
    const formData = new FormData();
    arquivos.forEach(({ arquivo }) => formData.append("arquivos", arquivo));

    const resultado = await lerDocumentoAction(formData);
    setCarregando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    const arquivosLidos = arquivos.map((a) => a.arquivo);
    arquivos.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    setArquivos([]);
    await onDadosExtraidos(resultado.dados, arquivosLidos);
  }

  return (
    <div
      onPaste={aoColar}
      tabIndex={0}
      title="Cole (Ctrl+V), arraste ou escolha uma ou mais imagens do documento"
      className="space-y-2 text-sm"
    >
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Opcional — só pré-preenche, você confere antes de salvar.</p>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastandoSobre(true);
        }}
        onDragLeave={() => setArrastandoSobre(false)}
        onDrop={aoSoltarArquivos}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          arrastandoSobre
            ? "border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-950"
            : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && adicionarArquivos(e.target.files)}
        />
        <span className="text-xl">📄✨</span>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Arraste, cole (Ctrl+V) ou clique pra escolher imagens/PDF do documento
        </p>
      </div>

      {arquivos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {arquivos.map((a, indice) => (
            <div key={indice} className="relative">
              {a.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.previewUrl} alt={a.arquivo.name} className="h-16 w-16 rounded border border-zinc-200 object-cover dark:border-zinc-700" />
              ) : (
                <div className="flex h-16 w-16 flex-col items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-xs dark:border-zinc-700 dark:bg-zinc-800">
                  <span>📄</span>
                  <span className="max-w-14 truncate px-1 text-zinc-500">{a.arquivo.name}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removerArquivo(indice)}
                title="Remover"
                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] leading-none text-white shadow"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}

      <button
        type="button"
        onClick={ler}
        disabled={arquivos.length === 0 || carregando}
        className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {carregando ? (
          <>
            <span className="inline-block animate-spin">⏳</span> Lendo...
          </>
        ) : (
          "Ler documento"
        )}
      </button>
    </div>
  );
}
