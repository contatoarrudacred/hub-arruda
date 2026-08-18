"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sair } from "./actions";

// Identidade visual do Hub Arruda — navy/dourado extraídos do site real da ArrudaCred
// (arrudacred.com.br), decisão registrada com Luiz em 14/08/2026. Cor não muda com
// dark/light mode do resto do admin — a barra lateral é sempre navy, igual ao mockup aprovado.
const NAVY = "#141e33";
const DOURADO = "#c8a55d";

type ItemMenu = { rotulo: string; href: string } | { rotulo: string; emBreve: true };

// Estrutura combinada com Luiz (14/08/2026): "CRM" (Kanban/Oportunidades) só entra no menu
// principal quando a tela existir — por enquanto "Configurações" é o único item de topo.
// Dentro dela, um sub-grupo "CRM" reúne o que configura o atendimento automatizado
// (Fluxos/FAQs/Objeções/Agendas); Preços fica fora desse sub-grupo porque também vai
// alimentar a futura Vendas de Balcão, não é exclusivo do CRM.
const GRUPO_CRM: ItemMenu[] = [
  { rotulo: "Fluxos", href: "/admin/fluxos" },
  { rotulo: "FAQs", href: "/admin/faqs" },
  { rotulo: "Objeções", href: "/admin/objecoes" },
  { rotulo: "Agendas de Follow-up", href: "/admin/agendas" },
  { rotulo: "Respostas prontas", href: "/admin/respostas-prontas" },
  { rotulo: "Roteamento de lead novo", href: "/admin/roteamento" },
];

const GRUPO_GERAL: ItemMenu[] = [
  { rotulo: "Preços", href: "/admin/precos" },
  { rotulo: "Atendentes", href: "/admin/atendentes" },
  { rotulo: "Configurações gerais", href: "/admin/configuracoes" },
];

const GRUPO_VENDAS: ItemMenu[] = [
  { rotulo: "Nova venda", href: "/admin/vendas/nova" },
  { rotulo: "Fornecedores", href: "/admin/fornecedores" },
];

function ItemNav({ item, pathname }: { item: ItemMenu; pathname: string }) {
  if ("emBreve" in item) {
    return (
      <div className="flex items-center justify-between rounded px-2.5 py-1.5 text-sm text-white/30">
        <span>{item.rotulo}</span>
        <span className="text-[10px]">em breve</span>
      </div>
    );
  }

  const ativo = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      className="flex items-center gap-2 rounded px-2.5 py-1.5 text-sm"
      style={
        ativo
          ? { backgroundColor: "rgba(200,165,93,0.16)", borderLeft: `2px solid ${DOURADO}`, color: DOURADO }
          : { color: "rgba(255,255,255,0.6)", borderLeft: "2px solid transparent" }
      }
    >
      {item.rotulo}
    </Link>
  );
}

export function Sidebar({ userEmail }: { userEmail: string | undefined }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-56 shrink-0 flex-col gap-1 p-3.5" style={{ backgroundColor: NAVY }}>
      <div className="mb-5 flex items-center gap-2 px-1">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-medium"
          style={{ backgroundColor: DOURADO, color: NAVY }}
        >
          H
        </div>
        <span className="text-sm font-medium text-white">Hub Arruda</span>
      </div>

      <ItemNav item={{ rotulo: "Atendimento", href: "/admin/atendimento" }} pathname={pathname} />

      <p className="px-2.5 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-white/40">
        Configurações
      </p>

      <p className="px-2.5 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-white/30">
        CRM
      </p>
      {GRUPO_CRM.map((item) => (
        <ItemNav key={item.rotulo} item={item} pathname={pathname} />
      ))}

      <p className="px-2.5 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-white/30">
        Geral
      </p>
      {GRUPO_GERAL.map((item) => (
        <ItemNav key={item.rotulo} item={item} pathname={pathname} />
      ))}

      <p className="px-2.5 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-white/30">
        Vendas
      </p>
      {GRUPO_VENDAS.map((item) => (
        <ItemNav key={item.rotulo} item={item} pathname={pathname} />
      ))}

      <form action={sair} className="mt-auto flex items-center gap-2 border-t border-white/10 pt-3">
        <div className="h-5.5 w-5.5 shrink-0 rounded-full bg-white/15" />
        <span className="flex-1 truncate text-xs text-white/70">{userEmail}</span>
        <button type="submit" className="text-xs text-white/50 hover:text-white/80 hover:underline">
          Sair
        </button>
      </form>
    </div>
  );
}
