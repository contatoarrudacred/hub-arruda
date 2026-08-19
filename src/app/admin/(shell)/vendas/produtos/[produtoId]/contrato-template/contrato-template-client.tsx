"use client";

import type { Editor } from "@tiptap/react";
import { useRef, useState } from "react";
import { EditorHtmlContrato } from "@/components/vendas/editor-html-contrato";
import { enviarImagemTemplateAction, salvarTemplateAction } from "./actions";

const PLACEHOLDERS = [
  { chave: "dados_cliente", descricao: "Nome/CPF/RG/estado civil/profissão/e-mail/telefone/endereço (PF), ou razão social/CNPJ + os mesmos dados do representante legal (PJ)." },
  { chave: "lista_documentos", descricao: "Repete o bloco de dados acima pra cada documento, quando a venda é um pacote com mais de um CPF/CNPJ." },
  { chave: "valor_total", descricao: "Valor total do contrato, formatado em R$." },
  { chave: "valor_total_extenso", descricao: "Valor total por extenso (ex.: mil e quinhentos reais)." },
  { chave: "tabela_vencimentos", descricao: "Tabela com número, vencimento, valor e forma de pagamento de cada parcela." },
  { chave: "forma_pagamento", descricao: "Texto simples com a forma de pagamento combinada (ex.: Parcelado em 3x, Boleto/Pix)." },
] as const;

type Props = {
  produto: { id: string; nome: string };
  conteudoHtmlInicial: string;
};

export function ContratoTemplateClient({ produto, conteudoHtmlInicial }: Props) {
  const [html, setHtml] = useState(conteudoHtmlInicial);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const editorRef = useRef<Editor | null>(null);

  async function enviarImagem(arquivo: File): Promise<string> {
    const formData = new FormData();
    formData.append("arquivo", arquivo);
    const resultado = await enviarImagemTemplateAction(formData);
    if (!resultado.sucesso) throw new Error(resultado.erro);
    return resultado.url;
  }

  function inserirPlaceholder(chave: string) {
    editorRef.current?.chain().focus().insertContent(`{{${chave}}}`).run();
  }

  async function salvar() {
    setSalvando(true);
    setMensagem(null);
    const resultado = await salvarTemplateAction(produto.id, html);
    setSalvando(false);
    setMensagem(resultado.sucesso ? "Template salvo." : resultado.erro);
  }

  return (
    <div className="flex max-w-6xl gap-6 p-8">
      <div className="flex-1 space-y-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Template de contrato — {produto.nome}
        </h1>
        <EditorHtmlContrato
          valorInicial={conteudoHtmlInicial}
          aoMudar={setHtml}
          aoEnviarImagem={enviarImagem}
          aoInicializar={(editor) => {
            editorRef.current = editor;
          }}
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={salvando}
            onClick={salvar}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {salvando ? "Salvando..." : "Salvar template"}
          </button>
          {mensagem && <p className="text-sm text-zinc-600 dark:text-zinc-400">{mensagem}</p>}
        </div>
      </div>

      <div className="w-72 shrink-0 space-y-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Placeholders</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Clique pra inserir no cursor do editor.</p>
        <ul className="space-y-2">
          {PLACEHOLDERS.map((placeholder) => (
            <li key={placeholder.chave}>
              <button
                type="button"
                onMouseDown={(evento) => evento.preventDefault()}
                onClick={() => inserirPlaceholder(placeholder.chave)}
                className="w-full rounded border border-zinc-300 p-2 text-left text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <span className="block font-mono font-medium text-zinc-900 dark:text-zinc-50">
                  {"{{" + placeholder.chave + "}}"}
                </span>
                <span className="mt-1 block text-zinc-500 dark:text-zinc-400">{placeholder.descricao}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
