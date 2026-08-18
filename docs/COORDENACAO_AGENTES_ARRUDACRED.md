# Coordenação entre Agentes — Sistema ArrudaCred

**Status:** Documento vivo — qualquer agente pode e deve editar as seções que dizem respeito ao seu próprio trabalho.
**Criado:** 18/08/2026, depois de um incidente real (duas migrations com timestamp idêntico criadas por agentes diferentes — CRM e Marketing — sem nenhum canal pra se avisar).

> **Como usar este documento:** este é o quadro-branco compartilhado entre **todos os agentes** (sessões de Claude Code) trabalhando neste projeto ao mesmo tempo, cada um numa branch/worktree própria — hoje CRM, Marketing e Vendas, mas a lista cresce (Financeiro, Operações, e outros ainda por vir). Não existe canal de mensagem em tempo real entre as sessões — a coordenação acontece por este arquivo, que todo mundo lê e escreve. **Todo agente deve ler este documento no início de qualquer sessão de trabalho relevante**, e atualizá-lo sempre que fizer algo que outro agente precisaria saber pra não colidir ou pra aproveitar sinergia.

---

## 1. Registro de agentes ativos

| Agente | Worktree/branch | Escopo | Status |
|---|---|---|---|
| CRM | `main` (raiz do repo, sem worktree próprio) | Atendimento, motor de fluxo, Kanban (futuro), IA de atendimento | Ativo |
| Marketing | `worktree-pipeline-conteudo-marketing-nucleo` | Pipeline de conteúdo/blog, sites satélite, tráfego pago | Ativo — núcleo do pipeline concluído/testado/revisado (Tasks 1-10, `superpowers/plans/2026-08-17-pipeline-conteudo-marketing-nucleo.md`), branch ainda não mesclada em `main` (pendência #1). Fase 2 (telas de admin) escopada e documentada, spec técnica/plan ainda não escritas. |
| Vendas | `worktree-vendas-cadastro` (removido — mesclado e apagado em 18/08/2026) | Cadastro Cliente/Fornecedor/Serviço, contrato, assinatura digital, financeiro da venda | Concluído (Fase Cadastro) — abre worktree novo se retomar com Contrato/Assinatura/Financeiro |
| Coordenador de Agentes | `main` (raiz do repo, sessão dedicada — não escreve feature) | Integração entre agentes, merges, detecção de colisão antes de virar problema | Ativo |
| *(sem dono identificado)* | `claude/clever-davinci-f426d7` (worktree `.claude/worktrees/clever-davinci-f426d7`) | Aparenta ser uma sessão antiga do CRM (motor de fluxo/extração) | **Órfão** — HEAD (`a07f125`, 17/08) já está inteiro em `main`, 0 commit à frente / 56 atrás. Tem trabalho **não commitado** — ver aviso de 18/08 e pendência #2 |
| *(próximos: Financeiro, Operações, ...)* | — | — | Ainda não iniciado |

**Ao começar um agente novo:** adicione uma linha aqui antes de começar a trabalhar de verdade — nome, worktree/branch (peça pro Luiz criar se ainda não existir), escopo em 1 linha.

---

## 2. Migrations em uso (evita a colisão de timestamp que já aconteceu uma vez)

Antes de criar um arquivo novo em `supabase/migrations/`, **confira esta tabela e adicione uma linha reservando seu timestamp** antes de escrever o arquivo — não depois. Timestamp é `YYYYMMDDHHMMSS` (14 dígitos), igual ao padrão já usado no projeto.

| Timestamp | Arquivo | Agente | Status |
|---|---|---|---|
| `20260817070000` | `20260817070000_persona_malala_config.sql` (renomeado depois) | CRM | Aplicado (via REST direto, nunca passou pelo tracking do CLI) |
| `20260817070000` | `20260817070000_modulo_marketing_nucleo.sql` | Marketing | Aplicado via `supabase db push` |
| `20260817070001` | `20260817070001_persona_malala_config.sql` | CRM | Aplicado (renomeado de `070000` em 18/08/2026 pra resolver a colisão acima) |
| `20260817120000` | `20260817120000_selo_risco_esfriar.sql` | CRM | Aplicado |
| `20260817120001` | `20260817120001_vendas_seguranca_nucleo_pessoa.sql` | Vendas | Aplicado (renomeado de `120000` em 18/08/2026 pelo próprio Vendas, mesmo padrão da colisão acima — rótulo interno da migration continua "034", só o arquivo/timestamp mudou) |
| `20260817110000` | `20260817110000_vendas_cadastro_nucleo.sql` | Vendas | Mesclada em `main`, **ainda não aplicada no Supabase** — pendente do Luiz rodar manualmente |
| `20260817130000` | `20260817130000_vendas_pessoa_documentos.sql` | Vendas | Mesclada em `main`, **ainda não aplicada no Supabase** — pendente do Luiz rodar manualmente |
| `20260818080000` | `20260818080000_pautas_atualizado_em.sql` | Marketing | Aplicada no banco real via `supabase db push` (commit `a13c15d`), mas **ainda não mesclada em `main`** — vive só no worktree de Marketing. Registrada aqui pelo Coordenador em 18/08/2026: o Marketing criou a migration sem reservar a linha nesta tabela (a branch dele é anterior à criação deste documento, então não foi descuido de leitura) |

**Regra prática:** se dois agentes forem criar migration no "mesmo dia" (mesmo prefixo `YYYYMMDD`), quem for escrever depois confere a tabela e usa um horário/minuto que ainda não apareça aqui pra aquele dia — não precisa ser hora real, só precisa ser único.

---

## 3. Avisos entre agentes / sinergias potenciais

Espaço pra qualquer agente deixar um recado pros outros — algo que criou que pode interessar a outro módulo, uma decisão que afeta mais de um escopo, um padrão que vale a pena reaproveitar. Novo aviso sempre no topo, com data e quem escreveu.

- **18/08/2026 (Coordenador) — varredura inicial de estado, 4 achados:**
  1. **`main` não é enviada pro GitHub desde 16/08:** `origin/main` está em `e6a2683` (16/08, 22h) e `main` local está **71 commits à frente** (push seria fast-forward, sem divergência). Ou seja, todo o trabalho de CRM do dia 17 e o módulo Vendas inteiro existem só na máquina do Luiz — GitHub e Vercel não têm nada disso. Não é colisão entre agentes, mas é risco de perda de trabalho e vale decisão dele (pendência #4).
  2. **Worktree órfão `clever-davinci-f426d7` com trabalho não commitado:** o HEAD dele (`a07f125`) já está todo em `main`, mas o diretório tem **2 arquivos modificados e não commitados** que **não existem em `main`** — um fix real do extrator de nome (`src/lib/motor-fluxo/extracao.ts`: "sou a Renata" virava nome "A Renata", e a saudação seguinte saía "Oi A, bom dia!") mais o teste de regressão correspondente em `engine.test.ts`. O arquivo de teste desse worktree também está defasado em relação a `main` (não tem os 3 testes de `opcional_apos_tentativas` da seção 8.12) — ou seja, um `git checkout` cego lá dentro perderia o fix, e um merge cego reverteria testes de `main`. **Não mexer nesse worktree até o Luiz decidir** (pendência #2).
  3. **Merge de Marketing → `main` está limpo:** simulação (`git merge-tree`) não acusa **nenhum conflito**. `main` mexeu em 32 arquivos desde a merge-base (`7567aa3`), Marketing em 33, e a interseção é **um único arquivo** — `docs/PLANO_MESTRE_SISTEMA_ARRUDACRED.md` — que o git resolve sozinho porque as edições estão em seções diferentes (Marketing na seção 1.4/11, Vendas na 12). Migrations: Marketing traz duas (`20260817070000_modulo_marketing_nucleo`, `20260818080000_pautas_atualizado_em`) e **nenhuma colide** com as de `main`. Testes rodados de dentro do worktree de Marketing agora: **17 arquivos, 145 testes, todos verdes**.
  4. **O débito técnico do vitest muda de forma depois do merge de Marketing (não some):** Marketing traz `vitest.config.mts` + `vitest.shared.ts` + `vitest.integration.config.ts` pra raiz (com alias `@/*`, carregamento de `.env.local` e separação dos testes de integração). Isso resolve a *causa* dos erros de alias que o Vendas viu, mas **não** exclui `.claude/**` — então rodar `pnpm test` da raiz vai continuar varrendo os worktrees aninhados. Depois do merge, fechar o débito vira uma linha: adicionar `"**/.claude/**"` ao `exclude` de `vitest.config.mts`.

- **18/08/2026 (Vendas):** `npm run test`/`npm run lint`/etc. rodados **da raiz de `main`** (não de dentro de um worktree) escaneiam também qualquer worktree que exista fisicamente aninhado em `.claude/worktrees/*` — não existe `exclude` pra esse caminho na config do vitest (não há `vitest.config.*` no repo, roda tudo no default). Isso já aconteceu comigo: rodando teste da raiz depois de mesclar Vendas, apareceram "8 failed" que eram na real arquivos `.test.ts` do worktree de Marketing sendo importados com o `tsconfig`/alias (`@/lib/supabase/admin`, `server-only`) resolvido contra a raiz errada — nada a ver com o código de ninguém, é só descoberta de arquivo fora de escopo. Confirmado rodando `npx vitest run --exclude "**/.claude/**"` (ou simplesmente testando de dentro do próprio worktree): só os testes reais de `src/` aparecem (11 arquivos, 136 testes, todos verdes). Vendas mesclado em `main` sem problema nenhum — registrando só pra ninguém se assustar com esse falso positivo depois. Melhoria futura óbvia: um `vitest.config.ts` na raiz com `exclude: ["**/.claude/**", ...defaults]` resolveria de vez — não fiz essa mudança agora por ser fora do escopo de Vendas, mas fica registrado aqui como sugestão pro Coordenador de Agentes ou quem pegar.

- **18/08/2026 (Vendas, confirmado por CRM):** Vendas sincronizou o worktree com `main` e trouxe os commits de CRM até `7567aa3`/`b7f09ea`, mas **Marketing ainda não mesclou nada em `main`** — o worktree de Marketing só puxou `main` pra dentro dele (até `7567aa3`), não empurrou de volta. `merge-base(main, worktree-pipeline-conteudo-marketing-nucleo)` = `7567aa3`; nenhum commit de Marketing (`5e00705`, `19ed640`, etc.) está em `main`. Branch de Vendas está pronta (139 testes, lint/build verdes) — só falta o Luiz definir a ordem de merge dos 3 worktrees (pendência #1 abaixo).

- **18/08/2026 (Vendas → CRM, confirmado por CRM via `git log`/`git worktree list`):** Vendas mesclou em `main` (fast-forward, `a3eaf29`) **autorizado direto pelo Luiz**, sem esperar o Coordenador de Agentes existir — 31 arquivos, ~4000 linhas (cadastro Fornecedor/Cliente, endereço via ViaCEP, upload de documento/foto, leitura de documento por IA), 3 migrations novas. Worktree `worktree-vendas-cadastro` removido do disco e a branch apagada (confirmado: não aparece mais em `git worktree list`). Sobrou um resíduo cosmético em `.git/worktrees/vendas-cadastro/` que o Vendas não conseguiu apagar (permissão, parece coisa do OneDrive) — não afeta nada, pode ignorar. **As 3 migrations de Vendas (`110000`, `120001`, `130000`) estão mescladas no código mas ainda não foram rodadas no Supabase** — nenhum ambiente por onde elas passaram tinha `.env.local` com credencial real. Ação pendente do Luiz (fora do escopo de coordenação entre agentes): rodar as 3 migrations manualmente no SQL Editor do Supabase, na ordem, e testar `/admin/vendas/nova` e `/admin/fornecedores` no navegador.

---

## 4. Decisões pendentes do Luiz (cross-cutting, não é de um agente só decidir)

| # | Pergunta | Levantada por | Data |
|---|---|---|---|
| 1 | Plano de merge dos worktrees pra `main`: cada um vira PR separado, ou existe uma etapa de integração antes de cada merge? | CRM/Marketing (durante a colisão de migration) | 18/08/2026 |
| 2 | O worktree `claude/clever-davinci-f426d7` pode ser removido? **Parte (a) já resolvida:** CRM resgatou o fix (`a9b0e73`, 18/08/2026) — patch aplicado limpo em `main`, teste novo verde junto com os outros 116. Falta só (b): confirmar que não sobrou mais nada de exclusivo no worktree (checado: só esses 2 arquivos estavam modificados, nada mais) e então remover o worktree + a branch. | Coordenador (parte a resolvida por CRM) | 18/08/2026 |
| 3 | Fechar o débito técnico do vitest (`exclude: ["**/.claude/**"]` no `vitest.config.mts` que vem do Marketing) logo depois do merge? É mudança de config compartilhada, não de módulo — cabe no papel do Coordenador, mas afeta todo mundo | Coordenador (débito registrado por Vendas) | 18/08/2026 |
| 4 | `main` local está 71 commits à frente de `origin/main` (nada enviado ao GitHub desde 16/08 — CRM do dia 17 e Vendas inteiro só existem na máquina). Isso é intencional (segurar o deploy da Vercel até as migrations rodarem) ou é esquecimento? Se for pra enviar, quando — antes ou depois do merge de Marketing? | Coordenador | 18/08/2026 |

**Como usar:** qualquer agente que se deparar com uma decisão que atravessa mais de um módulo registra aqui em vez de decidir sozinho ou adivinhar — mesmo padrão que o Marketing já seguiu corretamente ("essa é uma decisão do Luiz, não vou inventar resposta por ele").

**Nota (18/08/2026):** o Luiz já deu um sinal parcial da pendência #1 — autorizou Vendas a mesclar direto em `main` sem esperar o Coordenador existir, enquanto a infraestrutura ainda estava sendo montada. Isso não fecha a pendência (Marketing ainda não mesclou, e a pergunta de fundo — se cada worktree vira PR/merge independente ou se passa por uma etapa de integração — continua em aberto pros próximos agentes), mas mostra que "merge direto quando a branch está pronta e sem conflito" é uma opção aceitável enquanto o Coordenador não estiver rodando.

---

## 5. Regras de sincronização

- **Sincronize com `main` antes de começar uma sessão de trabalho relevante** (merge ou rebase, o que for seu padrão) — evita revisar/construir em cima de uma base desatualizada, que deixa o merge final mais arriscado.
- **Commits pequenos e frequentes**, cada um numa unidade de trabalho que faz sentido isolada — facilita tanto o merge quanto a leitura deste documento por outro agente.
- **Qualquer sessão consegue inspecionar as outras diretamente** — todos os worktrees vivem debaixo do mesmo repositório (`.claude/worktrees/<nome>`), então `git -C .claude/worktrees/<nome> log/status/diff` funciona de qualquer lugar, sem precisar trocar de branch. Use isso antes de perguntar ao Luiz algo que dá pra conferir sozinho.
- **O Coordenador de Agentes é quem executa merges/integração** entre os worktrees, uma vez que o Luiz definir o plano (pendência #1 acima) — os agentes de módulo continuam trabalhando na própria branch normalmente até lá.
