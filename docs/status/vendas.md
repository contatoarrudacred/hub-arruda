# Status — Vendas

tarefa: Rodada de fechamento das 6 pendências levantadas em 22/08/2026: migration `130001` confirmada aplicada, escopo do Checkout de cartão reduzido pro Financeiro (spec+plano atualizados), 3 Minors da auditoria de 21/08 implementados, e investigação de código do "Kanban não avançou sozinho" (ver seção abaixo) — sem bug encontrado, aguardando o Luiz reproduzir numa Oportunidade nova pra decidir o próximo passo. Tudo commitado (`7849e05`, `9bd2735`) e já em `main`/`vendas-contrato`.
desde: 2026-08-22T00:00:00-03:00
proxima: **Aguardando o Luiz** gerar uma Oportunidade nova e seguir até a assinatura pra ver se o Kanban avança sozinho dessa vez — se não avançar, ele vai olhar os logs da Vercel/Assinafy antes de qualquer coisa nova ser desenhada. Ideia de reconciliação automática (cron) mencionada e aceita por ele, mas só se o problema virar recorrente — não desenhar sem ele pedir de novo. Depois: aguardar instrução do Luiz sobre comunicação centralizada do CRM (ele disse explicitamente "aguarde minha instrução" — nenhuma ação do Vendas até lá).
bloqueio: **Envio de comunicação pro cliente desativado de propósito** — `enviarWhatsapp`/`enviarPorEmail` (`src/lib/vendas/notificacoes.ts`) agora lançam erro em vez de chamar Zapster/Resend direto (decisão do Luiz, 21/08/2026: só o CRM deve mandar comunicação, pra ficar registrado na ficha do cliente). Os botões de reenvio continuam na tela (pedido explícito dele) — clicar mostra a mensagem explicando a situação. **Não reativar o envio direto** quando for mexer nisso de novo — esperar a integração que o Luiz for trazer do CRM.

## Investigação (22/08/2026) — contrato assinado não avançou sozinho no Kanban

Segredo do webhook confirmado batendo pelo Luiz ("esta batendo - conferido") — hipótese original descartada. Revisei a cadeia inteira (`src/app/api/webhooks/assinafy/route.ts` → `processarDocumentoAssinado` → `buscarContratoPorAssinafyDocumentId` → `sincronizarEtapaKanban`) e não achei bug: nomes de evento (`document_ready`, `signer_rejected_document`) conferem com a lista oficial `GET /webhooks/event-types` da Assinafy (`document_ready` = "triggered when the last signer signs"), busca por `assinafy_document_id` é uma query direta sem lógica frágil.

Achado relevante: esse EXATO sintoma já aconteceu antes, em 21/08 — é por isso que existe o escape hatch `confirmarAssinaturaManualAction` ("Verificar assinaturas agora", `src/app/admin/(shell)/vendas/[oportunidadeId]/actions.ts:100`, comentário já documenta o incidente). Hipótese mais provável: o webhook simplesmente não chega ao nosso endpoint em alguns casos (lado Assinafy ou de rede), não uma falha de processamento nosso — mas isso só um log real (Vercel function `/api/webhooks/assinafy` no horário da assinatura, ou o histórico de entrega do painel Assinafy) confirma.

**Combinado com o Luiz:** ele vai gerar uma Oportunidade nova e testar de novo antes de olhar logs — se acontecer de novo, aí sim ele confere os logs. Se o problema virar recorrente, ele topa desenhar uma reconciliação automática (cron que confere contratos presos e destrava sozinho, no padrão dos crons que Marketing/CRM já usam) — não fazer isso sem ele pedir de novo.

## Pesquisa (22/08/2026) — Asaas Checkout e cliente duplicado (item 6)

Confirmado de novo direto na doc oficial da Asaas: eles **não documentam** se `customerData` (sem `customer` id) casa por CPF/CNPJ com cliente existente ou sempre cria um novo. Segue sem confirmação oficial, registrado como já estava — sem impacto funcional (reconciliação usa `externalReference`, não o id do cliente Asaas).

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
