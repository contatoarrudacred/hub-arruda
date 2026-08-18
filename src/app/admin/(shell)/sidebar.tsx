"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { sair } from "./actions";

// Identidade visual do Hub Arruda — navy/dourado extraídos do site real da ArrudaCred
// (arrudacred.com.br), decisão registrada com Luiz em 14/08/2026. Cor não muda com
// dark/light mode do resto do admin — a barra lateral é sempre navy, igual ao mockup aprovado.
const NAVY = "#141e33";
const DOURADO = "#c8a55d";

// Menu em árvore por módulo (Luiz, 17/08/2026) — 4 módulos principais (CRM/Vendas/Marketing/
// Configurações), cada um com "Dashboard" como primeiro subitem (ainda não construído em nenhum —
// fica "em breve" até existir) e depois as páginas do dia a dia do módulo. Itens que são
// parametrização de sistema (não uso diário), mesmo quando ligados a um módulo específico, moram em
// Configurações — ex.: Preços é usado tanto pelo CRM (proposta) quanto por Vendas, mas é cadastro,
// não operação — critério explícito do Luiz. Dentro de Configurações, dois subgrupos ("Geral" e
// "CRM", que reúne o que configura o atendimento automatizado — Fluxos/FAQs/Objeções/Agendas/
// Respostas prontas/Roteamento) ficam colapsados por padrão: só o rótulo do subgrupo aparece até o
// usuário clicar nele (economiza espaço mesmo com o módulo já aberto).
type ItemLink = { tipo: "link"; rotulo: string; href: string; icone: string };
type ItemEmBreve = { tipo: "em_breve"; rotulo: string; icone: string };
type Grupo = { tipo: "grupo"; rotulo: string; itens: NoModulo[] };
type NoModulo = ItemLink | ItemEmBreve | Grupo;
type Modulo = { chave: string; rotulo: string; icone: string; itens: NoModulo[] };

const MODULOS: Modulo[] = [
  {
    chave: "crm",
    rotulo: "CRM",
    icone: "💬",
    itens: [
      { tipo: "em_breve", rotulo: "Dashboard", icone: "📊" },
      { tipo: "link", rotulo: "Atendimento", href: "/admin/atendimento", icone: "🗨️" },
      { tipo: "em_breve", rotulo: "Kanban", icone: "📋" },
    ],
  },
  {
    chave: "vendas",
    rotulo: "Vendas",
    icone: "💰",
    itens: [
      { tipo: "em_breve", rotulo: "Dashboard", icone: "📊" },
      { tipo: "link", rotulo: "Nova venda", href: "/admin/vendas/nova", icone: "🧾" },
      { tipo: "link", rotulo: "Fornecedores", href: "/admin/fornecedores", icone: "🏭" },
    ],
  },
  {
    chave: "marketing",
    rotulo: "Marketing",
    icone: "📣",
    itens: [
      { tipo: "link", rotulo: "Visão Geral", href: "/admin/marketing", icone: "📊" },
      { tipo: "link", rotulo: "Monitor", href: "/admin/marketing/monitor", icone: "🛰️" },
      { tipo: "link", rotulo: "Fila de Pautas", href: "/admin/marketing/pautas", icone: "🗂️" },
      { tipo: "link", rotulo: "Posts Publicados", href: "/admin/marketing/posts", icone: "📰" },
    ],
  },
  {
    chave: "configuracoes",
    rotulo: "Configurações",
    icone: "⚙️",
    itens: [
      { tipo: "em_breve", rotulo: "Dashboard", icone: "📊" },
      {
        tipo: "grupo",
        rotulo: "Geral",
        itens: [
          { tipo: "link", rotulo: "Preços", href: "/admin/precos", icone: "💲" },
          { tipo: "link", rotulo: "Atendentes", href: "/admin/atendentes", icone: "🧑‍💼" },
          { tipo: "link", rotulo: "Configurações gerais", href: "/admin/configuracoes", icone: "🛠️" },
        ],
      },
      {
        tipo: "grupo",
        rotulo: "CRM",
        itens: [
          { tipo: "link", rotulo: "Fluxos", href: "/admin/fluxos", icone: "🔀" },
          { tipo: "link", rotulo: "FAQs", href: "/admin/faqs", icone: "❓" },
          { tipo: "link", rotulo: "Objeções", href: "/admin/objecoes", icone: "🚩" },
          { tipo: "link", rotulo: "Agendas de Follow-up", href: "/admin/agendas", icone: "⏰" },
          { tipo: "link", rotulo: "Respostas prontas", href: "/admin/respostas-prontas", icone: "⚡" },
          { tipo: "link", rotulo: "Roteamento de lead novo", href: "/admin/roteamento", icone: "🧭" },
        ],
      },
      {
        tipo: "grupo",
        rotulo: "Marketing",
        itens: [
          { tipo: "link", rotulo: "Propriedades Digitais", href: "/admin/configuracoes/marketing/propriedades", icone: "🌐" },
          { tipo: "link", rotulo: "Matrizes de Conteúdo", href: "/admin/configuracoes/marketing/matrizes", icone: "🧩" },
          { tipo: "link", rotulo: "Personas", href: "/admin/configuracoes/marketing/personas", icone: "🎭" },
          { tipo: "link", rotulo: "Checklist de QA", href: "/admin/configuracoes/marketing/checklist", icone: "✅" },
        ],
      },
    ],
  },
];

const CHAVE_RETRAIDO_LOCALSTORAGE = "hubarruda_admin_sidebar_retraido";

function estaAtivo(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function folhasLink(itens: NoModulo[]): ItemLink[] {
  const resultado: ItemLink[] = [];
  for (const no of itens) {
    if (no.tipo === "link") resultado.push(no);
    else if (no.tipo === "grupo") resultado.push(...folhasLink(no.itens));
  }
  return resultado;
}

function moduloContemRotaAtiva(modulo: Modulo, pathname: string): boolean {
  return folhasLink(modulo.itens).some((item) => estaAtivo(item.href, pathname));
}

/** Acha o módulo (e o subgrupo, se houver) dono da rota atual — usado pra auto-expandir a árvore até o item ativo quando se navega direto por URL/F5. */
function localizarRotaAtiva(pathname: string): { modulo: string; grupo: string | null } | null {
  for (const modulo of MODULOS) {
    for (const no of modulo.itens) {
      if (no.tipo === "link" && estaAtivo(no.href, pathname)) return { modulo: modulo.chave, grupo: null };
      if (no.tipo === "grupo") {
        for (const filho of folhasLink([no])) {
          if (estaAtivo(filho.href, pathname)) return { modulo: modulo.chave, grupo: no.rotulo };
        }
      }
    }
  }
  return null;
}

/** Busca (accent/case-insensitive) — "atendimento" bate com "Atenção", "preços" bate com "precos". */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function ItemNav({ item, pathname, onClicar }: { item: ItemLink | ItemEmBreve; pathname: string; onClicar?: () => void }) {
  if (item.tipo === "em_breve") {
    return (
      <div className="flex items-center gap-2 rounded px-2.5 py-1.5 text-sm text-white/30">
        <span className="w-4 shrink-0 text-center">{item.icone}</span>
        <span className="flex-1 truncate">{item.rotulo}</span>
        <span className="shrink-0 text-[10px]">em breve</span>
      </div>
    );
  }

  const ativo = estaAtivo(item.href, pathname);

  return (
    <Link
      href={item.href}
      onClick={onClicar}
      className="flex items-center gap-2 rounded px-2.5 py-1.5 text-sm"
      style={
        ativo
          ? { backgroundColor: "rgba(200,165,93,0.16)", borderLeft: `2px solid ${DOURADO}`, color: DOURADO }
          : { color: "rgba(255,255,255,0.7)", borderLeft: "2px solid transparent" }
      }
    >
      <span className="w-4 shrink-0 text-center">{item.icone}</span>
      <span className="truncate">{item.rotulo}</span>
    </Link>
  );
}

/**
 * Renderiza os nós de um módulo (links, "em breve" e subgrupos) — reaproveitado tanto no corpo
 * expandido do accordion quanto no flyout do modo retraído. Subgrupos ficam colapsados por padrão
 * (só o rótulo aparece); `subgrupoAberto` guarda qual está aberto agora (um só por vez, decisão de
 * Luiz 17/08/2026 — economizar espaço).
 */
function NoLista({
  itens,
  pathname,
  subgrupoAberto,
  onAlternarSubgrupo,
  onClicarLink,
}: {
  itens: NoModulo[];
  pathname: string;
  subgrupoAberto: string | null;
  onAlternarSubgrupo: (rotulo: string) => void;
  onClicarLink?: () => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {itens.map((no) => {
        if (no.tipo === "grupo") {
          const aberto = subgrupoAberto === no.rotulo;
          return (
            <div key={no.rotulo}>
              <button
                type="button"
                onClick={() => onAlternarSubgrupo(no.rotulo)}
                className="flex w-full items-center gap-1.5 rounded px-2.5 py-1 text-left text-[11px] font-medium uppercase tracking-wide text-white/40 hover:text-white/70"
              >
                <span className="w-3 shrink-0 text-[9px]">{aberto ? "▾" : "▸"}</span>
                <span className="flex-1 truncate">{no.rotulo}</span>
              </button>
              {aberto && (
                <div className="border-l border-white/10 py-0.5 pl-3">
                  <NoLista
                    itens={no.itens}
                    pathname={pathname}
                    subgrupoAberto={subgrupoAberto}
                    onAlternarSubgrupo={onAlternarSubgrupo}
                    onClicarLink={onClicarLink}
                  />
                </div>
              )}
            </div>
          );
        }
        return <ItemNav key={no.rotulo} item={no} pathname={pathname} onClicar={onClicarLink} />;
      })}
    </div>
  );
}

export function Sidebar({ userEmail }: { userEmail: string | undefined }) {
  const pathname = usePathname();
  const [retraido, setRetraido] = useState(false);
  const [hoverExpandido, setHoverExpandido] = useState(false);
  const [moduloAberto, setModuloAberto] = useState<string | null>(null);
  const [subgrupoAberto, setSubgrupoAberto] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const inputBuscaRef = useRef<HTMLInputElement>(null);

  // Preferência retraído/expandido é do navegador (localStorage), não do sistema — mesma decisão
  // pragmática de qualquer app com sidebar recolhível (VS Code, Notion): é conforto de tela, não
  // dado de negócio, não precisa de schema/coluna nova pra isso. `Promise.resolve().then()` (mesmo
  // padrão já usado em atendimento-client.tsx) em vez de setState síncrono direto no efeito.
  useEffect(() => {
    Promise.resolve().then(() => {
      if (localStorage.getItem(CHAVE_RETRAIDO_LOCALSTORAGE) === "1") setRetraido(true);
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(CHAVE_RETRAIDO_LOCALSTORAGE, retraido ? "1" : "0");
  }, [retraido]);

  // Auto-abre o módulo (e o subgrupo, se a rota estiver dentro de um) dono da rota atual — navegar
  // direto por URL (ou dar F5) não deixa o usuário sem saber onde está dentro da árvore.
  useEffect(() => {
    Promise.resolve().then(() => {
      const ativo = localizarRotaAtiva(pathname);
      setModuloAberto(ativo?.modulo ?? null);
      setSubgrupoAberto(ativo?.grupo ?? null);
    });
  }, [pathname]);

  const resultadosBusca = useMemo(() => {
    const termo = normalizar(busca.trim());
    if (!termo) return [];
    const resultado: { modulo: Modulo; grupo: string | null; item: ItemLink | ItemEmBreve }[] = [];
    const percorrer = (modulo: Modulo, itens: NoModulo[], grupo: string | null) => {
      for (const no of itens) {
        if (no.tipo === "grupo") percorrer(modulo, no.itens, no.rotulo);
        else if (normalizar(no.rotulo).includes(termo)) resultado.push({ modulo, grupo, item: no });
      }
    };
    for (const modulo of MODULOS) percorrer(modulo, modulo.itens, null);
    return resultado;
  }, [busca]);

  function abrirBuscaExpandindo() {
    if (retraido) setRetraido(false);
    requestAnimationFrame(() => inputBuscaRef.current?.focus());
  }

  function alternarModulo(chave: string) {
    setModuloAberto((atual) => (atual === chave ? null : chave));
    setSubgrupoAberto(null);
  }

  function alternarSubgrupo(rotulo: string) {
    setSubgrupoAberto((atual) => (atual === rotulo ? null : rotulo));
  }

  // Corpo (busca ou árvore de módulos) — idêntico estando a barra fixa expandida ou aberta
  // temporariamente por hover no modo retraído, por isso vive fora dos dois JSX que o usam.
  const corpo = busca.trim() ? (
    <div className="flex flex-col gap-1">
      {resultadosBusca.length === 0 && <p className="px-2.5 py-2 text-xs text-white/40">Nada encontrado.</p>}
      {resultadosBusca.map(({ modulo, grupo, item }) => (
        <div key={`${modulo.chave}-${grupo ?? ""}-${item.rotulo}`}>
          <p className="px-2.5 pt-1 text-[10px] text-white/30">
            {modulo.rotulo}
            {grupo ? ` › ${grupo}` : ""}
          </p>
          <ItemNav item={item} pathname={pathname} onClicar={() => setBusca("")} />
        </div>
      ))}
    </div>
  ) : (
    <div className="flex flex-col gap-0.5">
      {MODULOS.map((modulo) => {
        const aberto = moduloAberto === modulo.chave;
        const ativo = moduloContemRotaAtiva(modulo, pathname);
        return (
          <div key={modulo.chave}>
            <button
              type="button"
              onClick={() => alternarModulo(modulo.chave)}
              className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm"
              style={{ color: ativo ? DOURADO : "rgba(255,255,255,0.85)" }}
            >
              <span className="w-4 shrink-0 text-center">{modulo.icone}</span>
              <span className="flex-1 truncate font-medium">{modulo.rotulo}</span>
              <span className="shrink-0 text-[10px] text-white/40">{aberto ? "▾" : "▸"}</span>
            </button>
            {aberto && (
              <div className="mb-1 mt-0.5 border-l border-white/10 py-0.5 pl-3">
                <NoLista itens={modulo.itens} pathname={pathname} subgrupoAberto={subgrupoAberto} onAlternarSubgrupo={alternarSubgrupo} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // Cabeçalho (logo + busca) + corpo + rodapé (usuário/sair) — mesmo conteúdo usado tanto na barra
  // fixa expandida quanto no overlay que aparece ao passar o mouse no modo retraído.
  const conteudoCompleto = (
    <>
      <div className="mb-3 flex items-center gap-2 px-1">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-medium"
          style={{ backgroundColor: DOURADO, color: NAVY }}
        >
          H
        </div>
        <span className="flex-1 truncate text-sm font-medium text-white">Hub Arruda</span>
        <button
          type="button"
          onClick={() => setRetraido(!retraido)}
          title={retraido ? "Fixar menu expandido" : "Retrair menu"}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/40 hover:bg-white/10 hover:text-white/80"
        >
          {retraido ? "📌" : "«"}
        </button>
      </div>

      <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
        <span className="shrink-0 text-white/40">🔍</span>
        <input
          ref={inputBuscaRef}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar no menu..."
          className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
        />
        {busca && (
          <button type="button" onClick={() => setBusca("")} className="shrink-0 text-white/40 hover:text-white/80">
            ✕
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">{corpo}</div>

      <form action={sair} className="mt-auto flex items-center gap-2 border-t border-white/10 pt-3">
        <div className="h-5.5 w-5.5 shrink-0 rounded-full bg-white/15" />
        <span className="flex-1 truncate text-xs text-white/70">{userEmail}</span>
        <button type="submit" className="text-xs text-white/50 hover:text-white/80 hover:underline">
          Sair
        </button>
      </form>
    </>
  );

  if (retraido) {
    // Barra estreita (só ícones) sempre ocupando o espaço reservado no layout; passar o mouse por
    // cima expande o menu inteiro num overlay flutuando acima do conteúdo (não empurra o `<main>`)
    // — decisão original de Luiz (16/08/2026). O overlay é filho do mesmo container que escuta
    // mouseenter/mouseleave, então entrar nele não conta como "sair" da barra.
    return (
      <div
        className="relative h-full w-14 shrink-0"
        onMouseEnter={() => setHoverExpandido(true)}
        onMouseLeave={() => setHoverExpandido(false)}
      >
        <div className="flex h-full w-14 flex-col items-center gap-1 py-3.5" style={{ backgroundColor: NAVY }}>
          <div
            className="mb-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-medium"
            style={{ backgroundColor: DOURADO, color: NAVY }}
            title="Hub Arruda"
          >
            H
          </div>

          <button
            type="button"
            onClick={abrirBuscaExpandindo}
            title="Buscar"
            className="mb-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white/80"
          >
            🔍
          </button>

          <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
            {MODULOS.map((modulo) => {
              const ativo = moduloContemRotaAtiva(modulo, pathname);
              return (
                <button
                  key={modulo.chave}
                  type="button"
                  title={modulo.rotulo}
                  onClick={() => {
                    setModuloAberto(modulo.chave);
                    setRetraido(false);
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-lg"
                  style={ativo ? { backgroundColor: "rgba(200,165,93,0.16)" } : undefined}
                >
                  {modulo.icone}
                </button>
              );
            })}
          </div>

          <div className="mt-auto flex flex-col items-center gap-1 border-t border-white/10 pt-3">
            <div className="h-6 w-6 shrink-0 rounded-full bg-white/15" title={userEmail} />
            <form action={sair}>
              <button
                type="submit"
                title="Sair"
                className="flex h-7 w-7 items-center justify-center rounded text-white/50 hover:text-white/80"
              >
                ⏻
              </button>
            </form>
          </div>
        </div>

        {hoverExpandido && (
          <div
            className="absolute left-0 top-0 z-40 flex h-full w-64 flex-col gap-1 p-3.5 shadow-2xl"
            style={{ backgroundColor: NAVY }}
          >
            {conteudoCompleto}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full w-64 shrink-0 flex-col gap-1 p-3.5" style={{ backgroundColor: NAVY }}>
      {conteudoCompleto}
    </div>
  );
}
