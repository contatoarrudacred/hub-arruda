import "server-only";
import { createClient } from "@/lib/supabase/server";
import { tipoEtapaDb } from "./db";
import type { ConteudoEtapa } from "./tipos";

// Camada de I/O usada pelo painel admin (leitura E escrita) — separada de repositorio.ts, que é
// só leitura e serve o motor de fluxo em tempo real. Usa o cliente autenticado (cookie de sessão),
// não o service_role: /admin/* já é protegido por proxy.ts (sempre há um usuário logado aqui), e
// autenticar de verdade é o que permite ao Postgres saber "quem" está escrevendo — auth.uid() fica
// disponível pro trigger de auditoria (auditoria_log, ver SEGURANCA_E_AUDITORIA_ARRUDACRED.md).
// As tabelas abaixo têm política de RLS liberando acesso total pra qualquer usuário autenticado
// (nível único ADMIN/MASTER hoje, MODELAGEM_DADOS_ARRUDACRED.md) — sem essa política o acesso seria
// negado por padrão (Supabase liga RLS automaticamente em toda tabela nova).

export type FluxoAdmin = { id: string; nome: string; produtoId: string | null };

export async function listarFluxos(): Promise<FluxoAdmin[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fluxos").select("id, nome, produto_id").order("nome");

  if (error) {
    throw new Error(`Falha ao listar fluxos: ${error.message}`);
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    nome: linha.nome,
    produtoId: linha.produto_id,
  }));
}

export type EtapaAdmin = {
  id: string;
  fluxoId: string;
  ordem: number;
  campoSalvo: string | null;
  agendaFollowupId: string | null;
  conteudo: ConteudoEtapa;
};

export async function carregarEtapasDoFluxo(fluxoId: string): Promise<EtapaAdmin[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("etapas_fluxo")
    .select("id, fluxo_id, ordem, campo_salvo, agenda_followup_id, conteudo")
    .eq("fluxo_id", fluxoId)
    .order("ordem");

  if (error) {
    throw new Error(`Falha ao carregar etapas do fluxo: ${error.message}`);
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    fluxoId: linha.fluxo_id,
    ordem: linha.ordem,
    campoSalvo: linha.campo_salvo,
    agendaFollowupId: linha.agenda_followup_id,
    conteudo: linha.conteudo as ConteudoEtapa,
  }));
}

/** Id + código de toda etapa que existe hoje, em qualquer fluxo — a navegação do motor cruza fluxos (ex.: triagem → produto), então validar referências e colisão de código precisa considerar tudo, não só o fluxo aberto no editor. */
export async function carregarResumoDeTodasEtapas(): Promise<{ id: string; codigo: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("etapas_fluxo").select("id, conteudo");

  if (error) {
    throw new Error(`Falha ao carregar etapas existentes: ${error.message}`);
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    codigo: (linha.conteudo as ConteudoEtapa).codigo,
  }));
}

export type AgendaAdmin = { id: string; nome: string };

export async function listarAgendasFollowup(): Promise<AgendaAdmin[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("agendas_followup").select("id, nome").order("nome");

  if (error) {
    throw new Error(`Falha ao listar agendas de follow-up: ${error.message}`);
  }

  return data ?? [];
}

export type EntradaSalvarEtapa = {
  id: string | null;
  fluxoId: string;
  ordem: number;
  campoSalvo: string | null;
  agendaFollowupId: string | null;
  conteudo: ConteudoEtapa;
};

export async function salvarEtapa(entrada: EntradaSalvarEtapa): Promise<{ id: string }> {
  const supabase = await createClient();
  const linha = {
    fluxo_id: entrada.fluxoId,
    ordem: entrada.ordem,
    tipo_etapa: tipoEtapaDb(entrada.conteudo),
    conteudo: entrada.conteudo,
    campo_salvo: entrada.campoSalvo,
    agenda_followup_id: entrada.agendaFollowupId,
  };

  if (entrada.id) {
    const { error } = await supabase.from("etapas_fluxo").update(linha).eq("id", entrada.id);
    if (error) throw new Error(`Falha ao atualizar etapa: ${error.message}`);
    return { id: entrada.id };
  }

  const { data, error } = await supabase.from("etapas_fluxo").insert(linha).select("id").single();
  if (error) throw new Error(`Falha ao criar etapa: ${error.message}`);
  return { id: data.id };
}

export async function excluirEtapa(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("etapas_fluxo").delete().eq("id", id);
  if (error) throw new Error(`Falha ao excluir etapa: ${error.message}`);
}

export type ProdutoAdmin = { id: string; nome: string };

export async function listarProdutos(): Promise<ProdutoAdmin[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("produtos").select("id, nome").order("nome");

  if (error) {
    throw new Error(`Falha ao listar produtos: ${error.message}`);
  }
  return data ?? [];
}

export type FaqAdmin = {
  id: string;
  produtoId: string;
  pergunta: string;
  resposta: string;
  ativo: boolean;
};

export async function listarFaqs(): Promise<FaqAdmin[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("faqs")
    .select("id, produto_id, pergunta, resposta, ativo")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao listar FAQs: ${error.message}`);
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    produtoId: linha.produto_id,
    pergunta: linha.pergunta,
    resposta: linha.resposta,
    ativo: linha.ativo,
  }));
}

export type EntradaSalvarFaq = {
  id: string | null;
  produtoId: string;
  pergunta: string;
  resposta: string;
  ativo: boolean;
};

export async function salvarFaq(entrada: EntradaSalvarFaq): Promise<{ id: string }> {
  const supabase = await createClient();
  const linha = {
    produto_id: entrada.produtoId,
    pergunta: entrada.pergunta,
    resposta: entrada.resposta,
    ativo: entrada.ativo,
  };

  if (entrada.id) {
    const { error } = await supabase.from("faqs").update(linha).eq("id", entrada.id);
    if (error) throw new Error(`Falha ao atualizar FAQ: ${error.message}`);
    return { id: entrada.id };
  }

  const { data, error } = await supabase.from("faqs").insert(linha).select("id").single();
  if (error) throw new Error(`Falha ao criar FAQ: ${error.message}`);
  return { id: data.id };
}

export async function excluirFaq(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("faqs").delete().eq("id", id);
  if (error) throw new Error(`Falha ao excluir FAQ: ${error.message}`);
}

export type ObjecaoAdmin = {
  id: string;
  produtoId: string;
  objecao: string;
  comoLidar: string;
  ativo: boolean;
};

export async function listarObjecoes(): Promise<ObjecaoAdmin[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("objecoes")
    .select("id, produto_id, objecao, como_lidar, ativo")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao listar objeções: ${error.message}`);
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    produtoId: linha.produto_id,
    objecao: linha.objecao,
    comoLidar: linha.como_lidar,
    ativo: linha.ativo,
  }));
}

export type EntradaSalvarObjecao = {
  id: string | null;
  produtoId: string;
  objecao: string;
  comoLidar: string;
  ativo: boolean;
};

export async function salvarObjecao(entrada: EntradaSalvarObjecao): Promise<{ id: string }> {
  const supabase = await createClient();
  const linha = {
    produto_id: entrada.produtoId,
    objecao: entrada.objecao,
    como_lidar: entrada.comoLidar,
    ativo: entrada.ativo,
  };

  if (entrada.id) {
    const { error } = await supabase.from("objecoes").update(linha).eq("id", entrada.id);
    if (error) throw new Error(`Falha ao atualizar objeção: ${error.message}`);
    return { id: entrada.id };
  }

  const { data, error } = await supabase.from("objecoes").insert(linha).select("id").single();
  if (error) throw new Error(`Falha ao criar objeção: ${error.message}`);
  return { id: data.id };
}

export async function excluirObjecao(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("objecoes").delete().eq("id", id);
  if (error) throw new Error(`Falha ao excluir objeção: ${error.message}`);
}

export type FaixaPrecoAdmin = {
  id: string;
  produtoId: string;
  faixaMin: number;
  faixaMax: number | null;
  precoCheio: number | null;
  precoAvista: number | null;
  parcelasBoletoQtd: number | null;
  parcelasBoletoValor: number | null;
  parcelasCartaoMax: number | null;
  voucherAvista: number | null;
  voucherParcelasQtd: number | null;
  voucherParcelasValor: number | null;
  ativo: boolean;
};

export async function listarFaixasPrecoAdmin(): Promise<FaixaPrecoAdmin[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("precos_por_faixa")
    .select(
      "id, produto_id, faixa_min, faixa_max, preco_cheio, preco_avista, parcelas_boleto_qtd, parcelas_boleto_valor, parcelas_cartao_max, voucher_avista, voucher_parcelas_qtd, voucher_parcelas_valor, ativo",
    )
    .order("faixa_min");

  if (error) {
    throw new Error(`Falha ao listar preços por faixa: ${error.message}`);
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    produtoId: linha.produto_id,
    faixaMin: Number(linha.faixa_min),
    faixaMax: linha.faixa_max === null ? null : Number(linha.faixa_max),
    precoCheio: linha.preco_cheio === null ? null : Number(linha.preco_cheio),
    precoAvista: linha.preco_avista === null ? null : Number(linha.preco_avista),
    parcelasBoletoQtd: linha.parcelas_boleto_qtd,
    parcelasBoletoValor: linha.parcelas_boleto_valor === null ? null : Number(linha.parcelas_boleto_valor),
    parcelasCartaoMax: linha.parcelas_cartao_max,
    voucherAvista: linha.voucher_avista === null ? null : Number(linha.voucher_avista),
    voucherParcelasQtd: linha.voucher_parcelas_qtd,
    voucherParcelasValor: linha.voucher_parcelas_valor === null ? null : Number(linha.voucher_parcelas_valor),
    ativo: linha.ativo,
  }));
}

export type EntradaSalvarFaixaPreco = Omit<FaixaPrecoAdmin, "id"> & { id: string | null };

export async function salvarFaixaPreco(entrada: EntradaSalvarFaixaPreco): Promise<{ id: string }> {
  const supabase = await createClient();
  const linha = {
    produto_id: entrada.produtoId,
    faixa_min: entrada.faixaMin,
    faixa_max: entrada.faixaMax,
    preco_cheio: entrada.precoCheio,
    preco_avista: entrada.precoAvista,
    parcelas_boleto_qtd: entrada.parcelasBoletoQtd,
    parcelas_boleto_valor: entrada.parcelasBoletoValor,
    parcelas_cartao_max: entrada.parcelasCartaoMax,
    voucher_avista: entrada.voucherAvista,
    voucher_parcelas_qtd: entrada.voucherParcelasQtd,
    voucher_parcelas_valor: entrada.voucherParcelasValor,
    ativo: entrada.ativo,
  };

  if (entrada.id) {
    const { error } = await supabase.from("precos_por_faixa").update(linha).eq("id", entrada.id);
    if (error) throw new Error(`Falha ao atualizar faixa de preço: ${error.message}`);
    return { id: entrada.id };
  }

  const { data, error } = await supabase.from("precos_por_faixa").insert(linha).select("id").single();
  if (error) throw new Error(`Falha ao criar faixa de preço: ${error.message}`);
  return { id: data.id };
}

export async function excluirFaixaPreco(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("precos_por_faixa").delete().eq("id", id);
  if (error) throw new Error(`Falha ao excluir faixa de preço: ${error.message}`);
}

export type ConfiguracaoAdmin = {
  id: string;
  chave: string;
  valor: unknown;
  descricao: string;
  produtoId: string | null;
};

export async function listarConfiguracoes(): Promise<ConfiguracaoAdmin[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("configuracoes")
    .select("id, chave, valor, descricao, produto_id")
    .order("chave");

  if (error) {
    throw new Error(`Falha ao listar configurações: ${error.message}`);
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    chave: linha.chave,
    valor: linha.valor,
    descricao: linha.descricao,
    produtoId: linha.produto_id,
  }));
}

export type EntradaSalvarConfiguracao = {
  id: string | null;
  chave: string;
  valor: unknown;
  descricao: string;
  produtoId: string | null;
};

export async function salvarConfiguracao(entrada: EntradaSalvarConfiguracao): Promise<{ id: string }> {
  const supabase = await createClient();
  const linha = {
    chave: entrada.chave,
    valor: entrada.valor,
    descricao: entrada.descricao,
    produto_id: entrada.produtoId,
  };

  if (entrada.id) {
    const { error } = await supabase.from("configuracoes").update(linha).eq("id", entrada.id);
    if (error) throw new Error(`Falha ao atualizar configuração: ${error.message}`);
    return { id: entrada.id };
  }

  const { data, error } = await supabase.from("configuracoes").insert(linha).select("id").single();
  if (error) throw new Error(`Falha ao criar configuração: ${error.message}`);
  return { id: data.id };
}

export async function excluirConfiguracao(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("configuracoes").delete().eq("id", id);
  if (error) throw new Error(`Falha ao excluir configuração: ${error.message}`);
}

export type AgendaItemAdmin = {
  id: string;
  ordem: number;
  intervaloValor: number;
  intervaloUnidade: "minutos" | "horas" | "dias";
  canal: "whatsapp" | "email";
  respeitaJanelaComercial: boolean;
  conteudo: string;
};

export type AgendaFollowupCompleta = {
  id: string;
  nome: string;
  itens: AgendaItemAdmin[];
};

export async function listarAgendasCompletas(): Promise<AgendaFollowupCompleta[]> {
  const supabase = await createClient();
  const [agendasResp, itensResp] = await Promise.all([
    supabase.from("agendas_followup").select("id, nome").order("nome"),
    supabase
      .from("agenda_itens")
      .select(
        "id, agenda_id, ordem, intervalo_valor, intervalo_unidade, canal, respeita_janela_comercial, conteudo",
      )
      .order("ordem"),
  ]);

  if (agendasResp.error) {
    throw new Error(`Falha ao listar agendas de follow-up: ${agendasResp.error.message}`);
  }
  if (itensResp.error) {
    throw new Error(`Falha ao listar itens de agenda: ${itensResp.error.message}`);
  }

  return (agendasResp.data ?? []).map((agenda) => ({
    id: agenda.id,
    nome: agenda.nome,
    itens: (itensResp.data ?? [])
      .filter((item) => item.agenda_id === agenda.id)
      .map((item) => ({
        id: item.id,
        ordem: item.ordem,
        intervaloValor: item.intervalo_valor,
        intervaloUnidade: item.intervalo_unidade,
        canal: item.canal,
        respeitaJanelaComercial: item.respeita_janela_comercial,
        conteudo: item.conteudo,
      })),
  }));
}

export async function salvarAgenda(id: string | null, nome: string): Promise<{ id: string }> {
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("agendas_followup").update({ nome }).eq("id", id);
    if (error) throw new Error(`Falha ao atualizar agenda: ${error.message}`);
    return { id };
  }
  const { data, error } = await supabase.from("agendas_followup").insert({ nome }).select("id").single();
  if (error) throw new Error(`Falha ao criar agenda: ${error.message}`);
  return { id: data.id };
}

export async function excluirAgenda(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("agendas_followup").delete().eq("id", id);
  if (error) throw new Error(`Falha ao excluir agenda: ${error.message}`);
}

export type EntradaSalvarAgendaItem = {
  id: string | null;
  agendaId: string;
  ordem: number;
  intervaloValor: number;
  intervaloUnidade: "minutos" | "horas" | "dias";
  canal: "whatsapp" | "email";
  respeitaJanelaComercial: boolean;
  conteudo: string;
};

export async function salvarAgendaItem(entrada: EntradaSalvarAgendaItem): Promise<{ id: string }> {
  const supabase = await createClient();
  const linha = {
    agenda_id: entrada.agendaId,
    ordem: entrada.ordem,
    intervalo_valor: entrada.intervaloValor,
    intervalo_unidade: entrada.intervaloUnidade,
    canal: entrada.canal,
    respeita_janela_comercial: entrada.respeitaJanelaComercial,
    conteudo: entrada.conteudo,
  };

  if (entrada.id) {
    const { error } = await supabase.from("agenda_itens").update(linha).eq("id", entrada.id);
    if (error) throw new Error(`Falha ao atualizar item de agenda: ${error.message}`);
    return { id: entrada.id };
  }

  const { data, error } = await supabase.from("agenda_itens").insert(linha).select("id").single();
  if (error) throw new Error(`Falha ao criar item de agenda: ${error.message}`);
  return { id: data.id };
}

export async function excluirAgendaItem(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("agenda_itens").delete().eq("id", id);
  if (error) throw new Error(`Falha ao excluir item de agenda: ${error.message}`);
}

export type RespostaPronta = {
  id: string;
  atalho: string;
  texto: string;
  ativo: boolean;
};

/** Só as ativas — usado pelo atalho "/" do composer da Tela de Atendimento. */
export async function listarRespostasProntasAtivas(): Promise<RespostaPronta[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("respostas_prontas")
    .select("id, atalho, texto, ativo")
    .eq("ativo", true)
    .order("atalho");

  if (error) throw new Error(`Falha ao listar respostas prontas: ${error.message}`);
  return data ?? [];
}

/** Todas (ativas e inativas) — usado pelo CRUD em /admin/respostas-prontas. */
export async function listarRespostasProntas(): Promise<RespostaPronta[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("respostas_prontas")
    .select("id, atalho, texto, ativo")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Falha ao listar respostas prontas: ${error.message}`);
  return data ?? [];
}

export type EntradaSalvarRespostaPronta = {
  id: string | null;
  atalho: string;
  texto: string;
  ativo: boolean;
};

export async function salvarRespostaPronta(entrada: EntradaSalvarRespostaPronta): Promise<{ id: string }> {
  const supabase = await createClient();
  const linha = { atalho: entrada.atalho, texto: entrada.texto, ativo: entrada.ativo };

  if (entrada.id) {
    const { error } = await supabase.from("respostas_prontas").update(linha).eq("id", entrada.id);
    if (error) throw new Error(`Falha ao atualizar resposta pronta: ${error.message}`);
    return { id: entrada.id };
  }

  const { data, error } = await supabase.from("respostas_prontas").insert(linha).select("id").single();
  if (error) throw new Error(`Falha ao criar resposta pronta: ${error.message}`);
  return { id: data.id };
}

export async function excluirRespostaPronta(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("respostas_prontas").delete().eq("id", id);
  if (error) throw new Error(`Falha ao excluir resposta pronta: ${error.message}`);
}
