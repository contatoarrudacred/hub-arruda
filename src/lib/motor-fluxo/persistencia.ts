import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEmailBoasVindasSeNecessario } from "@/lib/email/boas-vindas";
import { enviarMensagemTexto } from "@/lib/whatsapp/zapster";
import { concatenarMensagensLead } from "./buffer-mensagens";
import { substituirVariaveisTexto } from "./engine";
import {
  ehUltimoItemDaAgenda,
  leadProvavelmenteBloqueouWhatsapp,
  LIMITE_FOLLOWUPS_WHATSAPP_SEM_ENTREGA,
  MOTIVO_PERDA_BLOQUEIO_WHATSAPP,
  MOTIVO_PERDA_SEM_RESPOSTA,
} from "./motor-followup";
import { detectarObjecao } from "./detector-objecao";
import { criarDocumentosOportunidadeSeNecessario } from "./oportunidade-documentos";
import { carregarIdAgendaPadrao, listarObjecoesAtivas, type ItemAgendaFollowupCarregado } from "./repositorio";
import type { DadosConversa, EfeitoNegocio, EtapaCarregada, MensagemEnviada, MensagemEtapa, ResultadoAvanco } from "./tipos";

// Persistência de conversa "de verdade" — grava em pessoas/oportunidades/conversas/mensagens.
// Hoje só o /simulador chama isto (ver src/app/simulador/actions.ts), mas é a mesma peça que o
// webhook do WhatsApp real (Fase 7, Zapster) vai usar depois — o simulador é só mais uma "porta
// de entrada" pro mesmo motor. Usa sempre o cliente service_role: não existe usuário Supabase
// autenticado por trás de um lead (mesma decisão já registrada em repositorio.ts).
//
// Sem isso, o cron de disparo de follow-up (src/app/api/cron/followups/route.ts) não teria
// nenhuma conversa real pra varrer — descoberta feita ao planejar a Fase 6 com Luiz (15/08/2026).

const NOME_PRODUTO_LIMPEZA_NOME = "Limpeza de Nome (CPF/CNPJ) — Serasa/SPC";

function paraColunasMensagem(msg: MensagemEtapa): { conteudo: string | null; midiaUrl: string | null; midiaTipo: string | null } {
  switch (msg.tipo) {
    case "texto":
      return { conteudo: msg.texto, midiaUrl: null, midiaTipo: null };
    case "imagem":
    case "audio":
    case "video":
    case "documento":
      return { conteudo: msg.legenda ?? null, midiaUrl: msg.midia_url, midiaTipo: msg.tipo };
    case "localizacao":
      return {
        conteudo: JSON.stringify({
          latitude: msg.latitude,
          longitude: msg.longitude,
          nome: msg.nome,
          endereco: msg.endereco,
        }),
        midiaUrl: null,
        midiaTipo: null,
      };
    case "contato":
      return { conteudo: JSON.stringify({ nome: msg.nome, telefone: msg.telefone }), midiaUrl: null, midiaTipo: null };
    case "pix":
      return {
        conteudo: JSON.stringify({
          chave: msg.chave,
          tipo_chave: msg.tipo_chave,
          nome_beneficiario: msg.nome_beneficiario,
        }),
        midiaUrl: null,
        midiaTipo: null,
      };
  }
}

export type ConversaWhatsappCarregada = {
  conversaId: string;
  oportunidadeId: string;
  pessoaId: string;
  /** null = conversa nova, ainda não entrou em nenhum fluxo (equivalente a `iniciarSimulacaoComMensagem`) */
  etapaAtualCodigo: string | null;
  dados: DadosConversa;
  /** true = conversa escalada pro supervisor humano (PLANO_MESTRE 8.4) — quem chama não deve rodar o motor automatizado nem responder sozinho, só registrar a mensagem do lead. */
  sobSupervisor: boolean;
};

/**
 * Encontra a conversa de WhatsApp ativa de um telefone, ou cria pessoa/oportunidade/conversa do
 * zero se for a primeira vez que esse número aparece (ou se a conversa anterior dele já encerrou).
 * Existe porque o webhook do WhatsApp real (Fase 7) não tem client guardando `EstadoSimulador`
 * entre uma mensagem e outra — cada mensagem recebida é uma invocação serverless nova, então a
 * posição na conversa (etapa/dados) precisa ser reconstruída do banco a cada vez.
 */
export async function carregarOuCriarConversaWhatsapp(
  telefone: string,
  etapasPorCodigo: Record<string, EtapaCarregada>,
): Promise<ConversaWhatsappCarregada> {
  const supabase = createAdminClient();

  // Achado real (19/08/2026): `pessoas.whatsapp` não tem constraint de único no banco — um mesmo
  // número pode acabar ligado a mais de uma pessoa (ex.: cadastro criado pelo webhook do WhatsApp
  // + cadastro criado depois pela Nova Oportunidade do Vendas usando o mesmo telefone). `.maybeSingle()`
  // quebra com "multiple rows returned" nesse caso — trocado por uma busca que aceita N linhas e,
  // se houver mais de uma, prefere a que já tem conversa de WhatsApp ativa (a mais relevante pra
  // continuar o atendimento); sem nenhuma com conversa ativa, usa a mais recente. Não resolve a
  // duplicidade em si (isso é uma decisão de produto — precisa de unique constraint ou fluxo de
  // mesclagem, registrado na coordenação pra decidir com o Luiz/Vendas), só evita que o webhook
  // pare de responder pro lead por causa disso.
  const { data: pessoasComTelefone } = await supabase.from("pessoas").select("id").eq("whatsapp", telefone);

  let pessoaExistente: { id: string } | null = null;
  if (pessoasComTelefone && pessoasComTelefone.length === 1) {
    pessoaExistente = pessoasComTelefone[0];
  } else if (pessoasComTelefone && pessoasComTelefone.length > 1) {
    const ids = pessoasComTelefone.map((p) => p.id);
    const { data: comConversaAtiva } = await supabase
      .from("conversas")
      .select("pessoa_id")
      .in("pessoa_id", ids)
      .eq("canal", "whatsapp")
      .eq("status", "ativa")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    pessoaExistente = comConversaAtiva ? { id: comConversaAtiva.pessoa_id } : pessoasComTelefone[pessoasComTelefone.length - 1];
  }

  if (pessoaExistente) {
    const { data: conversaAtiva } = await supabase
      .from("conversas")
      .select("id, oportunidade_id, etapa_fluxo_atual_id, dados, sob_supervisor, oportunidades(etapa_kanban)")
      .eq("pessoa_id", pessoaExistente.id)
      .eq("canal", "whatsapp")
      .eq("status", "ativa")
      .maybeSingle();

    if (conversaAtiva?.oportunidade_id) {
      // Lead que tinha sido marcado Perdida voltou a responder — reabre a oportunidade (decisão de
      // Luiz, planejamento da Tela de Atendimento, 16/08/2026). A conversa/fluxo em si nunca parou
      // de rastrear (por isso ainda está "ativa" aqui) — só a etapa do Kanban precisa voltar,
      // sinalizando pro time que esse lead reengajou. Volta pro início do funil (não temos histórico
      // de qual subetapa era antes de "perdida" hoje) — reclassificar manualmente se fizer sentido.
      const oportunidadeAtual = conversaAtiva.oportunidades as unknown as { etapa_kanban: string } | null;
      if (oportunidadeAtual?.etapa_kanban === "perdida") {
        await supabase
          .from("oportunidades")
          .update({ etapa_kanban: "novo_lead_triagem", motivo_perda: null })
          .eq("id", conversaAtiva.oportunidade_id);
      }

      const etapa = conversaAtiva.etapa_fluxo_atual_id
        ? Object.values(etapasPorCodigo).find((e) => e.id === conversaAtiva.etapa_fluxo_atual_id)
        : undefined;
      return {
        conversaId: conversaAtiva.id,
        oportunidadeId: conversaAtiva.oportunidade_id,
        pessoaId: pessoaExistente.id,
        etapaAtualCodigo: etapa?.conteudo.codigo ?? null,
        dados: (conversaAtiva.dados as DadosConversa) ?? {},
        sobSupervisor: conversaAtiva.sob_supervisor,
      };
    }
  }

  const { data: produto, error: erroProduto } = await supabase
    .from("produtos")
    .select("id")
    .eq("nome", NOME_PRODUTO_LIMPEZA_NOME)
    .single();
  if (erroProduto || !produto) {
    throw new Error(`Falha ao localizar produto "${NOME_PRODUTO_LIMPEZA_NOME}": ${erroProduto?.message}`);
  }

  const pessoaId = pessoaExistente
    ? pessoaExistente.id
    : await (async () => {
        const { data: pessoa, error } = await supabase
          .from("pessoas")
          .insert({ tipo_pessoa: "pf", nome_razao_social: "Lead (WhatsApp)", whatsapp: telefone })
          .select("id")
          .single();
        if (error || !pessoa) throw new Error(`Falha ao criar pessoa: ${error?.message}`);
        return pessoa.id;
      })();

  const { data: oportunidade, error: erroOportunidade } = await supabase
    .from("oportunidades")
    .insert({ pessoa_id: pessoaId, produto_id: produto.id, etapa_kanban: "novo_lead_triagem" })
    .select("id")
    .single();
  if (erroOportunidade || !oportunidade) {
    throw new Error(`Falha ao criar oportunidade: ${erroOportunidade?.message}`);
  }

  const { data: conversa, error: erroConversa } = await supabase
    .from("conversas")
    .insert({ pessoa_id: pessoaId, oportunidade_id: oportunidade.id, canal: "whatsapp" })
    .select("id")
    .single();
  if (erroConversa || !conversa) {
    throw new Error(`Falha ao criar conversa: ${erroConversa?.message}`);
  }

  return {
    conversaId: conversa.id,
    oportunidadeId: oportunidade.id,
    pessoaId,
    etapaAtualCodigo: null,
    dados: {},
    sobSupervisor: false,
  };
}

/**
 * Histórico de fotos do contato (Bloco D, 17/08/2026) — a Zapster manda `sender.profile_picture`
 * em todo `message.received`, então isso roda a cada mensagem recebida do lead, não só na
 * primeira. Nunca sobrescreve: só insere uma linha nova quando a URL muda em relação à mais
 * recente já salva — mantém o histórico completo (TELA_ATENDIMENTO_ARRUDACRED.md seção 4).
 * Silenciosa em qualquer falha — captura de foto é complementar, nunca pode travar o webhook.
 */
export async function capturarFotoPerfilSeNecessario(pessoaId: string, urlFoto: string | null | undefined): Promise<void> {
  if (!urlFoto) return;

  try {
    const supabase = createAdminClient();
    const { data: ultimaFoto } = await supabase
      .from("pessoa_fotos")
      .select("url")
      .eq("pessoa_id", pessoaId)
      .order("capturada_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ultimaFoto?.url === urlFoto) return;

    const { error } = await supabase.from("pessoa_fotos").insert({ pessoa_id: pessoaId, url: urlFoto });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error("[persistencia] erro ao capturar foto de perfil:", e);
  }
}

/** Grava a mensagem do lead e cancela qualquer cadência de follow-up pendente — ele acabou de responder. `midiaUrl`/`midiaTipo` preenchidos quando o lead manda foto/áudio/vídeo (Bloco B2, ver processarMensagemRecebida). */
export async function registrarMensagemLead(
  conversaId: string,
  texto: string | null,
  midiaUrl: string | null = null,
  midiaTipo: string | null = null,
): Promise<void> {
  const supabase = createAdminClient();

  const { error: erroMensagem } = await supabase
    .from("mensagens")
    .insert({ conversa_id: conversaId, remetente: "lead", conteudo: texto, midia_url: midiaUrl, midia_tipo: midiaTipo });
  if (erroMensagem) {
    throw new Error(`Falha ao registrar mensagem do lead: ${erroMensagem.message}`);
  }

  const { error: erroConversa } = await supabase
    .from("conversas")
    .update({ aguardando_resposta_desde: null, proximo_item_agenda: 0, followup_manual_ativo: false })
    .eq("id", conversaId);
  if (erroConversa) {
    throw new Error(`Falha ao atualizar conversa após resposta do lead: ${erroConversa.message}`);
  }
}

/**
 * Escreve o token de debounce (19/08/2026, "corrigir tudo de forma global" — mensagens seguidas do
 * lead viravam turnos separados do motor, cegos um pro outro). Cada mensagem que chega sobrescreve
 * o token da conversa; quem espera e relê o MESMO valor que escreveu é quem processa o turno (ver
 * `aindaEhTokenAtual` e o webhook, `route.ts`).
 */
export async function escreverTokenBuffer(conversaId: string, token: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("conversas").update({ buffer_token: token }).eq("id", conversaId);
  if (error) throw new Error(`Falha ao gravar token de buffer: ${error.message}`);
}

/** true só se `buffer_token` da conversa ainda for exatamente o token informado — false quando uma mensagem mais nova já sobrescreveu (essa invocação desiste, a mais nova processa tudo). */
export async function aindaEhTokenAtual(conversaId: string, token: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("conversas").select("buffer_token").eq("id", conversaId).single();
  if (error) throw new Error(`Falha ao reler token de buffer: ${error.message}`);
  return data?.buffer_token === token;
}

/**
 * Todo texto que o lead mandou desde a última fala da Malala nesta conversa (ou desde o início,
 * se a Malala ainda não falou nada) — a "janela" que o debounce concatena num turno só. Ignora
 * mensagens sem texto (mídia sem legenda): elas não alimentam o motor de qualquer forma.
 */
export async function montarRespostaConcatenadaDesdeUltimaFala(conversaId: string): Promise<string> {
  const supabase = createAdminClient();

  const { data: ultimaMalala, error: erroUltimaMalala } = await supabase
    .from("mensagens")
    .select("enviado_em")
    .eq("conversa_id", conversaId)
    .eq("remetente", "malala")
    .order("enviado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroUltimaMalala) throw new Error(`Falha ao buscar última mensagem da Malala: ${erroUltimaMalala.message}`);

  let query = supabase
    .from("mensagens")
    .select("conteudo, enviado_em")
    .eq("conversa_id", conversaId)
    .eq("remetente", "lead")
    .order("enviado_em", { ascending: true });
  if (ultimaMalala?.enviado_em) {
    query = query.gt("enviado_em", ultimaMalala.enviado_em);
  }

  const { data: mensagensLead, error: erroMensagensLead } = await query;
  if (erroMensagensLead) throw new Error(`Falha ao buscar mensagens do lead pra concatenar: ${erroMensagensLead.message}`);

  return concatenarMensagensLead(mensagensLead ?? []);
}

/** Marca `conversas.estagnado_desde` (selo de risco de esfriar, sinal 3) se ainda não estiver marcada — nunca sobrescreve uma pendência já aberta, a data precisa refletir quando ela começou de verdade. */
async function marcarEstagnadaSeNecessario(conversaId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("conversas").select("estagnado_desde").eq("id", conversaId).single();
  if (data?.estagnado_desde) return;

  const { error } = await supabase
    .from("conversas")
    .update({ estagnado_desde: new Date().toISOString() })
    .eq("id", conversaId);
  if (error) throw new Error(`Falha ao marcar conversa como estagnada: ${error.message}`);
}

/**
 * Detector automático de objeção (Bloco D/Fase 5) — roda a cada mensagem de texto do lead (chamado
 * via `after()` no webhook, route.ts) e marca a conversa como estagnada quando detecta uma. Reaproveita
 * o mesmo `detectarObjecao` do botão manual do Bloco C (`detector-objecao.ts`), só que automático em
 * vez de sob demanda. Silencioso em qualquer falha — é um sinal complementar pro selo de risco, nunca
 * pode travar o atendimento nem atrasar a resposta da Malala.
 */
export async function detectarEMarcarObjecaoPendente(conversaId: string, textoLead: string): Promise<void> {
  try {
    const objecoesAtivas = await listarObjecoesAtivas();
    const detectada = await detectarObjecao(textoLead, objecoesAtivas);
    if (!detectada) return;
    await marcarEstagnadaSeNecessario(conversaId);
  } catch (e) {
    console.error("[persistencia] erro ao detectar objeção automática:", e);
  }
}

/** Aplica um efeito de negócio já decidido pelo motor (engine.ts) — hoje isto ficava calculado e nunca era usado, porque nada persistia. Também é usada pelo cron de follow-up ao sintetizar um "marcar_perdida" quando a agenda se esgota. `pessoaId` só é obrigatório de verdade pro efeito `agendar_consultor` (spec 2026-08-20-agendamento-consultor-alto-valor.md) — os demais efeitos não usam. */
export async function aplicarEfeitoNegocio(
  conversaId: string,
  oportunidadeId: string,
  efeito: EfeitoNegocio,
  pessoaId?: string,
): Promise<void> {
  const supabase = createAdminClient();

  if (efeito.tipo === "agendar_consultor") {
    if (!pessoaId) throw new Error("Falha ao agendar consultor: pessoaId não informado.");
    const { data: consultor, error: erroConsultor } = await supabase
      .from("usuarios_sistema")
      .select("id")
      .eq("eh_consultor", true)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();
    if (erroConsultor) throw new Error(`Falha ao buscar consultor: ${erroConsultor.message}`);
    if (!consultor) {
      // Defensivo — não devia acontecer em produção (o corte só é oferecido pro lead quando existe
      // consultor com horário calculado), mas se acontecer não trava o turno: só não agenda nada.
      console.error("[persistencia] agendar_consultor sem nenhum usuario_sistema.eh_consultor=true — nada agendado.");
      return;
    }

    const { data: agendamento, error: erroAgendamento } = await supabase
      .from("agendamentos_consultor")
      .insert({
        usuario_sistema_id: consultor.id,
        conversa_id: conversaId,
        pessoa_id: pessoaId,
        inicio: efeito.inicio,
        fim: efeito.fim,
        motivo: efeito.motivo,
      })
      .select("id")
      .single();
    if (erroAgendamento || !agendamento) throw new Error(`Falha ao gravar agendamento: ${erroAgendamento?.message}`);

    const { error: erroNotificacao } = await supabase
      .from("notificacoes")
      .insert({ usuario_id: consultor.id, conversa_id: conversaId, tipo: "agendamento", agendamento_id: agendamento.id });
    if (erroNotificacao) throw new Error(`Falha ao notificar consultor: ${erroNotificacao.message}`);

    const { error: erroSupervisor } = await supabase.from("conversas").update({ sob_supervisor: true }).eq("id", conversaId);
    if (erroSupervisor) throw new Error(`Falha ao escalar conversa pro supervisor: ${erroSupervisor.message}`);
    return;
  }

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

  // Selo de risco de esfriar, sinal 3 (Bloco D/Fase 5) — o fluxo automatizado acabou sem chegar em
  // "ganha" (decisão de Luiz, 17/08/2026: essa é a leitura escolhida pra "o lead não fechar", em vez
  // de tentar marcar recusas pontuais no meio do script, que exigiria schema novo no editor de fluxo).
  if (efeito.etapaKanban !== "ganha") {
    await marcarEstagnadaSeNecessario(conversaId);
  }
}

/** Grava as mensagens que a Malala mandou neste turno, aplica os efeitos de negócio que o motor decidiu, sincroniza o nome capturado com `pessoas` (pro follow-up conseguir montar `[Primeiro_Nome]` depois), e rearma (ou desarma) a cadência de follow-up conforme a etapa em que a conversa parou. */
export async function registrarTurnoMalala(params: {
  conversaId: string;
  oportunidadeId: string;
  pessoaId: string;
  dadosNovos: Record<string, string>;
  /** `dados` completo (turnos anteriores + este) — só precisa quando algum efeito colateral precisa de um campo capturado num turno anterior (ex.: documentos_tipos, capturado em ln_passo4, quando a faixa de cada um é capturada só depois em ln_passo6). Opcional pra não obrigar quem só usa dadosNovos a montar isso à toa. */
  dadosCompletos?: Record<string, string>;
  /** `naoReconhecido` só existe em turnos de `avancarConversa` (conversa já em andamento) — turnos de `iniciarFluxo` (primeira mensagem) não têm o conceito, tratam como `false` (selo de risco, sinal 2). */
  resultado: Pick<ResultadoAvanco, "mensagens" | "etapaFinal" | "efeitos"> & { naoReconhecido?: boolean };
}): Promise<void> {
  const { conversaId, oportunidadeId, pessoaId, dadosNovos, dadosCompletos, resultado } = params;
  const supabase = createAdminClient();

  if (dadosNovos.nome) {
    const { error } = await supabase
      .from("pessoas")
      .update({ nome_razao_social: dadosNovos.nome })
      .eq("id", pessoaId);
    if (error) throw new Error(`Falha ao sincronizar nome da pessoa: ${error.message}`);
  }

  if (dadosNovos.email) {
    const { error } = await supabase.from("pessoas").update({ email: dadosNovos.email }).eq("id", pessoaId);
    if (error) throw new Error(`Falha ao sincronizar e-mail da pessoa: ${error.message}`);

    const { data: pessoa } = await supabase
      .from("pessoas")
      .select("nome_razao_social")
      .eq("id", pessoaId)
      .single();
    // after() (Next.js) agenda o envio pra depois da resposta ser entregue — um e-mail de
    // boas-vindas lento (ou fora do ar) não pode atrasar a resposta da Malala no WhatsApp. Sem
    // isso, um `await` bloquearia o turno inteiro; um `void` simples arriscaria a função
    // serverless ser encerrada antes do envio terminar.
    const emailCapturado = dadosNovos.email;
    const nomeConhecido = pessoa?.nome_razao_social ?? "";
    after(() => enviarEmailBoasVindasSeNecessario(pessoaId, nomeConhecido, emailCapturado));
  }

  // Suporte a "pacote" (Bloco C, PLANO_MESTRE seção 11) — dadosNovos.documentos_valores só existe
  // no turno em que a faixa de TODOS os documentos acabou de ser capturada (ln_passo6). O tipo de
  // cada documento (documentos_tipos) foi capturado num turno anterior (ln_passo4) — por isso
  // precisa do `dadosCompletos` acumulado, não só do que mudou agora.
  if (dadosNovos.documentos_valores && dadosCompletos?.documentos_tipos) {
    const documentosTipos = dadosCompletos.documentos_tipos;
    const documentosValores = dadosNovos.documentos_valores;
    after(() => criarDocumentosOportunidadeSeNecessario(oportunidadeId, documentosTipos, documentosValores));
  }

  if (resultado.mensagens.length > 0) {
    // `enviado_em` explícito e crescente (19/08/2026, achado real — log de produção mostrou a
    // Tela de Atendimento em ordem ERRADA dentro de um mesmo turno, ex.: pergunta de e-mail antes
    // da saudação/foto). Causa: um único INSERT em lote faz o Postgres avaliar `now()` uma vez só
    // pra todas as linhas — com timestamp idêntico, a ordem de exibição fica ao sabor de como o
    // banco devolve as linhas, não da ordem real do array (que já está certa). 50ms de espaçamento
    // é imperceptível pro usuário mas garante desempate determinístico, sem depender de nenhuma
    // coluna nova nem de índice sequencial.
    const agora = Date.now();
    const linhas = resultado.mensagens.map((item: MensagemEnviada, indice) => {
      const { conteudo, midiaUrl, midiaTipo } = paraColunasMensagem(item.mensagem);
      return {
        conversa_id: conversaId,
        etapa_fluxo_id: resultado.etapaFinal?.id ?? null,
        remetente: "malala",
        conteudo,
        midia_url: midiaUrl,
        midia_tipo: midiaTipo,
        enviado_em: new Date(agora + indice * 50).toISOString(),
      };
    });
    const { error } = await supabase.from("mensagens").insert(linhas);
    if (error) throw new Error(`Falha ao registrar mensagens da Malala: ${error.message}`);
  }

  // Posição na conversa (fluxo/etapa/dados acumulados) — o simulador guarda isso só no client
  // (EstadoSimulador), mas o webhook do WhatsApp real (Fase 7) não tem client nenhum entre uma
  // mensagem e outra: cada chamada é uma invocação serverless nova, então precisa reconstruir de
  // onde a conversa parou a partir do banco. Gravar aqui sempre (não só quando vem do WhatsApp)
  // mantém as duas portas de entrada consistentes.
  const { data: dadosAtuais } = await supabase
    .from("conversas")
    .select("dados, contador_nao_reconhecimento")
    .eq("id", conversaId)
    .single();
  // Selo de risco de esfriar, sinal 2 (Bloco D/Fase 5) — zera assim que a Malala reconhece uma
  // resposta de novo, só sobe enquanto o lead segue "confundindo" o mesmo checkpoint.
  const contadorNaoReconhecimento = resultado.naoReconhecido
    ? (dadosAtuais?.contador_nao_reconhecimento ?? 0) + 1
    : 0;
  const { error: erroPosicao } = await supabase
    .from("conversas")
    .update({
      etapa_fluxo_atual_id: resultado.etapaFinal?.id ?? null,
      fluxo_id: resultado.etapaFinal?.fluxoId ?? null,
      dados: { ...(dadosAtuais?.dados ?? {}), ...dadosNovos },
      contador_nao_reconhecimento: contadorNaoReconhecimento,
    })
    .eq("id", conversaId);
  if (erroPosicao) throw new Error(`Falha ao salvar posição da conversa: ${erroPosicao.message}`);

  for (const efeito of resultado.efeitos) {
    await aplicarEfeitoNegocio(conversaId, oportunidadeId, efeito, pessoaId);
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

export type ResultadoDisparoFollowup =
  | { disparado: true; conteudo: string }
  | { disparado: false; motivo: "bloqueio_whatsapp_detectado" };

/**
 * Dispara um item da agenda de follow-up — chamado pelo cron (src/app/api/cron/followups).
 * WhatsApp envia de verdade (Zapster, `enviarMensagemTexto`) e grava em `mensagens` (mesmo
 * histórico da conversa, `origem_followup=true`); e-mail grava em `followup_emails` (canal
 * separado, não é conversa — Luiz, 15/08/2026). Marca a oportunidade como Perdida no item de
 * encerramento (`encerraAtendimento`), e só finaliza a cadência de verdade (fecha a conversa, para
 * o relógio) no ÚLTIMO item da agenda inteira — a régua continua depois da Perdida, com os itens
 * de nutrição por e-mail, até realmente acabar.
 *
 * Antes de mandar um item de WhatsApp, checa se as últimas `LIMITE_FOLLOWUPS_WHATSAPP_SEM_ENTREGA`
 * mensagens de follow-up já disparadas pra esta conversa não foram entregues — sinal de bloqueio
 * do número pelo lead (Luiz, 17/08/2026). Se detectar, marca Perdida com motivo específico, liga
 * `conversas.followup_whatsapp_bloqueado` (o cron passa a pular os itens de canal whatsapp dessa
 * conversa daí em diante, mas continua a régua de e-mail normalmente) e NÃO dispara este item.
 */
export async function dispararItemFollowup(
  conversaId: string,
  oportunidadeId: string,
  item: ItemAgendaFollowupCarregado,
  todosItensDaAgenda: ItemAgendaFollowupCarregado[],
): Promise<ResultadoDisparoFollowup> {
  const supabase = createAdminClient();

  const { data: conversa } = await supabase
    .from("conversas")
    .select("pessoas(nome_razao_social, email, whatsapp)")
    .eq("id", conversaId)
    .single();
  const pessoa = conversa?.pessoas as unknown as {
    nome_razao_social: string | null;
    email: string | null;
    whatsapp: string | null;
  } | null;
  const conteudo = substituirVariaveisTexto(item.conteudo, { nome: pessoa?.nome_razao_social ?? "" }, {});

  if (item.canal === "whatsapp") {
    const { data: ultimasMensagens, error: erroUltimas } = await supabase
      .from("mensagens")
      .select("entregue_em")
      .eq("conversa_id", conversaId)
      .eq("origem_followup", true)
      .order("enviado_em", { ascending: false })
      .limit(LIMITE_FOLLOWUPS_WHATSAPP_SEM_ENTREGA);
    if (erroUltimas) throw new Error(`Falha ao checar entregas de follow-up anteriores: ${erroUltimas.message}`);

    const bloqueado = leadProvavelmenteBloqueouWhatsapp(
      (ultimasMensagens ?? []).map((m) => ({ entregueEm: m.entregue_em as string | null })),
    );

    if (bloqueado) {
      const { error: erroOportunidade } = await supabase
        .from("oportunidades")
        .update({ etapa_kanban: "perdida", motivo_perda: MOTIVO_PERDA_BLOQUEIO_WHATSAPP })
        .eq("id", oportunidadeId);
      if (erroOportunidade) throw new Error(`Falha ao marcar oportunidade perdida por bloqueio: ${erroOportunidade.message}`);

      const { error: erroConversa } = await supabase
        .from("conversas")
        .update({ followup_whatsapp_bloqueado: true })
        .eq("id", conversaId);
      if (erroConversa) throw new Error(`Falha ao marcar bloqueio de whatsapp na conversa: ${erroConversa.message}`);

      return { disparado: false, motivo: "bloqueio_whatsapp_detectado" };
    }

    if (!pessoa?.whatsapp) throw new Error(`Conversa ${conversaId} não tem telefone de WhatsApp associado.`);
    const { messageId } = await enviarMensagemTexto(pessoa.whatsapp, conteudo);

    const { error } = await supabase.from("mensagens").insert({
      conversa_id: conversaId,
      remetente: "malala",
      conteudo,
      zapster_message_id: messageId || null,
      origem_followup: true,
    });
    if (error) throw new Error(`Falha ao registrar mensagem de follow-up: ${error.message}`);
  } else {
    const { error } = await supabase.from("followup_emails").insert({
      conversa_id: conversaId,
      agenda_item_id: item.id,
      destinatario_email: pessoa?.email ?? null,
      descricao: conteudo,
    });
    if (error) throw new Error(`Falha ao registrar e-mail de follow-up: ${error.message}`);
  }

  const { error: erroProximo } = await supabase
    .from("conversas")
    .update({ proximo_item_agenda: item.ordem })
    .eq("id", conversaId);
  if (erroProximo) throw new Error(`Falha ao avançar cadência de follow-up: ${erroProximo.message}`);

  if (item.encerraAtendimento) {
    const { error } = await supabase
      .from("oportunidades")
      .update({ etapa_kanban: "perdida", motivo_perda: MOTIVO_PERDA_SEM_RESPOSTA })
      .eq("id", oportunidadeId);
    if (error) throw new Error(`Falha ao marcar oportunidade perdida: ${error.message}`);
  }

  if (ehUltimoItemDaAgenda(todosItensDaAgenda, item)) {
    const { error } = await supabase
      .from("conversas")
      .update({ status: "encerrada", aguardando_resposta_desde: null, followup_manual_ativo: false })
      .eq("id", conversaId);
    if (error) throw new Error(`Falha ao finalizar cadência de follow-up: ${error.message}`);
  }

  return { disparado: true, conteudo };
}

const PADRAO_CODIGO_RASTREIO = /\s*\(ref:\s*([a-f0-9]{8})\)\s*$/i;

/**
 * Tira o código de rastreio (`(ref: a1b2c3d4)`, embutido pela página zap.arrudacred.com.br — ver
 * docs/RASTREIO_CLIQUES_WHATSAPP.md) do texto que a Malala/o motor enxergam, sem perder o código
 * em si (quem chama usa ele em `correlacionarCliqueRastreio`). Sem código encontrado, devolve o
 * texto original sem alteração.
 */
export function extrairCodigoRastreio(textoOriginal: string): { texto: string; codigo: string | null } {
  const encontrado = textoOriginal.match(PADRAO_CODIGO_RASTREIO);
  if (!encontrado) return { texto: textoOriginal, codigo: null };
  return { texto: textoOriginal.slice(0, encontrado.index).trimEnd(), codigo: encontrado[1].toLowerCase() };
}

/** Liga um clique já registrado em `cliques_rastreio` à pessoa cuja primeira mensagem trouxe o código correspondente. Silencioso — clique não encontrado (código errado, expirado, ou a pessoa editou o texto pré-preenchido) não pode travar o atendimento. */
export async function correlacionarCliqueRastreio(codigo: string, pessoaId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("cliques_rastreio")
    .update({ pessoa_id: pessoaId })
    .eq("codigo", codigo)
    .is("pessoa_id", null);
  if (error) console.error(`Falha ao correlacionar clique de rastreio "${codigo}":`, error.message);
}

/**
 * Marca uma mensagem nossa (Malala/humano) como entregue ou lida, a partir dos webhooks
 * message.delivered/message.read da Zapster (Bloco B2, 17/08/2026) — alimenta o check ✓/✓✓/✓✓azul
 * no card de contato. Silencioso de propósito: `zapsterMessageId` não achar nada é esperado (evento
 * de uma mensagem antiga, anterior a esta migration, ou o nome do campo no payload da Zapster
 * divergir do que estamos lendo — payload ainda não confirmado contra tráfego real, mesmo
 * caso já registrado em `message.received`) e não pode derrubar o processamento do webhook.
 */
export async function marcarStatusMensagem(
  zapsterMessageId: string,
  status: "entregue" | "lido",
  quando: string,
): Promise<void> {
  const supabase = createAdminClient();
  const coluna = status === "entregue" ? "entregue_em" : "lido_em";
  const { error } = await supabase
    .from("mensagens")
    .update({ [coluna]: quando })
    .eq("zapster_message_id", zapsterMessageId);
  if (error) console.error(`Falha ao marcar mensagem ${zapsterMessageId} como ${status}:`, error.message);
}
