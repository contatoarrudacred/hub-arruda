<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Vários agentes trabalham neste repositório ao mesmo tempo

Cada agente (CRM, Marketing, Vendas, …) roda numa sessão própria, numa branch/worktree própria, **sem canal de mensagem entre elas**. A coordenação acontece por arquivo. Duas coisas antes de começar:

1. **`docs/INBOX_AGENTES.md`** — se tem uma linha com o seu nome, **responda antes de qualquer outra coisa**, nem que seja "visto, entra na fila". Alguém está parado esperando. (Um hook `SessionStart` costuma mostrar isso sozinho; se não apareceu, leia o arquivo.)
2. **`docs/COORDENACAO_AGENTES_ARRUDACRED.md`** — o quadro-branco. A **seção 0** tem o protocolo de comunicação; leia antes de mexer em migration, `database.types.ts`, sidebar, `configuracoes` ou Storage, que são território compartilhado.

Duas regras que já custaram tempo a este projeto:

- **Nenhum agente roda migration no Supabase.** Escreva o `.sql`, reserve o timestamp na tabela da seção 2 e avise o Coordenador — ele leva ao Luiz, que executa.
- **Recado escrito de dentro de um worktree não chega a ninguém** até o commit alcançar `main`. Avise o Coordenador para ele trazer.
