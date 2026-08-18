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
    //
    // ".claude/**" exclui os worktrees dos outros agentes, que vivem fisicamente aninhados em
    // .claude/worktrees/<nome> dentro deste mesmo diretório. Sem isso, rodar o teste da raiz
    // descobre os *.test.ts das outras branches e os executa com o tsconfig/alias resolvido contra
    // a raiz errada — gera "failed" que não têm nada a ver com o código de ninguém. Já pegou dois
    // agentes diferentes (ver COORDENACAO_AGENTES_ARRUDACRED.md, avisos de 18/08/2026).
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts", "**/.claude/**"],
  },
});
