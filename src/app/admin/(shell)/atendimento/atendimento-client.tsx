"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConversaDetalhe,
  ConversaResumo,
  FiltroConversas,
  UsuarioSistema,
} from "@/lib/motor-fluxo/repositorio-atendimento";
import {
  assumirConversaAction,
  atribuirParaMalalaAction,
  carregarConversaAction,
  enviarMensagemAction,
  listarConversasAction,
} from "./actions";

// Tela de Atendimento, Bloco A (fundação) — ver docs/TELA_ATENDIMENTO_ARRUDACRED.md. Simplificações
// conscientes deste primeiro bloco, registradas lá: "não lida" é só "última mensagem é do lead" (sem
// granularidade por atendente ainda); atualização é por polling simples (4s), não Supabase Realtime;
// um card só mostra o produto/etapa da oportunidade ligada à conversa (agregação de múltiplos
// produtos por pessoa fica pro Bloco D); composer libera pra qualquer humano quando a conversa está
// sob supervisão, não só pra quem assumiu (a config de "assumir de outro humano" ainda não existe).

const INTERVALO_POLLING_MS = 4000;

type FiltroRotulo = { chave: string; rotulo: string; filtro: FiltroConversas };

function formatarHora(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatarTelefone(telefone: string | null): string {
  if (!telefone) return "";
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10) return telefone;
  const ddd = digitos.slice(2, 4);
  const resto = digitos.slice(4);
  const meio = resto.length > 4 ? resto.slice(0, -4) : resto;
  const fim = resto.length > 4 ? resto.slice(-4) : "";
  return `(${ddd}) ${meio}${fim ? "-" + fim : ""}`;
}

export function AtendimentoClient({
  usuarioAtual,
  atendentes,
  conversasIniciais,
}: {
  usuarioAtual: UsuarioSistema;
  atendentes: UsuarioSistema[];
  conversasIniciais: ConversaResumo[];
}) {
  const [filtroChave, setFiltroChave] = useState("tudo");
  const [busca, setBusca] = useState("");
  const [conversas, setConversas] = useState(conversasIniciais);
  const [conversaSelecionadaId, setConversaSelecionadaId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<ConversaDetalhe | null>(null);
  const [textoComposer, setTextoComposer] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const filtros: FiltroRotulo[] = [
    { chave: "tudo", rotulo: "Tudo", filtro: { tipo: "tudo" } },
    { chave: "malala", rotulo: "Malala", filtro: { tipo: "malala" } },
    { chave: "minhas", rotulo: "Minhas", filtro: { tipo: "minhas", usuarioId: usuarioAtual.id } },
    ...atendentes
      .filter((a) => a.id !== usuarioAtual.id)
      .map((a): FiltroRotulo => ({
        chave: `atendente:${a.id}`,
        rotulo: a.nome,
        filtro: { tipo: "atendente", usuarioId: a.id },
      })),
    { chave: "nao_atribuidas", rotulo: "Não atribuídas", filtro: { tipo: "nao_atribuidas" } },
    { chave: "nao_lidas", rotulo: "Não lidas", filtro: { tipo: "nao_lidas" } },
  ];

  const filtroAtual = filtros.find((f) => f.chave === filtroChave)?.filtro ?? { tipo: "tudo" };

  const recarregarLista = useCallback(async () => {
    const resultado = await listarConversasAction(filtroAtual, busca);
    setConversas(resultado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroChave, busca]);

  const recarregarDetalhe = useCallback(async (id: string) => {
    const resultado = await carregarConversaAction(id);
    setDetalhe(resultado);
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => recarregarLista());
  }, [recarregarLista]);

  useEffect(() => {
    if (!conversaSelecionadaId) {
      Promise.resolve().then(() => setDetalhe(null));
      return;
    }
    Promise.resolve().then(() => recarregarDetalhe(conversaSelecionadaId));
  }, [conversaSelecionadaId, recarregarDetalhe]);

  // Polling simples — mantém a lista e a conversa aberta "ao vivo" sem precisar de Realtime ainda.
  useEffect(() => {
    const intervalo = setInterval(() => {
      recarregarLista();
      if (conversaSelecionadaId) recarregarDetalhe(conversaSelecionadaId);
    }, INTERVALO_POLLING_MS);
    return () => clearInterval(intervalo);
  }, [conversaSelecionadaId, recarregarLista, recarregarDetalhe]);

  useEffect(() => {
    timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight });
  }, [detalhe?.mensagens.length]);

  async function handleAssumir() {
    if (!conversaSelecionadaId) return;
    await assumirConversaAction(conversaSelecionadaId);
    await recarregarDetalhe(conversaSelecionadaId);
    await recarregarLista();
  }

  async function handleAtribuirMalala() {
    if (!conversaSelecionadaId) return;
    await atribuirParaMalalaAction(conversaSelecionadaId);
    await recarregarDetalhe(conversaSelecionadaId);
    await recarregarLista();
  }

  async function handleEnviar() {
    if (!conversaSelecionadaId || !detalhe?.pessoaTelefone || !textoComposer.trim()) return;
    setEnviando(true);
    setErroEnvio(null);
    const resultado = await enviarMensagemAction(conversaSelecionadaId, detalhe.pessoaTelefone, textoComposer);
    setEnviando(false);
    if (!resultado.sucesso) {
      setErroEnvio(resultado.erro);
      return;
    }
    setTextoComposer("");
    await recarregarDetalhe(conversaSelecionadaId);
    await recarregarLista();
  }

  const composerHabilitado = detalhe?.sobSupervisor === true;

  return (
    <div className="flex h-screen">
      {/* Painel esquerdo — lista de contatos */}
      <div className="flex w-96 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800">
        <div className="space-y-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone ou mensagem..."
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <div className="flex flex-wrap gap-1.5">
            {filtros.map((f) => (
              <button
                key={f.chave}
                onClick={() => setFiltroChave(f.chave)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  filtroChave === f.chave
                    ? "bg-[#141e33] text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {f.rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversas.length === 0 && (
            <p className="p-4 text-center text-sm text-zinc-500 dark:text-zinc-400">Nenhuma conversa aqui.</p>
          )}
          {conversas.map((c) => (
            <button
              key={c.conversaId}
              onClick={() => setConversaSelecionadaId(c.conversaId)}
              className={`flex w-full flex-col gap-1 border-b border-zinc-100 px-3 py-2.5 text-left dark:border-zinc-900 ${
                conversaSelecionadaId === c.conversaId
                  ? "bg-zinc-100 dark:bg-zinc-800"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`truncate text-sm ${c.naoLida ? "font-semibold text-zinc-900 dark:text-zinc-50" : "text-zinc-700 dark:text-zinc-300"}`}>
                  {c.pessoaNome}
                </span>
                <span className="shrink-0 text-[11px] text-zinc-400">{formatarHora(c.ultimaMensagemEm)}</span>
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{formatarTelefone(c.pessoaTelefone)}</span>
              <div className="flex items-center gap-1">
                <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {c.ultimaMensagemRemetente === "lead" ? "" : "Você: "}
                  {c.ultimaMensagemConteudo || "(sem texto)"}
                </span>
                {c.naoLida && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
              </div>
              <div className="flex flex-wrap gap-1 pt-0.5">
                {c.etapaKanban && (
                  <span className="rounded-full bg-[#c8a55d]/20 px-2 py-0.5 text-[10px] text-[#8a6d34] dark:text-[#e0c07f]">
                    {c.etapaKanban}
                  </span>
                )}
                {c.produtoNome && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {c.produtoNome}
                  </span>
                )}
                {!c.sobSupervisor && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                    Malala
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Painel direito — conversa */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!detalhe ? (
          <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
            Selecione uma conversa
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div>
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">{detalhe.pessoaNome}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatarTelefone(detalhe.pessoaTelefone)}
                  {detalhe.produtoNome && ` · ${detalhe.produtoNome}`}
                  {detalhe.valorEstimado && ` · R$ ${detalhe.valorEstimado.toLocaleString("pt-BR")}`}
                </p>
              </div>
              <div className="flex gap-2">
                {detalhe.sobSupervisor ? (
                  <button
                    onClick={handleAtribuirMalala}
                    className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Atribuir pra Malala
                  </button>
                ) : (
                  <button
                    onClick={handleAssumir}
                    className="rounded-full bg-[#141e33] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    Assumir Chat
                  </button>
                )}
              </div>
            </div>

            <div ref={timelineRef} className="flex-1 space-y-2 overflow-y-auto p-4">
              {detalhe.mensagens.map((m) => {
                const doLead = m.remetente === "lead";
                const cor = doLead
                  ? "bg-emerald-600 text-white"
                  : m.remetente === "supervisor"
                    ? "bg-[#c8a55d] text-[#141e33]"
                    : "bg-white text-zinc-900 shadow dark:bg-zinc-900 dark:text-zinc-50";
                return (
                  <div key={m.id} className={`flex ${doLead ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-md rounded-2xl px-4 py-2 text-sm ${cor}`}>
                      {m.midiaUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- URL arbitrária de mídia trocada na conversa
                        <img src={m.midiaUrl} alt="" className="mb-1 max-w-full rounded-lg" />
                      )}
                      {m.conteudo && <p className="whitespace-pre-wrap">{m.conteudo}</p>}
                      <p className="mt-0.5 text-right text-[10px] opacity-60">{formatarHora(m.enviadoEm)}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
              {erroEnvio && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{erroEnvio}</p>}
              <div className="flex gap-2">
                <input
                  value={textoComposer}
                  onChange={(e) => setTextoComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleEnviar();
                    }
                  }}
                  disabled={!composerHabilitado || enviando}
                  placeholder={composerHabilitado ? "Digite uma mensagem..." : "A Malala está no controle desta conversa"}
                  className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
                <button
                  onClick={handleEnviar}
                  disabled={!composerHabilitado || enviando || !textoComposer.trim()}
                  className="rounded-full bg-[#141e33] px-4 py-2 text-sm text-white disabled:opacity-40"
                >
                  {enviando ? "..." : "Enviar"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
