import type { Browser } from "puppeteer-core";
import { createClient } from "@/lib/supabase/server";
import { MARGENS_PDF_MM } from "./estilo-documento";

const BUCKET = "contratos";

/**
 * @sparticuz/chromium só roda em Linux serverless (Vercel) — o binário nem inicia no Windows de
 * dev local (confirmado: `spawn .../chromium ENOENT`). Em produção (`VERCEL` setada) usa
 * puppeteer-core + @sparticuz/chromium (binário compilado pro ambiente serverless, sem duplicar
 * Chromium completo no pacote da função). Em dev local usa o pacote `puppeteer` completo
 * (devDependency, baixa um Chromium compatível com o SO — já instalado via
 * `npx puppeteer browsers install chrome`).
 */
async function lancarBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
      import("puppeteer-core"),
      import("@sparticuz/chromium"),
    ]);
    return puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
      defaultViewport: { width: 1240, height: 1754, deviceScaleFactor: 1 },
      executablePath: await chromium.executablePath(),
      headless: "shell",
    }) as Promise<Browser>;
  }

  const { default: puppeteer } = await import("puppeteer");
  return puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1240, height: 1754, deviceScaleFactor: 1 },
  }) as Promise<Browser>;
}

/**
 * Renderiza um HTML completo (já com os placeholders do contrato resolvidos) como PDF.
 */
export async function gerarPdfContrato(html: string): Promise<Buffer> {
  const browser = await lancarBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      margin: {
        top: `${MARGENS_PDF_MM.top}mm`,
        bottom: `${MARGENS_PDF_MM.bottom}mm`,
        left: `${MARGENS_PDF_MM.left}mm`,
        right: `${MARGENS_PDF_MM.right}mm`,
      },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function uploadPdfContrato(contratoId: string, pdf: Buffer): Promise<{ path: string }> {
  const supabase = await createClient();
  const caminho = `${contratoId}/${Date.now()}-contrato.pdf`;

  const { error } = await supabase.storage.from(BUCKET).upload(caminho, pdf, { contentType: "application/pdf" });
  if (error) throw new Error(`Falha ao enviar PDF do contrato: ${error.message}`);

  return { path: caminho };
}

/** `forcarDownload: true` faz o link vir com `Content-Disposition: attachment` (o navegador baixa
 * o arquivo em vez de abrir inline) — usado pelo botão "Baixar" da tela de Detalhes da Venda,
 * separado do link "Ver" (que abre normal, sem esse header). */
export async function gerarUrlAssinadaContrato(caminho: string, opcoes?: { forcarDownload?: boolean }): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(caminho, 3600, opcoes?.forcarDownload ? { download: true } : undefined);
  if (error) throw new Error(`Falha ao gerar URL do contrato: ${error.message}`);
  return data.signedUrl;
}

/** Baixa o PDF de volta do Storage — usado pelo adapter da Assinafy, que precisa dos bytes do
 * arquivo pra fazer o upload (não aceita URL, só o arquivo em si). */
export async function baixarPdfContrato(caminho: string): Promise<Buffer> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(caminho);
  if (error) throw new Error(`Falha ao baixar PDF do contrato: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Sobrescreve o PDF já salvo no MESMO caminho (`upsert: true`) — usado quando o contrato termina
 * de ser assinado por todos: o PDF sem assinatura vira o PDF final com certificado da Assinafy
 * (pedido do Luiz, 20/08/2026). Sobrescrever em vez de subir um arquivo novo com caminho diferente
 * significa que `contratos.pdf_url` não precisa mudar — qualquer link já copiado/enviado antes da
 * assinatura passa a servir o conteúdo assinado automaticamente, sem precisar gerar/reenviar nada.
 */
export async function sobrescreverPdfContrato(caminho: string, pdf: Buffer): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, pdf, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`Falha ao sobrescrever PDF do contrato: ${error.message}`);
}

/** Apaga o PDF do Storage — chamado quando a venda é excluída de vez (achado real da auditoria de
 * 21/08/2026: `excluirVenda` apagava a linha do contrato mas nunca o arquivo, deixando-o órfão no
 * bucket pra sempre). */
export async function apagarPdfContrato(caminho: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.storage.from(BUCKET).remove([caminho]);
  if (error) throw new Error(`Falha ao apagar PDF do contrato: ${error.message}`);
}
