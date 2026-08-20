"use client";

import Link from "next/link";
import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CORES_PASTA, CORES_PASTA_LISTA, COR_PASTA_PADRAO, type CorPasta } from "@/lib/motor-fluxo/cores-pasta";
import type { FluxoAdmin, PastaAdmin } from "@/lib/motor-fluxo/repositorio-admin";
import { EditarNomeInline } from "./editar-nome-inline";
import { SeletorCorPasta } from "./seletor-cor-pasta";
import {
  criarPastaAction,
  definirCorPastaAction,
  excluirPastaAction,
  moverEReordenarAction,
  renomearFluxoAction,
  renomearPastaAction,
} from "./actions";

const CHAVE_RAIZ = "raiz";
const PREFIXO_CONTAINER = "secao:";

type Secao = { chave: string; pastaId: string | null; nome: string; cor: CorPasta | null; itens: FluxoAdmin[] };

function montarSecoes(fluxos: FluxoAdmin[], pastas: PastaAdmin[]): Secao[] {
  const porPasta = new Map<string, FluxoAdmin[]>();
  const semPasta: FluxoAdmin[] = [];
  for (const f of fluxos) {
    if (f.pastaId) {
      const lista = porPasta.get(f.pastaId) ?? [];
      lista.push(f);
      porPasta.set(f.pastaId, lista);
    } else {
      semPasta.push(f);
    }
  }
  const secoesPastas: Secao[] = pastas
    .slice()
    .sort((a, b) => a.posicao - b.posicao)
    .map((p) => ({
      chave: p.id,
      pastaId: p.id,
      nome: p.nome,
      cor: p.cor,
      itens: (porPasta.get(p.id) ?? []).sort((a, b) => a.posicao - b.posicao),
    }));
  const secaoRaiz: Secao = {
    chave: CHAVE_RAIZ,
    pastaId: null,
    nome: "Sem pasta",
    cor: null,
    itens: semPasta.sort((a, b) => a.posicao - b.posicao),
  };
  return [...secoesPastas, secaoRaiz];
}

function FluxoCard({ fluxo }: { fluxo: FluxoAdmin }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: fluxo.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-xl bg-white p-3 shadow hover:shadow-md dark:bg-zinc-900"
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="cursor-grab touch-none px-1 text-zinc-400 active:cursor-grabbing"
        title="Arrastar"
        aria-label="Arrastar fluxo"
      >
        ⠿
      </button>
      <div className="min-w-0 flex-1">
        <EditarNomeInline
          valor={fluxo.nome}
          aoSalvar={async (novoNome) => {
            await renomearFluxoAction(fluxo.id, novoNome);
          }}
        />
      </div>
      <Link
        href={`/admin/fluxos/${fluxo.id}`}
        className="shrink-0 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        Abrir →
      </Link>
    </div>
  );
}

function SecaoPastaView({
  secao,
  aoRenomear,
  aoMudarCor,
  aoExcluir,
}: {
  secao: Secao;
  aoRenomear: (novoNome: string) => Promise<void>;
  aoMudarCor: (novaCor: CorPasta) => void;
  aoExcluir: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${PREFIXO_CONTAINER}${secao.chave}` });
  const cor = secao.cor ? CORES_PASTA[secao.cor] : null;

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border p-3 transition-colors ${
        isOver ? "border-zinc-400 bg-zinc-50 dark:border-zinc-500 dark:bg-zinc-800/50" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        {secao.pastaId && secao.cor && <SeletorCorPasta cor={secao.cor} aoEscolher={aoMudarCor} />}
        <span className={`text-sm font-semibold ${cor ? cor.texto : "text-zinc-500 dark:text-zinc-400"}`}>
          {secao.pastaId ? (
            <EditarNomeInline valor={secao.nome} aoSalvar={aoRenomear} tamanhoTexto="text-sm font-semibold" />
          ) : (
            secao.nome
          )}
        </span>
        <span className="text-xs text-zinc-400">
          {secao.itens.length} {secao.itens.length === 1 ? "fluxo" : "fluxos"}
        </span>
        {secao.pastaId && (
          <button
            type="button"
            onClick={aoExcluir}
            className="ml-auto text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
            title="Excluir pasta"
            aria-label="Excluir pasta"
          >
            🗑️
          </button>
        )}
      </div>

      {secao.itens.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-400 dark:border-zinc-700">
          Pasta vazia — arraste um fluxo pra cá
        </p>
      ) : (
        <SortableContext items={secao.itens.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {secao.itens.map((fluxo) => (
              <FluxoCard key={fluxo.id} fluxo={fluxo} />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

function CriarPastaPopover({ aoCriar }: { aoCriar: (nome: string, cor: CorPasta) => Promise<void> }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState<CorPasta>(COR_PASTA_PADRAO);
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    if (!nome.trim()) return;
    setSalvando(true);
    await aoCriar(nome.trim(), cor);
    setSalvando(false);
    setNome("");
    setCor(COR_PASTA_PADRAO);
    setAberto(false);
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
      >
        📁 Criar Pasta
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div
            className="absolute right-0 top-9 z-20 w-64 space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              placeholder="Nome da pasta"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmar()}
            />
            <div className="grid grid-cols-4 gap-1.5">
              {CORES_PASTA_LISTA.map((chave) => (
                <button
                  key={chave}
                  type="button"
                  title={CORES_PASTA[chave].nome}
                  onClick={() => setCor(chave)}
                  className={`h-6 w-6 rounded-full border-2 ${CORES_PASTA[chave].bg} ${
                    chave === cor ? "border-zinc-900 dark:border-white" : "border-transparent"
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              disabled={!nome.trim() || salvando}
              onClick={confirmar}
              className="w-full rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {salvando ? "Criando..." : "Criar"}
            </button>
          </div>
        </>
      )}
    </span>
  );
}

export function FluxosClient({
  fluxosIniciais,
  pastasIniciais,
}: {
  fluxosIniciais: FluxoAdmin[];
  pastasIniciais: PastaAdmin[];
}) {
  const [pastas, setPastas] = useState(pastasIniciais);
  const [secoes, setSecoes] = useState<Secao[]>(() => montarSecoes(fluxosIniciais, pastasIniciais));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function persistir(chaves: string[], novasSecoes: Secao[]) {
    const mudancas: { fluxoId: string; pastaId: string | null; posicao: number }[] = [];
    for (const chave of chaves) {
      const secao = novasSecoes.find((s) => s.chave === chave);
      if (!secao) continue;
      secao.itens.forEach((f, indice) => mudancas.push({ fluxoId: f.id, pastaId: secao.pastaId, posicao: indice }));
    }
    if (mudancas.length === 0) return;
    const resultado = await moverEReordenarAction(mudancas);
    if (!resultado.sucesso) console.error(resultado.erro);
  }

  function aoTerminarDrag(evento: DragEndEvent) {
    const { active, over } = evento;
    if (!over) return;

    const fluxoId = String(active.id);
    const overIdBruto = String(over.id);
    const overId = overIdBruto.startsWith(PREFIXO_CONTAINER) ? overIdBruto.slice(PREFIXO_CONTAINER.length) : overIdBruto;
    if (fluxoId === overId) return;

    setSecoes((atual) => {
      const secaoOrigem = atual.find((s) => s.itens.some((f) => f.id === fluxoId));
      if (!secaoOrigem) return atual;
      const secaoDestino = atual.find((s) => s.chave === overId) ?? atual.find((s) => s.itens.some((f) => f.id === overId)) ?? secaoOrigem;

      const copia = atual.map((s) => ({ ...s, itens: [...s.itens] }));
      const origem = copia.find((s) => s.chave === secaoOrigem.chave)!;
      const destino = copia.find((s) => s.chave === secaoDestino.chave)!;
      const indiceOrigem = origem.itens.findIndex((f) => f.id === fluxoId);
      const [item] = origem.itens.splice(indiceOrigem, 1);
      const indiceOver = destino.itens.findIndex((f) => f.id === overId);
      const posicaoFinal = indiceOver === -1 ? destino.itens.length : indiceOver;
      destino.itens.splice(posicaoFinal, 0, item);

      const chavesAfetadas = origem.chave === destino.chave ? [origem.chave] : [origem.chave, destino.chave];
      void persistir(chavesAfetadas, copia);
      return copia;
    });
  }

  async function criarPasta(nome: string, cor: CorPasta) {
    const resultado = await criarPastaAction(nome, cor);
    if (!resultado.sucesso) {
      alert(resultado.erro);
      return;
    }
    const novaPasta: PastaAdmin = { id: resultado.id, nome, cor, posicao: pastas.length };
    setPastas((atual) => [...atual, novaPasta]);
    setSecoes((atual) => {
      const raiz = atual.find((s) => s.chave === CHAVE_RAIZ)!;
      const outras = atual.filter((s) => s.chave !== CHAVE_RAIZ);
      return [...outras, { chave: novaPasta.id, pastaId: novaPasta.id, nome, cor, itens: [] }, raiz];
    });
  }

  async function renomearPasta(pastaId: string, novoNome: string) {
    const resultado = await renomearPastaAction(pastaId, novoNome);
    if (!resultado.sucesso) {
      alert(resultado.erro);
      return;
    }
    setSecoes((atual) => atual.map((s) => (s.chave === pastaId ? { ...s, nome: novoNome } : s)));
  }

  async function mudarCorPasta(pastaId: string, novaCor: CorPasta) {
    const anterior = secoes.find((s) => s.chave === pastaId)?.cor ?? COR_PASTA_PADRAO;
    setSecoes((atual) => atual.map((s) => (s.chave === pastaId ? { ...s, cor: novaCor } : s)));
    const resultado = await definirCorPastaAction(pastaId, novaCor);
    if (!resultado.sucesso) {
      alert(resultado.erro);
      setSecoes((atual) => atual.map((s) => (s.chave === pastaId ? { ...s, cor: anterior } : s)));
    }
  }

  async function excluirPasta(pastaId: string, nome: string) {
    if (!window.confirm(`Excluir a pasta "${nome}"? Os fluxos dentro dela voltam pra "Sem pasta".`)) return;
    const secao = secoes.find((s) => s.chave === pastaId);
    const resultado = await excluirPastaAction(pastaId);
    if (!resultado.sucesso) {
      alert(resultado.erro);
      return;
    }
    setPastas((atual) => atual.filter((p) => p.id !== pastaId));
    setSecoes((atual) => {
      const semEssaPasta = atual.filter((s) => s.chave !== pastaId);
      if (!secao || secao.itens.length === 0) return semEssaPasta;
      return semEssaPasta.map((s) => (s.chave === CHAVE_RAIZ ? { ...s, itens: [...s.itens, ...secao.itens] } : s));
    });
  }

  return (
    <div className="p-8">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Fluxos de atendimento</h1>
        <CriarPastaPopover aoCriar={criarPasta} />
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={aoTerminarDrag}>
        <div className="space-y-4">
          {secoes.map((secao) => (
            <SecaoPastaView
              key={secao.chave}
              secao={secao}
              aoRenomear={(novoNome) => renomearPasta(secao.chave, novoNome)}
              aoMudarCor={(novaCor) => mudarCorPasta(secao.chave, novaCor)}
              aoExcluir={() => excluirPasta(secao.chave, secao.nome)}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
