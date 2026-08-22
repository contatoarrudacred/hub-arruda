import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Camada de I/O do módulo de comunicação centralizada — único lugar que fala com o Supabase aqui
// dentro (mesmo padrão de motor-fluxo/repositorio.ts). Sem testes de unidade (não tem lógica pra
// testar sem mockar o Supabase — convenção deste projeto, ver motor-fluxo/repositorio.ts, sem
// testes próprios, verificado manualmente).

/** Conversa oficial de WhatsApp já existente pra essa pessoa — NUNCA cria uma nova aqui (só existe se o lead já contatou o oficial de verdade). Pega o telefone salvo em `pessoas.whatsapp`. */
export async function buscarConversaWhatsappOficial(pessoaId: string): Promise<{ id: string; telefone: string } | null> {
  const supabase = createAdminClient();

  const { data: pessoa, error: erroPessoa } = await supabase.from("pessoas").select("whatsapp").eq("id", pessoaId).single();
  if (erroPessoa) throw new Error(`Falha ao buscar pessoa ${pessoaId}: ${erroPessoa.message}`);
  if (!pessoa?.whatsapp) return null;

  const { data: conversa, error: erroConversa } = await supabase
    .from("conversas")
    .select("id")
    .eq("pessoa_id", pessoaId)
    .eq("canal", "whatsapp")
    .is("instancia", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroConversa) throw new Error(`Falha ao buscar conversa de WhatsApp oficial pra pessoa ${pessoaId}: ${erroConversa.message}`);

  if (!conversa) return null;
  return { id: conversa.id, telefone: pessoa.whatsapp };
}

/** Conversa da instância secundária — cria se ainda não existir pra essa pessoa. */
export async function buscarOuCriarConversaSecundaria(pessoaId: string): Promise<{ id: string; telefone: string }> {
  const supabase = createAdminClient();

  const { data: pessoa, error: erroPessoa } = await supabase.from("pessoas").select("whatsapp").eq("id", pessoaId).single();
  if (erroPessoa) throw new Error(`Falha ao buscar pessoa ${pessoaId}: ${erroPessoa.message}`);
  if (!pessoa?.whatsapp) {
    throw new Error(`Pessoa ${pessoaId} não tem telefone de WhatsApp cadastrado — não é possível enviar.`);
  }

  const { data: existente, error: erroExistente } = await supabase
    .from("conversas")
    .select("id")
    .eq("pessoa_id", pessoaId)
    .eq("canal", "whatsapp")
    .eq("instancia", "secundaria")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroExistente) throw new Error(`Falha ao buscar conversa secundária pra pessoa ${pessoaId}: ${erroExistente.message}`);

  if (existente) return { id: existente.id, telefone: pessoa.whatsapp };

  const { data: criada, error } = await supabase
    .from("conversas")
    .insert({ pessoa_id: pessoaId, canal: "whatsapp", instancia: "secundaria", status: "ativa" })
    .select("id")
    .single();
  if (error || !criada) throw new Error(`Falha ao criar conversa secundária pra pessoa ${pessoaId}: ${error?.message}`);

  return { id: criada.id, telefone: pessoa.whatsapp };
}

/** Conversa do canal e-mail — cria se ainda não existir pra essa pessoa. E-mail não tem o problema de "instância" (Resend não bane número, ver spec). */
export async function buscarOuCriarConversaEmail(pessoaId: string): Promise<{ id: string }> {
  const supabase = createAdminClient();

  const { data: existente, error: erroExistente } = await supabase
    .from("conversas")
    .select("id")
    .eq("pessoa_id", pessoaId)
    .eq("canal", "email")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroExistente) throw new Error(`Falha ao buscar conversa de e-mail pra pessoa ${pessoaId}: ${erroExistente.message}`);

  if (existente) return { id: existente.id };

  const { data: criada, error } = await supabase
    .from("conversas")
    .insert({ pessoa_id: pessoaId, canal: "email", status: "ativa" })
    .select("id")
    .single();
  if (error || !criada) throw new Error(`Falha ao criar conversa de e-mail pra pessoa ${pessoaId}: ${error?.message}`);

  return { id: criada.id };
}

/** E-mail cadastrado da pessoa. Retorna `null` se não tiver e-mail — estado válido, quem chama decide o que fazer. */
export async function buscarEmailPessoa(pessoaId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("pessoas").select("email").eq("id", pessoaId).single();
  if (error) throw new Error(`Falha ao buscar e-mail da pessoa ${pessoaId}: ${error.message}`);
  return data?.email ?? null;
}

export async function buscarMensagemPorChaveIdempotencia(chave: string): Promise<{ id: string } | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("mensagens").select("id").eq("chave_idempotencia", chave).maybeSingle();
  if (error) throw new Error(`Falha ao buscar mensagem por chave de idempotência ${chave}: ${error.message}`);
  return data ?? null;
}

export async function inserirMensagemSistema(params: {
  conversaId: string;
  texto: string;
  categoriaId: string;
  chaveIdempotencia?: string;
  provedorMessageId: string | null;
}): Promise<{ id: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("mensagens")
    .insert({
      conversa_id: params.conversaId,
      remetente: "sistema",
      conteudo: params.texto,
      categoria_id: params.categoriaId,
      chave_idempotencia: params.chaveIdempotencia ?? null,
      provedor_message_id: params.provedorMessageId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Falha ao gravar mensagem do sistema: ${error?.message}`);
  return { id: data.id };
}
