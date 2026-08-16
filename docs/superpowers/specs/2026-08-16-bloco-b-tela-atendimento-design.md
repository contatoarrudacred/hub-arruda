# Bloco B da Tela de Atendimento + Sistema de Cores por Controlador — Design

**Status:** Validado com Luiz em 16/08/2026 (brainstorming visual, mockups em `.superpowers/brainstorm/`).
**Escopo:** Bloco B da Tela de Atendimento (`docs/TELA_ATENDIMENTO_ARRUDACRED.md` seção 6/5) + melhorias de UX/layout + sistema de cor por controlador da conversa (item novo, não estava no desenho original).

---

## 1. Sistema de cores por controlador

O painel inteiro da conversa aberta (não por trecho/histórico) reflete quem está no controle **agora**:

| Estado | Cor de fundo do painel | Cor do badge na lista |
|---|---|---|
| Não atribuída (`sob_supervisor=true`, `atendente_id` nulo) | Verde claro estilo WhatsApp Web — fundo `#D9FDD3`, texto/acento `#128C7E` | mesmo par |
| Malala no controle (`sob_supervisor=false`) | Roxo — fundo `#EDE7F9`, texto/acento `#7C5CBF` (era verde antes desta mudança) | mesmo par |
| Atendente específico (`atendente_id` preenchido) | Cor escolhida pelo atendente (ver paleta abaixo) | mesma cor |

**Paleta curada para `usuarios_sistema.cor_badge`** (verde e roxo reservados, não entram na paleta escolhível):

| Chave | Acento (texto/badge saturado) | Fundo claro (badge/painel) |
|---|---|---|
| `vermelho` | `#B91C1C` | `#FEE2E2` |
| `laranja` | `#C2410C` | `#FFEDD5` |
| `marrom` | `#78350F` | `#F5E3D3` |
| `rosa` | `#DB2777` (ajustado pra ficar "mais pink", não "vinho") | `#FCE7F3` |
| `ciano` | `#0E7A83` | `#CFF4F1` |
| `azul` | `#1D4ED8` | `#DBEAFE` |
| `cinza` | `#44403C` | `#E7E5E4` |

Decisões de descarte registradas (não reabrir sem motivo novo): turquesa saiu por ficar quase idêntico ao verde-escuro do WhatsApp já usado no estado "não atribuída"; índigo saiu por ficar perto demais do azul; dourado/amarelo foi proposto e **rejeitado** por colidir com o dourado `#c8a55d` de identidade da marca (badge de etapa do Kanban, botões do admin) — mesma cor apareceria em dois contextos diferentes no mesmo card.

**Schema:** `usuarios_sistema` ganha `cor_badge text not null default 'azul' check (cor_badge in ('vermelho','laranja','marrom','rosa','ciano','azul','cinza'))`. Editável pelo próprio usuário (clique no avatar → "Escolher minha cor"), não pelo admin em nome de outro.

---

## 2. Menus de ação

**Card da lista (painel esquerdo):** mantém 100% dos campos atuais (nome, hora, telefone, prévia da última mensagem, indicador de não lida, badge de etapa do Kanban, badge de produto, badge de estado colorido) — nada é removido. Acrescenta um ícone "⋮" no fim da linha de badges, que abre: Assumir Chat / Atribuir pra Malala / Atribuir a atendente específico (submenu com foto+nome+cor de cada atendente ativo) — direto da lista, sem precisar abrir a conversa.

**Cabeçalho da conversa:** acrescenta, sempre visíveis (por serem de uso frequente):
- 🔍 Busca inline dentro do histórico daquela conversa (rola até o trecho, destaca o termo).
- 👤 Abre painel lateral com dados do contato/oportunidade (recurso já previsto em `TELA_ATENDIMENTO_ARRUDACRED.md` seção 3, nunca construído — entra aqui).
- Botão "Atribuir a..." (substitui o antigo par Assumir/Atribuir-pra-Malala por um único ponto de entrada com todos os destinos: Malala, mim, ou um atendente específico).

E um "⋮" com ações raras: **Resetar conversa** (sai da página separada `/admin/reset-conversa` e entra aqui, mesmo modal de confirmação com alerta de irreversibilidade) e Copiar telefone.

**Identidade do usuário logado:** avatar (foto/inicial) à **esquerda** do nome, no canto superior direito da tela — clicar abre "Escolher minha cor" + Sair.

**Notificações:** ícone de sino com contador vermelho (mesmo padrão visual dos badges de não lida já usados na lista) — cobre @menções em notas internas e atribuições recebidas. Só polling (mesmo padrão de 4s já usado), sem push/som.

---

## 3. Funcionalidades do Bloco B (já especificadas em `TELA_ATENDIMENTO_ARRUDACRED.md`, detalhadas aqui)

1. **Atribuição a atendente específico** — `conversas.atendente_id` já existe (Bloco A). Novo: Server Action de atribuição direta a um colega (não só a si mesmo), acionável do "Atribuir a..." do cabeçalho e do "⋮" do card. Submenu "Humano" da barra de filtros passa a listar cada atendente ativo por nome (com a cor dele), além de Minhas/Não atribuídas/Todas.
2. **Notas internas + @menção** — tabela nova `notas_internas` (conversa_id, autor_id, texto, criado_em), aparecem na timeline como chip amarelo (nunca vai pro WhatsApp real). `@nome` no texto vira notificação in-app pro mencionado.
3. **Respostas prontas** — tabela nova `respostas_prontas` (nome/atalho, texto, ativo) + CRUD no admin (mesmo padrão de FAQs/Objeções) + atalho "/" no composer pra buscar e inserir.
4. **Atalho "usar próxima etapa do script"** — botão no composer que busca a mensagem literal da próxima etapa do fluxo (via `conversas.etapa_fluxo_atual_id` → `etapas_fluxo`) e preenche o campo de texto (o humano revisa/edita antes de mandar).
5. **Modal de follow-up ao sair de conversa sem resposta** — ao trocar de conversa (ou fechar a tela) com uma mensagem nossa sem resposta do lead, pergunta se quer ativar follow-up automático + qual régua usar (`agendas_followup`, pré-selecionada "Padrão").
6. **Trilha de atividade na timeline** — reaproveita `auditoria_log` já existente, exibida como linha de sistema centralizada (ex.: "Ana assumiu o chat às 14:32").

---

## 4. Composer reorganizado

Duas linhas: barra de atalhos em cima (⚡ Próxima etapa, 💬 Respostas prontas, 📎 anexo, 🎤 áudio, 📅 agendar) + linha de digitação embaixo (input + Enviar), evitando amontoar tudo numa linha só conforme os recursos do Bloco B chegam.

---

## 5. Fora de escopo desta rodada (registrado, não esquecer)

- Selo de risco de esfriar, histórico de fotos do contato, confirmação de leitura — Bloco D, sem mudança aqui.
- Provedor de IA / Fase 5 (resumo automático, detector de objeção) — dependência já registrada, não faz parte deste bloco.
- Cor por trecho da timeline (não por controlador atual) — avaliado e descartado por Luiz nesta rodada em favor da versão mais simples (painel inteiro pelo controlador atual).

---

## 6. Ordem de construção proposta

1. Sistema de cores (schema + badges + fundo do painel) — fundação de tudo o resto, sem dependência.
2. Atribuição a atendente específico (usa a cor) + filtro por atendente no submenu Humano.
3. "⋮" do card (reaproveita as ações do item 2).
4. Cabeçalho: 🔍 busca interna, 👤 dados do contato/oportunidade, "⋮" com Resetar conversa (migra da página separada).
5. Notas internas + @menção + sino de notificação.
6. Respostas prontas (CRUD + atalho "/").
7. Atalho "usar próxima etapa do script".
8. Modal de follow-up ao sair sem resposta.
9. Composer reorganizado (2 linhas) — integra os atalhos dos itens 6/7 e o resto já existente.
10. Avatar/nome do usuário atual + "Escolher minha cor".
