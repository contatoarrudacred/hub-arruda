"use client";

import { useEffect, useState } from "react";
import type { PessoaDocumento } from "@/lib/vendas/pessoa-documentos";
import { enviarDocumentoPessoaAction, excluirDocumentoPessoaAction, listarDocumentosPessoaAction } from "./upload-pessoa-actions";

const TIPOS_DOCUMENTO = [
  { valor: "rg", rotulo: "RG" },
  { valor: "cnh", rotulo: "CNH" },
  { valor: "comprovante_residencia", rotulo: "Comprovante de Residência" },
  { valor: "contrato_social", rotulo: "Contrato Social" },
  { valor: "cartao_cnpj", rotulo: "Cartão CNPJ" },
  { valor: "outro", rotulo: "Outro" },
] as const;

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";

export function UploadDocumentosPessoa({ pessoaId }: { pessoaId: string }) {
  const [documentos, setDocumentos] = useState<PessoaDocumento[]>([]);
  const [tipo, setTipo] = useState<(typeof TIPOS_DOCUMENTO)[number]["valor"]>("rg");
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    listarDocumentosPessoaAction(pessoaId).then(setDocumentos);
  }, [pessoaId]);

  async function enviar(arquivo: File) {
    setErro(null);
    const formData = new FormData();
    formData.append("pessoaId", pessoaId);
    formData.append("tipoDocumento", tipo);
    formData.append("descricao", descricao);
    formData.append("arquivo", arquivo);

    const resultado = await enviarDocumentoPessoaAction(formData);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    setDescricao("");
    listarDocumentosPessoaAction(pessoaId).then(setDocumentos);
  }

  async function excluir(id: string) {
    await excluirDocumentoPessoaAction(id);
    setDocumentos((atual) => atual.filter((d) => d.id !== id));
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">📎 Documentos anexados</p>
      <div className="flex flex-wrap items-end gap-2">
        <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} style={{ maxWidth: 220 }}>
          {TIPOS_DOCUMENTO.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.rotulo}
            </option>
          ))}
        </select>
        {tipo === "outro" && (
          <input
            className={campo}
            placeholder="Descreva o documento"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            style={{ maxWidth: 220 }}
          />
        )}
        <input type="file" onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])} />
      </div>
      {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
      <ul className="space-y-1 text-sm">
        {documentos.map((doc) => (
          <li key={doc.id} className="flex items-center justify-between rounded border border-zinc-200 px-2 py-1 dark:border-zinc-700">
            <a href={doc.url} target="_blank" rel="noreferrer" className="truncate text-zinc-700 hover:underline dark:text-zinc-300">
              {TIPOS_DOCUMENTO.find((t) => t.valor === doc.tipoDocumento)?.rotulo ?? doc.tipoDocumento}
              {doc.descricao ? ` — ${doc.descricao}` : ""}
            </a>
            <button onClick={() => excluir(doc.id)} className="ml-2 text-xs text-red-600 dark:text-red-400">
              Excluir
            </button>
          </li>
        ))}
        {documentos.length === 0 && <li className="text-xs text-zinc-500">Nenhum documento anexado ainda.</li>}
      </ul>
    </div>
  );
}
