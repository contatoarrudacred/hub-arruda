"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Ajuda } from "@/components/marketing/ajuda";
import { decidirProximoHorario } from "@/lib/marketing/agendador";
import type { DadosPautaManual, FunilPauta, MatrizAdmin, PersonaAtiva, PostAgendaAdmin, TipoConteudo } from "@/lib/marketing/tipos";
import { agendarPostAction } from "./agendamento-actions";
import { carregarImagensPostAction, trocarCapaAction, trocarImagemSecundariaAction, type ImagensPost } from "./imagens-actions";
import { criarPautaManualAction, listarMatrizesAtivasAction, listarPersonasParaPautaManualAction } from "./pauta-manual-actions";
import { carregarPostVisualizacaoAction, type PostVisualizacao } from "./visualizar-actions";

type Propriedade = { id: string; nome: string; horariosPublicacao?: string[] };

type ModalAberto =
  | { tipo: "acoes"; postId: string; posicao: { top: number; left: number } }
  | { tipo: "trocar-foto"; postId: string }
  | { tipo: "visualizar-local"; postId: string }
  | { tipo: "agendar"; postId: string; diaFixo?: string };

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400";

const MAX_CHIPS_POR_DIA = 3;
const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;
const NOMES_DIA_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

/**
 * Mesma técnica de `obterMomentoSaoPaulo` (processar-pauta.ts) / `diaISOEmSaoPaulo` (agendador.ts)
 * — repetida aqui (módulo/camada diferente: client component vs. lib de servidor) em vez de
 * extraída pra um util compartilhado, mesmo princípio de não criar abstração cross-módulo já
 * seguido no resto da base.
 */
function diaISOEmSaoPaulo(iso: string): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

function horaEmSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

function paraDiaISO(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Grade de células do mês (7 colunas), incluindo dias do mês anterior/seguinte só pra completar a semana. */
function celulasDoMes(ano: number, mes: number): { diaISO: string; dia: number; noMesAtual: boolean }[] {
  const primeiroDia = new Date(Date.UTC(ano, mes, 1));
  const diaSemanaPrimeiro = primeiroDia.getUTCDay();
  const ultimoDiaMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();

  const celulas: { diaISO: string; dia: number; noMesAtual: boolean }[] = [];
  for (let i = diaSemanaPrimeiro; i > 0; i--) {
    const data = new Date(Date.UTC(ano, mes, 1 - i));
    celulas.push({ diaISO: data.toISOString().slice(0, 10), dia: data.getUTCDate(), noMesAtual: false });
  }
  for (let dia = 1; dia <= ultimoDiaMes; dia++) {
    celulas.push({ diaISO: paraDiaISO(ano, mes, dia), dia, noMesAtual: true });
  }
  while (celulas.length % 7 !== 0) {
    const ultima = new Date(`${celulas[celulas.length - 1].diaISO}T00:00:00Z`);
    const proxima = new Date(ultima.getTime() + 86_400_000);
    celulas.push({ diaISO: proxima.toISOString().slice(0, 10), dia: proxima.getUTCDate(), noMesAtual: false });
  }
  return celulas;
}

// Arrastável só quando "Agendado" (futuro) — post já ao vivo não faz sentido reagendar por drag,
// e um post "Publicado" arrastado pra outro dia não teria efeito nenhum no WordPress.
function BadgePost({ post, onAbrirAcoes }: { post: PostAgendaAdmin; onAbrirAcoes: (postId: string, origem: HTMLElement) => void }) {
  const agendado = Boolean(post.agendadoPara && new Date(post.agendadoPara) > new Date());
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `post:${post.id}`, disabled: !agendado });
  const classe = agendado
    ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  // 21/08/2026, pedido do Luiz: sem a palavra "Agendado" — o relógio já comunica isso, e economiza
  // espaço no chip pro título aparecer mais completo.
  const rotuloBadge = agendado ? `🕐 ${horaEmSaoPaulo(post.agendadoPara!)}` : "Publicado";
  return (
    <span
      ref={agendado ? setNodeRef : undefined}
      className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${classe}`}
      style={agendado ? { opacity: isDragging ? 0.4 : 1 } : undefined}
    >
      {agendado && (
        <span {...listeners} {...attributes} className="shrink-0 cursor-grab touch-none text-zinc-500 dark:text-zinc-400" title="Arrastar pra reagendar">
          ⠿
        </span>
      )}
      {agendado || !post.url ? (
        <span className="truncate" title={post.titulo}>
          {rotuloBadge} · {post.titulo}
        </span>
      ) : (
        <a href={post.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline" title={post.titulo}>
          {rotuloBadge} · {post.titulo}
        </a>
      )}
      <button
        type="button"
        onClick={(e) => onAbrirAcoes(post.id, e.currentTarget)}
        className="shrink-0 rounded px-1 text-zinc-500 hover:bg-black/10 dark:text-zinc-300 dark:hover:bg-white/10"
        title="Ações deste post"
        aria-label="Ações do post"
      >
        ⋯
      </button>
    </span>
  );
}

function CelulaDia({ diaISO, children, className }: { diaISO: string; children: React.ReactNode; className: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `dia:${diaISO}` });
  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}>
      {children}
    </div>
  );
}

function LinhaPendente({ post, onAbrirAcoes }: { post: PostAgendaAdmin; onAbrirAcoes: (postId: string, origem: HTMLElement) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `post:${post.id}` });
  return (
    <tr ref={setNodeRef} style={{ opacity: isDragging ? 0.4 : 1 }} className="align-top text-zinc-800 dark:text-zinc-100">
      <td className="px-4 py-2.5 font-medium">
        <span {...listeners} {...attributes} className="mr-1.5 cursor-grab touch-none text-zinc-400" title="Arrastar pra agendar">
          ⠿
        </span>
        {post.titulo}
      </td>
      <td className="px-4 py-2.5">{new Date(post.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
      <td className="px-4 py-2.5">{post.tentativas}</td>
      <td className="px-4 py-2.5 text-right">
        <button
          type="button"
          onClick={(e) => onAbrirAcoes(post.id, e.currentTarget)}
          className="rounded px-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          title="Ações deste post"
        aria-label="Ações do post"
        >
          ⋯
        </button>
      </td>
    </tr>
  );
}

export function AgendaClient({
  posts,
  pendentes,
  propriedades,
  propriedadeIdSelecionada,
}: {
  posts: PostAgendaAdmin[];
  pendentes: PostAgendaAdmin[];
  propriedades: Propriedade[];
  propriedadeIdSelecionada: string;
}) {
  const router = useRouter();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState<ModalAberto | null>(null);
  const [novoPostManualAberto, setNovoPostManualAberto] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function aoTrocarPropriedade(id: string) {
    router.push(id ? `/admin/marketing/agenda?propriedadeId=${id}` : "/admin/marketing/agenda");
  }

  // Menu flutuante de ações (21/08/2026, pedido do Luiz — antes era uma modal centralizada) — abre
  // ancorado no botão "⋯" clicado em vez do centro da tela. Clamp simples pra não vazar pra fora do
  // viewport perto das bordas (largura/altura estimadas do menu, únicas usadas nesta tela).
  function abrirMenuAcoes(postId: string, origem: HTMLElement) {
    const rect = origem.getBoundingClientRect();
    const larguraMenu = 224;
    const alturaMenuEstimada = 220;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - larguraMenu - 8);
    const top =
      rect.bottom + alturaMenuEstimada > window.innerHeight ? Math.max(8, rect.top - alturaMenuEstimada) : rect.bottom + 4;
    setModal({ tipo: "acoes", postId, posicao: { top, left } });
  }

  function aoTerminarDrag(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const postId = String(active.id).replace(/^post:/, "");
    const diaFixo = String(over.id).replace(/^dia:/, "");
    setModal({ tipo: "agendar", postId, diaFixo });
  }

  function irParaHoje() {
    setAno(hoje.getFullYear());
    setMes(hoje.getMonth());
  }

  function mesAnterior() {
    if (mes === 0) {
      setAno((a) => a - 1);
      setMes(11);
    } else {
      setMes((m) => m - 1);
    }
  }

  function proximoMes() {
    if (mes === 11) {
      setAno((a) => a + 1);
      setMes(0);
    } else {
      setMes((m) => m + 1);
    }
  }

  const buscaNormalizada = busca.trim().toLowerCase();
  const postsFiltrados = useMemo(
    () => (buscaNormalizada ? posts.filter((p) => p.titulo.toLowerCase().includes(buscaNormalizada)) : posts),
    [posts, buscaNormalizada],
  );
  const pendentesFiltrados = useMemo(
    () => (buscaNormalizada ? pendentes.filter((p) => p.titulo.toLowerCase().includes(buscaNormalizada)) : pendentes),
    [pendentes, buscaNormalizada],
  );

  const postsPorDia = useMemo(() => {
    const mapa = new Map<string, PostAgendaAdmin[]>();
    for (const post of postsFiltrados) {
      const referencia = post.agendadoPara ?? post.publicadoEm;
      if (!referencia) continue;
      const diaISO = diaISOEmSaoPaulo(referencia);
      const lista = mapa.get(diaISO) ?? [];
      lista.push(post);
      mapa.set(diaISO, lista);
    }
    // Ordem cronológica dentro do dia (21/08/2026, pedido do Luiz) — sem isto a ordem seguia só a
    // da query (não necessariamente por horário), confuso num dia com vários posts.
    for (const lista of mapa.values()) {
      lista.sort((a, b) => new Date(a.agendadoPara ?? a.publicadoEm!).getTime() - new Date(b.agendadoPara ?? b.publicadoEm!).getTime());
    }
    return mapa;
  }, [postsFiltrados]);

  const propriedadeSelecionada = propriedades.find((p) => p.id === propriedadeIdSelecionada);
  const slotsProximos7Dias = useMemo(() => {
    if (!propriedadeSelecionada?.horariosPublicacao?.length) return null;
    const limite = new Date(hoje.getTime() + 7 * 86_400_000);
    const agendadosNoPeriodo = posts.filter((p) => {
      if (!p.agendadoPara) return false;
      const data = new Date(p.agendadoPara);
      return data > hoje && data <= limite;
    }).length;
    const total = propriedadeSelecionada.horariosPublicacao.length * 7;
    return { agendados: agendadosNoPeriodo, vagos: Math.max(0, total - agendadosNoPeriodo) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, propriedadeSelecionada]);

  const celulas = celulasDoMes(ano, mes);

  const todosPosts = useMemo(() => [...posts, ...pendentes], [posts, pendentes]);
  const postAlvo = modal ? todosPosts.find((p) => p.id === modal.postId) : undefined;
  const propriedadeAlvo = propriedades.find((p) => p.id === postAlvo?.propriedadeId);
  const agendamentosExistentesAlvo = useMemo(() => {
    if (!modal || !postAlvo) return [];
    return posts
      .filter((p) => p.propriedadeId === postAlvo.propriedadeId && p.id !== postAlvo.id && p.agendadoPara && new Date(p.agendadoPara) > hoje)
      .map((p) => new Date(p.agendadoPara!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, modal, postAlvo]);

  return (
    <div className="max-w-6xl space-y-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Agenda de Posts</h1>
        <button
          type="button"
          onClick={() => setNovoPostManualAberto(true)}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow dark:bg-zinc-50 dark:text-zinc-900"
        >
          + Novo Post Manual
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className={rotulo}>Propriedade</label>
          <select
            className={`${campo} max-w-xs`}
            value={propriedadeIdSelecionada}
            onChange={(e) => aoTrocarPropriedade(e.target.value)}
          >
            <option value="">Todas</option>
            {propriedades.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-w-64 flex-1 items-center gap-2">
          <label className={rotulo}>Buscar</label>
          <input
            type="text"
            className={campo}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar post por título..."
          />
        </div>
      </div>

      {slotsProximos7Dias && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Próximos 7 dias: <span className="font-medium text-zinc-900 dark:text-zinc-50">{slotsProximos7Dias.agendados} agendados</span>,{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-50">{slotsProximos7Dias.vagos} vagos</span>
          <Ajuda texto="Calculado a partir dos horários de publicação configurados nesta propriedade x 7 dias, menos quantos posts já têm agendado_para caindo nesse período." />
        </p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={mesAnterior}
            className="rounded-full px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ‹
          </button>
          <span className="min-w-40 text-center text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {NOMES_MES[mes]} de {ano}
          </span>
          <button
            type="button"
            onClick={proximoMes}
            className="rounded-full px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ›
          </button>
        </div>
        <button
          type="button"
          onClick={irParaHoje}
          className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Hoje
        </button>
      </div>

      <DndContext sensors={sensors} onDragEnd={aoTerminarDrag}>
        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
          <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50 text-center text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
            {NOMES_DIA_SEMANA.map((nome) => (
              <div key={nome} className="px-2 py-2">
                {nome}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {celulas.map((celula) => {
              const postsDoDia = postsPorDia.get(celula.diaISO) ?? [];
              const visiveis = postsDoDia.slice(0, MAX_CHIPS_POR_DIA);
              const restantes = postsDoDia.length - visiveis.length;
              return (
                <CelulaDia
                  key={celula.diaISO}
                  diaISO={celula.diaISO}
                  className={`min-h-24 space-y-1 border-b border-r border-zinc-200 p-1.5 dark:border-zinc-800 ${
                    celula.noMesAtual ? "" : "opacity-40"
                  }`}
                >
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{celula.dia}</span>
                  {visiveis.map((post) => (
                    <BadgePost key={post.id} post={post} onAbrirAcoes={abrirMenuAcoes} />
                  ))}
                  {restantes > 0 && <span className="block text-[11px] text-zinc-400">+{restantes} mais</span>}
                </CelulaDia>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Gerados, ainda não agendados</h2>
          {pendentesFiltrados.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum post gerado aguardando agendamento.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-2.5">Título</th>
                    <th className="px-4 py-2.5">Criado em</th>
                    <th className="px-4 py-2.5">Tentativas</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {pendentesFiltrados.map((post) => (
                    <LinhaPendente key={post.id} post={post} onAbrirAcoes={abrirMenuAcoes} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DndContext>

      {modal?.tipo === "acoes" && postAlvo && (
        <ModalAcoesPost
          postId={postAlvo.id}
          posicao={modal.posicao}
          urlWordpress={postAlvo.url}
          jaPublicadoDeVerdade={Boolean(postAlvo.url) && !(postAlvo.agendadoPara && new Date(postAlvo.agendadoPara) > hoje)}
          elegivelAgendamento={!postAlvo.agendadoPara || new Date(postAlvo.agendadoPara) > hoje}
          jaAgendado={Boolean(postAlvo.agendadoPara)}
          onFechar={() => setModal(null)}
          onEscolher={(tipo) => setModal({ tipo, postId: postAlvo.id })}
        />
      )}
      {modal?.tipo === "trocar-foto" && <ModalTrocarFoto postId={modal.postId} onFechar={() => setModal(null)} />}
      {modal?.tipo === "visualizar-local" && <ModalVisualizarPostLocal postId={modal.postId} onFechar={() => setModal(null)} />}
      {modal?.tipo === "agendar" && postAlvo && (
        <ModalAgendar
          postId={postAlvo.id}
          diaFixo={modal.diaFixo}
          horariosPublicacao={propriedadeAlvo?.horariosPublicacao}
          agendamentosExistentes={agendamentosExistentesAlvo}
          onFechar={() => setModal(null)}
          onSucesso={() => {
            setModal(null);
            router.refresh();
          }}
        />
      )}

      {novoPostManualAberto && (
        <ModalNovoPostManual
          propriedades={propriedades}
          propriedadeIdInicial={propriedadeIdSelecionada}
          onFechar={() => setNovoPostManualAberto(false)}
          onSucesso={() => {
            setNovoPostManualAberto(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

const itemMenu =
  "block w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800";

/**
 * Menu flutuante de ações (21/08/2026, pedido do Luiz — antes era uma modal centralizada com
 * fundo escurecido). Ancorado no botão "⋯" que abriu (posicao vem de abrirMenuAcoes), fecha ao
 * clicar fora via uma camada invisível por trás — sem bg-black/50, é um menu, não uma modal.
 */
function ModalAcoesPost({
  postId,
  posicao,
  urlWordpress,
  jaPublicadoDeVerdade,
  elegivelAgendamento,
  jaAgendado,
  onFechar,
  onEscolher,
}: {
  postId: string;
  posicao: { top: number; left: number };
  urlWordpress: string | null;
  jaPublicadoDeVerdade: boolean;
  elegivelAgendamento: boolean;
  jaAgendado: boolean;
  onFechar: () => void;
  onEscolher: (tipo: "trocar-foto" | "agendar" | "visualizar-local") => void;
}) {
  const router = useRouter();
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onFechar} />
      <div
        className="fixed z-50 w-56 rounded-xl border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        style={{ top: posicao.top, left: posicao.left }}
      >
        <button
          type="button"
          onClick={() => onEscolher("visualizar-local")}
          title="Preview do conteúdo salvo no nosso banco, sem depender do WordPress"
          className={itemMenu}
        >
          👁️ Visualizar post (local)
        </button>
        {jaPublicadoDeVerdade && urlWordpress && (
          <a
            href={urlWordpress}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onFechar}
            title="Abre o post ao vivo no WordPress, em nova aba"
            className={itemMenu}
          >
            🌐 Visualizar no WordPress
          </a>
        )}
        <button
          type="button"
          onClick={() => onEscolher("trocar-foto")}
          title="Troca a capa ou uma imagem secundária deste post"
          className={itemMenu}
        >
          🖼️ Trocar foto
        </button>
        <button
          type="button"
          onClick={() => router.push(`/admin/marketing/agenda/${postId}/editar`)}
          title="Edita título, conteúdo, slug e metadados manualmente"
          className={itemMenu}
        >
          ✏️ Editar post
        </button>
        {elegivelAgendamento && (
          <button
            type="button"
            onClick={() => onEscolher("agendar")}
            title={jaAgendado ? "Escolhe um novo horário pra este post" : "Escolhe quando este post deve ir ao ar"}
            className={itemMenu}
          >
            📅 {jaAgendado ? "Reagendar..." : "Agendar..."}
          </button>
        )}
      </div>
    </>
  );
}

/**
 * Visualizar post (local) (21/08/2026, pedido do Luiz) — preview só-leitura do que está salvo no
 * NOSSO banco, distinto de "Visualizar no WordPress" (o post ao vivo lá fora). Mesmo padrão
 * lazy-fetch-on-open de ModalTrocarFoto/ModalVisualizarPost (Monitor). conteudoHtml já passou por
 * sanitizarConteudoHtml no pipeline — seguro renderizar direto.
 */
function ModalVisualizarPostLocal({ postId, onFechar }: { postId: string; onFechar: () => void }) {
  const [dados, setDados] = useState<PostVisualizacao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregar, setErroCarregar] = useState(false);

  useEffect(() => {
    let cancelado = false;
    Promise.resolve().then(async () => {
      setCarregando(true);
      setErroCarregar(false);
      try {
        const resultado = await carregarPostVisualizacaoAction(postId);
        if (cancelado) return;
        setDados(resultado);
        setCarregando(false);
      } catch {
        if (cancelado) return;
        setErroCarregar(true);
        setCarregando(false);
      }
    });
    return () => {
      cancelado = true;
    };
  }, [postId]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10" onClick={onFechar}>
      <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{dados?.titulo ?? "Visualizar post"}</h2>
          <button
            type="button"
            onClick={onFechar}
            className="shrink-0 rounded-full px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            ✕
          </button>
        </div>

        {carregando && <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Carregando…</p>}
        {erroCarregar && <p className="mt-4 text-sm text-red-600 dark:text-red-400">Não foi possível carregar este post.</p>}

        {dados && !carregando && !erroCarregar && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Meta title:</span> {dados.metaTitle}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Meta description:</span> {dados.metaDescription}
            </p>
            <div
              className="post-preview-conteudo border-t border-zinc-100 pt-3 text-zinc-800 dark:border-zinc-800 dark:text-zinc-100"
              dangerouslySetInnerHTML={{ __html: dados.conteudoHtml }}
            />
            {/* Estilo próprio pro conteúdo do post (21/08/2026, pedido do Luiz) — não depende de
                nenhum plugin de tipografia do Tailwind (não confirmado neste projeto); título/
                subtítulos/texto ganham hierarquia visual clara, e links saem sublinhados numa cor
                própria, fáceis de distinguir do texto comum. */}
            <style>{`
              .post-preview-conteudo h1 { font-size: 1.4rem; font-weight: 700; line-height: 1.3; margin: 1.5rem 0 0.75rem; }
              .post-preview-conteudo h1:first-child { margin-top: 0; }
              .post-preview-conteudo h2 { font-size: 1.15rem; font-weight: 600; line-height: 1.35; margin: 1.75rem 0 0.6rem; }
              .post-preview-conteudo h3 { font-size: 1.02rem; font-weight: 600; line-height: 1.4; margin: 1.5rem 0 0.5rem; }
              .post-preview-conteudo p { font-size: 0.9rem; line-height: 1.75; margin: 0 0 1rem; }
              .post-preview-conteudo ul, .post-preview-conteudo ol { font-size: 0.9rem; line-height: 1.7; margin: 0 0 1rem 1.25rem; }
              .post-preview-conteudo li { margin-bottom: 0.35rem; }
              .post-preview-conteudo a { color: #2563eb; text-decoration: underline; text-underline-offset: 2px; }
              .post-preview-conteudo a:hover { text-decoration-thickness: 2px; }
              .post-preview-conteudo strong { font-weight: 700; }
              .post-preview-conteudo figure { margin: 1.25rem 0; }
              .post-preview-conteudo figure img { width: 100%; border-radius: 0.5rem; }
              .post-preview-conteudo figcaption { font-size: 0.75rem; color: #71717a; margin-top: 0.375rem; }
              @media (prefers-color-scheme: dark) {
                .post-preview-conteudo a { color: #60a5fa; }
                .post-preview-conteudo figcaption { color: #a1a1aa; }
              }
            `}</style>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Agendamento manual (20/08/2026, pedido do Luiz) — mesma modal serve os dois pontos de entrada:
 * soltar um post arrastado num dia (diaFixo já vem preenchido, pergunta só o horário) ou clicar
 * "Agendar..." no menu de ações (nada vem preenchido, pergunta data e horário). "Automático"
 * reaproveita decidirProximoHorario (agendador.ts) — mesma função pura da Fase 4e, sem round-trip
 * ao servidor: `agora` é meia-noite do dia soltado (drag) ou o instante real (menu).
 */
function ModalAgendar({
  postId,
  diaFixo,
  horariosPublicacao,
  agendamentosExistentes,
  onFechar,
  onSucesso,
}: {
  postId: string;
  diaFixo?: string;
  horariosPublicacao: string[] | undefined;
  agendamentosExistentes: Date[];
  onFechar: () => void;
  onSucesso: () => void;
}) {
  const [modoAuto, setModoAuto] = useState(Boolean(horariosPublicacao?.length));
  const [horario, setHorario] = useState("");
  const [dataHora, setDataHora] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setErro(null);
    let alvo: Date;

    if (modoAuto) {
      if (!horariosPublicacao?.length) {
        setErro("Nenhum horário automático disponível — escolha manualmente.");
        return;
      }
      const agora = diaFixo ? new Date(`${diaFixo}T00:00:00-03:00`) : new Date();
      alvo = decidirProximoHorario(horariosPublicacao, agendamentosExistentes, agora);
    } else if (diaFixo) {
      if (!horario) {
        setErro("Escolha um horário.");
        return;
      }
      alvo = new Date(`${diaFixo}T${horario}:00-03:00`);
    } else {
      if (!dataHora) {
        setErro("Escolha data e horário.");
        return;
      }
      alvo = new Date(dataHora);
    }

    setEnviando(true);
    const resultado = await agendarPostAction(postId, alvo.toISOString());
    setEnviando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onSucesso();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onFechar}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Agendar post</h2>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-full px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="radio" checked={modoAuto} onChange={() => setModoAuto(true)} disabled={!horariosPublicacao?.length} />
            Agendar automaticamente
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="radio" checked={!modoAuto} onChange={() => setModoAuto(false)} />
            Escolher horário exato
          </label>

          {!modoAuto && diaFixo && <input type="time" className={campo} value={horario} onChange={(e) => setHorario(e.target.value)} />}
          {!modoAuto && !diaFixo && (
            <input type="datetime-local" className={campo} value={dataHora} onChange={(e) => setDataHora(e.target.value)} />
          )}

          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={enviando}
              onClick={onFechar}
              className="rounded-full px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={confirmar}
              className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {enviando ? "Agendando..." : "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const NOME_FUNIL: Record<FunilPauta, string> = { topo: "Topo", meio: "Meio", fundo: "Fundo" };
const NOME_TIPO_CONTEUDO: Record<TipoConteudo, string> = {
  post_padrao: "Post padrão",
  post_storytelling: "Post storytelling",
  pagina_servico: "Página de serviço",
  pagina_geografica: "Página geográfica",
  homepage: "Homepage",
};

/**
 * Novo Post Manual (21/08/2026, pedido do Luiz) — o usuário controla à mão TODOS os ingredientes
 * que o Estrategista (`estrategista.ts`) normalmente decide sozinho, incluindo um tema livre (ex.:
 * "limpeza de nome no Natal") e, opcionalmente, um horário exato de publicação.
 */
function ModalNovoPostManual({
  propriedades,
  propriedadeIdInicial,
  onFechar,
  onSucesso,
}: {
  propriedades: Propriedade[];
  propriedadeIdInicial: string;
  onFechar: () => void;
  onSucesso: () => void;
}) {
  const [propriedadeId, setPropriedadeId] = useState(propriedadeIdInicial);
  const [matrizes, setMatrizes] = useState<MatrizAdmin[]>([]);
  const [matrizId, setMatrizId] = useState("");
  const [personas, setPersonas] = useState<PersonaAtiva[]>([]);
  const [personaId, setPersonaId] = useState("");
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(false);

  const [angulo, setAngulo] = useState("");
  const [palavraChave, setPalavraChave] = useState("");
  const [palavrasSecundarias, setPalavrasSecundarias] = useState("");
  const [funil, setFunil] = useState<FunilPauta>("meio");
  const [tipoConteudo, setTipoConteudo] = useState<TipoConteudo>("post_padrao");
  const [geografia, setGeografia] = useState("");
  const [quandoPublicar, setQuandoPublicar] = useState("");
  const [prioridade, setPrioridade] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    Promise.resolve().then(async () => {
      if (!propriedadeId) {
        setMatrizes([]);
        setPersonas([]);
        setMatrizId("");
        setPersonaId("");
        return;
      }
      setCarregandoOpcoes(true);
      const [matrizesCarregadas, personasCarregadas] = await Promise.all([
        listarMatrizesAtivasAction(propriedadeId),
        listarPersonasParaPautaManualAction(propriedadeId),
      ]);
      if (cancelado) return;
      setMatrizes(matrizesCarregadas);
      setPersonas(personasCarregadas);
      setMatrizId(matrizesCarregadas.length === 1 ? matrizesCarregadas[0].id : "");
      setPersonaId("");
      setCarregandoOpcoes(false);
    });
    return () => {
      cancelado = true;
    };
  }, [propriedadeId]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  const propriedadeNome = propriedades.find((p) => p.id === propriedadeId)?.nome;
  const personaSelecionada = personas.find((p) => p.id === personaId);

  async function confirmar() {
    setErro(null);
    if (!matrizId) {
      setErro("Selecione a matriz de conteúdo.");
      return;
    }
    if (!angulo.trim()) {
      setErro("Descreva o tema/ângulo do post.");
      return;
    }
    if (!palavraChave.trim()) {
      setErro("Informe a palavra-chave principal.");
      return;
    }

    const dados: DadosPautaManual = {
      matrizConteudoId: matrizId,
      personaId: personaId || null,
      angulo: angulo.trim(),
      palavraChavePrincipal: palavraChave.trim(),
      palavrasSecundarias: palavrasSecundarias
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p !== ""),
      funil,
      tipoConteudo,
      geografia: geografia.trim() || null,
      agendamentoForcado: quandoPublicar ? new Date(quandoPublicar).toISOString() : null,
      prioridadeScore: prioridade ? 200 : undefined,
    };

    setEnviando(true);
    const resultado = await criarPautaManualAction(dados);
    setEnviando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onSucesso();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10" onClick={onFechar}>
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Novo Post Manual</h2>
          <button
            type="button"
            onClick={onFechar}
            className="shrink-0 rounded-full px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={rotulo}>Propriedade</label>
              <select className={campo} value={propriedadeId} onChange={(e) => setPropriedadeId(e.target.value)}>
                <option value="">Selecione...</option>
                {propriedades.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className={rotulo}>Matriz de conteúdo</label>
              <select className={campo} value={matrizId} onChange={(e) => setMatrizId(e.target.value)} disabled={!propriedadeId || carregandoOpcoes}>
                <option value="">Selecione...</option>
                {matrizes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className={rotulo}>Persona (opcional)</label>
            <select className={campo} value={personaId} onChange={(e) => setPersonaId(e.target.value)} disabled={!propriedadeId || carregandoOpcoes}>
              <option value="">Nenhuma</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            {personaSelecionada && personaSelecionada.angulosProntos.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {personaSelecionada.angulosProntos.map((sugestao) => (
                  <button
                    key={sugestao}
                    type="button"
                    onClick={() => setAngulo(sugestao)}
                    className="rounded-full border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    title="Usar este ângulo pronto"
                  >
                    {sugestao}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className={rotulo}>
              Tema/Ângulo
              <Ajuda texto="Descreva livremente o que o post deve abordar — ex.: 'limpeza de nome no Natal'. Se escolher uma persona com ângulos prontos, clique num dos chips acima pra preencher automaticamente." />
            </label>
            <textarea className={campo} rows={3} value={angulo} onChange={(e) => setAngulo(e.target.value)} placeholder="Ex.: limpeza de nome no Natal" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={rotulo}>Palavra-chave principal</label>
              <input className={campo} value={palavraChave} onChange={(e) => setPalavraChave(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className={rotulo}>Palavras secundárias</label>
              <input
                className={campo}
                value={palavrasSecundarias}
                onChange={(e) => setPalavrasSecundarias(e.target.value)}
                placeholder="Separadas por vírgula"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={rotulo}>Funil</label>
              <select className={campo} value={funil} onChange={(e) => setFunil(e.target.value as FunilPauta)}>
                {(Object.keys(NOME_FUNIL) as FunilPauta[]).map((f) => (
                  <option key={f} value={f}>
                    {NOME_FUNIL[f]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className={rotulo}>Tipo de conteúdo</label>
              <select className={campo} value={tipoConteudo} onChange={(e) => setTipoConteudo(e.target.value as TipoConteudo)}>
                {(Object.keys(NOME_TIPO_CONTEUDO) as TipoConteudo[]).map((t) => (
                  <option key={t} value={t}>
                    {NOME_TIPO_CONTEUDO[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className={rotulo}>Geografia (opcional)</label>
            <input className={campo} value={geografia} onChange={(e) => setGeografia(e.target.value)} />
          </div>

          <div className="space-y-1">
            <label className={rotulo}>
              Quando publicar
              <Ajuda texto="Deixe em branco pra usar a agenda automática da propriedade (ou publicar assim que aprovado, se ela não tiver horários configurados)." />
            </label>
            <input type="datetime-local" className={campo} value={quandoPublicar} onChange={(e) => setQuandoPublicar(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={prioridade} onChange={(e) => setPrioridade(e.target.checked)} />
            Processar com prioridade (fura a fila das pautas geradas automaticamente)
          </label>

          {propriedadeNome && matrizId && (
            <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              1 post pra {propriedadeNome} · Persona: {personaSelecionada?.nome ?? "Nenhuma"} · Funil: {NOME_FUNIL[funil]} · Tipo: {NOME_TIPO_CONTEUDO[tipoConteudo]}
            </p>
          )}

          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={enviando}
              onClick={onFechar}
              className="rounded-full px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={confirmar}
              className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {enviando ? "Criando..." : "Criar pauta"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type AlvoTroca = { tipo: "capa" } | { tipo: "secundaria"; slug: string };
type ModoTroca = "regenerar" | "prompt" | "upload";

/**
 * Trocar Foto (20/08/2026, pedido do Luiz) — galeria (capa + secundárias) com um botão "Trocar" em
 * cada imagem; clicar abre o formulário de 3 modos pra aquela imagem específica. Mesmo padrão
 * lazy-fetch-on-open de ModalVisualizarPost (Monitor, monitor-client.tsx).
 */
function ModalTrocarFoto({ postId, onFechar }: { postId: string; onFechar: () => void }) {
  const [dados, setDados] = useState<ImagensPost | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregar, setErroCarregar] = useState(false);
  const [alvo, setAlvo] = useState<AlvoTroca | null>(null);
  const [modo, setModo] = useState<ModoTroca>("regenerar");
  const [prompt, setPrompt] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    Promise.resolve().then(async () => {
      setCarregando(true);
      setErroCarregar(false);
      try {
        const resultado = await carregarImagensPostAction(postId);
        if (cancelado) return;
        setDados(resultado);
        setCarregando(false);
      } catch {
        if (cancelado) return;
        setErroCarregar(true);
        setCarregando(false);
      }
    });
    return () => {
      cancelado = true;
    };
  }, [postId]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  function abrirFormulario(novoAlvo: AlvoTroca) {
    setAlvo(novoAlvo);
    setModo("regenerar");
    setPrompt("");
    setArquivo(null);
    setErroEnvio(null);
  }

  async function confirmar() {
    if (!alvo) return;
    setEnviando(true);
    setErroEnvio(null);

    const formData = new FormData();
    formData.append("postId", postId);
    formData.append("modo", modo);
    if (modo === "upload" && arquivo) formData.append("arquivo", arquivo);
    if (modo === "prompt") formData.append("prompt", prompt);
    if (alvo.tipo === "secundaria") formData.append("slugImagem", alvo.slug);

    const resultado = alvo.tipo === "capa" ? await trocarCapaAction(formData) : await trocarImagemSecundariaAction(formData);
    setEnviando(false);
    if (!resultado.sucesso) {
      setErroEnvio(resultado.erro);
      return;
    }

    const alvoConfirmado = alvo;
    setDados((atual) => {
      if (!atual) return atual;
      if (alvoConfirmado.tipo === "capa") return { ...atual, imagemDestaqueUrl: resultado.url };
      return {
        ...atual,
        imagensSecundarias: atual.imagensSecundarias.map((i) => (i.slug === alvoConfirmado.slug ? { ...i, url: resultado.url } : i)),
      };
    });
    setAlvo(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10" onClick={onFechar}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{dados?.titulo ?? "Trocar foto"}</h2>
          <button
            type="button"
            onClick={onFechar}
            className="shrink-0 rounded-full px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            ✕
          </button>
        </div>

        {carregando && <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Carregando…</p>}
        {erroCarregar && <p className="mt-4 text-sm text-red-600 dark:text-red-400">Não foi possível carregar as imagens deste post.</p>}

        {dados && !carregando && !erroCarregar && !alvo && (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Capa</p>
              <div className="mt-1 flex items-center gap-3">
                {dados.imagemDestaqueUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagem hospedada no WordPress/Storage do próprio Luiz
                  <img src={dados.imagemDestaqueUrl} alt="Capa" className="h-16 w-28 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-16 w-28 items-center justify-center rounded-lg bg-zinc-100 text-xs text-zinc-400 dark:bg-zinc-800">
                    sem capa
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => abrirFormulario({ tipo: "capa" })}
                  className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  🖼️ Trocar
                </button>
              </div>
            </div>

            {dados.imagensSecundarias.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Imagens secundárias</p>
                <div className="mt-1 space-y-2">
                  {dados.imagensSecundarias.map((imagem) => (
                    <div key={imagem.slug} className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- ver comentário acima */}
                      <img src={imagem.url} alt={imagem.alt} className="h-16 w-28 rounded-lg object-cover" />
                      <div className="flex-1 text-xs text-zinc-500 dark:text-zinc-400">{imagem.legenda}</div>
                      <button
                        type="button"
                        onClick={() => abrirFormulario({ tipo: "secundaria", slug: imagem.slug })}
                        className="shrink-0 rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        🖼️ Trocar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {alvo && (
          <div className="mt-4 space-y-3">
            <div className="flex gap-2">
              {(["regenerar", "prompt", "upload"] as const).map((opcao) => (
                <button
                  key={opcao}
                  type="button"
                  onClick={() => setModo(opcao)}
                  className={`rounded-full px-3 py-1 text-xs ${
                    modo === opcao
                      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                      : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  {opcao === "regenerar" ? "Gerar de novo" : opcao === "prompt" ? "Digitar prompt" : "Enviar arquivo"}
                </button>
              ))}
            </div>

            {modo === "prompt" && (
              <textarea
                className={campo}
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Descreva a imagem que você quer..."
              />
            )}
            {modo === "upload" && <input type="file" accept="image/*" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />}
            {modo === "regenerar" && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Gera uma nova variação automática, sem instrução adicional.</p>
            )}

            {erroEnvio && <p className="text-sm text-red-600 dark:text-red-400">{erroEnvio}</p>}

            {/* 21/08/2026, pedido do Luiz: a barra indeterminada + "~20-40s" de antes davam a
                impressão errada de travado quando a geração passava desse tempo (a chamada não
                expõe progresso real — não dá pra prometer uma janela curta e específica). Só o
                ícone girando + uma explicação honesta sobre a variação real do tempo. */}
            {enviando && (
              <div className="flex items-start gap-2.5 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800">
                <span
                  aria-hidden
                  className="mt-0.5 inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent dark:border-zinc-500"
                />
                <p className="text-xs text-zinc-600 dark:text-zinc-300">
                  Gerando a imagem — isso pode levar alguns minutos, dependendo da complexidade do prompt. Não feche
                  esta janela.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={enviando}
                onClick={() => setAlvo(null)}
                className="rounded-full px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={enviando}
                onClick={confirmar}
                className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
              >
                {enviando ? "Gerando..." : "Confirmar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
