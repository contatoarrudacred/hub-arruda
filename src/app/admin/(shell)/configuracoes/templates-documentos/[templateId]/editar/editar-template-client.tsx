"use client";

import type { Editor } from "@tiptap/react";
import { useRef, useState } from "react";
import { EditorHtmlContrato } from "@/components/vendas/editor-html-contrato";
import type { TemplateDocumentoCompleto, TipoTemplateDocumento } from "@/lib/vendas/contrato-templates";
import { enviarImagemTemplateAction, salvarConteudoTemplateAction } from "./actions";

const TIPO_LABEL: Record<TipoTemplateDocumento, string> = {
  contrato: "Contrato",
  termo_acordo: "Termo de Acordo",
  ficha_associativa: "Ficha Associativa",
};

const GRUPOS_PLACEHOLDERS = [
  {
    grupo: "Campos individuais do cliente",
    itens: [
      { chave: "cliente_nome", descricao: "Nome completo (PF) ou nome do representante legal (PJ) — quem assina de fato." },
      { chave: "cliente_documento", descricao: "CPF (PF) ou CPF do representante legal (PJ)." },
      { chave: "cliente_rg", descricao: "RG de quem assina." },
      { chave: "cliente_estado_civil", descricao: "Estado civil de quem assina." },
      { chave: "cliente_profissao", descricao: "Profissão de quem assina." },
      { chave: "cliente_email", descricao: "E-mail de quem assina." },
      { chave: "cliente_whatsapp", descricao: "Telefone/WhatsApp de quem assina." },
      { chave: "cliente_endereco", descricao: "Endereço de quem assina." },
      { chave: "empresa_razao_social", descricao: "Razão social da empresa — vazio quando o cliente é Pessoa Física." },
      { chave: "empresa_cnpj", descricao: "CNPJ da empresa — vazio quando o cliente é Pessoa Física." },
    ],
  },
  {
    grupo: "Blocos prontos",
    itens: [
      { chave: "dados_cliente", descricao: "Bloco já formatado com todos os campos acima de uma vez (nome, CPF, RG, endereço...). Alternativa rápida a montar campo a campo." },
      { chave: "lista_documentos", descricao: "Tabela com documento + nome de cada CPF/CNPJ do pacote, quando a venda cobre mais de um." },
    ],
  },
  {
    grupo: "Financeiro",
    itens: [
      { chave: "valor_total", descricao: "Valor total do contrato, formatado em R$." },
      { chave: "valor_total_extenso", descricao: "Valor total por extenso (ex.: mil e quinhentos reais)." },
      { chave: "tabela_vencimentos", descricao: "Tabela com número, vencimento, valor e forma de pagamento de cada parcela." },
      { chave: "forma_pagamento", descricao: "Texto simples com a forma de pagamento combinada (ex.: Parcelado em 3x, Boleto/Pix)." },
    ],
  },
] as const;

export function EditarTemplateClient({ template }: { template: TemplateDocumentoCompleto }) {
  const [html, setHtml] = useState(template.conteudoHtml);
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
    const resultado = await salvarConteudoTemplateAction(template.id, html);
    setSalvando(false);
    setMensagem(resultado.sucesso ? "Template salvo." : resultado.erro);
  }

  return (
    <div className="flex max-w-6xl gap-6 p-8">
      <div className="flex-1 space-y-3">
        <div>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {TIPO_LABEL[template.tipo]}
          </span>
          <h1 className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">{template.nome}</h1>
        </div>
        <EditorHtmlContrato
          valorInicial={template.conteudoHtml}
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

      {template.tipo === "contrato" && (
        <div className="w-72 shrink-0 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Placeholders</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Clique pra inserir no cursor do editor.</p>
          </div>
          {GRUPOS_PLACEHOLDERS.map((grupo) => (
            <div key={grupo.grupo} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{grupo.grupo}</h3>
              <ul className="space-y-2">
                {grupo.itens.map((placeholder) => (
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
          ))}
        </div>
      )}
    </div>
  );
}
