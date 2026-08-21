"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { corEstagio, ehEstagioTransitorio, ESTAGIOS_VENDA, rotuloEstagio } from "@/lib/vendas/estagio-venda";
import type { VendaResumo } from "@/lib/vendas/painel-vendas";
import { cancelarVendaAction, excluirVendaAction, listarVendasAction, tentarNovamenteEmLoteAction } from "./actions";

function formatarValor(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Badge({ status }: { status: VendaResumo["status"] }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: corEstagio(status) }}
      title={`Estágio: ${rotuloEstagio(status)}`}
    >
      {rotuloEstagio(status)}
    </span>
  );
}

function MenuAcoes({ venda, onMudou }: { venda: VendaResumo; onMudou: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState<{ top: number; right: number } | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [confirmacaoExcluir, setConfirmacaoExcluir] = useState("");
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // O menu é renderizado num portal (abaixo) em vez de dentro da coluna do Kanban — a coluna tem
  // overflow-y-auto pro scroll vertical dos cards, e por regra do CSS (um eixo não-visible força o
  // outro a virar "auto" também) isso corta qualquer coisa que estoure a largura da coluna, tipo
  // este menu de 256px numa coluna estreita. Achado real do Luiz: menu aparecia preso/cortado.
  // Posição calculada a partir do botão (coordenadas de viewport, position: fixed) — funciona
  // igual não importa o quão apertada seja a coluna.
  function alternar() {
    if (aberto) {
      setAberto(false);
      return;
    }
    const rect = botaoRef.current?.getBoundingClientRect();
    if (rect) setPosicao({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setAberto(true);
  }

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(evento: MouseEvent) {
      const alvo = evento.target as Node;
      if (menuRef.current?.contains(alvo) || botaoRef.current?.contains(alvo)) return;
      setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  async function confirmarCancelamento() {
    if (!motivo.trim()) {
      setErro("Descreva o motivo do cancelamento.");
      return;
    }
    const resultado = await cancelarVendaAction(venda.contratoId, motivo.trim());
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    setCancelando(false);
    setAberto(false);
    onMudou();
  }

  async function confirmarExclusao() {
    if (confirmacaoExcluir !== "EXCLUIR") {
      setErro('Digite "EXCLUIR" pra confirmar — essa ação não pode ser desfeita.');
      return;
    }
    const resultado = await excluirVendaAction(venda.contratoId);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onMudou();
  }

  return (
    <div>
      <button
        ref={botaoRef}
        type="button"
        onClick={alternar}
        title="Ações desta venda"
        className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        ⋮
      </button>
      {aberto &&
        posicao &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: posicao.top, right: posicao.right }}
            className="z-50 w-64 space-y-2 rounded-lg border border-zinc-300 bg-white p-3 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          >
            <Link
              href={`/admin/vendas/${venda.oportunidadeId}`}
              className="block rounded px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Detalhes
            </Link>

            {!cancelando ? (
              <button
                type="button"
                onClick={() => setCancelando(true)}
                className="block w-full rounded px-2 py-1 text-left text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950"
              >
                Cancelar venda
              </button>
            ) : (
              <div className="space-y-1 rounded border border-amber-300 p-2 dark:border-amber-700">
                <label className="text-xs text-zinc-600 dark:text-zinc-400">Motivo do cancelamento</label>
                <input
                  className="w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: cliente desistiu antes de assinar"
                />
                <button type="button" onClick={confirmarCancelamento} className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  Confirmar cancelamento
                </button>
              </div>
            )}

            {!excluindo ? (
              <button
                type="button"
                onClick={() => setExcluindo(true)}
                title="Ação restrita — apaga o registro da venda de vez, sem volta"
                className="block w-full rounded px-2 py-1 text-left text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
              >
                Excluir
              </button>
            ) : (
              <div className="space-y-1 rounded border border-red-300 p-2 dark:border-red-700">
                <label className="text-xs text-zinc-600 dark:text-zinc-400">
                  Isso apaga a venda de vez, sem volta. Digite <strong>EXCLUIR</strong> pra confirmar.
                </label>
                <input
                  className="w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                  value={confirmacaoExcluir}
                  onChange={(e) => setConfirmacaoExcluir(e.target.value)}
                />
                <button type="button" onClick={confirmarExclusao} className="text-xs font-medium text-red-700 dark:text-red-400">
                  Excluir definitivamente
                </button>
              </div>
            )}

            {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function PainelVendasClient({ vendasIniciais }: { vendasIniciais: VendaResumo[] }) {
  const [vendas, setVendas] = useState(vendasIniciais);
  const [visao, setVisao] = useState<"lista" | "kanban">("kanban");

  const recarregar = useCallback(async () => {
    const recarregadas = await listarVendasAction();
    setVendas(recarregadas);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel("painel-vendas")
      .on("postgres_changes", { event: "*", schema: "public", table: "contratos" }, () => {
        recarregar();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [recarregar]);

  const porEstagio = useMemo(() => {
    const mapa = new Map(ESTAGIOS_VENDA.map((e) => [e.valor, [] as VendaResumo[]]));
    for (const venda of vendas) mapa.get(venda.status)?.push(venda);
    return mapa;
  }, [vendas]);

  return (
    <div className="space-y-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Painel de Vendas</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-zinc-300 text-sm dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setVisao("lista")}
              title="Ver como lista"
              className={`px-3 py-1.5 ${visao === "lista" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 dark:text-zinc-400"}`}
            >
              Lista
            </button>
            <button
              type="button"
              onClick={() => setVisao("kanban")}
              title="Ver como Kanban"
              className={`px-3 py-1.5 ${visao === "kanban" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 dark:text-zinc-400"}`}
            >
              Kanban
            </button>
          </div>
          <Link
            href="/admin/vendas/nova-oportunidade"
            title="Cadastrar uma oportunidade sem passar pelo funil de atendimento"
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            + Nova Oportunidade
          </Link>
        </div>
      </div>

      {vendas.length === 0 && <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma venda em andamento ainda.</p>}

      {visao === "lista" && vendas.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-left text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              <th className="py-2">Cliente</th>
              <th className="py-2">Serviço</th>
              <th className="py-2">Valor</th>
              <th className="py-2">Estágio</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {vendas.map((venda) => (
              <tr key={venda.contratoId} className="border-b border-zinc-200 dark:border-zinc-800">
                <td className="py-2">
                  {venda.pessoaNome} <span className="text-xs text-zinc-500 dark:text-zinc-400">({venda.pessoaDocumento})</span>
                </td>
                <td className="py-2">{venda.produtoNome}</td>
                <td className="py-2">{formatarValor(venda.valorTotal)}</td>
                <td className="py-2">
                  <Badge status={venda.status} />
                </td>
                <td className="py-2 text-right">
                  <MenuAcoes venda={venda} onMudou={recarregar} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {visao === "kanban" && vendas.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {ESTAGIOS_VENDA
            // Etapas transitórias (Emitindo Contrato/Gerando Financeiro) só aparecem como coluna
            // quando têm ao menos 1 card — pedido do Luiz, 21/08/2026: são etapas automáticas que
            // deveriam ser instantâneas, então uma coluna sempre visível ficaria quase sempre vazia
            // à toa; a coluna aparecendo já é o sinal de que algo travou. As demais (esperas humanas
            // genuínas + terminais) continuam sempre visíveis, mesmo vazias.
            .filter((estagio) => !ehEstagioTransitorio(estagio.valor) || (porEstagio.get(estagio.valor)?.length ?? 0) > 0)
            .map((estagio) => (
            <div
              key={estagio.valor}
              className="flex w-64 shrink-0 flex-col divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-zinc-50 text-xs shadow-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center gap-2 p-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: estagio.cor }} />
                <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300" title={estagio.rotulo}>
                  {estagio.rotulo} ({porEstagio.get(estagio.valor)?.length ?? 0})
                </h2>
                {(porEstagio.get(estagio.valor) ?? []).some((v) => v.ultimoErro) && (
                  <button
                    type="button"
                    onClick={async () => {
                      await tentarNovamenteEmLoteAction(estagio.valor);
                      recarregar();
                    }}
                    className="ml-auto text-xs text-amber-700 underline dark:text-amber-400"
                  >
                    Tentar novamente todos
                  </button>
                )}
              </div>
              <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-2">
                {(porEstagio.get(estagio.valor) ?? []).map((venda) => (
                  <div
                    key={venda.contratoId}
                    className={`rounded-md border p-3 shadow-sm ${
                      venda.ultimoErro
                        ? "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950"
                        : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <Link href={`/admin/vendas/${venda.oportunidadeId}`} className="font-medium text-zinc-900 hover:underline dark:text-zinc-50">
                        {venda.pessoaNome}
                      </Link>
                      <MenuAcoes venda={venda} onMudou={recarregar} />
                    </div>
                    <p className="text-zinc-500 dark:text-zinc-400">{venda.produtoNome}</p>
                    <p className="mt-1 font-medium text-zinc-700 dark:text-zinc-300">{formatarValor(venda.valorTotal)}</p>
                    {venda.ultimoErro && (
                      <p className="mt-1 line-clamp-2 text-red-700 dark:text-red-400" title={venda.ultimoErro}>
                        ⚠ {venda.ultimoErro}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
