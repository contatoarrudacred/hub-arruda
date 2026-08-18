"use client";

import { Color } from "@tiptap/extension-color";
import { FontFamily } from "@tiptap/extension-font-family";
import { Image } from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";

const FONTES = ["Arial", "Georgia", "Times New Roman", "Courier New"];
const CORES = ["#18181b", "#dc2626", "#2563eb", "#16a34a"];

type Props = {
  valorInicial: string;
  aoMudar: (html: string) => void;
  aoEnviarImagem: (arquivo: File) => Promise<string>;
};

export function EditorHtmlContrato({ valorInicial, aoMudar, aoEnviarImagem }: Props) {
  const [enviandoImagem, setEnviandoImagem] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TextStyle,
      FontFamily,
      Color,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TableKit.configure({ table: { resizable: true } }),
      Image,
    ],
    content: valorInicial,
    onUpdate: ({ editor: editorAtualizado }) => aoMudar(editorAtualizado.getHTML()),
    editorProps: {
      attributes: {
        class:
          "min-h-[400px] max-w-none p-4 text-zinc-900 focus:outline-none dark:text-zinc-100 [&_table]:border-collapse [&_td]:border [&_td]:border-zinc-400 [&_td]:p-1 [&_th]:border [&_th]:border-zinc-400 [&_th]:bg-zinc-100 [&_th]:p-1 dark:[&_td]:border-zinc-600 dark:[&_th]:border-zinc-600 dark:[&_th]:bg-zinc-800",
      },
    },
  });

  if (!editor) return null;

  async function inserirImagem(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!arquivo || !editor) return;

    setEnviandoImagem(true);
    try {
      const url = await aoEnviarImagem(arquivo);
      editor.chain().focus().setImage({ src: url }).run();
    } finally {
      setEnviandoImagem(false);
    }
  }

  const botao = (ativo: boolean) =>
    `rounded px-2 py-1 text-sm ${ativo ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"}`;

  return (
    <div className="rounded border border-zinc-300 dark:border-zinc-700">
      <div className="flex flex-wrap items-center gap-1 border-b border-zinc-300 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
        <button
          type="button"
          className={botao(editor.isActive("bold"))}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          Negrito
        </button>
        <button
          type="button"
          className={botao(editor.isActive("italic"))}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          Itálico
        </button>
        <button
          type="button"
          className={botao(editor.isActive("underline"))}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          Sublinhado
        </button>
        <span className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-700" />
        {([1, 2, 3] as const).map((nivel) => (
          <button
            key={nivel}
            type="button"
            className={botao(editor.isActive("heading", { level: nivel }))}
            onClick={() => editor.chain().focus().toggleHeading({ level: nivel }).run()}
          >
            Título {nivel}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-700" />
        <button
          type="button"
          className={botao(editor.isActive("bulletList"))}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          Lista
        </button>
        <button
          type="button"
          className={botao(editor.isActive("orderedList"))}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          Lista numerada
        </button>
        <span className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-700" />
        {([
          ["left", "Esquerda"],
          ["center", "Centro"],
          ["right", "Direita"],
          ["justify", "Justificado"],
        ] as const).map(([alinhamento, rotulo]) => (
          <button
            key={alinhamento}
            type="button"
            className={botao(editor.isActive({ textAlign: alinhamento }))}
            onClick={() => editor.chain().focus().setTextAlign(alinhamento).run()}
          >
            {rotulo}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-700" />
        <select
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          defaultValue=""
          onChange={(evento) => {
            if (evento.target.value) editor.chain().focus().setFontFamily(evento.target.value).run();
          }}
        >
          <option value="">Fonte</option>
          {FONTES.map((fonte) => (
            <option key={fonte} value={fonte}>
              {fonte}
            </option>
          ))}
        </select>
        {CORES.map((cor) => (
          <button
            key={cor}
            type="button"
            aria-label={`Cor ${cor}`}
            className="h-6 w-6 rounded border border-zinc-300 dark:border-zinc-600"
            style={{ backgroundColor: cor }}
            onClick={() => editor.chain().focus().setColor(cor).run()}
          />
        ))}
        <span className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-700" />
        <button
          type="button"
          className={botao(false)}
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          Tabela
        </button>
        <label className={`${botao(false)} cursor-pointer`}>
          {enviandoImagem ? "Enviando..." : "Imagem"}
          <input type="file" accept="image/*" className="hidden" disabled={enviandoImagem} onChange={inserirImagem} />
        </label>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
