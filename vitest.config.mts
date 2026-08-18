import fs from "node:fs";
import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

// Resolve o mesmo alias "@/*" -> "./src/*" que já existe em tsconfig.json (paths),
// mas que o Vitest não enxerga sozinho (ele não lê tsconfig paths por padrão).
// Sem isto, qualquer teste que importe (direta ou transitivamente) um módulo com
// "@/..." falha com "Cannot find package '@/...'".
//
// "server-only" é aliasado para o próprio "empty.js" que o pacote já publica pra
// esse fim (é o que o bundler do Next escolhe via a export condition "react-server";
// o Vitest não entende essa condition, então sem o alias qualquer módulo com
// `import "server-only"` lança em runtime fora do Next).

/**
 * Diferente do Next (que carrega .env.local sozinho), o Vitest não injeta os
 * arquivos .env em process.env por padrão. "vite" tem um loadEnv pra isso, mas
 * não é uma dependência direta deste projeto (só transitiva via vitest) — em vez
 * de depender disso, lê e faz o parse do .env.local manualmente aqui. Sem isto,
 * código que lê process.env.SUPABASE_* (ex.: createAdminClient) recebe undefined
 * nos testes mesmo com .env.local presente no projeto.
 *
 * Exportada (não local) porque vitest.integration.config.ts reaproveita — os testes de
 * integração também precisam do .env.local pra falar com o Supabase remoto real.
 */
export function carregarEnvLocal(): Record<string, string> {
  const envPath = path.resolve(import.meta.dirname, ".env.local");
  if (!fs.existsSync(envPath)) return {};

  const env: Record<string, string> = {};
  for (const linhaBruta of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const linha = linhaBruta.trim();
    if (!linha || linha.startsWith("#")) continue;
    const idx = linha.indexOf("=");
    if (idx === -1) continue;
    const chave = linha.slice(0, idx).trim();
    let valor = linha.slice(idx + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    env[chave] = valor;
  }
  return env;
}

// Exportado (não local) pelo mesmo motivo de carregarEnvLocal: vitest.integration.config.ts
// reaproveita, em vez de duplicar os mesmos caminhos.
export function resolveAlias() {
  return {
    "@": path.resolve(import.meta.dirname, "./src"),
    "server-only": path.resolve(import.meta.dirname, "./node_modules/server-only/empty.js"),
  };
}

export default defineConfig({
  resolve: {
    alias: resolveAlias(),
  },
  test: {
    env: carregarEnvLocal(),
    // Testes *.integration.test.ts batem em serviços reais (Supabase remoto — não há Docker
    // local neste ambiente) e não podem rodar no `pnpm test` padrão. Ver vitest.integration.config.ts
    // e o script `test:integration` no package.json para rodá-los explicitamente.
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
  },
});
