// Config para os testes de INTEGRAÇÃO (*.integration.test.ts) — batem em serviços reais
// (Supabase remoto de produção; não há Docker/Supabase local neste ambiente). Roda via
// `pnpm test:integration`, nunca via `pnpm test` padrão (esse usa vitest.config.mts, que
// exclui explicitamente esses arquivos). Reaproveita o alias "@/*" e o carregamento de
// .env.local de vitest.shared.ts (não usa mergeConfig porque o array `exclude` da base
// concatenaria com o novo `include`, mantendo a exclusão que a base define pra estes mesmos
// arquivos; e não importa de vitest.config.mts porque um specifier de import terminado em
// ".mts" exige "allowImportingTsExtensions" no tsc — TS5097).
import { defineConfig } from "vitest/config";
import { carregarEnvLocal, resolveAlias } from "./vitest.shared";

export default defineConfig({
  resolve: {
    alias: resolveAlias(),
  },
  test: {
    env: carregarEnvLocal(),
    include: ["**/*.integration.test.ts"],
  },
});
