import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Worktrees dos outros agentes, aninhados fisicamente aqui dentro (.claude/worktrees/<nome>).
    // Sem isto, o lint da raiz analisa o código das outras branches — 99 problemas que não são de
    // `main` e que ninguém nesta branch pode corrigir. Mesmo motivo do exclude em vitest.config.mts.
    ".claude/**",
  ]),
]);

export default eslintConfig;
