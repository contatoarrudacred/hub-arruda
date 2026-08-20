"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProdutoParaVenda } from "@/lib/vendas/produtos";
import type { TemplateDocumentoResumo, TipoTemplateDocumento } from "@/lib/vendas/contrato-templates";
import {
  atualizarMetadadosTemplateAction,
  criarTemplateDocumentoAction,
  excluirTemplateDocumentoAction,
} from "./actions";

const TIPO_LABEL: Record<TipoTemplateDocumento, string> = {
  contrato: "Contrato",
  termo_acordo: "Termo de Acordo",
  ficha_associativa: "Ficha Associativa",
};

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

function NovoDocumento({ produtos, onCancelar }: { produtos: ProdutoParaVenda[]; onCancelar: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoTemplateDocumento>("contrato");
  const [nome, setNome] = useState("");
  const [produtoId, setProdutoId] = useState<string>("");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criar() {
    setErro(null);
    setCriando(true);
    const resultado = await criarTemplateDocumentoAction({
      tipo,
      nome,
      produtoId: tipo === "contrato" ? produtoId || null : null,
    });
    setCriando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    router.push(`/admin/configuracoes/templates-documentos/${resultado.id}/editar`);
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className={rotulo}>Tipo</label>
          <select
            className={campo}
            value={tipo}
            onChange={(e) => {
              const novoTipo = e.target.value as TipoTemplateDocumento;
              setTipo(novoTipo);
              if (novoTipo !== "contrato") setProdutoId("");
            }}
          >
            {(Object.entries(TIPO_LABEL) as [TipoTemplateDocumento, string][]).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className={rotulo}>Nome do documento</label>
          <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Contrato — Limpeza de Nome" />
        </div>
      </div>

      {tipo === "contrato" && (
        <div className="space-y-1">
          <label className={rotulo}>Produto</label>
          <select className={campo} value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
            <option value="">Selecione...</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
      )}

      {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

      <div className="flex items-center justify-between">
        <button onClick={onCancelar} className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
          Cancelar
        </button>
        <button
          onClick={criar}
          disabled={criando}
          className="rounded-full bg-zinc-900 px-5 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {criando ? "Criando..." : "Criar e ir pro editor"}
        </button>
      </div>
    </div>
  );
}

function LinhaDocumento({
  template,
  onMudou,
  onExcluido,
}: {
  template: TemplateDocumentoResumo;
  onMudou: (t: TemplateDocumentoResumo) => void;
  onExcluido: () => void;
}) {
  const [expandida, setExpandida] = useState(false);
  const [nome, setNome] = useState(template.nome);
  const [ativo, setAtivo] = useState(template.ativo);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const resultado = await atualizarMetadadosTemplateAction(template.id, nome, ativo);
    setSalvando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onMudou({ ...template, nome, ativo });
    setExpandida(false);
  }

  async function excluir() {
    setExcluindo(true);
    const resultado = await excluirTemplateDocumentoAction(template.id);
    setExcluindo(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      setConfirmandoExclusao(false);
      return;
    }
    onExcluido();
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center gap-2 px-4 py-3">
        <button type="button" onClick={() => setExpandida((v) => !v)} className="flex flex-1 items-center gap-2 text-left">
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {TIPO_LABEL[template.tipo]}
          </span>
          <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{template.nome}</span>
          {template.produtoNome && <span className="text-xs text-zinc-400">({template.produtoNome})</span>}
          {!template.ativo && <span className="text-xs text-zinc-400">(inativo)</span>}
        </button>
        <Link
          href={`/admin/configuracoes/templates-documentos/${template.id}/editar`}
          className="shrink-0 rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Editar Template
        </Link>
      </div>

      {expandida && (
        <div className="space-y-3 border-t border-zinc-200 p-4 dark:border-zinc-700">
          <div className="space-y-1">
            <label className={rotulo}>Nome do documento</label>
            <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Ativo
          </label>

          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

          <div className="flex items-center justify-between pt-1">
            {!confirmandoExclusao ? (
              <button onClick={() => setConfirmandoExclusao(true)} className="text-sm text-red-600 hover:underline dark:text-red-400">
                Excluir
              </button>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">Confirma excluir?</span>
                <button onClick={excluir} disabled={excluindo} className="font-medium text-red-600 hover:underline dark:text-red-400">
                  {excluindo ? "Excluindo..." : "Sim, excluir"}
                </button>
                <button onClick={() => setConfirmandoExclusao(false)} className="text-zinc-500 hover:underline dark:text-zinc-400">
                  Cancelar
                </button>
              </div>
            )}
            <button
              onClick={salvar}
              disabled={salvando}
              className="rounded-full bg-zinc-900 px-5 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TemplatesDocumentosClient({
  templatesIniciais,
  produtos,
}: {
  templatesIniciais: TemplateDocumentoResumo[];
  produtos: ProdutoParaVenda[];
}) {
  const [templates, setTemplates] = useState(templatesIniciais);
  const [criandoNovo, setCriandoNovo] = useState(false);

  return (
    <div className="max-w-3xl space-y-3 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Template de Documentos</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Contrato (por produto, usado na emissão automática), Termo de Acordo e Ficha Associativa — cadastre aqui, edite o texto no editor.
          </p>
        </div>
        <button
          onClick={() => setCriandoNovo(true)}
          disabled={criandoNovo}
          className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          + Novo documento
        </button>
      </div>

      {criandoNovo && <NovoDocumento produtos={produtos} onCancelar={() => setCriandoNovo(false)} />}

      {templates.map((template) => (
        <LinhaDocumento
          key={template.id}
          template={template}
          onMudou={(atualizado) => setTemplates((atual) => atual.map((t) => (t.id === template.id ? atualizado : t)))}
          onExcluido={() => setTemplates((atual) => atual.filter((t) => t.id !== template.id))}
        />
      ))}

      {templates.length === 0 && !criandoNovo && <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum documento cadastrado ainda.</p>}
    </div>
  );
}
