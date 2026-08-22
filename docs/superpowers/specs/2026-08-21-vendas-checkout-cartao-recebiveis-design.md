# Vendas — Reconciliação do Checkout de cartão: conclusão automática + parcelas a receber da Asaas — Design

**Status:** escopo reduzido em 22/08/2026 (ver abaixo) — a parte que sobra pro Vendas está pronta pra virar plano pequeno; o resto vira responsabilidade do módulo Financeiro quando ele existir.
**Decidido com:** Luiz, 21/08/2026 (desenho original), 22/08/2026 (redução de escopo) — conversa direta em chat.

## 0. Atualização de escopo (22/08/2026) — Financeiro herda a reconciliação

Luiz decidiu, revisando esta spec: **o Vendas só cuida de (a) gerar a venda certa com o Checkout quando o método é cartão, e (b) detectar que foi pago pra poder concluir a venda e seguir o processo.** Toda a parte de *reconciliação* — capturar o cronograma real de parcelas a receber da Asaas, marcar cada uma como paga, detectar chargeback/estorno, cancelar parcelas restantes — é trabalho do futuro módulo **Financeiro**, não do Vendas. Raciocínio: "a venda concluiu" é uma decisão de negócio do Vendas (motivo pelo qual o `CHECKOUT_PAID` continua aqui); "qual o cronograma de repasse desse dinheiro e o que fazer se ele for contestado" é tesouraria/contabilidade — não tem relação com decidir se a venda em si terminou.

Isso significa, nesta spec:
- **Seção 4, passos 1-3 continuam sendo trabalho do Vendas** (achar a venda pelo `checkout.id`, concluir a venda na hora, sem esperar parcela nenhuma).
- **Seção 4 passo 4 (capturar o parcelamento real via `GET /v3/installments/{id}/payments` e gravar em `contrato_parcelas`) MOVE PRO FINANCEIRO.** O Vendas não grava mais nenhuma parcela real de cartão — o placeholder que já existe fica como está, sem ser substituído.
- **Seção 6 (chargeback/estorno) MOVE PRO FINANCEIRO** — inteira, já que ela só existe em função das parcelas reais que o Vendas não vai mais capturar.
- **Seção 3 (novo valor `'contestado'` no CHECK de `contrato_parcelas.status`) MOVE PRO FINANCEIRO** — só faz sentido junto do chargeback, que é deles agora.
- **Pesquisa da seção 2** (payload do `CHECKOUT_PAID`, `GET`/`DELETE /v3/installments/{id}/payments`, eventos de estorno/chargeback) continua válida e reaproveitável — só quem implementa é que muda.

O plano de implementação (`docs/superpowers/plans/2026-08-21-vendas-checkout-cartao-recebiveis.md`) será reduzido na mesma linha — só as tasks 1 (parte do CHECKOUT_PAID que conclui a venda) seguem como Vendas; o resto fica registrado lá como "não é mais escopo do Vendas, ver esta spec seção 0" pro Financeiro reaproveitar quando existir.

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

**Correção depois da spec original (achado ao ler a migration de novo antes de planejar):** `contrato_parcelas` **já tem** uma coluna `asaas_installment_id text`, criada desde o início do módulo (`20260818090001_vendas_contrato_nucleo.sql`) com o comentário "id do parcelamento completo na Asaas — compartilhado entre todas as parcelas do mesmo contrato quando parcelas_qtd > 1" — nunca populada até hoje. Ou seja: **nenhuma coluna nova é necessária em `contratos` nem em `contrato_parcelas` pra guardar o id do parcelamento** — só falta (a) expor esse campo já existente no tipo `ContratoParcela`/`SELECT_CONTRATO` de `src/lib/vendas/contratos.ts` (hoje não é lido) e (b) gravá-lo em cada linha real inserida no passo 4 abaixo.

**`contrato_parcelas`** — mudança de schema associada ao chargeback (seção 6), **MOVIDA PRO FINANCEIRO (seção 0, 22/08/2026)**: um valor novo no `CHECK` do `status`: `'contestado'` (hoje: `previsto/gerado/pago/atrasado/cancelado`) — marca uma parcela que sofreu chargeback/estorno e está aguardando decisão manual, sem confundir com `cancelado` (que já significa "resolvido, não vai mais ser cobrado"). O Vendas não escreve essa migration.

Nenhuma tabela nova. Nenhuma coluna nova pra "isso é receita da Asaas, não do cliente" — já dá pra saber isso olhando `contratos.metodo_pagamento = 'cartao'` via join, sem duplicar informação.

## 4. Fluxo: `CHECKOUT_PAID` (resolve o Problema 1 + inicia o Problema 2)

Em `src/app/api/webhooks/asaas/route.ts`, novo tratamento pro evento `CHECKOUT_PAID`, rodando em `after()` como os demais:

1. Acha a venda por `contratos.asaas_checkout_id = checkout.id` (nova função `buscarContratoPorAsaasCheckoutId` em `src/lib/vendas/contratos.ts`, mesmo padrão de `buscarContratoPorAssinafyDocumentId`).
2. Se não achar, loga erro e sai (mesmo padrão dos outros handlers).
3. **Marca a venda como concluída e dispara os efeitos de conclusão na hora** — `atualizarStatusContrato(contrato.id, "concluida")`, `sincronizarEtapaKanban(contrato.oportunidadeId, "ganha")`, `promoverPessoaACliente` (mesma sequência que `processarPagamentoConfirmado` já faz pra boleto/pix, extraída pra uma função compartilhada `concluirVenda(contrato)` em `src/lib/vendas/contratos.ts` ou `oportunidades.ts` — usada pelos dois caminhos). **Não espera nenhuma parcela específica**: diferente do boleto/pix, no cartão o cliente já pagou o valor cheio pra Asaas no ato da compra — o que vem depois é só repasse escalonado pra nossa conta, e isso não deveria segurar a entrega do serviço.
4. ~~Numa etapa separada... captura o parcelamento real e grava em `contrato_parcelas`.~~ **MOVIDO PRO FINANCEIRO (seção 0, 22/08/2026)** — o Vendas para no passo 3. Descrição original mantida abaixo só como referência de pesquisa pro Financeiro reaproveitar: numa etapa separada, em `try/catch` próprio que não pode derrubar o passo 3 (mesmo padrão já usado hoje pra `sincronizarPdfCertificado` no webhook da Assinafy), lê `checkout.installment` do payload. Se vier vazio, loga um aviso claro e para por aqui. Se vier preenchido, chama `GET /v3/installments/{id}/payments`, apaga a(s) parcela(s)-placeholder do contrato e grava uma linha real em `contrato_parcelas` por parcela (`numero` sequencial, `valor`, `vencimento_previsto` = `dueDate`, `asaas_payment_id` = `id`, `asaas_installment_id` = o id do parcelamento — coluna já existente, ver seção 3), atualiza `contratos.parcelas_qtd`.

## 5. Fluxo: pagamento de cada parcela real

O webhook `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` já existente (`processarPagamentoConfirmado`) passa a valer também pra essas parcelas de cartão, porque agora têm `asaas_payment_id` de verdade — `marcarParcelaPaga` já funciona sem mudança.

**Um ajuste pontual:** a regra atual "só a 1ª parcela paga conclui a venda" não pode rodar de novo pro cartão (a venda já foi concluída na seção 4). Gate: `if (contrato.metodoPagamento !== "cartao" && parcelaPaga.numero === 1) { /* concluir venda */ }` — pra cartão, o webhook só atualiza `status`/`pago_em` da parcela via `marcarParcelaPaga`, sem repetir a promoção de cliente/mudança de etapa.

## 6. Fluxo: chargeback/estorno — **MOVIDO PRO FINANCEIRO (seção 0, 22/08/2026)**

Descrição original mantida como referência de pesquisa (payload/endpoint já confirmados, seção 2) pro Financeiro reaproveitar quando existir — o Vendas não implementa nada desta seção.

Novo tratamento no mesmo webhook pros eventos `PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`, `PAYMENT_REFUND_IN_PROGRESS`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`, `PAYMENT_AWAITING_CHARGEBACK_REVERSAL` (agrupados — mesmo tratamento pros seis, só o texto do alerta muda por evento):

1. Acha a parcela por `contrato_parcelas.asaas_payment_id = payment.id`.
2. Marca `status = 'contestado'`.

Sem coluna nova em `contratos` pra sinalizar isso — o próprio `status = 'contestado'` na parcela já é a fonte da verdade (evita duplicar o mesmo fato em dois lugares, e evita reaproveitar por engano o campo `ultimo_erro`, que está amarrado ao botão automático "Tentar novamente" de `PainelErroTentativas` — ação errada pra este caso, que é um evento financeiro, não uma falha de automação).

Em Detalhes da Venda, dentro do quadro Financeiro (`CardCheckoutCartao`, construído nesta mesma sessão): quando existe alguma parcela `'contestado'` entre as parcelas do contrato, aparece um aviso e um botão **"Cancelar parcelas restantes"** — chama uma Server Action nova que executa `DELETE /v3/installments/{id}/payments` (usando o `asaas_installment_id` de qualquer parcela do contrato — é o mesmo valor em todas) e marca como `'cancelado'` as parcelas que ainda estavam `previsto`/`gerado`. Ação manual, com confirmação explícita avisando que é irreversível (mesmo padrão de `BotaoExcluir`, construído nesta sessão) — decisão do Luiz, não automática, porque a documentação da Asaas não confirma se eles já cancelam isso sozinhos.

## 7. Riscos e pontos não confirmados na doc (a verificar na implementação)

- `checkout.installment` vazio numa compra em 1x — tratado como caso normal (seção 4, passo 4), não bloqueante.
- Nomes exatos de todos os campos do payload de `CHECKOUT_PAID` (só o payload de `CHECKOUT_CREATED` foi confirmado na doc, que documenta serem eventos "irmãos" com o mesmo formato de objeto `checkout`) — conferir contra o payload real na primeira venda de cartão testada em produção, antes de considerar este fluxo validado de ponta a ponta.
- Se a Asaas cancela sozinha as parcelas futuras num chargeback — não confirmado; por isso o cancelamento é manual (seção 6).

## 8. Fora de escopo (registrado pro futuro módulo Financeiro)

- **Captura do parcelamento real, chargeback/estorno, cancelamento de parcelas restantes** (seções 4-passo-4, 6, e o `CHECK` novo da seção 3) — decisão de escopo explícita do Luiz (seção 0, 22/08/2026): é reconciliação/tesouraria, não decisão de venda. Todo o desenho já pesquisado (payload, endpoints, riscos) fica pronto pro Financeiro reaproveitar.
- **Reconciliação periódica/proativa** (cron que confere sozinho, de tempos em tempos, o status de cada parcela a receber na Asaas, sem depender só do webhook) — ideia validada com o Luiz como direção futura, motivada por um caso real desta mesma sessão (um webhook da Assinafy que nunca chegou deixou uma venda presa até uma ação manual). Financeiro, junto com o item acima.
- Qualquer tela ou relatório de fluxo de caixa consolidado (múltiplas vendas, múltiplos meses) — Financeiro.
- Cancelamento automático de parcelas restantes em chargeback — ficaria manual mesmo no desenho original (seção 6), até confirmar com o suporte da Asaas se eles não cancelam sozinhos; decisão de automatizar ou não também é do Financeiro quando chegar lá.

## 9. Testes

Do que sobra pro Vendas (seção 4, passos 1-3): `concluirVenda` e o gate `deveConcluirAoConfirmarParcela` **já foram extraídos e testados** (`src/lib/vendas/conclusao-venda.ts`, implementados em 21/08/2026 como parte da feature "Recebido em dinheiro" — reaproveitáveis aqui sem trabalho extra). O parse do payload `CHECKOUT_PAID` e a busca por `checkout.id` seguem a convenção do módulo — I/O não ganha teste unitário, verificação é manual (primeira venda de cartão de teste em produção). Tudo relacionado a parcelamento/chargeback (Financeiro) tem sua própria seção de testes quando aquele módulo escrever o plano dele.
