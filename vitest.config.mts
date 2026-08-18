import { configDefaults, defineConfig } from "vitest/config";
import { carregarEnvLocal, resolveAlias } from "./vitest.shared";

// Reexportados (compat) — vitest.integration.config.ts importa direto de "./vitest.shared" hoje,
// mas manter aqui evita quebrar qualquer outro import futuro que aponte pra este arquivo.
export { carregarEnvLocal, resolveAlias };

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
