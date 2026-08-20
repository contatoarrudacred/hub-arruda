import { createClient } from "@/lib/supabase/server";
import { valorPorExtenso } from "./valor-por-extenso";

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
// 20260819130000_vendas_templates_documentos.sql (generaliza pra além de contrato — ver
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

export type DadosResolucaoContrato = {
  dadosCliente: string;
  valorTotal: number;
  formaPagamento: string;
  tabelaVencimentos: string;
  listaDocumentos: string;
};

const PLACEHOLDERS = [
  "dados_cliente",
  "valor_total",
  "valor_total_extenso",
  "tabela_vencimentos",
  "forma_pagamento",
  "lista_documentos",
] as const;

/**
 * Resolve os placeholders {{...}} do HTML do template contra os dados já coletados na tela de
 * Fechamento de Venda. Os blocos HTML de dados_cliente/lista_documentos/tabela_vencimentos já
 * chegam prontos (montados por montarDadosClienteHtml/montarListaDocumentosHtml/
 * montarTabelaVencimentosHtml) — esta função só faz a substituição final, continua pura.
 */
export function resolverPlaceholders(conteudoHtml: string, dados: DadosResolucaoContrato): string {
  const valorFormatado = dados.valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const substituicoes: Record<(typeof PLACEHOLDERS)[number], string> = {
    dados_cliente: dados.dadosCliente,
    valor_total: valorFormatado,
    valor_total_extenso: valorPorExtenso(dados.valorTotal),
    tabela_vencimentos: dados.tabelaVencimentos,
    forma_pagamento: dados.formaPagamento,
    lista_documentos: dados.listaDocumentos,
  };

  return PLACEHOLDERS.reduce(
    (texto, chave) => texto.split(`{{${chave}}}`).join(substituicoes[chave]),
    conteudoHtml,
  );
}

export type PessoaContrato = {
  tipoPessoa: "pf" | "pj";
  nomeRazaoSocial: string;
  documento: string;
  email: string | null;
  whatsapp: string | null;
  endereco: string | null;
  rg: string | null;
  estadoCivil: string | null;
  profissao: string | null;
};

function campo(rotulo: string, valor: string | null): string {
  return `<p><strong>${rotulo}:</strong> ${valor && valor.trim() ? valor : "—"}</p>`;
}

function montarBlocoPessoaFisica(pessoa: PessoaContrato): string {
  return [
    campo("Nome completo", pessoa.nomeRazaoSocial),
    campo("CPF", pessoa.documento),
    campo("RG", pessoa.rg),
    campo("Estado civil", pessoa.estadoCivil),
    campo("Profissão", pessoa.profissao),
    campo("E-mail", pessoa.email),
    campo("Telefone/WhatsApp", pessoa.whatsapp),
    campo("Endereço", pessoa.endereco),
  ].join("\n");
}

/**
 * Monta o bloco {{dados_cliente}} — PF: os 8 campos do próprio cliente. PJ: razão social/CNPJ +
 * os mesmos 8 campos do representante legal (obrigatório passar `representante` quando `pessoa`
 * é PJ — lança erro se faltar, contrato de PJ sem representante não tem quem assine).
 */
export function montarDadosClienteHtml(pessoa: PessoaContrato, representante?: PessoaContrato | null): string {
  if (pessoa.tipoPessoa === "pf") {
    return montarBlocoPessoaFisica(pessoa);
  }

  if (!representante) {
    throw new Error("Pessoa jurídica precisa de um representante legal pra montar os dados do contrato.");
  }

  return [
    campo("Razão social", pessoa.nomeRazaoSocial),
    campo("CNPJ", pessoa.documento),
    "<p><strong>Representada por:</strong></p>",
    montarBlocoPessoaFisica(representante),
  ].join("\n");
}

export type DocumentoPacote = { documento: string; nomeRazaoSocial: string };

/**
 * Monta {{lista_documentos}} — lista simples de documento + nome/razão social de cada CPF/CNPJ
 * coberto pelo contrato. **Decisão de escopo (Luiz, 18/08/2026): só temos dado completo (RG/estado
 * civil/profissão/endereço) de quem assina o contrato — os demais documentos do pacote só têm
 * documento + nome, e é só isso que existe pra mostrar aqui.** Devolve string vazia quando não é
 * pacote (0 ou 1 documento — nesse caso os dados já estão em {{dados_cliente}}, não precisa
 * repetir).
 */
export function montarListaDocumentosHtml(documentos: DocumentoPacote[]): string {
  if (documentos.length <= 1) return "";

  const linhas = documentos
    .map((doc) => `<tr><td>${doc.documento}</td><td>${doc.nomeRazaoSocial}</td></tr>`)
    .join("\n");

  return `<table><thead><tr><th>Documento</th><th>Nome/Razão social</th></tr></thead><tbody>\n${linhas}\n</tbody></table>`;
}

export type ParcelaTabela = { numero: number; valor: number; vencimento: Date };

/**
 * Monta {{tabela_vencimentos}} — tabela HTML (nº / vencimento / valor / forma de pagamento).
 * `formaPagamentoLabel` repete na coluna de cada linha (contratos.metodo_pagamento é por
 * contrato, não por parcela).
 */
export function montarTabelaVencimentosHtml(parcelas: ParcelaTabela[], formaPagamentoLabel: string): string {
  const linhas = parcelas
    .map((parcela) => {
      const valorFormatado = parcela.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const vencimentoFormatado = parcela.vencimento.toLocaleDateString("pt-BR", { timeZone: "UTC" });
      return `<tr><td>${parcela.numero}</td><td>${vencimentoFormatado}</td><td>${valorFormatado}</td><td>${formaPagamentoLabel}</td></tr>`;
    })
    .join("\n");

  return `<table><thead><tr><th>Nº</th><th>Vencimento</th><th>Valor</th><th>Forma de pagamento</th></tr></thead><tbody>\n${linhas}\n</tbody></table>`;
}
