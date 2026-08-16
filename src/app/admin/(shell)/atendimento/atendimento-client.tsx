"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ContagemNaoLidas,
  ConversaDetalhe,
  ConversaResumo,
  FiltroConversas,
  MensagemConversa,
  NotaInterna,
  Notificacao,
  UsuarioSistema,
} from "@/lib/motor-fluxo/repositorio-atendimento";
import type { AgendaAdmin, RespostaPronta } from "@/lib/motor-fluxo/repositorio-admin";
import {
  alternarFavoritaAction,
  assumirConversaAction,
  ativarFollowupManualAction,
  atribuirParaAtendenteAction,
  atribuirParaMalalaAction,
  carregarConversaAction,
  carregarTextoEtapaScriptAction,
  contarNaoLidasAction,
  contarNotificacoesNaoLidasAction,
  criarNotaAction,
  enviarMensagemAction,
  listarConversasAction,
  listarNotificacoesAction,
  marcarNotificacaoLidaAction,
} from "./actions";
import { resetarConversaAction } from "../reset-conversa/actions";
import { sair } from "../actions";
import { CORES_BADGE, corControlador } from "@/lib/motor-fluxo/cores-atendimento";

// Tela de Atendimento, Bloco A (fundação) — ver docs/TELA_ATENDIMENTO_ARRUDACRED.md. Simplificações
// conscientes deste primeiro bloco, registradas lá: "não lida" é só "última mensagem é do lead" (sem
// granularidade por atendente ainda); atualização é por polling simples (4s), não Supabase Realtime;
// um card só mostra o produto/etapa da oportunidade ligada à conversa (agregação de múltiplos
// produtos por pessoa fica pro Bloco D); composer libera pra qualquer humano quando a conversa está
// sob supervisão, não só pra quem assumiu (a config de "assumir de outro humano" ainda não existe);
// "Humano > Minhas/Não atribuídas/Todas" ainda não distingue outros atendentes específicos por nome
// na barra de filtros (isso volta no Bloco B, junto com atribuição a atendente específico).

const INTERVALO_POLLING_MS = 4000;

type ChaveFiltro =
  | "tudo"
  | "malala"
  | "humano_minhas"
  | "humano_nao_atribuidas"
  | "humano_todas"
  | "nao_lidas"
  | { atendenteId: string };

type ItemTimeline = { tipo: "mensagem"; dado: MensagemConversa } | { tipo: "nota"; dado: NotaInterna };

function filtroPorChave(chave: ChaveFiltro, usuarioId: string): FiltroConversas {
  if (typeof chave === "object") return { tipo: "humano_atendente", atendenteId: chave.atendenteId };
  switch (chave) {
    case "humano_minhas":
      return { tipo: "humano_minhas", usuarioId };
    case "humano_nao_atribuidas":
      return { tipo: "humano_nao_atribuidas" };
    case "humano_todas":
      return { tipo: "humano_todas" };
    case "nao_lidas":
      return { tipo: "nao_lidas" };
    case "malala":
      return { tipo: "malala" };
    default:
      return { tipo: "tudo" };
  }
}

function formatarHora(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Só hora quando a mensagem é de hoje; "DD/MM - HH:MM" quando é de outro dia (card de contato, Bloco B2). */
function formatarHoraOuData(iso: string | null): string {
  if (!iso) return "";
  const data = new Date(iso);
  const hoje = new Date();
  const mesmoDia =
    data.getFullYear() === hoje.getFullYear() && data.getMonth() === hoje.getMonth() && data.getDate() === hoje.getDate();
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (mesmoDia) return hora;
  const dataCurta = data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${dataCurta} - ${hora}`;
}

function iniciais(nome: string): string {
  return nome.trim().charAt(0).toUpperCase() || "?";
}

/** ✓ cinza (enviado) / ✓✓ cinza (entregue) / ✓✓ azul (lido) — só faz sentido pra mensagens nossas (não do lead). */
function IconeStatusEntrega({ entregueEm, lidoEm }: { entregueEm: string | null; lidoEm: string | null }) {
  if (lidoEm) return <span className="text-[13px] text-blue-500" title="Lido">✓✓</span>;
  if (entregueEm) return <span className="text-[13px] text-zinc-400" title="Entregue">✓✓</span>;
  return <span className="text-[13px] text-zinc-400" title="Enviado">✓</span>;
}

/** Rótulo curto tipo "em ~10 min" / "em ~4h" / "amanhã" — usado no chip de follow-up ativo, não precisa de precisão de segundo (o polling de 4s já mantém isso razoavelmente fresco). */
function formatarTempoRelativo(iso: string | null): string {
  if (!iso) return "";
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return "a qualquer momento";
  const min = Math.round(diffMs / 60_000);
  if (min < 60) return `em ~${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `em ~${horas}h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "amanhã" : `em ~${dias} dias`;
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

function Contador({ valor }: { valor: number | undefined }) {
  if (!valor) return null;
  return (
    <span className="ml-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white">
      {valor > 99 ? "99+" : valor}
    </span>
  );
}

function BotaoFiltro({
  rotulo,
  ativo,
  contador,
  onClick,
}: {
  rotulo: string;
  ativo: boolean;
  contador: number | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
        ativo
          ? "bg-[#141e33] text-white"
          : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      }`}
    >
      {rotulo}
      <Contador valor={contador} />
    </button>
  );
}

function ItemSubmenu({
  rotulo,
  contador,
  onClick,
}: {
  rotulo: string;
  contador: number | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {rotulo}
      <Contador valor={contador} />
    </button>
  );
}

/**
 * Menu de atribuição (Malala / mim / atendente específico) — usado tanto como o botão "Atribuir
 * a..." do cabeçalho da conversa aberta quanto como o "⋮" de ações rápidas do card na lista (Fase
 * 3 do Bloco B, reaproveita a Fase 2). `stopPropagation` em tudo porque, no card, este menu vive
 * dentro da linha inteira que também tem onClick pra selecionar a conversa — sem isso, abrir o
 * menu ou escolher uma opção também "clicaria" no card por baixo.
 */
function DropdownAtribuir({
  atendentes,
  usuarioAtualId,
  onEscolherMalala,
  onEscolherAtendente,
  compacto = false,
  favorita,
  onAlternarFavorita,
}: {
  atendentes: UsuarioSistema[];
  usuarioAtualId: string;
  onEscolherMalala: () => void;
  onEscolherAtendente: (atendenteId: string) => void;
  compacto?: boolean;
  favorita?: boolean;
  onAlternarFavorita?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        title={compacto ? "Ações rápidas" : undefined}
        className={
          compacto
            ? "flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 dark:text-zinc-500 dark:hover:bg-zinc-700"
            : "rounded-full bg-[#141e33] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        }
      >
        {compacto ? "⋮" : "Atribuir a... ▾"}
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => {
                onEscolherMalala();
                setAberto(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <span className="h-4 w-4 rounded-full bg-violet-100 dark:bg-violet-900" />
              Malala
            </button>
            {atendentes.map((atendente) => (
              <button
                key={atendente.id}
                type="button"
                onClick={() => {
                  onEscolherAtendente(atendente.id);
                  setAberto(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <span className={`h-4 w-4 rounded-full ${CORES_BADGE[atendente.corBadge].bg}`} />
                {atendente.id === usuarioAtualId ? "Mim" : atendente.nome}
              </button>
            ))}
            {onAlternarFavorita && (
              <>
                <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                <button
                  type="button"
                  onClick={() => {
                    onAlternarFavorita();
                    setAberto(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {favorita ? "☆ Desfavoritar" : "⭐ Favoritar"}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function renderizarTextoComMencoes(texto: string, atendentes: UsuarioSistema[]) {
  const partes = texto.split(/(@\w+)/g);
  return partes.map((parte, i) => {
    if (parte.startsWith("@")) {
      const nomeBuscado = parte.slice(1).toLowerCase();
      const atendente = atendentes.find((a) => a.nome.split(" ")[0].toLowerCase() === nomeBuscado);
      if (atendente) {
        const tom = CORES_BADGE[atendente.corBadge];
        return (
          <span key={i} className={`rounded px-1 font-medium ${tom.bg} ${tom.texto}`}>
            {parte}
          </span>
        );
      }
    }
    return <span key={i}>{parte}</span>;
  });
}

function MenuAcoesCabecalho({ telefone, onResetar }: { telefone: string | null; onResetar: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function copiarTelefone() {
    if (!telefone) return;
    await navigator.clipboard.writeText(telefone);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        title="Mais ações"
        className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        ⋮
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <button
              type="button"
              onClick={copiarTelefone}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              📋 {copiado ? "Copiado!" : "Copiar telefone"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAberto(false);
                onResetar();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              🗑️ Resetar conversa
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SinoNotificacoes({
  usuarioId,
  onAbrirConversa,
}: {
  usuarioId: string;
  onAbrirConversa: (conversaId: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);

  const recarregar = useCallback(async () => {
    const [lista, contagem] = await Promise.all([
      listarNotificacoesAction(usuarioId),
      contarNotificacoesNaoLidasAction(usuarioId),
    ]);
    setNotificacoes(lista);
    setNaoLidas(contagem);
  }, [usuarioId]);

  useEffect(() => {
    Promise.resolve().then(() => recarregar());
    const intervalo = setInterval(recarregar, INTERVALO_POLLING_MS);
    return () => clearInterval(intervalo);
  }, [recarregar]);

  async function abrirNotificacao(n: Notificacao) {
    if (!n.lida) await marcarNotificacaoLidaAction(n.id);
    setAberto(false);
    onAbrirConversa(n.conversaId);
    recarregar();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        title="Notificações"
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        🔔
        {naoLidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute left-0 z-20 mt-1 max-h-96 w-72 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            {notificacoes.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-zinc-400">Nenhuma notificação ainda.</p>
            )}
            {notificacoes.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => abrirNotificacao(n)}
                className={`flex w-full flex-col gap-0.5 border-b border-zinc-100 px-3 py-2 text-left text-xs hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800 ${
                  n.lida ? "opacity-60" : ""
                }`}
              >
                <span className="text-zinc-700 dark:text-zinc-300">
                  {n.tipo === "mencao"
                    ? `📝 Você foi mencionado numa nota de ${n.pessoaNome}`
                    : `👤 ${n.pessoaNome} foi atribuída a você`}
                </span>
                <span className="text-[10px] text-zinc-400">{formatarHora(n.criadoEm)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BarraUsuarioAtual({ usuarioAtual }: { usuarioAtual: UsuarioSistema }) {
  const [aberto, setAberto] = useState(false);
  const tom = CORES_BADGE[usuarioAtual.corBadge];

  return (
    <div className="flex items-center justify-end border-b border-zinc-200 bg-white px-4 py-1.5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="relative">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${tom.bg} ${tom.texto}`}
          >
            {usuarioAtual.nome.charAt(0).toUpperCase()}
          </span>
          <span className="text-sm text-zinc-700 dark:text-zinc-300">{usuarioAtual.nome}</span>
        </button>
        {aberto && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
            <div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              <form action={sair}>
                <button
                  type="submit"
                  className="flex w-full items-center px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Sair
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function AtendimentoClient({
  usuarioAtual,
  conversasIniciais,
  contagensIniciais,
  atendentesIniciais,
  respostasProntasIniciais,
  agendasFollowupIniciais,
}: {
  usuarioAtual: UsuarioSistema;
  conversasIniciais: ConversaResumo[];
  contagensIniciais: ContagemNaoLidas;
  atendentesIniciais: UsuarioSistema[];
  respostasProntasIniciais: RespostaPronta[];
  agendasFollowupIniciais: AgendaAdmin[];
}) {
  const [filtroChave, setFiltroChave] = useState<ChaveFiltro>("tudo");
  const [menuHumanoAberto, setMenuHumanoAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [conversas, setConversas] = useState(conversasIniciais);
  const [contagens, setContagens] = useState<ContagemNaoLidas>(contagensIniciais);
  const [conversaSelecionadaId, setConversaSelecionadaId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<ConversaDetalhe | null>(null);
  const [textoComposer, setTextoComposer] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [painelContatoAberto, setPainelContatoAberto] = useState(true);
  const [confirmandoReset, setConfirmandoReset] = useState(false);
  const [resetando, setResetando] = useState(false);
  const [buscaConversaAberta, setBuscaConversaAberta] = useState(false);
  const [termoBuscaConversa, setTermoBuscaConversa] = useState("");
  const [indiceResultado, setIndiceResultado] = useState(0);
  const [modalFollowupPendente, setModalFollowupPendente] = useState<{
    conversaId: string;
    proximoId: string | null;
    agendaId: string;
  } | null>(null);
  const [ativandoFollowup, setAtivandoFollowup] = useState(false);
  const recusadosFollowupRef = useRef<Set<string>>(new Set());
  const timelineRef = useRef<HTMLDivElement>(null);

  const itensTimeline = useMemo<ItemTimeline[]>(() => {
    if (!detalhe) return [];
    const msgs: ItemTimeline[] = detalhe.mensagens.map((m) => ({ tipo: "mensagem", dado: m }));
    const notas: ItemTimeline[] = detalhe.notas.map((n) => ({ tipo: "nota", dado: n }));
    return [...msgs, ...notas].sort((a, b) => {
      const ta = a.tipo === "mensagem" ? a.dado.enviadoEm : a.dado.criadoEm;
      const tb = b.tipo === "mensagem" ? b.dado.enviadoEm : b.dado.criadoEm;
      return ta.localeCompare(tb);
    });
  }, [detalhe]);

  const resultadosBusca = useMemo(() => {
    const termo = termoBuscaConversa.trim().toLowerCase();
    if (!termo || !detalhe) return [];
    return detalhe.mensagens.filter((m) => m.conteudo?.toLowerCase().includes(termo));
  }, [termoBuscaConversa, detalhe]);

  useEffect(() => {
    const alvo = resultadosBusca[indiceResultado];
    if (!alvo) return;
    document.getElementById(`mensagem-${alvo.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [indiceResultado, resultadosBusca]);

  function irParaResultadoAnterior() {
    if (resultadosBusca.length === 0) return;
    setIndiceResultado((i) => (i - 1 + resultadosBusca.length) % resultadosBusca.length);
  }

  function irParaProximoResultado() {
    if (resultadosBusca.length === 0) return;
    setIndiceResultado((i) => (i + 1) % resultadosBusca.length);
  }

  function fecharBuscaConversa() {
    setBuscaConversaAberta(false);
    setTermoBuscaConversa("");
  }

  const recarregarLista = useCallback(async () => {
    const resultado = await listarConversasAction(filtroPorChave(filtroChave, usuarioAtual.id), busca);
    setConversas(resultado);
  }, [filtroChave, busca, usuarioAtual.id]);

  const recarregarContagens = useCallback(async () => {
    const resultado = await contarNaoLidasAction(usuarioAtual.id);
    setContagens(resultado);
  }, [usuarioAtual.id]);

  const recarregarDetalhe = useCallback(async (id: string) => {
    const resultado = await carregarConversaAction(id);
    setDetalhe(resultado);
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => recarregarLista());
  }, [recarregarLista]);

  useEffect(() => {
    Promise.resolve().then(() => recarregarContagens());
  }, [recarregarContagens]);

  useEffect(() => {
    if (!conversaSelecionadaId) {
      Promise.resolve().then(() => setDetalhe(null));
      return;
    }
    Promise.resolve().then(() => recarregarDetalhe(conversaSelecionadaId));
  }, [conversaSelecionadaId, recarregarDetalhe]);

  // Polling simples — mantém a lista, os badges e a conversa aberta "ao vivo" sem precisar de Realtime ainda.
  useEffect(() => {
    const intervalo = setInterval(() => {
      recarregarLista();
      recarregarContagens();
      if (conversaSelecionadaId) recarregarDetalhe(conversaSelecionadaId);
    }, INTERVALO_POLLING_MS);
    return () => clearInterval(intervalo);
  }, [conversaSelecionadaId, recarregarLista, recarregarContagens, recarregarDetalhe]);

  useEffect(() => {
    timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight });
  }, [detalhe?.mensagens.length]);

  function selecionarFiltro(chave: ChaveFiltro) {
    setFiltroChave(chave);
    setMenuHumanoAberto(false);
  }

  // Recebem o conversaId explícito (não presumem "a conversa aberta") pra servir tanto o dropdown
  // do cabeçalho (age sobre conversaSelecionadaId) quanto o "⋮" do card na lista (age sobre
  // qualquer card, aberto ou não — Fase 3 do Bloco B).
  async function assumir(conversaId: string) {
    await assumirConversaAction(conversaId);
    if (conversaId === conversaSelecionadaId) await recarregarDetalhe(conversaId);
    await recarregarLista();
    await recarregarContagens();
  }

  async function atribuirMalala(conversaId: string) {
    await atribuirParaMalalaAction(conversaId);
    if (conversaId === conversaSelecionadaId) await recarregarDetalhe(conversaId);
    await recarregarLista();
    await recarregarContagens();
  }

  async function atribuirAtendente(conversaId: string, atendenteId: string) {
    await atribuirParaAtendenteAction(conversaId, atendenteId);
    if (conversaId === conversaSelecionadaId) await recarregarDetalhe(conversaId);
    await recarregarLista();
    await recarregarContagens();
  }

  async function alternarFavorita(conversaId: string, favoritaAtual: boolean) {
    await alternarFavoritaAction(conversaId, !favoritaAtual);
    await recarregarLista();
  }

  async function confirmarReset() {
    if (!detalhe?.pessoaTelefone) return;
    setResetando(true);
    await resetarConversaAction(detalhe.pessoaTelefone);
    setResetando(false);
    setConfirmandoReset(false);
    setConversaSelecionadaId(null);
    await recarregarLista();
    await recarregarContagens();
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
    await recarregarContagens();
  }

  const [modoComposer, setModoComposer] = useState<"mensagem" | "nota">("mensagem");
  const [enviandoNota, setEnviandoNota] = useState(false);

  const [menuRespostasAberto, setMenuRespostasAberto] = useState(false);

  const sugestoesRespostas = useMemo(() => {
    if (modoComposer !== "mensagem") return [];
    if (textoComposer.startsWith("/")) {
      const termo = textoComposer.slice(1).toLowerCase();
      return respostasProntasIniciais.filter((r) => r.atalho.toLowerCase().includes(termo));
    }
    return menuRespostasAberto ? respostasProntasIniciais : [];
  }, [modoComposer, textoComposer, respostasProntasIniciais, menuRespostasAberto]);

  function inserirRespostaPronta(resposta: RespostaPronta) {
    setTextoComposer(resposta.texto);
    setMenuRespostasAberto(false);
  }

  const [carregandoProximaEtapa, setCarregandoProximaEtapa] = useState(false);
  const [avisoProximaEtapa, setAvisoProximaEtapa] = useState<string | null>(null);

  async function handleUsarProximaEtapa() {
    if (!detalhe?.etapaFluxoAtualId) return;
    setAvisoProximaEtapa(null);
    setCarregandoProximaEtapa(true);
    const texto = await carregarTextoEtapaScriptAction(detalhe.etapaFluxoAtualId);
    setCarregandoProximaEtapa(false);
    if (texto) setTextoComposer(texto);
    else setAvisoProximaEtapa("Esta etapa do script não tem mensagem de texto pra reaproveitar.");
  }

  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [menuAcoesAberto, setMenuAcoesAberto] = useState(false);
  const [emojiAberto, setEmojiAberto] = useState(false);

  /** Campo cresce com o texto (1 linha → ~10 linhas, empurrando a timeline pra cima) e depois disso vira scroll interno — WhatsApp Web, pedido do Luiz (Bloco B2, 17/08/2026). */
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const ALTURA_LINHA_PX = 20;
    const MAX_LINHAS = 10;
    el.style.height = "auto";
    const alturaMax = ALTURA_LINHA_PX * MAX_LINHAS + 16;
    const alturaAlvo = Math.min(el.scrollHeight, alturaMax);
    el.style.height = `${alturaAlvo}px`;
    el.style.overflowY = el.scrollHeight > alturaMax ? "auto" : "hidden";
  }, [textoComposer]);

  function inserirNoComposer(trecho: string) {
    const el = composerRef.current;
    const posicao = el?.selectionStart ?? textoComposer.length;
    const novoTexto = textoComposer.slice(0, posicao) + trecho + textoComposer.slice(posicao);
    setTextoComposer(novoTexto);
    Promise.resolve().then(() => {
      el?.focus();
      el?.setSelectionRange(posicao + trecho.length, posicao + trecho.length);
    });
  }

  const EMOJIS_COMPOSER = [
    "😀", "😂", "😊", "😍", "🙏", "👍", "👏", "🎉", "❤️", "😢", "😮", "🤔",
    "✅", "❌", "🙌", "🔥", "💪", "😴", "😅", "🥳", "😉", "🤝", "📌", "⏰",
  ];

  /**
   * Troca de conversa "de verdade" — intercepta quando a conversa que está sendo deixada tem uma
   * mensagem nossa (não da Malala/simulador — daqui só passa quem é humano de verdade) sem
   * resposta do lead e ainda não tem follow-up ativo: pergunta antes de sair (modal), em vez de
   * trocar direto. Todo clique que muda `conversaSelecionadaId` (card da lista, sino) passa por
   * aqui — só o fluxo de resetar conversa (linha ~540) troca direto, de propósito.
   */
  function selecionarConversa(novoId: string | null) {
    const podeAparecerPrompt =
      conversaSelecionadaId &&
      conversaSelecionadaId !== novoId &&
      detalhe &&
      detalhe.conversaId === conversaSelecionadaId &&
      !detalhe.followupAtivo &&
      !recusadosFollowupRef.current.has(conversaSelecionadaId) &&
      detalhe.mensagens.length > 0 &&
      detalhe.mensagens[detalhe.mensagens.length - 1].remetente !== "lead";

    if (podeAparecerPrompt) {
      const agendaPadraoId =
        agendasFollowupIniciais.find((a) => a.nome === "Padrão")?.id ?? agendasFollowupIniciais[0]?.id ?? "";
      setModalFollowupPendente({ conversaId: conversaSelecionadaId as string, proximoId: novoId, agendaId: agendaPadraoId });
      return;
    }
    setConversaSelecionadaId(novoId);
  }

  async function confirmarFollowupModal(ativar: boolean) {
    if (!modalFollowupPendente) return;
    if (ativar && modalFollowupPendente.agendaId) {
      setAtivandoFollowup(true);
      await ativarFollowupManualAction(modalFollowupPendente.conversaId, modalFollowupPendente.agendaId);
      setAtivandoFollowup(false);
    } else {
      recusadosFollowupRef.current.add(modalFollowupPendente.conversaId);
    }
    const proximoId = modalFollowupPendente.proximoId;
    setModalFollowupPendente(null);
    setConversaSelecionadaId(proximoId);
  }

  async function handleSalvarNota() {
    if (!conversaSelecionadaId || !textoComposer.trim()) return;
    setEnviandoNota(true);
    const resultado = await criarNotaAction(conversaSelecionadaId, textoComposer);
    setEnviandoNota(false);
    if (resultado.sucesso) {
      setTextoComposer("");
      await recarregarDetalhe(conversaSelecionadaId);
    }
  }

  const composerHabilitado = detalhe?.sobSupervisor === true;
  const tomConversa = detalhe
    ? corControlador({ sobSupervisor: detalhe.sobSupervisor, atendenteCor: detalhe.atendenteCor })
    : null;
  const humanoAtivo =
    filtroChave === "humano_minhas" ||
    filtroChave === "humano_nao_atribuidas" ||
    filtroChave === "humano_todas" ||
    typeof filtroChave === "object";

  return (
    <>
    <div className="flex h-screen flex-col">
    <BarraUsuarioAtual usuarioAtual={usuarioAtual} />
    <div className="flex min-h-0 flex-1">
      {/* Painel esquerdo — lista de contatos */}
      <div className="flex w-96 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800">
        <div className="space-y-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, telefone ou mensagem..."
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <SinoNotificacoes usuarioId={usuarioAtual.id} onAbrirConversa={(conversaId) => selecionarConversa(conversaId)} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <BotaoFiltro rotulo="Tudo" ativo={filtroChave === "tudo"} contador={contagens.tudo} onClick={() => selecionarFiltro("tudo")} />
            <BotaoFiltro rotulo="Malala" ativo={filtroChave === "malala"} contador={contagens.malala} onClick={() => selecionarFiltro("malala")} />

            <div className="relative">
              <BotaoFiltro
                rotulo="Humano ▾"
                ativo={humanoAtivo}
                contador={contagens.humanoTodas}
                onClick={() => setMenuHumanoAberto((v) => !v)}
              />
              {menuHumanoAberto && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuHumanoAberto(false)} />
                  <div className="absolute left-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                    <ItemSubmenu rotulo="Minhas" contador={contagens.humanoMinhas} onClick={() => selecionarFiltro("humano_minhas")} />
                    <ItemSubmenu
                      rotulo="Não atribuídas"
                      contador={contagens.humanoNaoAtribuidas}
                      onClick={() => selecionarFiltro("humano_nao_atribuidas")}
                    />
                    <ItemSubmenu rotulo="Todas" contador={contagens.humanoTodas} onClick={() => selecionarFiltro("humano_todas")} />
                    {atendentesIniciais
                      .filter((a) => a.id !== usuarioAtual.id)
                      .map((atendente) => (
                        <ItemSubmenu
                          key={atendente.id}
                          rotulo={atendente.nome}
                          contador={contagens.porAtendente[atendente.id]}
                          onClick={() => selecionarFiltro({ atendenteId: atendente.id })}
                        />
                      ))}
                  </div>
                </>
              )}
            </div>

            <BotaoFiltro rotulo="Não lidas" ativo={filtroChave === "nao_lidas"} contador={contagens.tudo} onClick={() => selecionarFiltro("nao_lidas")} />

            <button
              type="button"
              disabled
              title="Em breve"
              className="cursor-not-allowed rounded-full bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600"
            >
              + Filtros
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversas.length === 0 && (
            <p className="p-4 text-center text-sm text-zinc-500 dark:text-zinc-400">Nenhuma conversa aqui.</p>
          )}
          {conversas.map((c) => {
            const tom = corControlador({ sobSupervisor: c.sobSupervisor, atendenteCor: c.atendenteCor });
            const rotuloAtendente = !c.sobSupervisor ? "Malala" : (c.atendenteNome ?? "Não atribuída");
            const naoLida = c.naoLidasContagem > 0;
            const nomeOuTelefone = c.nomeConhecido ? c.pessoaNome : formatarTelefone(c.pessoaTelefone) || c.pessoaNome;
            const nossaMensagem = c.ultimaMensagemRemetente !== null && c.ultimaMensagemRemetente !== "lead";
            return (
              <div
                key={c.conversaId}
                role="button"
                tabIndex={0}
                onClick={() => selecionarConversa(c.conversaId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") selecionarConversa(c.conversaId);
                }}
                className={`flex w-full cursor-pointer flex-col gap-2 border-b border-zinc-100 px-3 py-2.5 text-left dark:border-zinc-900 ${
                  conversaSelecionadaId === c.conversaId
                    ? "bg-zinc-100 dark:bg-zinc-800"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                }`}
              >
                <div className="flex gap-2.5">
                  <div className="relative shrink-0">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium ${tom.bg} ${tom.texto}`}
                    >
                      {c.nomeConhecido ? iniciais(c.pessoaNome) : "☎"}
                    </div>
                    {c.favorita && (
                      <span className="absolute -left-1 -top-1 text-[11px]" title="Favorita">
                        ⭐
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={`truncate text-sm ${naoLida ? "font-semibold text-zinc-900 dark:text-zinc-50" : "font-normal text-zinc-700 dark:text-zinc-300"}`}
                      >
                        {nomeOuTelefone}
                        {c.nomeConhecido && (
                          <span className="ml-1 text-[11px] font-normal text-zinc-400">
                            {formatarTelefone(c.pessoaTelefone)}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] text-zinc-400">{formatarHoraOuData(c.ultimaMensagemEm)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="truncate text-xs font-normal text-zinc-500 dark:text-zinc-400">
                        {nossaMensagem ? "Você: " : ""}
                        {c.ultimaMensagemConteudo || "(sem texto)"}
                      </span>
                      <span className="ml-auto flex shrink-0 items-center gap-1">
                        {nossaMensagem && (
                          <IconeStatusEntrega entregueEm={c.ultimaMensagemEntregueEm} lidoEm={c.ultimaMensagemLidoEm} />
                        )}
                        {naoLida && (
                          <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[11px] font-semibold text-white">
                            {c.naoLidasContagem > 99 ? "99+" : c.naoLidasContagem}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${tom.bg} ${tom.texto}`}>
                    <span aria-hidden="true">👤</span>
                    {rotuloAtendente}
                  </span>
                  {c.etapaKanban && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#c8a55d]/20 px-2 py-0.5 text-[10px] text-[#8a6d34] dark:text-[#e0c07f]">
                      <span aria-hidden="true">📋</span>
                      {c.etapaKanban}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {c.produtoNome && (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        <span aria-hidden="true">🏷</span>
                        {c.produtoNomeReduzido || c.produtoNome}
                      </span>
                      {c.valorEstimado != null && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                          <span aria-hidden="true">💲</span>
                          R$ {c.valorEstimado.toLocaleString("pt-BR")}
                        </span>
                      )}
                    </>
                  )}
                  <DropdownAtribuir
                    compacto
                    atendentes={atendentesIniciais}
                    usuarioAtualId={usuarioAtual.id}
                    onEscolherMalala={() => atribuirMalala(c.conversaId)}
                    onEscolherAtendente={(atendenteId) =>
                      atendenteId === usuarioAtual.id
                        ? assumir(c.conversaId)
                        : atribuirAtendente(c.conversaId, atendenteId)
                    }
                    favorita={c.favorita}
                    onAlternarFavorita={() => alternarFavorita(c.conversaId, c.favorita)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Painel direito — conversa + dados do contato */}
      <div className="flex min-w-0 flex-1">
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
                <button
                  type="button"
                  onClick={() => setBuscaConversaAberta((v) => !v)}
                  title="Buscar nesta conversa"
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                    buscaConversaAberta ? "bg-zinc-200 dark:bg-zinc-700" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  🔍
                </button>
                <button
                  type="button"
                  onClick={() => setPainelContatoAberto((v) => !v)}
                  title="Dados do contato e da oportunidade"
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                    painelContatoAberto ? "bg-zinc-200 dark:bg-zinc-700" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  👤
                </button>
                <DropdownAtribuir
                  atendentes={atendentesIniciais}
                  usuarioAtualId={usuarioAtual.id}
                  onEscolherMalala={() => conversaSelecionadaId && atribuirMalala(conversaSelecionadaId)}
                  onEscolherAtendente={(atendenteId) => {
                    if (!conversaSelecionadaId) return;
                    if (atendenteId === usuarioAtual.id) assumir(conversaSelecionadaId);
                    else atribuirAtendente(conversaSelecionadaId, atendenteId);
                  }}
                />
                <MenuAcoesCabecalho telefone={detalhe.pessoaTelefone} onResetar={() => setConfirmandoReset(true)} />
              </div>
            </div>

            {detalhe.followupAtivo && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                🕐 Follow-up ativo — próximo envio {formatarTempoRelativo(detalhe.followupProximoEm)}
              </div>
            )}

            {buscaConversaAberta && (
              <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
                <input
                  autoFocus
                  value={termoBuscaConversa}
                  onChange={(e) => {
                    setTermoBuscaConversa(e.target.value);
                    setIndiceResultado(0);
                  }}
                  placeholder="Buscar nesta conversa..."
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
                <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                  {resultadosBusca.length > 0 ? `${indiceResultado + 1} de ${resultadosBusca.length}` : "0 resultados"}
                </span>
                <button
                  type="button"
                  onClick={irParaResultadoAnterior}
                  disabled={resultadosBusca.length === 0}
                  className="rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-800"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={irParaProximoResultado}
                  disabled={resultadosBusca.length === 0}
                  className="rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-800"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={fecharBuscaConversa}
                  className="rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                >
                  ✕
                </button>
              </div>
            )}

            <div ref={timelineRef} className={`flex-1 space-y-2 overflow-y-auto p-4 ${tomConversa?.bg ?? ""}`}>
              {itensTimeline.map((item) => {
                if (item.tipo === "nota") {
                  const nota = item.dado;
                  return (
                    <div
                      key={`nota-${nota.id}`}
                      className="rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm dark:border-amber-500 dark:bg-amber-950/30"
                    >
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-300">📝 {nota.autorNome}</p>
                      <p className="mt-0.5 text-zinc-700 dark:text-zinc-300">
                        {renderizarTextoComMencoes(nota.texto, atendentesIniciais)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-amber-700/70 dark:text-amber-400/70">
                        {formatarHora(nota.criadoEm)} · só a equipe vê
                      </p>
                    </div>
                  );
                }

                const m = item.dado;
                const doLead = m.remetente === "lead";
                const cor = doLead
                  ? "bg-emerald-600 text-white"
                  : m.remetente === "supervisor"
                    ? "bg-[#c8a55d] text-[#141e33]"
                    : "bg-white text-zinc-900 shadow dark:bg-zinc-900 dark:text-zinc-50";
                return (
                  <div key={m.id} id={`mensagem-${m.id}`} className={`flex ${doLead ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-md rounded-2xl px-4 py-2 text-sm ${cor} ${
                        resultadosBusca[indiceResultado]?.id === m.id ? "ring-2 ring-amber-400" : ""
                      }`}
                    >
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
              <div className="mb-2 flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setModoComposer("mensagem")}
                  className={`rounded-full px-3 py-0.5 text-xs font-medium ${
                    modoComposer === "mensagem"
                      ? "bg-[#141e33] text-white"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  Mensagem
                </button>
                <button
                  type="button"
                  onClick={() => setModoComposer("nota")}
                  className={`rounded-full px-3 py-0.5 text-xs font-medium ${
                    modoComposer === "nota"
                      ? "bg-amber-500 text-white"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  Nota interna
                </button>

                <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-700" />

                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setMenuAcoesAberto((v) => !v)}
                    disabled={modoComposer !== "mensagem"}
                    className="rounded-full bg-zinc-100 px-3 py-0.5 text-xs font-medium text-zinc-600 disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-400"
                  >
                    ⚡ Ações ▾
                  </button>
                  {menuAcoesAberto && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuAcoesAberto(false)} />
                      <div className="absolute bottom-full left-0 z-20 mb-1 w-56 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                        {detalhe?.etapaFluxoAtualId && (
                          <button
                            type="button"
                            onClick={() => {
                              setMenuAcoesAberto(false);
                              handleUsarProximaEtapa();
                            }}
                            disabled={!composerHabilitado || carregandoProximaEtapa}
                            title="Preenche o composer com a mensagem que a Malala mandaria a seguir, pra você revisar antes de enviar"
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            ⚡ {carregandoProximaEtapa ? "Carregando..." : "Próxima etapa"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setMenuAcoesAberto(false);
                            setMenuRespostasAberto(true);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          💬 Respostas prontas
                        </button>
                        <button
                          type="button"
                          disabled
                          title="Em breve"
                          className="flex w-full cursor-not-allowed items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-400 dark:text-zinc-600"
                        >
                          📅 Agendar
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  disabled
                  title="Em breve"
                  className="cursor-not-allowed rounded-full bg-zinc-50 px-3 py-0.5 text-xs font-medium text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600"
                >
                  📎 Anexo
                </button>
                <button
                  type="button"
                  disabled
                  title="Em breve"
                  className="cursor-not-allowed rounded-full bg-zinc-50 px-3 py-0.5 text-xs font-medium text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600"
                >
                  🎤 Áudio
                </button>
              </div>
              {avisoProximaEtapa && <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">{avisoProximaEtapa}</p>}
              {erroEnvio && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{erroEnvio}</p>}
              <div className="flex items-end gap-2">
                <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setEmojiAberto((v) => !v)}
                    disabled={modoComposer === "nota" ? enviandoNota : !composerHabilitado || enviando}
                    title="Emoji"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-zinc-500 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    😀
                  </button>
                  {emojiAberto && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setEmojiAberto(false)} />
                      <div className="absolute bottom-full left-0 z-20 mb-1 grid w-56 grid-cols-6 gap-1 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                        {EMOJIS_COMPOSER.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              inserirNoComposer(emoji);
                              setEmojiAberto(false);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded text-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="relative flex-1">
                  {sugestoesRespostas.length > 0 && (
                    <div className="absolute bottom-full left-0 z-20 mb-1 max-h-48 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                      {sugestoesRespostas.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => inserirRespostaPronta(r)}
                          className="flex w-full flex-col gap-0.5 px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">/{r.atalho}</span>
                          <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{r.texto}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    ref={composerRef}
                    rows={1}
                    value={textoComposer}
                    onChange={(e) => setTextoComposer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" || e.shiftKey) return;
                      e.preventDefault();
                      if (modoComposer === "nota") handleSalvarNota();
                      else handleEnviar();
                    }}
                    disabled={modoComposer === "nota" ? enviandoNota : !composerHabilitado || enviando}
                    placeholder={
                      modoComposer === "nota"
                        ? "Escrever nota interna... (@PrimeiroNome pra mencionar)"
                        : composerHabilitado
                          ? 'Digite uma mensagem... ("/" pra respostas prontas)'
                          : "A Malala está no controle desta conversa"
                    }
                    className="w-full resize-none rounded-3xl border border-zinc-300 bg-white px-4 py-2 text-sm leading-5 text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                </div>
                <button
                  onClick={modoComposer === "nota" ? handleSalvarNota : handleEnviar}
                  disabled={
                    modoComposer === "nota"
                      ? enviandoNota || !textoComposer.trim()
                      : !composerHabilitado || enviando || !textoComposer.trim()
                  }
                  className={`rounded-full px-4 py-2 text-sm text-white disabled:opacity-40 ${
                    modoComposer === "nota" ? "bg-amber-500" : "bg-[#141e33]"
                  }`}
                >
                  {modoComposer === "nota" ? (enviandoNota ? "..." : "Salvar nota") : enviando ? "..." : "Enviar"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {painelContatoAberto && detalhe && (
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-zinc-200 p-4 dark:border-zinc-800">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Contato</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{detalhe.pessoaNome}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatarTelefone(detalhe.pessoaTelefone)}</p>
            {detalhe.pessoaEmail && <p className="text-xs text-zinc-500 dark:text-zinc-400">{detalhe.pessoaEmail}</p>}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Oportunidade</p>
            {detalhe.produtoNome && <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{detalhe.produtoNome}</p>}
            {detalhe.etapaKanban && (
              <span className="mt-1 inline-block rounded-full bg-[#c8a55d]/20 px-2 py-0.5 text-[10px] text-[#8a6d34] dark:text-[#e0c07f]">
                {detalhe.etapaKanban}
              </span>
            )}
            {detalhe.valorEstimado != null && (
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                R$ {detalhe.valorEstimado.toLocaleString("pt-BR")}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Atendimento</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  corControlador({ sobSupervisor: detalhe.sobSupervisor, atendenteCor: detalhe.atendenteCor }).bg
                }`}
              />
              {!detalhe.sobSupervisor ? "Malala" : (detalhe.atendenteNome ?? "Não atribuída")}
            </p>
          </div>
        </div>
      )}
    </div>
    </div>
    </div>

    {confirmandoReset && detalhe && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            Resetar a conversa com {detalhe.pessoaNome}?
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Apaga pessoa, oportunidade, conversa e mensagens desse número — ação irreversível. A
            próxima mensagem desse número no WhatsApp começa do zero.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setConfirmandoReset(false)}
              className="rounded-full px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              onClick={confirmarReset}
              disabled={resetando}
              className="rounded-full bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-40"
            >
              {resetando ? "Resetando..." : "Resetar"}
            </button>
          </div>
        </div>
      </div>
    )}

    {modalFollowupPendente && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Ativar follow-up automático?</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            A última mensagem desta conversa é sua e o lead ainda não respondeu. Quer que o sistema retome contato
            automaticamente pela régua abaixo, se ele continuar sem responder?
          </p>
          {agendasFollowupIniciais.length > 0 && (
            <select
              value={modalFollowupPendente.agendaId}
              onChange={(e) => setModalFollowupPendente({ ...modalFollowupPendente, agendaId: e.target.value })}
              className="mt-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            >
              {agendasFollowupIniciais.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => confirmarFollowupModal(false)}
              disabled={ativandoFollowup}
              className="rounded-full px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Não, obrigado
            </button>
            <button
              onClick={() => confirmarFollowupModal(true)}
              disabled={ativandoFollowup || !modalFollowupPendente.agendaId}
              className="rounded-full bg-[#141e33] px-4 py-1.5 text-sm text-white disabled:opacity-40"
            >
              {ativandoFollowup ? "Ativando..." : "Ativar follow-up"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
