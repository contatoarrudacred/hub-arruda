# Spec — Pastas de Fluxo + edição de nome inline (`/admin/fluxos`)

> Pedido de Luiz, 19/08/2026. Decisões já fechadas com ele antes de escrever isto: apagar pasta com fluxo dentro **move os fluxos pra raiz** (não bloqueia); ordem dos fluxos **é manual** (arrastar), não alfabética.

## 1. Objetivo

Hoje `/admin/fluxos` é uma lista simples (`page.tsx`), sem organização — todo fluxo aparece solto, ordenado por nome. Luiz pediu:
1. Editar o nome de um fluxo direto na lista (ícone de lápis, sem abrir o editor de etapas).
2. Agrupar fluxos em **pastas** (a pasta funciona como categoria/tipo do fluxo), com drag-and-drop pra mover fluxo entre pastas ou pra raiz.
3. Cada pasta tem uma **cor** (paleta fechada de 16, escolhida num seletor) e também é renomeável pelo mesmo ícone de lápis.

## 2. Modelo de dados

Tabela nova `fluxo_pastas` + 2 colunas novas em `fluxos`. Sem `pasta_id`, um fluxo vive na raiz.

```sql
create table fluxo_pastas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cor text not null default 'cinza',        -- chave da paleta fechada, não hex livre (ver seção 3)
  posicao integer not null default 0,       -- ordem manual entre pastas
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table fluxos
  add column pasta_id uuid references fluxo_pastas(id) on delete set null,
  add column posicao integer not null default 0;  -- ordem manual dentro da pasta (ou da raiz)
```

- **`on delete set null`** é o que implementa a decisão "apagar pasta move fluxo pra raiz" — sem gatilho nem código extra, o próprio banco já faz isso.
- RLS/policy da tabela nova segue o mesmo padrão já usado pelas tabelas de configuração do admin (`respostas_prontas`, `regras_roteamento` etc.) — igual pra todo `usuarios_sistema` autenticado, sem RBAC por nível (não existe RBAC de verdade implementado ainda, mesmo achado já registrado quando avaliei a tela de Pessoas).
- **Migration reservada:** `20260819130000_fluxos_pastas.sql` (próximo timestamp livre do dia, conferido contra a tabela de migrations do `COORDENACAO_AGENTES_ARRUDACRED.md`) — só escrevo o `.sql` quando você aprovar esta spec; não rodo, entrego pra você rodar no SQL Editor (regra dura do projeto).

**Ordem manual — mecânica escolhida (mais simples de implementar/raciocinar):** depois de qualquer drag (reordenar dentro da mesma lista, ou mover pra outra pasta/raiz), o client manda a lista final de ids na nova ordem daquele escopo (pasta de origem se mudou de pasta, mais a de destino) e o servidor regrava `posicao` como `0,1,2,3...` sequencial pra cada lista afetada — sem gaps fracionários, sem race condition de posição flutuante.

## 3. Paleta de cores da pasta (16 cores fixas)

O projeto já tem esse padrão exato pra cor de atendente (`src/lib/motor-fluxo/cores-atendimento.ts`) — paleta fechada, cada cor é uma **chave nomeada** (não hex livre), com par bg/texto já pronto pra light/dark. Proposta: mesmo padrão, novo arquivo `src/lib/motor-fluxo/cores-pasta.ts` com 16 chaves (as famílias de cor do Tailwind que ainda não são usadas por outra coisa no sistema — evita a pasta ficar visualmente igual ao badge de outro conceito):

`vermelho, laranja, amber, amarelo, lima, verde, esmeralda, teal, ciano, azul, indigo, violeta, roxo, fúcsia, rosa, cinza`

Cada uma vira `bg-{cor}-100 dark:bg-{cor}-900` / `text-{cor}-700 dark:text-{cor}-300` (mesmo par usado em `CORES_BADGE`). Column `fluxo_pastas.cor` guarda a chave (`"violeta"`, não `#8b5cf6`) — troca de tom visual no futuro (ex.: ajustar contraste) não exige migrar dado nenhum.

**Seletor:** grade 4×4 de bolinhas coloridas num popover, abre ao clicar num swatch/botão de cor no cabeçalho da pasta (ou dentro do mesmo popover de criar pasta) — mesmo componente de grade já usado em `/admin/atendentes`, só com 16 opções em vez de 7.

## 4. UI — `/admin/fluxos`

**Topo da página:** botão "📁 Criar Pasta" ao lado do título. Clique abre um popover pequeno: campo de nome + grade de 16 cores + botão "Criar" — cria a pasta já com posição no fim da lista de pastas, sem fluxo dentro.

**Lista principal** deixa de ser uma `<ul>` plana e vira 2 tipos de seção, cada pasta antes da raiz:
- **Seção de pasta** — cabeçalho colorido (barra lateral ou fundo leve na cor da pasta) com nome + ícone de lápis (edita nome) + swatch de cor clicável (edita cor) + ícone de lixeira (exclui pasta, confirmação simples tipo `window.confirm` — mesmo padrão já usado no editor de fluxo/FAQs) + contador de fluxos dentro. Corpo expansível/recolhível (estado não persistido — cosmético, reabre expandido a cada F5).
- **Seção "Sem pasta" (raiz)** — sempre visível por último (ou primeiro — a decidir no protótipo), sem cabeçalho colorido, é onde ficam os fluxos ainda não categorizados.

**Card de fluxo** (dentro de qualquer seção) — mesmo card de hoje (nome, link pro editor), mas com:
- Ícone de lápis ao lado do nome — clique troca o nome por um `<input>` inline, Enter/blur salva, Esc cancela (mesmo padrão a construir uma vez, reaproveitado também pro nome da pasta).
- Alça de arrastar (ícone `⠿` ou o card inteiro é arrastável) — solta em outra seção (pasta ou raiz) ou reordena dentro da mesma seção.

**Biblioteca de drag-and-drop:** o projeto **não tem nenhuma hoje** (o Kanban de Vendas é só visual, sem arrastar) — vou adicionar `@dnd-kit/core` (+ `@dnd-kit/sortable`), padrão de mercado, o mesmo que a Kibo UI (cujo visual já usamos no Kanban de Vendas) usa por baixo. Cobre mouse e touch de fábrica.

## 5. Server Actions novas (`src/app/admin/(shell)/fluxos/actions.ts`)

- `criarPastaAction(nome, cor)` 
- `renomearPastaAction(pastaId, novoNome)`
- `definirCorPastaAction(pastaId, cor)`
- `excluirPastaAction(pastaId)` — delete simples, o `on delete set null` cuida do resto
- `renomearFluxoAction(fluxoId, novoNome)` (não existe hoje — nome do fluxo só era editável indiretamente)
- `moverEReordenarAction(mudancas: { fluxoId, pastaIdDestino, posicao }[])` — recebe a lista final de 1 ou 2 escopos afetados (origem+destino quando muda de pasta, só um quando é reordenação dentro da mesma) e grava tudo numa passada

## 6. Fora de escopo (registrar, não construir agora)

- Pastas dentro de pastas (só 1 nível, como pedido).
- Arrastar um fluxo pra fora do admin ou pra outro tipo de entidade.
- Permissão diferenciada por nível de acesso no botão de excluir pasta — não existe RBAC real implementado ainda (mesmo gap já registrado na avaliação da tela de Pessoas); qualquer usuário logado no admin pode.
- Cor "customizada" (hex livre) — só as 16 fixas, como pedido.

## 7. Perguntas em aberto — resolvidas

- **Pasta vazia:** continua aparecendo na lista, com texto "Pasta vazia" no lugar do corpo (em vez de espaço em branco) — decidido por Luiz, 19/08/2026. Continua sendo um alvo válido de drop.
- Seção "Sem pasta" aparece **antes** ou **depois** das pastas coloridas? Proposta ainda de pé (sem objeção de Luiz): depois — as pastas (organização deliberada) chamam mais atenção primeiro.
