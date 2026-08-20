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

export async function gerarUrlAssinadaContrato(caminho: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 3600);
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
