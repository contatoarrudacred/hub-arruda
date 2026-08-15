import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { carregarIdAgendaPadrao } from "./repositorio";
import type { EfeitoNegocio, MensagemEnviada, MensagemEtapa, ResultadoAvanco } from "./tipos";

// Persistência de conversa "de verdade" — grava em pessoas/oportunidades/conversas/mensagens.
// Hoje só o /simulador chama isto (ver src/app/simulador/actions.ts), mas é a mesma peça que o
// webhook do WhatsApp real (Fase 7, Zapster) vai usar depois — o simulador é só mais uma "porta
// de entrada" pro mesmo motor. Usa sempre o cliente service_role: não existe usuário Supabase
// autenticado por trás de um lead (mesma decisão já registrada em repositorio.ts).
//
// Sem isso, o cron de disparo de follow-up (src/app/api/cron/followups/route.ts) não teria
// nenhuma conversa real pra varrer — descoberta feita ao planejar a Fase 6 com Luiz (15/08/2026).

const NOME_PRODUTO_LIMPEZA_NOME = "Limpeza de Nome (CPF/CNPJ) — Serasa/SPC";

function paraColunasMensagem(msg: MensagemEtapa): { conteudo: string | null; midiaUrl: string | null } {
  switch (msg.tipo) {
    case "texto":
      return { conteudo: msg.texto, midiaUrl: null };
    case "imagem":
    case "audio":
    case "video":
    case "documento":
      return { conteudo: msg.legenda ?? null, midiaUrl: msg.midia_url };
    case "localizacao":
      return {
        conteudo: JSON.stringify({
          latitude: msg.latitude,
          longitude: msg.longitude,
          nome: msg.nome,
          endereco: msg.endereco,
        }),
        midiaUrl: null,
      };
    case "contato":
      return { conteudo: JSON.stringify({ nome: msg.nome, telefone: msg.telefone }), midiaUrl: null };
    case "pix":
      return {
        conteudo: JSON.stringify({
          chave: msg.chave,
          tipo_chave: msg.tipo_chave,
          nome_beneficiario: msg.nome_beneficiario,
        }),
        midiaUrl: null,
      };
  }
}

/** Cria a tripla pessoa/oportunidade/conversa no início de uma conversa simulada. `nomeConhecido` vem da extração determinística da primeira mensagem, quando o lead já se apresentou de cara. */
export async function criarConversaSimulador(
  nomeConhecido: string | null,
): Promise<{ conversaId: string; oportunidadeId: string }> {
  const supabase = createAdminClient();

  const { data: produto, error: erroProduto } = await supabase
    .from("produtos")
    .select("id")
    .eq("nome", NOME_PRODUTO_LIMPEZA_NOME)
    .single();
  if (erroProduto || !produto) {
    throw new Error(`Falha ao localizar produto "${NOME_PRODUTO_LIMPEZA_NOME}": ${erroProduto?.message}`);
  }

  const { data: pessoa, error: erroPessoa } = await supabase
    .from("pessoas")
    .insert({ tipo_pessoa: "pf", nome_razao_social: nomeConhecido ?? "Lead (simulador)" })
    .select("id")
    .single();
  if (erroPessoa || !pessoa) {
    throw new Error(`Falha ao criar pessoa: ${erroPessoa?.message}`);
  }

  const { data: oportunidade, error: erroOportunidade } = await supabase
    .from("oportunidades")
    .insert({ pessoa_id: pessoa.id, produto_id: produto.id, etapa_kanban: "novo_lead_triagem" })
    .select("id")
    .single();
  if (erroOportunidade || !oportunidade) {
    throw new Error(`Falha ao criar oportunidade: ${erroOportunidade?.message}`);
  }

  const { data: conversa, error: erroConversa } = await supabase
    .from("conversas")
    .insert({ pessoa_id: pessoa.id, oportunidade_id: oportunidade.id, canal: "simulador" })
    .select("id")
    .single();
  if (erroConversa || !conversa) {
    throw new Error(`Falha ao criar conversa: ${erroConversa?.message}`);
  }

  return { conversaId: conversa.id, oportunidadeId: oportunidade.id };
}

/** Grava a mensagem do lead e cancela qualquer cadência de follow-up pendente — ele acabou de responder. */
export async function registrarMensagemLead(conversaId: string, texto: string): Promise<void> {
  const supabase = createAdminClient();

  const { error: erroMensagem } = await supabase
    .from("mensagens")
    .insert({ conversa_id: conversaId, remetente: "lead", conteudo: texto });
  if (erroMensagem) {
    throw new Error(`Falha ao registrar mensagem do lead: ${erroMensagem.message}`);
  }

  const { error: erroConversa } = await supabase
    .from("conversas")
    .update({ aguardando_resposta_desde: null, proximo_item_agenda: 0 })
    .eq("id", conversaId);
  if (erroConversa) {
    throw new Error(`Falha ao atualizar conversa após resposta do lead: ${erroConversa.message}`);
  }
}

/** Aplica um efeito de negócio já decidido pelo motor (engine.ts) — hoje isto ficava calculado e nunca era usado, porque nada persistia. Também é usada pelo cron de follow-up ao sintetizar um "marcar_perdida" quando a agenda se esgota. */
export async function aplicarEfeitoNegocio(
  conversaId: string,
  oportunidadeId: string,
  efeito: EfeitoNegocio,
): Promise<void> {
  const supabase = createAdminClient();

  if (efeito.tipo === "marcar_perdida") {
    const [{ error: erroOportunidade }, { error: erroConversa }] = await Promise.all([
      supabase
        .from("oportunidades")
        .update({ etapa_kanban: "perdida", motivo_perda: efeito.motivo })
        .eq("id", oportunidadeId),
      supabase
        .from("conversas")
        .update({ status: "encerrada", aguardando_resposta_desde: null })
        .eq("id", conversaId),
    ]);
    if (erroOportunidade) throw new Error(`Falha ao marcar oportunidade perdida: ${erroOportunidade.message}`);
    if (erroConversa) throw new Error(`Falha ao encerrar conversa: ${erroConversa.message}`);
    return;
  }

  if (efeito.tipo === "escalar_supervisor") {
    const { error } = await supabase.from("conversas").update({ sob_supervisor: true }).eq("id", conversaId);
    if (error) throw new Error(`Falha ao escalar conversa pro supervisor: ${error.message}`);
    return;
  }

  // encerrar_fluxo_automatizado: fim do script automatizado (não é necessariamente perda — pode
  // ser handoff de sucesso, ex.: coleta de documentos no fim do MVP1). Atualiza a subetapa do
  // Kanban e, se marcado, escala pro supervisor; não encerra a conversa (segue manual por
  // WhatsApp) nem mexe em aguardando_resposta_desde — sem etapa aguardando resposta, o cron não
  // tem nada pra fazer aqui mesmo.
  const { error: erroOportunidade } = await supabase
    .from("oportunidades")
    .update({ etapa_kanban: efeito.etapaKanban })
    .eq("id", oportunidadeId);
  if (erroOportunidade) throw new Error(`Falha ao atualizar etapa do Kanban: ${erroOportunidade.message}`);

  if (efeito.sobSupervisor) {
    const { error } = await supabase.from("conversas").update({ sob_supervisor: true }).eq("id", conversaId);
    if (error) throw new Error(`Falha ao escalar conversa pro supervisor: ${error.message}`);
  }
}

/** Grava as mensagens que a Malala mandou neste turno, aplica os efeitos de negócio que o motor decidiu, e rearma (ou desarma) a cadência de follow-up conforme a etapa em que a conversa parou. */
export async function registrarTurnoMalala(params: {
  conversaId: string;
  oportunidadeId: string;
  resultado: Pick<ResultadoAvanco, "mensagens" | "etapaFinal" | "efeitos">;
}): Promise<void> {
  const { conversaId, oportunidadeId, resultado } = params;
  const supabase = createAdminClient();

  if (resultado.mensagens.length > 0) {
    const linhas = resultado.mensagens.map((item: MensagemEnviada) => {
      const { conteudo, midiaUrl } = paraColunasMensagem(item.mensagem);
      return {
        conversa_id: conversaId,
        etapa_fluxo_id: resultado.etapaFinal?.id ?? null,
        remetente: "malala",
        conteudo,
        midia_url: midiaUrl,
      };
    });
    const { error } = await supabase.from("mensagens").insert(linhas);
    if (error) throw new Error(`Falha ao registrar mensagens da Malala: ${error.message}`);
  }

  for (const efeito of resultado.efeitos) {
    await aplicarEfeitoNegocio(conversaId, oportunidadeId, efeito);
  }

  const aguardaResposta = resultado.etapaFinal !== null && resultado.etapaFinal.conteudo.aguarda_resposta;
  if (aguardaResposta && resultado.etapaFinal) {
    const agendaId = resultado.etapaFinal.agendaFollowupId ?? (await carregarIdAgendaPadrao());
    const { error } = await supabase
      .from("conversas")
      .update({ aguardando_resposta_desde: new Date().toISOString(), agenda_followup_id: agendaId, proximo_item_agenda: 0 })
      .eq("id", conversaId);
    if (error) throw new Error(`Falha ao rearmar cadência de follow-up: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("conversas")
      .update({ aguardando_resposta_desde: null })
      .eq("id", conversaId);
    if (error) throw new Error(`Falha ao desarmar cadência de follow-up: ${error.message}`);
  }
}
