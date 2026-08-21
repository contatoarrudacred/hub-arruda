import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ehCorBadgeValida, type CorBadge } from "./cores-atendimento";
import { proximoDisparoPrevisto } from "./motor-followup";
import { carregarItensAgenda } from "./repositorio";

// Camada de dados da Tela de Atendimento (Bloco A) — usa sempre o cliente autenticado (não
// service_role), porque toda ação aqui é feita por um admin logado e precisa aparecer na trilha de
// auditoria como "quem fez" (mesmo padrão já usado em repositorio-admin.ts). Ver
// docs/TELA_ATENDIMENTO_ARRUDACRED.md pro desenho completo.

/**
 * Escapa um valor pra uso dentro de um filtro `.or()` do PostgREST — vírgula separa condições e
 * parênteses agrupam, então um texto de busca digitado pelo atendente com esses caracteres
 * alterava a estrutura do filtro em vez de ser tratado como texto literal (achado real na
 * avaliação de 16/08/2026). Envolver o valor em aspas duplas trata tudo dentro como literal — só
 * falta escapar aspas duplas/barra invertida que apareçam dentro do próprio texto de busca.
 */
function escaparValorFiltroOr(valor: string): string {
  return valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export type UsuarioSistema = {
  id: string;
  nome: string;
  email: string;
  corBadge: CorBadge;
  ehConsultor: boolean;
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

  const { data: existente, error: erroExistente } = await supabase
    .from("usuarios_sistema")
    .select("id, email, cor_badge, eh_consultor, pessoas(nome_razao_social)")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  // Erro de verdade (ex.: coluna renomeada/removida, RLS bloqueando) não pode ser tratado como
  // "usuário não existe" — isso já causou um bug real (16/08/2026): erro era ignorado, o código
  // caía direto na criação de um usuário/pessoa novo a cada carregamento de página.
  if (erroExistente) throw new Error(`Falha ao buscar usuário do sistema: ${erroExistente.message}`);
  if (existente) {
    const pessoa = existente.pessoas as unknown as { nome_razao_social: string } | null;
    const cor = ehCorBadgeValida(existente.cor_badge) ? existente.cor_badge : "azul";
    return {
      id: existente.id,
      email: existente.email,
      nome: pessoa?.nome_razao_social ?? existente.email,
      corBadge: cor,
      ehConsultor: existente.eh_consultor,
    };
  }

  // Pode existir um registro antigo com o mesmo e-mail mas auth_user_id desatualizado (ex.: o
  // usuário do Supabase Auth foi recriado) — realinha em vez de tentar criar um duplicado e
  // esbarrar na constraint de e-mail único (bug real encontrado em 16/08/2026, quebrava a tela
  // de Atendimento inteira com "duplicate key value violates unique constraint
  // usuarios_sistema_email_key").
  if (user.email) {
    const { data: porEmail, error: erroPorEmail } = await supabase
      .from("usuarios_sistema")
      .select("id, email, cor_badge, eh_consultor, pessoas(nome_razao_social)")
      .eq("email", user.email)
      .maybeSingle();
    if (erroPorEmail) throw new Error(`Falha ao buscar usuário do sistema por e-mail: ${erroPorEmail.message}`);
    if (porEmail) {
      const { error: erroRealinho } = await supabase
        .from("usuarios_sistema")
        .update({ auth_user_id: user.id })
        .eq("id", porEmail.id);
      if (erroRealinho) throw new Error(`Falha ao realinhar usuário do sistema: ${erroRealinho.message}`);
      const pessoa = porEmail.pessoas as unknown as { nome_razao_social: string } | null;
      const cor = ehCorBadgeValida(porEmail.cor_badge) ? porEmail.cor_badge : "azul";
      return {
        id: porEmail.id,
        email: porEmail.email,
        nome: pessoa?.nome_razao_social ?? porEmail.email,
        corBadge: cor,
        ehConsultor: porEmail.eh_consultor,
      };
    }
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

  return { id: usuario.id, email: user.email ?? "", nome: nomeInicial, corBadge: "azul", ehConsultor: false };
}

/** Todos os atendentes humanos cadastrados — usado pros filtros rápidos ("Minhas" / "[Fulano]"). */
export async function listarUsuariosSistema(): Promise<UsuarioSistema[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("usuarios_sistema")
    .select("id, email, cor_badge, eh_consultor, pessoas(nome_razao_social)")
    .eq("ativo", true);
  if (error) throw new Error(`Falha ao listar usuários do sistema: ${error.message}`);
  return (data ?? []).map((linha) => {
    const pessoa = linha.pessoas as unknown as { nome_razao_social: string } | null;
    const cor = ehCorBadgeValida(linha.cor_badge) ? linha.cor_badge : "azul";
    return {
      id: linha.id,
      email: linha.email,
      nome: pessoa?.nome_razao_social ?? linha.email,
      corBadge: cor,
      ehConsultor: linha.eh_consultor,
    };
  });
}

// --- Agendamento com consultor (spec 2026-08-20-agendamento-consultor-alto-valor.md) -----------

export async function definirConsultor(usuarioId: string, ehConsultor: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("usuarios_sistema").update({ eh_consultor: ehConsultor }).eq("id", usuarioId);
  if (error) throw new Error(`Falha ao atualizar consultor: ${error.message}`);
}

export type LinhaDisponibilidade = { diaSemana: number; horaInicio: number; horaFim: number; ativo: boolean };

/** Disponibilidade de um consultor, sempre as 7 linhas (0=domingo..6=sábado) — dia sem linha configurada vem com `ativo:false` e a janela padrão (10-21h) só como valor inicial de edição. */
export async function listarDisponibilidadeConsultor(usuarioId: string): Promise<LinhaDisponibilidade[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("disponibilidade_atendente")
    .select("dia_semana, hora_inicio, hora_fim, ativo")
    .eq("usuario_sistema_id", usuarioId);
  if (error) throw new Error(`Falha ao listar disponibilidade: ${error.message}`);

  const porDia = new Map((data ?? []).map((linha) => [Number(linha.dia_semana), linha]));
  return Array.from({ length: 7 }, (_, diaSemana) => {
    const linha = porDia.get(diaSemana);
    return {
      diaSemana,
      horaInicio: linha ? Number(linha.hora_inicio.split(":")[0]) : 10,
      horaFim: linha ? Number(linha.hora_fim.split(":")[0]) : diaSemana === 6 ? 15 : 21,
      ativo: linha?.ativo ?? false,
    };
  });
}

export type AgendamentoConsultor = {
  id: string;
  inicio: string;
  fim: string;
  status: string;
  motivo: string;
  pessoaNome: string;
  pessoaTelefone: string | null;
};

/** Agendamentos do consultor logado — passados e futuros, mais recente primeiro. Tela "Minha Agenda" (spec 2026-08-20-agendamento-consultor-alto-valor.md), sem calendário visual — só lista, decisão de Luiz. */
export async function listarAgendamentosConsultor(usuarioId: string): Promise<AgendamentoConsultor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agendamentos_consultor")
    .select("id, inicio, fim, status, motivo, pessoas(nome_razao_social, whatsapp)")
    .eq("usuario_sistema_id", usuarioId)
    .order("inicio", { ascending: false });
  if (error) throw new Error(`Falha ao listar agendamentos: ${error.message}`);

  return (data ?? []).map((linha) => {
    const pessoa = linha.pessoas as unknown as { nome_razao_social: string; whatsapp: string | null } | null;
    return {
      id: linha.id,
      inicio: linha.inicio,
      fim: linha.fim,
      status: linha.status,
      motivo: linha.motivo,
      pessoaNome: pessoa?.nome_razao_social ?? "Lead",
      pessoaTelefone: pessoa?.whatsapp ?? null,
    };
  });
}

export type LembreteAgendamento = { pessoaNome: string; inicio: string; tipo: "15min" | "hora" };

/**
 * Lembrete pendente do consultor logado — 15 minutos antes do agendamento, ou no horário exato
 * (spec 2026-08-20-agendamento-consultor-alto-valor.md). Marca o lembrete como enviado na mesma
 * chamada (nunca repete o mesmo aviso) — chamado por polling do layout raiz do admin, então
 * concorrência não é uma preocupação real aqui (um usuário só, checando a cada ~30s).
 */
export async function buscarLembretePendente(usuarioId: string): Promise<LembreteAgendamento | null> {
  const supabase = await createClient();
  const agora = new Date();
  const em15min = new Date(agora.getTime() + 15 * 60 * 1000);

  const { data, error } = await supabase
    .from("agendamentos_consultor")
    .select("id, inicio, fim, lembrete_15min_enviado, lembrete_hora_enviado, pessoas(nome_razao_social)")
    .eq("usuario_sistema_id", usuarioId)
    .eq("status", "confirmado")
    .lte("inicio", em15min.toISOString())
    .gte("fim", agora.toISOString())
    .order("inicio", { ascending: true });
  if (error) throw new Error(`Falha ao buscar lembrete: ${error.message}`);

  for (const linha of data ?? []) {
    const inicio = new Date(linha.inicio);
    const pessoa = linha.pessoas as unknown as { nome_razao_social: string } | null;
    const nome = pessoa?.nome_razao_social ?? "Lead";

    if (!linha.lembrete_hora_enviado && agora >= inicio) {
      await supabase.from("agendamentos_consultor").update({ lembrete_hora_enviado: true }).eq("id", linha.id);
      return { pessoaNome: nome, inicio: linha.inicio, tipo: "hora" };
    }
    if (!linha.lembrete_15min_enviado && agora < inicio) {
      await supabase.from("agendamentos_consultor").update({ lembrete_15min_enviado: true }).eq("id", linha.id);
      return { pessoaNome: nome, inicio: linha.inicio, tipo: "15min" };
    }
  }
  return null;
}

/** Substitui a disponibilidade inteira do consultor pelas linhas informadas (delete+insert, mais simples que fazer upsert por dia — o volume é sempre no máximo 7 linhas). */
export async function salvarDisponibilidadeConsultor(usuarioId: string, linhas: LinhaDisponibilidade[]): Promise<void> {
  const supabase = await createClient();
  const { error: erroDelete } = await supabase.from("disponibilidade_atendente").delete().eq("usuario_sistema_id", usuarioId);
  if (erroDelete) throw new Error(`Falha ao limpar disponibilidade anterior: ${erroDelete.message}`);

  const ativas = linhas.filter((l) => l.ativo);
  if (ativas.length === 0) return;

  const { error: erroInsert } = await supabase.from("disponibilidade_atendente").insert(
    ativas.map((l) => ({
      usuario_sistema_id: usuarioId,
      dia_semana: l.diaSemana,
      hora_inicio: `${String(l.horaInicio).padStart(2, "0")}:00`,
      hora_fim: `${String(l.horaFim).padStart(2, "0")}:00`,
      ativo: true,
    })),
  );
  if (erroInsert) throw new Error(`Falha ao salvar disponibilidade: ${erroInsert.message}`);
}

export type FiltroConversas =
  | { tipo: "tudo" }
  | { tipo: "malala" }
  | { tipo: "humano_minhas"; usuarioId: string }
  | { tipo: "humano_nao_atribuidas" }
  | { tipo: "humano_todas" }
  | { tipo: "humano_atendente"; atendenteId: string }
  | { tipo: "nao_lidas" };

export type ConversaResumo = {
  conversaId: string;
  pessoaId: string;
  pessoaNome: string;
  /** Placeholder ("Lead (WhatsApp)"/"Novo Lead") — ver `nomeConhecido`, não usar `pessoaNome` sozinho pra decidir o que mostrar no card. */
  nomeConhecido: boolean;
  pessoaTelefone: string | null;
  etapaKanban: string | null;
  produtoNome: string | null;
  produtoNomeReduzido: string | null;
  valorEstimado: number | null;
  ultimaMensagemConteudo: string | null;
  ultimaMensagemRemetente: string | null;
  ultimaMensagemEm: string | null;
  ultimaMensagemEntregueEm: string | null;
  ultimaMensagemLidoEm: string | null;
  naoLidasContagem: number;
  atendenteId: string | null;
  sobSupervisor: boolean;
  atendenteNome: string | null;
  atendenteCor: CorBadge | null;
  favorita: boolean;
  /** Foto de perfil do WhatsApp mais recente (Bloco D) — null quando o contato não tem foto pública ou ainda não mandou mensagem nenhuma. */
  fotoUrl: string | null;
  /** Sinais brutos do selo de risco de esfriar (Bloco D/Fase 5) — combinados em `selo-risco.ts` (calcularSeloRisco), calculado no client pra reaproveitar exatamente a mesma lógica testada do cabeçalho da conversa. */
  aguardandoRespostaDesde: string | null;
  contadorNaoReconhecimento: number;
  estagnadoDesde: string | null;
};

/** Placeholders gravados por `carregarOuCriarConversaWhatsapp`/repositorio-atendimento quando o lead ainda não disse o nome — string exata, não é o ideal (frágil a typo), mas evita uma coluna nova só pra isto agora. */
const NOMES_PLACEHOLDER = new Set(["Lead (WhatsApp)", "Novo Lead"]);

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
    // Escopo padrão (TELA_ATENDIMENTO_ARRUDACRED.md seção 2): esconde oportunidade "perdida" —
    // volta a aparecer sozinha se o lead responder de novo (a oportunidade reabre na última etapa,
    // motor-followup.ts, sem precisar de filtro nenhum aqui).
    .or("etapa_kanban.is.null,etapa_kanban.neq.perdida")
    .order("ultima_mensagem_em", { ascending: false, nullsFirst: false });

  if (filtro.tipo === "malala") query = query.eq("sob_supervisor", false);
  if (filtro.tipo === "humano_minhas") query = query.eq("atendente_id", filtro.usuarioId);
  if (filtro.tipo === "humano_nao_atribuidas") query = query.eq("sob_supervisor", true).is("atendente_id", null);
  if (filtro.tipo === "humano_todas") query = query.eq("sob_supervisor", true);
  if (filtro.tipo === "humano_atendente") query = query.eq("atendente_id", filtro.atendenteId);

  if (busca.trim()) {
    // Busca por nome/telefone direto na view; conteúdo de mensagem é uma segunda consulta (abaixo)
    // porque a view só traz a ÚLTIMA mensagem, não o histórico inteiro.
    const buscaEscapada = escaparValorFiltroOr(busca.trim());
    query = query.or(`pessoa_nome.ilike."%${buscaEscapada}%",pessoa_telefone.ilike."%${buscaEscapada}%"`);
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

  const resumo: ConversaResumo[] = linhas.map((linha) => {
    const nome = linha.pessoa_nome ?? "Novo Lead";
    return {
      conversaId: linha.conversa_id,
      pessoaId: linha.pessoa_id,
      pessoaNome: nome,
      nomeConhecido: !NOMES_PLACEHOLDER.has(nome),
      pessoaTelefone: linha.pessoa_telefone,
      etapaKanban: linha.etapa_kanban,
      produtoNome: linha.produto_nome,
      produtoNomeReduzido: linha.produto_nome_reduzido,
      valorEstimado: linha.valor_estimado,
      ultimaMensagemConteudo: linha.ultima_mensagem_conteudo,
      ultimaMensagemRemetente: linha.ultima_mensagem_remetente,
      ultimaMensagemEm: linha.ultima_mensagem_em,
      ultimaMensagemEntregueEm: linha.ultima_mensagem_entregue_em,
      ultimaMensagemLidoEm: linha.ultima_mensagem_lido_em,
      naoLidasContagem: linha.nao_lidas_contagem ?? 0,
      atendenteId: linha.atendente_id,
      sobSupervisor: linha.sob_supervisor,
      atendenteNome: linha.atendente_nome,
      atendenteCor: ehCorBadgeValida(linha.atendente_cor ?? "") ? (linha.atendente_cor as CorBadge) : null,
      favorita: linha.favorita ?? false,
      fotoUrl: linha.pessoa_foto_url ?? null,
      aguardandoRespostaDesde: linha.aguardando_resposta_desde ?? null,
      contadorNaoReconhecimento: linha.contador_nao_reconhecimento ?? 0,
      estagnadoDesde: linha.estagnado_desde ?? null,
    };
  });

  const filtrado = filtro.tipo === "nao_lidas" ? resumo.filter((c) => c.naoLidasContagem > 0) : resumo;
  return filtrado.sort((a, b) => {
    if (a.favorita !== b.favorita) return a.favorita ? -1 : 1;
    return (b.ultimaMensagemEm ?? "").localeCompare(a.ultimaMensagemEm ?? "");
  });
}

/** Histórico completo de fotos de perfil de uma pessoa (Bloco D) — mais recente primeiro, pra modal de histórico da Tela de Atendimento. */
export async function listarFotosPessoa(pessoaId: string): Promise<{ url: string; capturadaEm: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pessoa_fotos")
    .select("url, capturada_em")
    .eq("pessoa_id", pessoaId)
    .order("capturada_em", { ascending: false });
  if (error) throw new Error(`Falha ao carregar histórico de fotos: ${error.message}`);
  return (data ?? []).map((f) => ({ url: f.url, capturadaEm: f.capturada_em }));
}

/** Liga/desliga o favorito da conversa (sobe pro topo da lista de contatos quando favoritada). */
export async function alternarFavorita(conversaId: string, favorita: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("conversas").update({ favorita }).eq("id", conversaId);
  if (error) throw new Error(`Falha ao favoritar conversa: ${error.message}`);
}

/** Atendente marca a estagnação (selo de risco 🔴, sinal 3) como resolvida — objeção endereçada ou negociação retomada manualmente. Bloco D/Fase 5, `selo-risco.ts`. */
export async function resolverEstagnacao(conversaId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("conversas").update({ estagnado_desde: null }).eq("id", conversaId);
  if (error) throw new Error(`Falha ao resolver estagnação: ${error.message}`);
}

export type ContagemNaoLidas = {
  tudo: number;
  malala: number;
  humanoMinhas: number;
  humanoNaoAtribuidas: number;
  humanoTodas: number;
  porAtendente: Record<string, number>;
};

/** Quantidade de conversas não lidas por filtro (badges vermelhos na barra de filtros). */
export async function contarNaoLidas(usuarioId: string): Promise<ContagemNaoLidas> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversas_resumo")
    .select("sob_supervisor, atendente_id, ultima_mensagem_remetente")
    .eq("status", "ativa")
    .or("etapa_kanban.is.null,etapa_kanban.neq.perdida");
  if (error) throw new Error(`Falha ao contar não lidas: ${error.message}`);

  const naoLidas = (data ?? []).filter((linha) => linha.ultima_mensagem_remetente === "lead");

  const porAtendente: Record<string, number> = {};
  for (const linha of naoLidas) {
    if (linha.atendente_id) porAtendente[linha.atendente_id] = (porAtendente[linha.atendente_id] ?? 0) + 1;
  }

  return {
    tudo: naoLidas.length,
    malala: naoLidas.filter((linha) => !linha.sob_supervisor).length,
    humanoMinhas: naoLidas.filter((linha) => linha.atendente_id === usuarioId).length,
    humanoNaoAtribuidas: naoLidas.filter((linha) => linha.sob_supervisor && !linha.atendente_id).length,
    humanoTodas: naoLidas.filter((linha) => linha.sob_supervisor).length,
    porAtendente,
  };
}

export type MensagemConversa = {
  id: string;
  remetente: string;
  conteudo: string | null;
  midiaUrl: string | null;
  /** imagem/audio/video/documento — null em mensagens antigas (anteriores à migration 027), o frontend cai pra "imagem" nesse caso. */
  midiaTipo: string | null;
  entregueEm: string | null;
  lidoEm: string | null;
  enviadoEm: string;
};

export type NotaInterna = {
  id: string;
  conversaId: string;
  /** null = nota gerada pelo motor (handoff automático), sem autor humano — ver `autorNome`. */
  autorId: string | null;
  autorNome: string;
  texto: string;
  criadoEm: string;
};

export type Notificacao = {
  id: string;
  tipo: "mencao" | "atribuicao" | "agendamento";
  conversaId: string;
  pessoaNome: string;
  lida: boolean;
  criadoEm: string;
};

export type ConversaDetalhe = {
  conversaId: string;
  pessoaId: string;
  oportunidadeId: string | null;
  pessoaNome: string;
  pessoaTelefone: string | null;
  pessoaEmail: string | null;
  iniciadaEm: string;
  etapaKanban: string | null;
  produtoNome: string | null;
  produtoNomeReduzido: string | null;
  tipoDocumento: string | null;
  valorEstimado: number | null;
  sobSupervisor: boolean;
  atendenteId: string | null;
  atendenteNome: string | null;
  atendenteCor: CorBadge | null;
  etapaFluxoAtualId: string | null;
  followupAtivo: boolean;
  followupProximoEm: string | null;
  notas: NotaInterna[];
  mensagens: MensagemConversa[];
  /** Foto de perfil do WhatsApp mais recente (Bloco D) — null quando o contato não tem foto pública. */
  fotoUrl: string | null;
  /** Sinais brutos do selo de risco de esfriar (Bloco D/Fase 5) — combinados em `selo-risco.ts` (calcularSeloRisco). */
  aguardandoRespostaDesde: string | null;
  contadorNaoReconhecimento: number;
  estagnadoDesde: string | null;
};

/** Conversa inteira (cabeçalho + timeline) — painel direito. */
export async function carregarConversaDetalhe(conversaId: string): Promise<ConversaDetalhe> {
  const supabase = await createClient();

  const { data: conversa, error: erroConversa } = await supabase
    .from("conversas")
    .select(
      "id, pessoa_id, oportunidade_id, sob_supervisor, atendente_id, etapa_fluxo_atual_id, agenda_followup_id, aguardando_resposta_desde, proximo_item_agenda, followup_manual_ativo, created_at, dados, contador_nao_reconhecimento, estagnado_desde, pessoas(nome_razao_social, whatsapp, email), oportunidades(etapa_kanban, valor_estimado, produtos(nome, nome_reduzido)), usuarios_sistema(cor_badge, pessoas(nome_razao_social))",
    )
    .eq("id", conversaId)
    .single();
  if (erroConversa || !conversa) throw new Error(`Falha ao carregar conversa: ${erroConversa?.message}`);

  const pessoa = conversa.pessoas as unknown as { nome_razao_social: string; whatsapp: string | null; email: string | null } | null;
  const oportunidade = conversa.oportunidades as unknown as {
    etapa_kanban: string;
    valor_estimado: number | null;
    produtos: { nome: string; nome_reduzido: string | null } | null;
  } | null;
  const atendente = conversa.usuarios_sistema as unknown as {
    cor_badge: string;
    pessoas: { nome_razao_social: string } | null;
  } | null;
  const dados = conversa.dados as unknown as { tipo_documento?: string } | null;

  const { data: mensagens, error: erroMensagens } = await supabase
    .from("mensagens")
    .select("id, remetente, conteudo, midia_url, midia_tipo, entregue_em, lido_em, enviado_em")
    .eq("conversa_id", conversaId)
    .order("enviado_em", { ascending: true });
  if (erroMensagens) throw new Error(`Falha ao carregar mensagens: ${erroMensagens.message}`);

  const { data: notas, error: erroNotas } = await supabase
    .from("notas_internas")
    .select("id, autor_id, texto, created_at, usuarios_sistema(pessoas(nome_razao_social))")
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: true });
  if (erroNotas) throw new Error(`Falha ao carregar notas internas: ${erroNotas.message}`);

  const { data: ultimaFoto } = await supabase
    .from("pessoa_fotos")
    .select("url")
    .eq("pessoa_id", conversa.pessoa_id)
    .order("capturada_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const followupAtivo =
    Boolean(conversa.aguardando_resposta_desde) &&
    Boolean(conversa.agenda_followup_id) &&
    (!conversa.sob_supervisor || conversa.followup_manual_ativo);
  let followupProximoEm: string | null = null;
  if (followupAtivo && conversa.agenda_followup_id && conversa.aguardando_resposta_desde) {
    const itens = await carregarItensAgenda(conversa.agenda_followup_id);
    const previsto = proximoDisparoPrevisto(itens, conversa.proximo_item_agenda, new Date(conversa.aguardando_resposta_desde));
    followupProximoEm = previsto?.toISOString() ?? null;
  }

  return {
    conversaId: conversa.id,
    pessoaId: conversa.pessoa_id,
    oportunidadeId: conversa.oportunidade_id,
    pessoaNome: pessoa?.nome_razao_social ?? "Novo Lead",
    pessoaTelefone: pessoa?.whatsapp ?? null,
    pessoaEmail: pessoa?.email ?? null,
    iniciadaEm: conversa.created_at,
    etapaKanban: oportunidade?.etapa_kanban ?? null,
    produtoNome: oportunidade?.produtos?.nome ?? null,
    produtoNomeReduzido: oportunidade?.produtos?.nome_reduzido ?? null,
    tipoDocumento: dados?.tipo_documento ?? null,
    valorEstimado: oportunidade?.valor_estimado ?? null,
    sobSupervisor: conversa.sob_supervisor,
    atendenteId: conversa.atendente_id,
    atendenteNome: atendente?.pessoas?.nome_razao_social ?? null,
    atendenteCor: atendente && ehCorBadgeValida(atendente.cor_badge) ? (atendente.cor_badge as CorBadge) : null,
    etapaFluxoAtualId: conversa.etapa_fluxo_atual_id,
    followupAtivo,
    followupProximoEm,
    fotoUrl: ultimaFoto?.url ?? null,
    aguardandoRespostaDesde: conversa.aguardando_resposta_desde,
    contadorNaoReconhecimento: conversa.contador_nao_reconhecimento ?? 0,
    estagnadoDesde: conversa.estagnado_desde,
    notas: (notas ?? []).map((n) => {
      const autorInfo = n.usuarios_sistema as unknown as { pessoas: { nome_razao_social: string } | null } | null;
      return {
        id: n.id,
        conversaId,
        autorId: n.autor_id,
        autorNome: n.autor_id === null ? "Malala (sistema)" : (autorInfo?.pessoas?.nome_razao_social ?? "Atendente"),
        texto: n.texto,
        criadoEm: n.created_at,
      };
    }),
    mensagens: (mensagens ?? []).map((m) => ({
      id: m.id,
      remetente: m.remetente,
      conteudo: m.conteudo,
      midiaUrl: m.midia_url,
      midiaTipo: m.midia_tipo,
      entregueEm: m.entregue_em,
      lidoEm: m.lido_em,
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

/** Troca a cor do próprio atendente (paleta fechada, ver cores-atendimento.ts). */
export async function atualizarCorBadge(usuarioId: string, cor: CorBadge): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("usuarios_sistema").update({ cor_badge: cor }).eq("id", usuarioId);
  if (error) throw new Error(`Falha ao atualizar cor: ${error.message}`);
}

/** Atribui a conversa a um atendente humano específico (diferente de "Assumir" — pode ser feito por qualquer atendente, não só o destinatário) e notifica quem recebeu. */
export async function atribuirParaAtendente(conversaId: string, atendenteId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversas")
    .update({ sob_supervisor: true, atendente_id: atendenteId })
    .eq("id", conversaId);
  if (error) throw new Error(`Falha ao atribuir conversa ao atendente: ${error.message}`);

  const { error: erroNotif } = await supabase
    .from("notificacoes")
    .insert({ usuario_id: atendenteId, tipo: "atribuicao", conversa_id: conversaId });
  if (erroNotif) throw new Error(`Falha ao notificar atribuição: ${erroNotif.message}`);
}

/** Grava a mensagem de um atendente humano — o envio real via WhatsApp é feito por quem chama (fora daqui, mesmo adaptador de canal da Fase 7). `midiaUrl` preenchido quando é uma mensagem de anexo (Bloco B2, Fase 5). */
export async function registrarMensagemHumana(
  conversaId: string,
  texto: string,
  zapsterMessageId: string | null,
  midiaUrl: string | null = null,
  midiaTipo: string | null = null,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("mensagens").insert({
    conversa_id: conversaId,
    remetente: "supervisor",
    conteudo: texto || null,
    midia_url: midiaUrl,
    midia_tipo: midiaTipo,
    zapster_message_id: zapsterMessageId,
  });
  if (error) throw new Error(`Falha ao registrar mensagem: ${error.message}`);
}

/** Casa @PrimeiroNome (case-insensitive, limite de palavra) contra os atendentes ativos. Sem autocomplete nesta fase — é resolução de texto simples. */
function extrairMencoes(texto: string, atendentes: UsuarioSistema[]): UsuarioSistema[] {
  return atendentes.filter((atendente) => {
    const primeiroNome = atendente.nome.split(" ")[0];
    const regex = new RegExp(`@${primeiroNome}\\b`, "i");
    return regex.test(texto);
  });
}

/** Cria uma nota interna e notifica quem foi @mencionado (exceto o próprio autor, se ele se mencionar). */
export async function criarNotaInterna(conversaId: string, texto: string): Promise<void> {
  const supabase = await createClient();
  const autor = await obterUsuarioSistemaAtual();

  const { data: nota, error } = await supabase
    .from("notas_internas")
    .insert({ conversa_id: conversaId, autor_id: autor.id, texto })
    .select("id")
    .single();
  if (error || !nota) throw new Error(`Falha ao criar nota interna: ${error?.message}`);

  const atendentes = await listarUsuariosSistema();
  const mencionados = extrairMencoes(texto, atendentes).filter((a) => a.id !== autor.id);
  if (mencionados.length > 0) {
    const { error: erroNotif } = await supabase
      .from("notificacoes")
      .insert(mencionados.map((m) => ({ usuario_id: m.id, tipo: "mencao", conversa_id: conversaId, nota_id: nota.id })));
    if (erroNotif) throw new Error(`Falha ao notificar menção: ${erroNotif.message}`);
  }
}

/** Notificações do usuário, mais recentes primeiro — usadas pelo sino da Tela de Atendimento. */
export async function listarNotificacoes(usuarioId: string): Promise<Notificacao[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notificacoes")
    .select("id, tipo, conversa_id, lida, created_at, conversas(pessoas(nome_razao_social))")
    .eq("usuario_id", usuarioId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`Falha ao listar notificações: ${error.message}`);
  return (data ?? []).map((n) => {
    const conversaInfo = n.conversas as unknown as { pessoas: { nome_razao_social: string } | null } | null;
    return {
      id: n.id,
      tipo: n.tipo as "mencao" | "atribuicao" | "agendamento",
      conversaId: n.conversa_id,
      pessoaNome: conversaInfo?.pessoas?.nome_razao_social ?? "Contato",
      lida: n.lida,
      criadoEm: n.created_at,
    };
  });
}

export async function contarNotificacoesNaoLidas(usuarioId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notificacoes")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", usuarioId)
    .eq("lida", false);
  if (error) throw new Error(`Falha ao contar notificações: ${error.message}`);
  return count ?? 0;
}

export async function marcarNotificacaoLida(notificacaoId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("notificacoes").update({ lida: true }).eq("id", notificacaoId);
  if (error) throw new Error(`Falha ao marcar notificação como lida: ${error.message}`);
}

/**
 * Ativa follow-up automático numa conversa com humano no controle — sem isso o cron
 * (api/cron/followups) ignora conversas com `sob_supervisor=true` (ver `followup_manual_ativo`,
 * migration 025). Acionado pelo modal "trocar de conversa sem resposta" da Tela de Atendimento.
 */
export async function ativarFollowupManual(conversaId: string, agendaFollowupId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversas")
    .update({
      agenda_followup_id: agendaFollowupId,
      aguardando_resposta_desde: new Date().toISOString(),
      proximo_item_agenda: 0,
      followup_manual_ativo: true,
    })
    .eq("id", conversaId);
  if (error) throw new Error(`Falha ao ativar follow-up manual: ${error.message}`);
}

/**
 * Texto literal das mensagens de texto da etapa em que a conversa está parada agora — usado pelo
 * atalho "⚡ Próxima etapa" do composer, pra o humano reaproveitar (e revisar/editar) exatamente o
 * que a Malala mandaria a seguir. Mensagens que não são texto (imagem, pix etc.) são ignoradas: o
 * composer só manda texto livre, mídia continua sendo responsabilidade de outro fluxo.
 */
export async function carregarTextoEtapaScript(etapaId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("etapas_fluxo").select("conteudo").eq("id", etapaId).maybeSingle();
  if (error) throw new Error(`Falha ao carregar etapa do fluxo: ${error.message}`);
  if (!data) return null;

  const conteudo = data.conteudo as { mensagens?: { tipo: string; texto?: string }[] };
  const textos = (conteudo.mensagens ?? []).filter((m) => m.tipo === "texto" && m.texto).map((m) => m.texto as string);
  return textos.length > 0 ? textos.join("\n\n") : null;
}
