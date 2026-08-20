import { createClient } from "@/lib/supabase/server";

// Lógica pura de resolução de placeholders (resolverPlaceholders, montarDadosClienteHtml,
// montarTabelaContratanteHtml, gerarDadosMockPreview, etc.) mora em template-resolucao.ts, não
// aqui — este arquivo importa @/lib/supabase/server (server-only), e o preview do editor
// ("use client") precisa importar aquela lógica sem arrastar isso junto. Re-exportado abaixo só
// pra quem já importa daqui (emissao-contrato.ts, contrato-templates.test.ts) continuar
// funcionando sem mudar nada.
export * from "./template-resolucao";

const BUCKET_ASSETS = "contrato-template-assets";

/**
 * Upload de imagem inserida no editor rico do template (logo/timbrado) — bucket público (não é
 * dado de cliente), URL pública direta, sem signed URL.
 */
export async function enviarImagemTemplate(arquivo: Blob, nomeArquivo: string): Promise<{ url: string }> {
  const supabase = await createClient();
  const caminho = `${Date.now()}-${nomeArquivo}`;

  const { error } = await supabase.storage.from(BUCKET_ASSETS).upload(caminho, arquivo);
  if (error) throw new Error(`Falha ao enviar imagem: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET_ASSETS).getPublicUrl(caminho);
  return { url: data.publicUrl };
}

export type TipoTemplateDocumento = "contrato" | "termo_acordo" | "ficha_associativa";

// Tabela renomeada de contrato_templates -> documento_templates pela migration
// 20260819130001_vendas_templates_documentos.sql (generaliza pra além de contrato — ver
// docs/COORDENACAO_AGENTES_ARRUDACRED.md seção 2). Ainda não aplicada/regenerada no
// database.types.ts, então o nome da tabela e as colunas novas (tipo, nome) passam por uma
// variável não-literal — mesmo contorno já usado em src/lib/vendas/produtos.ts pra
// exige_lista_documentos: evita que o supabase-js tente validar contra o schema gerado
// desatualizado. Isso não afeta o dado real em runtime, só contorna o TypeScript.
const TABELA: string = "documento_templates";

type LinhaTemplateBruta = {
  id: string;
  produto_id: string | null;
  tipo: TipoTemplateDocumento;
  nome: string;
  conteudo_html: string;
  versao: number;
  ativo: boolean;
};

const SELECT_TEMPLATE = "id, produto_id, tipo, nome, conteudo_html, versao, ativo";

export type ContratoTemplate = {
  id: string;
  produtoId: string;
  conteudoHtml: string;
  versao: number;
};

function paraContratoTemplate(linha: LinhaTemplateBruta): ContratoTemplate {
  if (!linha.produto_id) throw new Error(`Template ${linha.id} não tem produto_id — não deveria acontecer pra tipo=contrato.`);
  return { id: linha.id, produtoId: linha.produto_id, conteudoHtml: linha.conteudo_html, versao: linha.versao };
}

/** Só busca templates tipo=contrato — é o único tipo que a emissão automática (Assinafy) usa. */
export async function buscarTemplateAtivoPorProduto(produtoId: string): Promise<ContratoTemplate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABELA)
    .select(SELECT_TEMPLATE)
    .eq("produto_id", produtoId)
    .eq("tipo", "contrato")
    .eq("ativo", true)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar template de contrato: ${error.message}`);
  if (!data) return null;

  return paraContratoTemplate(data as unknown as LinhaTemplateBruta);
}

/** Usado pela emissão automática (sempre tipo=contrato) — lança se por algum motivo o registro
 * não tiver produto_id, o que não deveria acontecer dado o constraint do banco. */
export async function buscarTemplatePorId(templateId: string): Promise<ContratoTemplate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABELA).select(SELECT_TEMPLATE).eq("id", templateId).maybeSingle();
  if (error) throw new Error(`Falha ao buscar template de contrato: ${error.message}`);
  if (!data) return null;

  return paraContratoTemplate(data as unknown as LinhaTemplateBruta);
}

/** Documento completo (qualquer tipo) — usado pela tela de edição genérica, que precisa mostrar
 * tipo/nome mesmo quando não há produto_id (termo_acordo/ficha_associativa). */
export type TemplateDocumentoCompleto = {
  id: string;
  tipo: TipoTemplateDocumento;
  nome: string;
  produtoId: string | null;
  conteudoHtml: string;
  versao: number;
};

export async function buscarTemplateDocumentoPorId(templateId: string): Promise<TemplateDocumentoCompleto | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABELA).select(SELECT_TEMPLATE).eq("id", templateId).maybeSingle();
  if (error) throw new Error(`Falha ao buscar documento: ${error.message}`);
  if (!data) return null;

  const linha = data as unknown as LinhaTemplateBruta;
  return { id: linha.id, tipo: linha.tipo, nome: linha.nome, produtoId: linha.produto_id, conteudoHtml: linha.conteudo_html, versao: linha.versao };
}

/** Resumo de um documento pra tela de listagem "Template de Documentos" — qualquer tipo. */
export type TemplateDocumentoResumo = {
  id: string;
  tipo: TipoTemplateDocumento;
  nome: string;
  produtoId: string | null;
  produtoNome: string | null;
  ativo: boolean;
};

export async function listarTemplatesDocumento(): Promise<TemplateDocumentoResumo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABELA)
    .select(`${SELECT_TEMPLATE}, produtos ( nome )`)
    .order("nome", { ascending: true });
  if (error) throw new Error(`Falha ao listar templates de documento: ${error.message}`);

  return ((data ?? []) as unknown as (LinhaTemplateBruta & { produtos: { nome: string } | null })[]).map((linha) => ({
    id: linha.id,
    tipo: linha.tipo,
    nome: linha.nome,
    produtoId: linha.produto_id,
    produtoNome: linha.produtos?.nome ?? null,
    ativo: linha.ativo,
  }));
}

export type EntradaCriarTemplateDocumento = { tipo: TipoTemplateDocumento; nome: string; produtoId: string | null };

/** Cria o registro do documento (metadados) com conteúdo vazio — o texto é escrito depois no
 * editor (tela separada), igual ao fluxo já usado pra contrato. */
export async function criarTemplateDocumento(entrada: EntradaCriarTemplateDocumento): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABELA)
    .insert({ tipo: entrada.tipo, nome: entrada.nome, produto_id: entrada.produtoId, conteudo_html: "" })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar template de documento: ${error.message}`);
  return { id: (data as unknown as { id: string }).id };
}

export type EntradaAtualizarMetadadosTemplate = { nome: string; ativo: boolean };

export async function atualizarMetadadosTemplateDocumento(
  templateId: string,
  entrada: EntradaAtualizarMetadadosTemplate,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).update({ nome: entrada.nome, ativo: entrada.ativo }).eq("id", templateId);
  if (error) throw new Error(`Falha ao atualizar template de documento: ${error.message}`);
}

export async function excluirTemplateDocumento(templateId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).delete().eq("id", templateId);
  if (error) {
    if (error.code === "23503") {
      throw new Error("Este documento já foi usado em algum contrato — não pode ser excluído (só desativado).");
    }
    throw new Error(`Falha ao excluir template de documento: ${error.message}`);
  }
}

/** Atualiza só o conteúdo (chamado pelo editor rico) — incrementa versão a cada salvamento. */
export async function salvarConteudoTemplateDocumento(templateId: string, conteudoHtml: string): Promise<void> {
  const supabase = await createClient();
  const atual = await buscarTemplatePorId(templateId);
  const proximaVersao = (atual?.versao ?? 0) + 1;
  const { error } = await supabase.from(TABELA).update({ conteudo_html: conteudoHtml, versao: proximaVersao }).eq("id", templateId);
  if (error) throw new Error(`Falha ao salvar conteúdo do template: ${error.message}`);
}
