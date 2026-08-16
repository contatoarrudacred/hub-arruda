import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Contato institucional configurável pelo admin (/admin/configuracoes) — Luiz pediu (15/08/2026)
// que o número de WhatsApp do CTA não fique fixo no template do e-mail, porque o número
// conectado à Malala pode mudar. Aproveitado pros links de redes sociais também, já que servem
// pro mesmo e-mail e pra conteúdo de marketing futuro. Ver migration
// 20260815180000_configuracoes_contato_institucional.sql pros valores provisórios (hoje são os
// do site institucional — trocar quando o WhatsApp real da Malala, Fase 7, estiver definido).

export type RedesSociais = {
  site: string;
  instagram: string;
  facebook: string;
  youtube: string;
};

export type ContatoInstitucional = {
  whatsappNumero: string;
  redesSociais: RedesSociais;
};

export async function carregarContatoInstitucional(): Promise<ContatoInstitucional> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("configuracoes")
    .select("chave, valor")
    .in("chave", ["whatsapp_numero_atendimento", "redes_sociais"]);

  if (error) {
    throw new Error(`Falha ao carregar contato institucional: ${error.message}`);
  }

  const porChave = Object.fromEntries((data ?? []).map((linha) => [linha.chave, linha.valor])) as Record<
    string,
    unknown
  >;

  return {
    whatsappNumero: (porChave.whatsapp_numero_atendimento as string) ?? "",
    redesSociais: (porChave.redes_sociais as RedesSociais) ?? {
      site: "",
      instagram: "",
      facebook: "",
      youtube: "",
    },
  };
}
