import { enviarComunicacao } from "@/lib/comunicacao/enviar";
import { listarCategoriasComunicacaoAtivas } from "@/lib/comunicacao/categorias-repositorio";

// Reativado em 22/08/2026 — antes mandava direto pra Zapster/Resend sem gravar na ficha da Pessoa
// (ver histórico de git, commit 06e7a40 e docs/COORDENACAO_AGENTES_ARRUDACRED.md seção 4 item 7).
// Agora passa pelo mecanismo centralizado do CRM (src/lib/comunicacao), que grava tudo na timeline.

async function idCategoriaCobranca(): Promise<string> {
  const categorias = await listarCategoriasComunicacaoAtivas();
  const categoria = categorias.find((c) => c.nome === "Cobrança");
  if (!categoria) {
    throw new Error(
      'Categoria "Cobrança" não encontrada ou desativada em categorias_comunicacao — configure em /admin/configuracoes/categorias-comunicacao.',
    );
  }
  return categoria.id;
}

export async function enviarWhatsapp(pessoaId: string, texto: string): Promise<void> {
  const categoriaId = await idCategoriaCobranca();
  await enviarComunicacao({ pessoaId, categoriaId, canal: "whatsapp", conteudo: { texto } });
}

export async function enviarPorEmail(pessoaId: string, assunto: string, texto: string): Promise<void> {
  const categoriaId = await idCategoriaCobranca();
  await enviarComunicacao({ pessoaId, categoriaId, canal: "email", conteudo: { assunto, corpo: texto } });
}

/** Link de pagamento gerado automaticamente na criação da cobrança (Asaas) — silencioso, mesma decisão de antes (uma falha aqui não pode travar o fluxo de criação de cobrança). */
export async function enviarLinkPagamentoWhatsapp(pessoaId: string, link: string): Promise<void> {
  try {
    const categoriaId = await idCategoriaCobranca();
    await enviarComunicacao({
      pessoaId,
      categoriaId,
      canal: "whatsapp",
      conteudo: { texto: `Aqui está o link para pagamento: ${link}` },
    });
  } catch (e) {
    console.error("[vendas/notificacoes] falha ao enviar link de pagamento automático:", e);
  }
}
