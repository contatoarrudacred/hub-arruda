"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EditorHtmlPost } from "@/components/marketing/editor-html-post";
import type { PostDetalhado } from "@/lib/marketing/repositorio";
import { enviarImagemEditorAction, salvarPostCompletoAction } from "./actions";

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400";

export function EditarPostClient({ post }: { post: PostDetalhado }) {
  const router = useRouter();
  const [titulo, setTitulo] = useState(post.titulo);
  const [slug, setSlug] = useState(post.slug);
  const [metaTitle, setMetaTitle] = useState(post.metaTitle);
  const [metaDescription, setMetaDescription] = useState(post.metaDescription);
  const [conteudoHtml, setConteudoHtml] = useState(post.conteudoHtml);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Aviso de alterações não salvas ao tentar sair (fechar aba/navegar pra fora do app) — o
  // conteúdo pode ser longo, vale um freio de mão antes de perder uma correção manual.
  useEffect(() => {
    function aoTentarSair(evento: BeforeUnloadEvent) {
      if (!sujo) return;
      evento.preventDefault();
    }
    window.addEventListener("beforeunload", aoTentarSair);
    return () => window.removeEventListener("beforeunload", aoTentarSair);
  }, [sujo]);

  async function enviarImagem(arquivo: File): Promise<string> {
    const formData = new FormData();
    formData.append("arquivo", arquivo);
    const resultado = await enviarImagemEditorAction(post.id, formData);
    if (!resultado.sucesso) throw new Error(resultado.erro);
    return resultado.url;
  }

  async function salvar() {
    setSalvando(true);
    setMensagem(null);
    setErro(null);
    const resultado = await salvarPostCompletoAction(post.id, { titulo, slug, metaTitle, metaDescription, conteudoHtml });
    setSalvando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    setSujo(false);
    setMensagem("Post salvo.");
  }

  return (
    <div className="max-w-4xl space-y-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Editar post</h1>
        <button
          type="button"
          onClick={() => router.push("/admin/marketing/agenda")}
          className="rounded-full px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          ← Voltar pra Agenda
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className={rotulo}>Título</label>
          <input
            className={campo}
            value={titulo}
            onChange={(e) => {
              setTitulo(e.target.value);
              setSujo(true);
            }}
          />
        </div>
        <div className="space-y-1">
          <label className={rotulo}>
            Slug
            <span className="font-normal normal-case text-zinc-400" title="Mudar o slug de um post já no ar muda a URL dele — o link antigo para de funcionar, sem redirect automático.">
              (mudar troca a URL do post)
            </span>
          </label>
          <input
            className={campo}
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSujo(true);
            }}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className={rotulo}>Meta title</label>
        <input
          className={campo}
          value={metaTitle}
          onChange={(e) => {
            setMetaTitle(e.target.value);
            setSujo(true);
          }}
        />
      </div>
      <div className="space-y-1">
        <label className={rotulo}>Meta description</label>
        <textarea
          className={campo}
          rows={2}
          value={metaDescription}
          onChange={(e) => {
            setMetaDescription(e.target.value);
            setSujo(true);
          }}
        />
      </div>

      <div className="space-y-1">
        <label className={rotulo}>Conteúdo</label>
        <EditorHtmlPost
          valorInicial={post.conteudoHtml}
          aoMudar={(html) => {
            setConteudoHtml(html);
            setSujo(true);
          }}
          aoEnviarImagem={enviarImagem}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={salvando}
          onClick={salvar}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {salvando ? "Salvando..." : "Salvar"}
        </button>
        {mensagem && <p className="text-sm text-emerald-600 dark:text-emerald-400">{mensagem}</p>}
        {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
      </div>
    </div>
  );
}
