# Status — Vendas

tarefa: **Auditoria completa do módulo Vendas** (código e documentação), feita a pedido do Luiz (21-22/08/2026) depois de uma sequência de achados reais testando o redesenho da Detalhes da Venda em produção. Cada achado foi apresentado com sugestão e aprovado individualmente antes de qualquer correção. Achados novos corrigidos: (1) `cancelarVenda` nunca sincronizava `oportunidades.etapa_kanban` pra "perdida" (inconsistente com o caminho automático de recusa de assinatura); (2) `excluirVenda` deixava o PDF órfão no Storage. Pendências antigas (registradas desde 19/08) fechadas na mesma rodada: (3) Leitor de Documento IA perdia nome/endereço já extraídos se a busca por documento falhasse (rede); (4) debounce de 300ms não cancelado quando o Leitor disparava direto; (5) `maxDuration` faltando em 3 páginas que disparam `tentarEmitirContrato` (Puppeteer+Assinafy) — achado um 3º ponto (Detalhes da Venda → "Tentar novamente") além dos 2 já suspeitos; (6) nota do `ASAAS_API_KEY` desatualizada, confirmada resolvida na prática. Tudo no commit `447249b`. Documentação corrigida: linha da migration `20260821100000` no quadro-branco (estava "aguardando", já tinha sido aplicada) e nova entrada datada no Plano Mestre cobrindo o dia inteiro de 21/08. Rodadas anteriores do mesmo dia (não repetidas aqui, ver histórico de commits): PDF certificado pós-assinatura, fix do status `previsto`/id errado na consulta à Asaas, "Recebido em dinheiro", comunicação com cliente desativada (decisão do Luiz, aguardando integração com CRM), `{{tabela_documentos}}` com 1 documento só, parcela paga escondendo boleto/copiar, soma por coluna no Kanban.
desde: 2026-08-22T00:00:00-03:00
proxima: **Aguardando o Luiz** — ele vai coordenar direto com o agente do CRM como o envio de WhatsApp/e-mail pro cliente deve passar a funcionar e depois trazer as instruções de como plugar isso no Vendas. Também pendente ele revisitar `/admin/configuracoes/assinafy-webhook` (reforçada pra conferir o segredo de verdade, commit `ef41644`) e confirmar se o contrato que ficou preso mostra "Segredo: NÃO bate". A spec+plano da reconciliação do Checkout de cartão (`docs/superpowers/specs/2026-08-21-vendas-checkout-cartao-recebiveis-design.md`, 9 tasks) segue aprovada, ainda não iniciada.
bloqueio: **Envio de comunicação pro cliente desativado de propósito** — `enviarWhatsapp`/`enviarPorEmail` (`src/lib/vendas/notificacoes.ts`) agora lançam erro em vez de chamar Zapster/Resend direto (decisão do Luiz, 21/08/2026: só o CRM deve mandar comunicação, pra ficar registrado na ficha do cliente). Os botões de reenvio continuam na tela (pedido explícito dele) — clicar mostra a mensagem explicando a situação. **Não reativar o envio direto** quando for mexer nisso de novo — esperar a integração que o Luiz for trazer do CRM.

## Verificação da Task 18 (2026-08-19) — o que foi confirmado e o que ficou pendente

**Confirmado (automatizado, branch inteira, HEAD `8350a6e`):**
- `pnpm exec tsc --noEmit` — limpo.
- `pnpm exec eslint src` — limpo.
- `pnpm exec vitest run` — 385/385 testes, 31 arquivos, verde.

**Pendente (roteiro manual do brief da Task 18 — precisa de Supabase real, não dá pra rodar neste worktree):**
- Nova Oportunidade (produto `proprio`, boleto/pix parcelado) aparecer no Painel em "Nova Oportunidade" antes do PDF terminar.
- Card avançar sozinho até "Aguardando Assinaturas" via Realtime, sem F5.
- Forçar erro (3 tentativas) → botão de retentativa manual aparecer e funcionar.
- Nova Oportunidade `comissionado` NÃO aparecer em `contratos`/Painel até "Confirmar venda".
- Fechamento de Venda (caminho CRM) criar o registro em "Nova Oportunidade" assim que a tela abre.
- Caminho de cartão — Checkout gerado, link funcional (confirmação final de pagamento depende de conta Asaas real, que ainda não existe).

**Por que não bloqueia o merge:** todas as 18 tasks passaram por revisão individual (spec + qualidade) durante a implementação, com 3 achados Critical/Important reais encontrados e corrigidos ao longo do processo (ver `.superpowers/sdd/2026-08-19-vendas-nova-oportunidade-kanban/progress.md`, não versionado — histórico completo do processo). O código está pronto pra funcionar assim que a migration rodar; falta só a verificação com dado real, que é ação do Luiz + deploy, não algo que eu resolvo sozinho neste worktree.

## Revisão final de branch (2026-08-19) — achados corrigidos + pendências que sobraram

Depois das 18 tasks implementadas e revisadas individualmente, rodei uma revisão final olhando a branch inteira (18 commits, diff completo) — esse tipo de passada pega coisas que cruzam múltiplas tasks, que nenhuma revisão isolada consegue ver. Achou 2 Critical reais (corrigidos no mesmo dia, commit `5f51e42`):
- Parcelamento do cartão nunca chegava na Asaas (o client coletava, o server descartava) — Checkout sempre saía em 1x. Corrigido com coluna nova `contratos.max_parcelas_cartao`.
- Retentativa automática "3x" não existe de fato (nenhuma etapa re-tenta sozinha) mas o botão manual só aparecia depois de 3 falhas acumuladas — um contrato com 1 erro ficava preso pra sempre, sem ação disponível. Corrigido: botão aparece a partir do primeiro erro.

Mais 4 achados Important corrigidos junto (migration não-idempotente; nome do Leitor de Documento IA sendo apagado; debounce/guarda de resposta obsoleta perdidos na busca por documento; card do Kanban sem indicador visual de erro).

**Re-revisão focada nos fixes (mesmo dia)** encontrou 2 achados Important novos — expostos justamente pela correção do Critical 2 (botão de retry agora fácil de clicar, o que tornou alcançável um caminho antes inatingível na prática) — corrigidos no commit `58ef970`:
- Retentativa manual do boleto/pix podia recriar cobranças já emitidas com sucesso na Asaas antes de uma falha no meio do lote de parcelas (risco de boleto duplicado pro cliente). Corrigido: `contrato_parcelas.asaas_payment_id` agora é lido de volta e o loop pula parcela já cobrada.
- Parcelamento do cartão sem limite de 1-21 (regra da Asaas) em nenhuma ponta — um valor fora da faixa só falharia depois do contrato assinado. Validado no client e no server, nas duas telas.
Mais 3 Minors baratos corrigidos junto (indicador "Buscando..." podia ficar preso; card vermelho do Kanban com mesmo fundo do normal no tema escuro; `cancelarVenda` não limpava `ultimo_erro`, deixando venda cancelada aparecer vermelha na coluna errada).

**Pendências que sobraram de rodadas anteriores — ✅ corrigidas na auditoria completa de 21/08/2026 (commit `447249b`), aprovadas uma a uma pelo Luiz:**
- ~~Se a busca por documento do Leitor de Documento IA falhar (erro de rede/server), o nome e endereço já extraídos pela IA se perdem~~ — corrigido, `try/catch` em volta da busca em `nova-oportunidade-client.tsx`.
- ~~O timer de debounce (300ms) da busca por documento não é cancelado quando o Leitor de Documento IA dispara uma busca direta~~ — corrigido, `clearTimeout` antes da busca direta.
- ~~Status transitório "aguardando_assinaturas" quando `ASAAS_API_KEY` não está configurada~~ — **confirmado resolvido na prática**: a conta Asaas real já está configurada e funcionando (cobranças, Checkout, recebido em dinheiro, tudo testado em produção nesta sessão). Deixando de ser pendência.
- ~~Cadeia PDF+Assinafy sem `maxDuration` explícito nas rotas de Vendas~~ — corrigido, `maxDuration = 60` explícito nas 3 páginas que disparam `tentarEmitirContrato` (Nova Oportunidade, Fechamento de Venda, Detalhes da Venda via "Tentar novamente" — esse terceiro ponto de entrada só foi achado nesta auditoria).
- Também corrigidos na mesma rodada, achados novos: `cancelarVenda` não sincronizava `oportunidades.etapa_kanban` pra "perdida" (inconsistente com o caminho automático); `excluirVenda` deixava o PDF órfão no Storage.

**Pendências que ainda seguem em aberto (Minor, baixo risco, não corrigidas):**
- Diversos Minors de polimento (feedback de quantos cards foram retentados em lote; `Record<string,string>` sem exaustividade em `FORMA_PAGAMENTO_LABEL`; logs de debug com dado sensível ainda em `fechamento/actions.ts`) — ver relatório completo da revisão em `.superpowers/sdd/2026-08-19-vendas-nova-oportunidade-kanban/` (workspace local, não versionado).

## Pendências conhecidas — Asaas Checkout (cartão, Task 10/10b)

- **Reconciliação de parcelas do cartão:** os "títulos a receber" reais do cartão (datas/valores exatos que a Asaas vai creditar por parcela) ainda não são gravados em `contrato_parcelas` — a parcela única criada no submit (Task 13) continua sendo só um placeholder pro valor total. Resolver depende da pesquisa pendente da spec seção 6.1 (onde/como a Asaas expõe o detalhe por parcela de um Checkout pago). Não bloqueia o resto do plano.
- **Possível duplicação de clientes no painel Asaas (baixa prioridade):** a doc oficial do Checkout não confirma se `customerData` (dados soltos, sem id) casa automaticamente com um cliente Asaas já existente pelo CPF/CNPJ ou sempre cria um novo. Se criar um novo a cada Checkout, o dashboard da Asaas acumula clientes duplicados pro mesmo CPF/CNPJ ao longo do tempo — sem impacto funcional pro nosso sistema (a reconciliação usa `externalReference`, não o id do cliente), mas pode confundir o Luiz olhando o painel da Asaas. Não bloqueia.
turno_fim: 2026-08-20T14:02:22-03:00
