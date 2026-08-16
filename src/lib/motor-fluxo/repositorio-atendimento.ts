import "server-only";
import { createClient } from "@/lib/supabase/server";

// Camada de dados da Tela de Atendimento (Bloco A) — usa sempre o cliente autenticado (não
// service_role), porque toda ação aqui é feita por um admin logado e precisa aparecer na trilha de
// auditoria como "quem fez" (mesmo padrão já usado em repositorio-admin.ts). Ver
// docs/TELA_ATENDIMENTO_ARRUDACRED.md pro desenho completo.

export type UsuarioSistema = {
  id: string;
  nome: string;
  email: string;
};

/**
 * Usuário do sistema (usuarios_sistema) correspondente ao admin logado agora. Cria na hora se
 * ainda não existir — a tabela nunca foi populada (login sempre foi só via Supabase Auth,
 * usuarios_sistema ficou parada desde a Fase 1) — sem isso não tem como saber "quem" assumiu uma
 * conversa. Cria também a Pessoa correspondente (usuarios_sistema.pessoa_id é obrigatório).
 */
export async function obterUsuarioSistemaAtual(): Promise<UsuarioSistema> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Nenhum admin autenticado.");

  const { data: existente } = await supabase
    .from("usuarios_sistema")
    .select("id, email, pessoas(nome_razao_social)")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (existente) {
    const pessoa = existente.pessoas as unknown as { nome_razao_social: string } | null;
    return { id: existente.id, email: existente.email, nome: pessoa?.nome_razao_social ?? existente.email };
  }

  const nomeInicial = user.email?.split("@")[0] ?? "Admin";
  const { data: pessoa, error: erroPessoa } = await supabase
    .from("pessoas")
    .insert({ tipo_pessoa: "pf", nome_razao_social: nomeInicial })
    .select("id")
    .single();
  if (erroPessoa || !pessoa) throw new Error(`Falha ao criar pessoa do usuário do sistema: ${erroPessoa?.message}`);

  const { data: usuario, error: erroUsuario } = await supabase
    .from("usuarios_sistema")
    .insert({ pessoa_id: pessoa.id, email: user.email ?? "", auth_user_id: user.id })
    .select("id")
    .single();
  if (erroUsuario || !usuario) throw new Error(`Falha ao criar usuário do sistema: ${erroUsuario?.message}`);

  return { id: usuario.id, email: user.email ?? "", nome: nomeInicial };
}

/** Todos os atendentes humanos cadastrados — usado pros filtros rápidos ("Minhas" / "[Fulano]"). */
export async function listarUsuariosSistema(): Promise<UsuarioSistema[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("usuarios_sistema")
    .select("id, email, pessoas(nome_razao_social)")
    .eq("ativo", true);
  if (error) throw new Error(`Falha ao listar usuários do sistema: ${error.message}`);
  return (data ?? []).map((linha) => {
    const pessoa = linha.pessoas as unknown as { nome_razao_social: string } | null;
    return { id: linha.id, email: linha.email, nome: pessoa?.nome_razao_social ?? linha.email };
  });
}

export type FiltroConversas =
  | { tipo: "tudo" }
  | { tipo: "malala" }
  | { tipo: "minhas"; usuarioId: string }
  | { tipo: "atendente"; usuarioId: string }
  | { tipo: "nao_atribuidas" }
  | { tipo: "nao_lidas" };

export type ConversaResumo = {
  conversaId: string;
  pessoaId: string;
  pessoaNome: string;
  pessoaTelefone: string | null;
  etapaKanban: string | null;
  produtoNome: string | null;
  ultimaMensagemConteudo: string | null;
  ultimaMensagemRemetente: string | null;
  ultimaMensagemEm: string | null;
  naoLida: boolean;
  atendenteId: string | null;
  sobSupervisor: boolean;
};

/** Lista de contatos (painel esquerdo) — por padrão só conversas ativas, não perdidas. */
export async function listarConversasAtendimento(
  filtro: FiltroConversas,
  busca: string,
): Promise<ConversaResumo[]> {
  const supabase = await createClient();
  let query = supabase
    .from("conversas_resumo")
    .select("*")
    .eq("status", "ativa")
    .order("ultima_mensagem_em", { ascending: false, nullsFirst: false });

  if (filtro.tipo === "malala") query = query.eq("sob_supervisor", false);
  if (filtro.tipo === "minhas") query = query.eq("atendente_id", filtro.usuarioId);
  if (filtro.tipo === "atendente") query = query.eq("atendente_id", filtro.usuarioId);
  if (filtro.tipo === "nao_atribuidas") query = query.eq("sob_supervisor", true).is("atendente_id", null);

  if (busca.trim()) {
    // Busca por nome/telefone direto na view; conteúdo de mensagem é uma segunda consulta (abaixo)
    // porque a view só traz a ÚLTIMA mensagem, não o histórico inteiro.
    query = query.or(`pessoa_nome.ilike.%${busca}%,pessoa_telefone.ilike.%${busca}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao listar conversas: ${error.message}`);

  const linhas = data ?? [];

  if (busca.trim()) {
    const { data: viaMensagem } = await supabase
      .from("mensagens")
      .select("conversa_id")
      .ilike("conteudo", `%${busca}%`);
    const idsViaMensagem = new Set((viaMensagem ?? []).map((m) => m.conversa_id));
    if (idsViaMensagem.size > 0) {
      const { data: extras } = await supabase
        .from("conversas_resumo")
        .select("*")
        .eq("status", "ativa")
        .in("conversa_id", Array.from(idsViaMensagem));
      const idsJaListados = new Set(linhas.map((l) => l.conversa_id));
      for (const extra of extras ?? []) {
        if (!idsJaListados.has(extra.conversa_id)) linhas.push(extra);
      }
    }
  }

  const resumo: ConversaResumo[] = linhas.map((linha) => ({
    conversaId: linha.conversa_id,
    pessoaId: linha.pessoa_id,
    pessoaNome: linha.pessoa_nome ?? "Novo Lead",
    pessoaTelefone: linha.pessoa_telefone,
    etapaKanban: linha.etapa_kanban,
    produtoNome: linha.produto_nome,
    ultimaMensagemConteudo: linha.ultima_mensagem_conteudo,
    ultimaMensagemRemetente: linha.ultima_mensagem_remetente,
    ultimaMensagemEm: linha.ultima_mensagem_em,
    naoLida: linha.ultima_mensagem_remetente === "lead",
    atendenteId: linha.atendente_id,
    sobSupervisor: linha.sob_supervisor,
  }));

  if (filtro.tipo === "nao_lidas") return resumo.filter((c) => c.naoLida);
  return resumo.sort((a, b) => (b.ultimaMensagemEm ?? "").localeCompare(a.ultimaMensagemEm ?? ""));
}

export type MensagemConversa = {
  id: string;
  remetente: string;
  conteudo: string | null;
  midiaUrl: string | null;
  enviadoEm: string;
};

export type ConversaDetalhe = {
  conversaId: string;
  pessoaId: string;
  oportunidadeId: string | null;
  pessoaNome: string;
  pessoaTelefone: string | null;
  pessoaEmail: string | null;
  etapaKanban: string | null;
  produtoNome: string | null;
  valorEstimado: number | null;
  sobSupervisor: boolean;
  atendenteId: string | null;
  mensagens: MensagemConversa[];
};

/** Conversa inteira (cabeçalho + timeline) — painel direito. */
export async function carregarConversaDetalhe(conversaId: string): Promise<ConversaDetalhe> {
  const supabase = await createClient();

  const { data: conversa, error: erroConversa } = await supabase
    .from("conversas")
    .select(
      "id, pessoa_id, oportunidade_id, sob_supervisor, atendente_id, pessoas(nome_razao_social, whatsapp, email), oportunidades(etapa_kanban, valor_estimado, produtos(nome))",
    )
    .eq("id", conversaId)
    .single();
  if (erroConversa || !conversa) throw new Error(`Falha ao carregar conversa: ${erroConversa?.message}`);

  const pessoa = conversa.pessoas as unknown as { nome_razao_social: string; whatsapp: string | null; email: string | null } | null;
  const oportunidade = conversa.oportunidades as unknown as {
    etapa_kanban: string;
    valor_estimado: number | null;
    produtos: { nome: string } | null;
  } | null;

  const { data: mensagens, error: erroMensagens } = await supabase
    .from("mensagens")
    .select("id, remetente, conteudo, midia_url, enviado_em")
    .eq("conversa_id", conversaId)
    .order("enviado_em", { ascending: true });
  if (erroMensagens) throw new Error(`Falha ao carregar mensagens: ${erroMensagens.message}`);

  return {
    conversaId: conversa.id,
    pessoaId: conversa.pessoa_id,
    oportunidadeId: conversa.oportunidade_id,
    pessoaNome: pessoa?.nome_razao_social ?? "Novo Lead",
    pessoaTelefone: pessoa?.whatsapp ?? null,
    pessoaEmail: pessoa?.email ?? null,
    etapaKanban: oportunidade?.etapa_kanban ?? null,
    produtoNome: oportunidade?.produtos?.nome ?? null,
    valorEstimado: oportunidade?.valor_estimado ?? null,
    sobSupervisor: conversa.sob_supervisor,
    atendenteId: conversa.atendente_id,
    mensagens: (mensagens ?? []).map((m) => ({
      id: m.id,
      remetente: m.remetente,
      conteudo: m.conteudo,
      midiaUrl: m.midia_url,
      enviadoEm: m.enviado_em,
    })),
  };
}

/** "Assumir Chat" — tira a Malala (ou outro atendente) do controle, coloca o admin logado. */
export async function assumirConversa(conversaId: string, usuarioId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversas")
    .update({ sob_supervisor: true, atendente_id: usuarioId })
    .eq("id", conversaId);
  if (error) throw new Error(`Falha ao assumir conversa: ${error.message}`);
}

/** "Atribuir pra Malala" — devolve o controle pro motor automatizado. */
export async function atribuirParaMalala(conversaId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversas")
    .update({ sob_supervisor: false, atendente_id: null })
    .eq("id", conversaId);
  if (error) throw new Error(`Falha ao atribuir conversa pra Malala: ${error.message}`);
}

/** Grava a mensagem de um atendente humano — o envio real via WhatsApp é feito por quem chama (fora daqui, mesmo adaptador de canal da Fase 7). */
export async function registrarMensagemHumana(conversaId: string, texto: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("mensagens")
    .insert({ conversa_id: conversaId, remetente: "supervisor", conteudo: texto });
  if (error) throw new Error(`Falha ao registrar mensagem: ${error.message}`);
}
