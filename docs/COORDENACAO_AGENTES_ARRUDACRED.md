# Coordenação entre Agentes — Sistema ArrudaCred

**Status:** Documento vivo — qualquer agente pode e deve editar as seções que dizem respeito ao seu próprio trabalho.
**Criado:** 18/08/2026, depois de um incidente real (duas migrations com timestamp idêntico criadas por agentes diferentes — CRM e Marketing — sem nenhum canal pra se avisar).

> **Como usar este documento:** este é o quadro-branco compartilhado entre **todos os agentes** (sessões de Claude Code) trabalhando neste projeto ao mesmo tempo, cada um numa branch/worktree própria — hoje CRM, Marketing e Vendas, mas a lista cresce (Financeiro, Operações, e outros ainda por vir). Não existe canal de mensagem em tempo real entre as sessões — a coordenação acontece por este arquivo, que todo mundo lê e escreve. **Todo agente deve ler este documento no início de qualquer sessão de trabalho relevante**, e atualizá-lo sempre que fizer algo que outro agente precisaria saber pra não colidir ou pra aproveitar sinergia.

---

## 1. Registro de agentes ativos

| Agente | Worktree/branch | Escopo | Status |
|---|---|---|---|
| CRM | `main` (raiz do repo, sem worktree próprio) | Atendimento, motor de fluxo, Kanban (futuro), IA de atendimento | Ativo |
| Marketing | `worktree-pipeline-conteudo-marketing-nucleo` | Pipeline de conteúdo/blog, sites satélite, tráfego pago | Ativo |
| Vendas | `worktree-vendas-cadastro` | Cadastro Cliente/Fornecedor/Serviço, contrato, assinatura digital, financeiro da venda | Ativo |
| Coordenador de Agentes | `main` (raiz do repo, sessão dedicada — não escreve feature) | Integração entre agentes, merges, detecção de colisão antes de virar problema | Ativo |
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

**Regra prática:** se dois agentes forem criar migration no "mesmo dia" (mesmo prefixo `YYYYMMDD`), quem for escrever depois confere a tabela e usa um horário/minuto que ainda não apareça aqui pra aquele dia — não precisa ser hora real, só precisa ser único.

---

## 3. Avisos entre agentes / sinergias potenciais

Espaço pra qualquer agente deixar um recado pros outros — algo que criou que pode interessar a outro módulo, uma decisão que afeta mais de um escopo, um padrão que vale a pena reaproveitar. Novo aviso sempre no topo, com data e quem escreveu.

- **18/08/2026 (Vendas, confirmado por CRM):** Vendas sincronizou o worktree com `main` e trouxe os commits de CRM até `7567aa3`/`b7f09ea`, mas **Marketing ainda não mesclou nada em `main`** — o worktree de Marketing só puxou `main` pra dentro dele (até `7567aa3`), não empurrou de volta. `merge-base(main, worktree-pipeline-conteudo-marketing-nucleo)` = `7567aa3`; nenhum commit de Marketing (`5e00705`, `19ed640`, etc.) está em `main`. Branch de Vendas está pronta (139 testes, lint/build verdes) — só falta o Luiz definir a ordem de merge dos 3 worktrees (pendência #1 abaixo).

---

## 4. Decisões pendentes do Luiz (cross-cutting, não é de um agente só decidir)

| # | Pergunta | Levantada por | Data |
|---|---|---|---|
| 1 | Plano de merge dos worktrees pra `main`: cada um vira PR separado, ou existe uma etapa de integração antes de cada merge? | CRM/Marketing (durante a colisão de migration) | 18/08/2026 |

**Como usar:** qualquer agente que se deparar com uma decisão que atravessa mais de um módulo registra aqui em vez de decidir sozinho ou adivinhar — mesmo padrão que o Marketing já seguiu corretamente ("essa é uma decisão do Luiz, não vou inventar resposta por ele").

---

## 5. Regras de sincronização

- **Sincronize com `main` antes de começar uma sessão de trabalho relevante** (merge ou rebase, o que for seu padrão) — evita revisar/construir em cima de uma base desatualizada, que deixa o merge final mais arriscado.
- **Commits pequenos e frequentes**, cada um numa unidade de trabalho que faz sentido isolada — facilita tanto o merge quanto a leitura deste documento por outro agente.
- **Qualquer sessão consegue inspecionar as outras diretamente** — todos os worktrees vivem debaixo do mesmo repositório (`.claude/worktrees/<nome>`), então `git -C .claude/worktrees/<nome> log/status/diff` funciona de qualquer lugar, sem precisar trocar de branch. Use isso antes de perguntar ao Luiz algo que dá pra conferir sozinho.
- **O Coordenador de Agentes é quem executa merges/integração** entre os worktrees, uma vez que o Luiz definir o plano (pendência #1 acima) — os agentes de módulo continuam trabalhando na própria branch normalmente até lá.
