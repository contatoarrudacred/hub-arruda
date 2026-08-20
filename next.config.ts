import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default é 1mb — pequeno demais pra foto/áudio/vídeo enviados no editor de fluxo
      // (src/app/admin/fluxos/actions.ts, uploadMidiaAction).
      bodySizeLimit: "8mb",
    },
  },
  // @sparticuz/chromium (src/lib/vendas/geracao-pdf.ts, geração de PDF do contrato) tem binário
  // próprio resolvido por caminho relativo — precisa ficar fora do bundle (senão o caminho quebra)
  // e o binário em si (bin/) precisa ser rastreado explicitamente, porque o Puppeteer é chamado a
  // partir de várias Server Actions (nova-oportunidade, fechamento, retry manual) e de dentro do
  // webhook da Assinafy, não de uma rota fixa só — "/*" cobre todas de uma vez. Achado real em
  // produção: "The input directory .../@sparticuz/chromium/bin does not exist" ao emitir contrato.
  // Ver https://github.com/Sparticuz/chromium#bundler-configuration e
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/output#outputfiletracingincludes
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/*": ["node_modules/@sparticuz/chromium/bin/**/*"],
  },
};

export default nextConfig;
