# Vendas — Reconciliação do Checkout de cartão: conclusão automática + parcelas a receber da Asaas — Design

**Status:** desenhado, aguardando plano de implementação.
**Decidido com:** Luiz, 21/08/2026, conversa direta em chat (sem sessão de brainstorming em terminal separada).

## 1. Contexto e motivação

O Checkout de cartão (`criarCheckout`, `src/lib/asaas/cliente.ts`) já existe e funciona: o cliente escolhe o parcelamento na página hospedada da Asaas, digita o cartão lá (nunca no nosso sistema). Mas nenhuma venda paga por cartão foi concluída de verdade em produção ainda, e dois problemas reais foram identificados ao planejar o primeiro teste:

**Problema 1 — o sistema nunca fica sabendo que o Checkout foi pago.** O webhook da Asaas (`src/app/api/webhooks/asaas/route.ts`) só escuta `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED`, casando por `payment.id` contra `contrato_parcelas.asaas_payment_id`. O Checkout de cartão nunca preenche essa coluna (`criarCobrancasDoContrato`, no ramo cartão, só grava `asaas_checkout_id`/`asaas_checkout_url` em `contratos`) — então mesmo que o cliente pague de verdade, a venda nunca conclui, o cliente nunca é promovido, e a Ordem de Serviço nunca dispara.

**Problema 2 — falta previsibilidade de caixa (Luiz, nas palavras dele):** *"quem vai nos pagar não é mais o cliente e sim a Asaas. É essa informação que precisamos para gerar as parcelas a receber da Asaas, ter previsibilidade de caixa, conseguindo marcar como pagas depois que a Asaas fizer o crédito na conta. [...] essas parcelas, mesmo sendo faturadas contra a Asaas e não contra o cliente, precisam ficar vinculadas à venda. [...] pode acontecer de o cliente desistir, solicitar devolução ou fazer um chargeback — caso isso aconteça, precisamos [...] cancelar essas parcelas a receber."* Hoje isso já estava anotado como pendência conhecida em `docs/status/vendas.md`: "os títulos a receber reais do cartão [...] ainda não são gravados em `contrato_parcelas`".

**Fronteira de escopo, definida explicitamente pelo Luiz:** esta spec cuida só de **criar e manter atualizada a informação de origem** (a venda foi paga; quais são as parcelas reais a receber; sinalizar quando uma foi contestada). Qualquer motor de **reconciliação periódica/proativa** (conferir sozinho, de tempos em tempos, se o dinheiro realmente caiu) é assunto do futuro módulo **Financeiro**, não de Vendas — registrado como direção futura na seção 8, não implementado aqui.

## 2. Pesquisa na documentação oficial da Asaas (confirmada, WebFetch em docs.asaas.com, 21/08/2026)

- Família de eventos de webhook `CHECKOUT_CREATED` / `CHECKOUT_CANCELED` / `CHECKOUT_EXPIRED` / `CHECKOUT_PAID` (`docs.asaas.com/docs/eventos-para-checkout`). O payload do evento carrega um objeto `checkout` com `checkout.id` (bate com `contratos.asaas_checkout_id`, já gravado) e `checkout.installment` (id do parcelamento gerado pela Asaas quando o cartão é parcelado — confirmado na estrutura do payload de `CHECKOUT_CREATED`, ali `null` porque o exemplo da doc não tinha parcelamento).
- `GET /v3/installments/{id}/payments` — lista cada parcela real do parcelamento: `id`, `value`, `dueDate`, `status`, `installment`.
- `DELETE /v3/installments/{id}/payments` — cancela de uma vez as parcelas **ainda não pagas** de um parcelamento inteiro; o que já foi confirmado não é mexido. Risco documentado: se cancelar todas, o parcelamento inteiro é apagado sem volta.
- Eventos de estorno/chargeback, todos com `payment.id` no payload: `PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`, `PAYMENT_REFUND_IN_PROGRESS`, `PAYMENT_REFUND_DENIED`, `PAYMENT_RECEIVED_IN_CASH_UNDONE`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`, `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`.
- **Confirmado com o Luiz (21/08/2026):** o webhook da Asaas é cadastrado manualmente no painel deles (não existe, e não vai existir nesta spec, nenhuma função no código tipo `configurarWebhook` — diferente do padrão já usado pra Assinafy). Os eventos novos necessários (`CHECKOUT_PAID` e os de estorno/chargeback acima) **já foram adicionados por ele no painel** antes desta spec ser escrita — nenhum passo manual pendente relacionado a isso.
- **Não confirmado na documentação, registrado como risco conhecido (seção 7):** não há exemplo de payload de `CHECKOUT_PAID` pra uma compra em cartão à vista (1x) — não dá pra garantir que `checkout.installment` vem preenchido nesse caso. O desenho abaixo é resiliente a isso (seção 4, passo 4).

## 3. Modelo de dados

**`contratos`** — uma coluna nova:
- `asaas_installment_id text` — id do parcelamento de cartão (`checkout.installment`), preenchido quando `CHECKOUT_PAID` chega e a busca do parcelamento dá certo. Usado depois pra montar o link "cancelar parcelas restantes" (`DELETE /v3/installments/{id}/payments`).

**`contrato_parcelas`** — nenhuma coluna nova. Um valor novo no `CHECK` do `status`: `'contestado'` (hoje: `previsto/gerado/pago/atrasado/cancelado`) — marca uma parcela que sofreu chargeback/estorno e está aguardando decisão manual, sem confundir com `cancelado` (que já significa "resolvido, não vai mais ser cobrado").

Nenhuma tabela nova. Nenhuma coluna nova em `contrato_parcelas` pra "isso é receita da Asaas, não do cliente" — já dá pra saber isso olhando `contratos.metodo_pagamento = 'cartao'` via join, sem duplicar informação.

## 4. Fluxo: `CHECKOUT_PAID` (resolve o Problema 1 + inicia o Problema 2)

Em `src/app/api/webhooks/asaas/route.ts`, novo tratamento pro evento `CHECKOUT_PAID`, rodando em `after()` como os demais:

1. Acha a venda por `contratos.asaas_checkout_id = checkout.id` (nova função `buscarContratoPorAsaasCheckoutId` em `src/lib/vendas/contratos.ts`, mesmo padrão de `buscarContratoPorAssinafyDocumentId`).
2. Se não achar, loga erro e sai (mesmo padrão dos outros handlers).
3. **Marca a venda como concluída e dispara os efeitos de conclusão na hora** — `atualizarStatusContrato(contrato.id, "concluida")`, `sincronizarEtapaKanban(contrato.oportunidadeId, "ganha")`, `promoverPessoaACliente` (mesma sequência que `processarPagamentoConfirmado` já faz pra boleto/pix, extraída pra uma função compartilhada `concluirVenda(contrato)` em `src/lib/vendas/contratos.ts` ou `oportunidades.ts` — usada pelos dois caminhos). **Não espera nenhuma parcela específica**: diferente do boleto/pix, no cartão o cliente já pagou o valor cheio pra Asaas no ato da compra — o que vem depois é só repasse escalonado pra nossa conta, e isso não deveria segurar a entrega do serviço.
4. **Numa etapa separada, em `try/catch` próprio que não pode derrubar o passo 3** (mesmo padrão já usado hoje pra `sincronizarPdfCertificado` no webhook da Assinafy): lê `checkout.installment` do payload. Se vier vazio, loga um aviso claro ("checkout pago mas sem id de parcelamento no payload — parcelas a receber não foram capturadas, conferir manualmente") e para por aqui — a venda já está concluída, só falta a tabela de recebíveis. Se vier preenchido, chama `GET /v3/installments/{id}/payments`, apaga a(s) parcela(s)-placeholder do contrato e grava uma linha real em `contrato_parcelas` por parcela (`numero` sequencial, `valor`, `vencimento_previsto` = `dueDate`, `asaas_payment_id` = `id`), atualiza `contratos.parcelas_qtd` e `contratos.asaas_installment_id`.

## 5. Fluxo: pagamento de cada parcela real

O webhook `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` já existente (`processarPagamentoConfirmado`) passa a valer também pra essas parcelas de cartão, porque agora têm `asaas_payment_id` de verdade — `marcarParcelaPaga` já funciona sem mudança.

**Um ajuste pontual:** a regra atual "só a 1ª parcela paga conclui a venda" não pode rodar de novo pro cartão (a venda já foi concluída na seção 4). Gate: `if (contrato.metodoPagamento !== "cartao" && parcelaPaga.numero === 1) { /* concluir venda */ }` — pra cartão, o webhook só atualiza `status`/`pago_em` da parcela via `marcarParcelaPaga`, sem repetir a promoção de cliente/mudança de etapa.

## 6. Fluxo: chargeback/estorno

Novo tratamento no mesmo webhook pros eventos `PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`, `PAYMENT_REFUND_IN_PROGRESS`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`, `PAYMENT_AWAITING_CHARGEBACK_REVERSAL` (agrupados — mesmo tratamento pros seis, só o texto do alerta muda por evento):

1. Acha a parcela por `contrato_parcelas.asaas_payment_id = payment.id`.
2. Marca `status = 'contestado'`.

Sem coluna nova em `contratos` pra sinalizar isso — o próprio `status = 'contestado'` na parcela já é a fonte da verdade (evita duplicar o mesmo fato em dois lugares, e evita reaproveitar por engano o campo `ultimo_erro`, que está amarrado ao botão automático "Tentar novamente" de `PainelErroTentativas` — ação errada pra este caso, que é um evento financeiro, não uma falha de automação).

Em Detalhes da Venda, dentro do quadro Financeiro (`CardCheckoutCartao`, construído nesta mesma sessão): quando existe alguma parcela `'contestado'` entre as parcelas do contrato, aparece um aviso e um botão **"Cancelar parcelas restantes"** — chama uma Server Action nova que executa `DELETE /v3/installments/{id}/payments` (usando `contratos.asaas_installment_id`) e marca como `'cancelado'` as parcelas que ainda estavam `previsto`/`gerado`. Ação manual, com confirmação explícita avisando que é irreversível (mesmo padrão de `BotaoExcluir`, construído nesta sessão) — decisão do Luiz, não automática, porque a documentação da Asaas não confirma se eles já cancelam isso sozinhos.

## 7. Riscos e pontos não confirmados na doc (a verificar na implementação)

- `checkout.installment` vazio numa compra em 1x — tratado como caso normal (seção 4, passo 4), não bloqueante.
- Nomes exatos de todos os campos do payload de `CHECKOUT_PAID` (só o payload de `CHECKOUT_CREATED` foi confirmado na doc, que documenta serem eventos "irmãos" com o mesmo formato de objeto `checkout`) — conferir contra o payload real na primeira venda de cartão testada em produção, antes de considerar este fluxo validado de ponta a ponta.
- Se a Asaas cancela sozinha as parcelas futuras num chargeback — não confirmado; por isso o cancelamento é manual (seção 6).

## 8. Fora de escopo (registrado pro futuro módulo Financeiro)

- **Reconciliação periódica/proativa** (cron que confere sozinho, de tempos em tempos, o status de cada parcela a receber na Asaas, sem depender só do webhook) — ideia validada com o Luiz nesta conversa como direção futura, motivada por um caso real desta mesma sessão (um webhook da Assinafy que nunca chegou deixou uma venda presa até uma ação manual). Fica só registrada aqui; construir isso é trabalho do módulo Financeiro, não de Vendas.
- Qualquer tela ou relatório de fluxo de caixa consolidado (múltiplas vendas, múltiplos meses) — Vendas só grava o dado por venda; consolidar é Financeiro.
- Cancelamento automático de parcelas restantes em chargeback — fica manual nesta spec (seção 6); automatizar exigiria confirmar antes, com o suporte da Asaas, se eles não fazem isso sozinhos.

## 9. Testes

`concluirVenda` (extraída pra ser compartilhada entre boleto/pix e cartão) e o gate do passo 5 (não repetir conclusão pro cartão) são lógica pura o bastante pra ganhar teste Vitest direto (dado um `contrato` com `metodoPagamento`/`status` variados, confere se os efeitos de conclusão disparam ou não). O resto (parse de payload, chamadas HTTP à Asaas, gravação em `contrato_parcelas`) segue a convenção já usada no resto do módulo — I/O não ganha teste unitário, verificação é manual (primeira venda de cartão de teste em produção, já registrada como pendência de verificação ao vivo em `docs/status/vendas.md`).
