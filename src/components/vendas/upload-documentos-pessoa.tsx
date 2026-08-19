"use client";

import { useEffect, useRef, useState } from "react";
import type { PessoaDocumento } from "@/lib/vendas/pessoa-documentos";
import { TIPOS_DOCUMENTO_PESSOA } from "@/lib/vendas/tipos-documento";
import { enviarDocumentoPessoaAction, excluirDocumentoPessoaAction, listarDocumentosPessoaAction } from "./upload-pessoa-actions";

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";

function ehImagem(nomeOuTipo: string): boolean {
  return /\.(jpe?g|png|webp|gif)$/i.test(nomeOuTipo) || nomeOuTipo.startsWith("image/");
}

export function UploadDocumentosPessoa({ pessoaId }: { pessoaId: string }) {
  const [documentos, setDocumentos] = useState<PessoaDocumento[]>([]);
  const [tipo, setTipo] = useState<(typeof TIPOS_DOCUMENTO_PESSOA)[number]["valor"]>("rg");
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [arrastandoSobre, setArrastandoSobre] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listarDocumentosPessoaAction(pessoaId).then(setDocumentos);
  }, [pessoaId]);

  // Limpa o object URL de preview ao trocar/desmontar, pra não vazar memória.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function enviar(arquivo: File) {
    setErro(null);
    setEnviando(true);
    if (ehImagem(arquivo.type || arquivo.name)) {
      setPreviewUrl(URL.createObjectURL(arquivo));
    }

    const formData = new FormData();
    formData.append("pessoaId", pessoaId);
    formData.append("tipoDocumento", tipo);
    formData.append("descricao", descricao);
    formData.append("arquivo", arquivo);

    const resultado = await enviarDocumentoPessoaAction(formData);
    setEnviando(false);
    setPreviewUrl(null);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    setDescricao("");
    listarDocumentosPessoaAction(pessoaId).then(setDocumentos);
  }

  async function excluir(id: string) {
    setErro(null);
    const resultado = await excluirDocumentoPessoaAction(id);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    setDocumentos((atual) => atual.filter((d) => d.id !== id));
  }

  function aoSoltarArquivo(evento: React.DragEvent<HTMLDivElement>) {
    evento.preventDefault();
    setArrastandoSobre(false);
    const arquivo = evento.dataTransfer.files?.[0];
    if (arquivo) enviar(arquivo);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">📎 Documentos anexados</p>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Tipo</label>
          <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} style={{ maxWidth: 220 }}>
            {TIPOS_DOCUMENTO_PESSOA.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </div>
        {tipo === "outro" && (
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Descreva</label>
            <input
              className={campo}
              placeholder="Descreva o documento"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              style={{ maxWidth: 220 }}
            />
          </div>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastandoSobre(true);
        }}
        onDragLeave={() => setArrastandoSobre(false)}
        onDrop={aoSoltarArquivo}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          arrastandoSobre
            ? "border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-950"
            : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])}
        />
        {enviando ? (
          <>
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Prévia do arquivo enviando" className="max-h-24 rounded object-contain opacity-60" />
            )}
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              <span className="inline-block animate-spin">⏳</span> Enviando...
            </p>
          </>
        ) : (
          <>
            <span className="text-xl">📤</span>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Arraste um arquivo aqui, ou clique pra escolher</p>
          </>
        )}
      </div>

      {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}

      <ul className="space-y-1 text-sm">
        {documentos.map((doc) => (
          <li key={doc.id} className="flex items-center gap-2 rounded border border-zinc-200 px-2 py-1 dark:border-zinc-700">
            {ehImagem(doc.nomeArquivo) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={doc.url} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
            ) : (
              <span className="shrink-0 text-base">📄</span>
            )}
            <a href={doc.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-zinc-700 hover:underline dark:text-zinc-300">
              {TIPOS_DOCUMENTO_PESSOA.find((t) => t.valor === doc.tipoDocumento)?.rotulo ?? doc.tipoDocumento}
              {doc.descricao ? ` — ${doc.descricao}` : ""}
            </a>
            <button onClick={() => excluir(doc.id)} className="shrink-0 text-xs text-red-600 dark:text-red-400">
              Excluir
            </button>
          </li>
        ))}
        {documentos.length === 0 && <li className="text-xs text-zinc-500">Nenhum documento anexado ainda.</li>}
      </ul>
    </div>
  );
}
