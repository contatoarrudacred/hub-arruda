import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";

// Faz o mesmo papel do bundler do Next.js: `import "server-only"` (presente em persistencia.ts,
// repositorio.ts, etc.) lança um erro de verdade fora de um Server Component — como este harness
// roda como script Node puro (tsx), fora do Next, precisamos neutralizar o import ANTES de
// qualquer módulo do motor ser carregado (por isso este arquivo precisa ser o primeiro import de
// qualquer script do harness).
const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as NodeJS.Module;

// Carrega .env.local manualmente (mesmo padrão usado nos scripts de verificação deste projeto) —
// tsx não lê .env.local sozinho, e o caminho do repo tem "$" no meio, que dotenv/shell costumam
// atropelar se não for tratado com cuidado.
const envPath = path.resolve(process.cwd(), ".env.local");
const conteudoEnv = fs.readFileSync(envPath, "utf8");
for (const linha of conteudoEnv.split("\n")) {
  const m = linha.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
