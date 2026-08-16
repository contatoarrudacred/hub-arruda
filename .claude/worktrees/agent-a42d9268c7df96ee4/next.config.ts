import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default é 1mb — pequeno demais pra foto/áudio/vídeo enviados no editor de fluxo
      // (src/app/admin/fluxos/actions.ts, uploadMidiaAction).
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
