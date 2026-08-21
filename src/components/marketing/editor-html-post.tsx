"use client";

// Agenda de Posts — Editar Post Completo (21/08/2026, pedido do Luiz): mesmo padrão de editor
// rich-text já usado em Vendas (`src/components/vendas/editor-html-contrato.tsx`) — toolbar,
// extensões do Tiptap, upload de imagem — copiado em vez de importado direto porque o preview de
// lá resolve placeholders de contrato (`resolverPlaceholders`), específico de Vendas; aqui o
// preview é só o HTML renderizado, sem placeholder nenhum. Sanitização reaproveita
// `sanitizarConteudoHtml` (marketing/sanitizar-html.ts, mesma allowlist usada pelo pipeline
// automático) em vez do `sanitizarHtml` de Vendas.

import { Color } from "@tiptap/extension-color";
import { FontFamily } from "@tiptap/extension-font-family";
import { Image } from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useState } from "react";
import { sanitizarConteudoHtml } from "@/lib/marketing/sanitizar-html";

const FONTES = ["Arial", "Georgia", "Times New Roman", "Courier New"];
const CORES = ["#18181b", "#dc2626", "#2563eb", "#16a34a"];

function classeBotao(ativo: boolean): string {
  return `rounded px-2 py-1 text-sm ${ativo ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"}`;
}

// onMouseDown com preventDefault: sem isso, o clique no botão tira o foco/seleção do editor ANTES
// do onClick rodar — mesmo achado documentado em editor-html-contrato.tsx.
function BotaoBarra({ ativo, aoClicar, children }: { ativo: boolean; aoClicar: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={classeBotao(ativo)} onMouseDown={(evento) => evento.preventDefault()} onClick={aoClicar}>
      {children}
    </button>
  );
}

type Props = {
  valorInicial: string;
  aoMudar: (html: string) => void;
  aoEnviarImagem: (arquivo: File) => Promise<string>;
  aoInicializar?: (editor: Editor) => void;
};

export function EditorHtmlPost({ valorInicial, aoMudar, aoEnviarImagem, aoInicializar }: Props) {
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const [preview, setPreview] = useState(false);

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

  useEffect(() => {
    if (editor) aoInicializar?.(editor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) return null;

  function sanitizar() {
    if (!editor) return;
    editor.chain().focus().setContent(sanitizarConteudoHtml(editor.getHTML())).run();
  }

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

  return (
    <div className="rounded border border-zinc-300 dark:border-zinc-700">
      <div className="flex flex-wrap items-center gap-1 border-b border-zinc-300 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
        <BotaoBarra ativo={editor.isActive("bold")} aoClicar={() => editor.chain().focus().toggleBold().run()}>
          Negrito
        </BotaoBarra>
        <BotaoBarra ativo={editor.isActive("italic")} aoClicar={() => editor.chain().focus().toggleItalic().run()}>
          Itálico
        </BotaoBarra>
        <span className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-700" />
        {([1, 2, 3] as const).map((nivel) => (
          <BotaoBarra key={nivel} ativo={editor.isActive("heading", { level: nivel })} aoClicar={() => editor.chain().focus().toggleHeading({ level: nivel }).run()}>
            Título {nivel}
          </BotaoBarra>
        ))}
        <span className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-700" />
        <BotaoBarra ativo={editor.isActive("bulletList")} aoClicar={() => editor.chain().focus().toggleBulletList().run()}>
          Lista
        </BotaoBarra>
        <BotaoBarra ativo={editor.isActive("orderedList")} aoClicar={() => editor.chain().focus().toggleOrderedList().run()}>
          Lista numerada
        </BotaoBarra>
        <span className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-700" />
        {(
          [
            ["left", "Esquerda"],
            ["center", "Centro"],
            ["right", "Direita"],
            ["justify", "Justificado"],
          ] as const
        ).map(([alinhamento, rotuloAlinhamento]) => (
          <BotaoBarra key={alinhamento} ativo={editor.isActive({ textAlign: alinhamento })} aoClicar={() => editor.chain().focus().setTextAlign(alinhamento).run()}>
            {rotuloAlinhamento}
          </BotaoBarra>
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
            onMouseDown={(evento) => evento.preventDefault()}
            onClick={() => editor.chain().focus().setColor(cor).run()}
          />
        ))}
        <span className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-700" />
        <BotaoBarra ativo={false} aoClicar={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          Tabela
        </BotaoBarra>
        <label className={`${classeBotao(false)} cursor-pointer`}>
          {enviandoImagem ? "Enviando..." : "Imagem"}
          <input type="file" accept="image/*" className="hidden" disabled={enviandoImagem} onChange={inserirImagem} />
        </label>
        <span className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-700" />
        <BotaoBarra ativo={false} aoClicar={sanitizar}>
          🧹 Sanitizar
        </BotaoBarra>
        <BotaoBarra ativo={preview} aoClicar={() => setPreview((atual) => !atual)}>
          {preview ? "✏️ Editar" : "👁️ Ver como vai ficar"}
        </BotaoBarra>
      </div>
      {preview ? (
        <div className="flex justify-center bg-zinc-100 p-4 dark:bg-zinc-950">
          <div className="prose prose-sm h-[600px] w-full max-w-3xl overflow-y-auto rounded border border-zinc-300 bg-white p-6 shadow-sm dark:prose-invert dark:border-zinc-700 dark:bg-zinc-900">
            <div dangerouslySetInnerHTML={{ __html: editor.getHTML() }} />
          </div>
        </div>
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
}
