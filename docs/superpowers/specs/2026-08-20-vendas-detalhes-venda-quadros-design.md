# Vendas — Detalhes da Venda: quadros de informação completa — Design

**Status:** ✅ implementado, mesclado em `main` e refinado em produção (20-21/08/2026). Ver seção 10 pra tudo que foi pedido depois da implementação inicial e não estava neste desenho original.
**Decidido com:** Luiz, 20/08/2026, conversa direta em chat (sem sessão de brainstorming em terminal separada).

## 1. Contexto e motivação

A tela "Detalhes da Venda" (`src/app/admin/(shell)/vendas/[oportunidadeId]/detalhes-venda-client.tsx`) já tem sua parte superior construída e aprovada em sessão anterior — o Painel Interativo por estágio do Kanban (badge de status, ações da etapa atual, erro/retentativa). Este design cobre só a parte **abaixo** desse painel.

Hoje essa parte de baixo mostra informação de forma incompleta e condicionada ao estágio atual do contrato:
- Não existe um card dedicado aos dados do cliente — só nome e documento aparecem, no cabeçalho da página.
- O card "Assinatura eletrônica" (único lugar que mostra o signatário da ArrudaCred) só é renderizado quando `contrato.status === 'aguardando_assinaturas'` — numa venda já concluída ou cancelada, não dá mais pra ver quem assinou o contrato.
- O representante legal (PJ) não aparece em lugar nenhum desta tela, mesmo quando existe (`pessoa_representantes`).
- O card "Parcelas" só é renderizado quando `contrato.status` é `aguardando_pagamento` ou `concluida` — numa venda ainda em "Emitindo Contrato" ou "Aguardando Assinaturas", não dá pra ver o plano de pagamento já combinado.
- O pacote de documentos (`oportunidade_documentos`, quando o produto exige) não aparece em nenhum lugar depois da tela Nova Oportunidade.
- Fornecedor (venda subcontratada/comissionada) e o template de contrato usado não são mostrados.

Luiz pediu explicitamente: a tela deveria trazer **todas as informações disponíveis daquela venda**, organizadas em quadros separados — o usuário que abre a tela precisa encontrar tudo que precisa sobre aquela venda ali, sem precisar adivinhar o estágio certo pra ver um dado que já existe no banco.

## 2. Escopo

**Entra nesta spec:**
- Reorganização da parte inferior da tela em cards sempre visíveis (não mais condicionados ao `status` do contrato), em grade de 2 colunas.
- 4 cards novos: Dados do Cliente, Partes do Contrato, Dados da Venda, Pacote de Documentos.
- Extensão do card de Financeiro (parcelas) pra sempre aparecer, não só em 2 dos 6 estágios.
- Extensão do card de Partes do Contrato (substitui o atual "Assinatura eletrônica") pra sempre aparecer, mostrando status de assinatura mesmo antes/depois da etapa `aguardando_assinaturas`.
- Registro do princípio de extensibilidade futura "drill-down por item" (seção 8) — só documentado, não implementado.

**Fica de fora, registrado como pendência futura:**
- Qualquer tela de detalhe por item (parcela, comissão, evento da timeline) — ver seção 8.
- Edição de dados nesta tela (a tela continua só leitura + as ações que já existem: cancelar, tentar novamente, verificar assinatura/cobrança, reenviar link, marcar comissão recebida). Corrigir um dado errado continua sendo feito voltando pra Nova Oportunidade/Fechamento de Venda ou editando a Pessoa diretamente.
- Qualquer mudança de schema — todo dado usado já existe no banco hoje.

## 3. Busca de dados (`page.tsx`)

`DetalhesVendaPage` já busca, em paralelo, `oportunidade`/`pessoa`/`contrato`, depois `timeline`/`comissoes`/`pdfUrlAssinada`. Adiciona uma 3ª onda de buscas em paralelo, só quando `contrato` existe:

```ts
const [enderecoCliente, pessoaArrudaCred, representante, template, documentosPacote] = await Promise.all([
  buscarEnderecoPorPessoa(pessoa.id),
  contrato.pessoaArrudaCredSignatarioId ? buscarPessoaCompleta(contrato.pessoaArrudaCredSignatarioId) : Promise.resolve(null),
  pessoa.tipoPessoa === "pj" ? buscarRepresentanteCompleto(pessoa.id) : Promise.resolve(null),
  contrato.contratoTemplateId ? buscarTemplatePorId(contrato.contratoTemplateId) : Promise.resolve(null),
  listarDocumentosPacote(oportunidadeId),
]);
```

`buscarRepresentanteCompleto` é uma função nova e pequena em `src/lib/vendas/pessoa-representantes.ts` — combina o `buscarRepresentante` (`{pessoaFisicaId}`) já existente com `buscarPessoaCompleta`, pra não espalhar essa composição pela `page.tsx`. Todo o resto (`buscarEnderecoPorPessoa`, `buscarPessoaCompleta`, `buscarTemplatePorId`, `listarDocumentosPacote`) já existe e é só reaproveitado.

Nenhuma tabela ou coluna nova — todo dado already existe no banco (`pessoas`, `enderecos`, `contratos`, `contrato_templates`, `oportunidade_documentos`, `pessoa_representantes`).

## 4. Layout

Grade responsiva: `grid-cols-1 md:grid-cols-2` pros cards de conteúdo curto/médio, com os de conteúdo longo (Financeiro/parcelas, Histórico) ocupando a largura cheia (`md:col-span-2`) mesmo dentro da grade — uma tabela de parcelas ou uma lista de eventos fica ilegível espremida numa coluna estreita.

Ordem de leitura (topo → base):
1. Painel interativo por estágio (já existe, sem mudança)
2. Dados do Cliente + Dados da Venda (lado a lado)
3. Partes do Contrato (largura cheia — é uma lista, não um par de campos)
4. Financeiro/Parcelas (largura cheia)
5. Pacote de Documentos (quando existir) + Comissão do Fornecedor (quando comissionado) — lado a lado quando os dois existem, senão o que existir ocupa a largura cheia
6. Histórico (largura cheia, sempre por último — é cronológico, faz sentido ser a última coisa lida)

## 5. Cards — conteúdo exato

### 5.1 Dados do Cliente
Nome/razão social, documento formatado (`formatarCpfCnpj`), tipo (Pessoa Física/Jurídica), e-mail (ou "não informado"), WhatsApp (ou "não informado"), endereço completo formatado numa linha (ou "não informado" quando `enderecoCliente` é `null`). Se PF: RG, estado civil, profissão (cada um "não informado" quando vazio) — PJ não mostra esses 3 campos (não fazem sentido pra pessoa jurídica, mesmo padrão já usado na Nova Oportunidade).

### 5.2 Dados da Venda
Produto (nome), tipo do produto (badge: Próprio/Subcontratado/Comissionado), fornecedor (nome, só quando `contrato.fornecedorId` existe — busca via `buscarPessoaCompleta`, mesma função já usada pro resto), template de contrato usado (nome do template, ou "nenhum template ativo pra este produto" quando `template` é `null` — mesmo texto de aviso que já existe na etapa de emissão).

### 5.3 Partes do Contrato
Substitui o atual `PainelAssinatura`. Lista de até 3 linhas — Cliente, Representante legal (só se PJ), Signatário ArrudaCred — cada uma com nome, e-mail, e status de assinatura:
- Antes de existir `contrato.assinafyDocumentId`: "Aguardando emissão do contrato" (sem tentar consultar a Assinafy — não tem o que consultar ainda).
- Depois de existir: mesmo comportamento de hoje — o status salvo no banco (`contrato.assinafyDocumentStatus`) aparece direto, com o botão "Verificar assinaturas agora" (`buscarStatusAssinaturaAction`, já existe) pra consultar o status exato na Assinafy neste instante, que quando usado atualiza a exibição de "assinou"/"não assinou" por signatário — mesmo mecanismo de hoje, só sem o gate de `status === aguardando_assinaturas` escondendo o card inteiro fora dessa janela.
- Botões de reenvio (`BotoesReenvio`, já existe) continuam só pro cliente, mesma regra de hoje (documentado no código atual: o signatário da ArrudaCred não tem `pessoaId` conhecido no contexto da Assinafy pra fins de reenvio).

### 5.4 Financeiro
Substitui o atual `PainelParcelasCliente`, sem o gate de status — sempre visível quando existe `contrato` (exceto venda comissionada, que não tem parcelas de cliente, só comissão de fornecedor — mesma exclusão que já existe hoje). Cabeçalho com forma de pagamento (à vista/parcelado), método (boleto/pix/cartão), valor total. Tabela de parcelas idêntica à de hoje (número, vencimento, valor, status, botão de reenvio quando aplicável) — únicas mudanças são o card aparecer independente do estágio, e o botão "Verificar cobranças agora" (`buscarStatusCobrancasAction`, já existe) ficar desabilitado com uma nota ("ainda não há cobrança gerada na Asaas") quando nenhuma parcela tiver saído do status `previsto`.

### 5.5 Pacote de Documentos
Só renderiza quando `documentosPacote.length > 0`. Tabela simples: documento (formatado) + nome/razão social, mesma lista que já existe em `oportunidade_documentos`, sem ação nenhuma (é só leitura, mesmo dado que já foi coletado na Nova Oportunidade).

### 5.6 Comissão do Fornecedor e Histórico
Sem mudança de conteúdo ou comportamento — só reposicionados no novo layout de grade (seção 4).

## 6. Sem mudança de comportamento

Nenhum botão de ação muda: cancelar venda, tentar novamente, verificar assinatura/cobrança agora, reenviar link (WhatsApp/e-mail/copiar), marcar comissão recebida — todos continuam exatamente como hoje, só potencialmente visíveis em mais estágios (já que os cards que os contêm deixam de ser escondidos por status).

## 7. Testes

Tela de leitura de dados já buscados no servidor (Server Component + Client Component de apresentação) — sem lógica pura nova que justifique teste unitário, mesma convenção já usada nesta tela e no resto do módulo (I/O e apresentação não ganham teste Vitest; verificação é manual no navegador). A única função nova não-trivial (`buscarRepresentanteCompleto`) é uma composição direta de duas funções já testadas/em produção (`buscarRepresentante` + `buscarPessoaCompleta`), sem lógica condicional própria que valha teste isolado.

## 8. Extensibilidade futura — drill-down por item (registrado, não implementado agora)

Princípio de design pedido explicitamente pelo Luiz (20/08/2026), pra não se perder conforme o sistema evolui: **quadros que mostram uma lista resumida de itens (parcelas, comissões, eventos da timeline, e qualquer outro que vier no futuro) são candidatos naturais a ganhar, mais adiante, um botão/link "Ver detalhes" por item, levando a uma tela dedicada com tudo sobre aquele item específico** — no caso de uma parcela, por exemplo, isso incluiria todo o histórico de tentativas de cobrança, o payload completo devolvido pela Asaas, timeline de mudança de status daquela parcela isoladamente, etc.

Não é um princípio exclusivo de parcelas — vale pra qualquer quadro resumido desta tela (ou de outras telas do sistema que sigam o mesmo padrão de "card com lista resumida").

**Nesta rodada:** nenhuma tela de detalhe por item é construída, e nenhum botão/placeholder "Ver detalhes" é adicionado à UI — a intenção fica só registrada aqui, pra uma sessão futura (quando o Luiz sentir a necessidade concreta de abrir o detalhe de um item específico) não precisar redescobrir essa direção do zero.

## 9. Fora de escopo

- Telas de detalhe por item (parcela, comissão, evento) — seção 8, registrado como direção futura, não como pendência bloqueante.
- Edição de qualquer dado nesta tela.
- Mudança de schema.
- Qualquer mudança no Painel Interativo por estágio (parte superior da tela) — já construído e aprovado em sessão anterior, fora de alcance deste design.

## 10. Atualizações pós-implementação (20-21/08/2026)

A tela foi construída conforme este design (SDD, 3 tasks + revisão final de branch — 2 achados Important corrigidos: `formatarEndereco` sem guarda contra campo nulo do banco, que podia derrubar a página; venda comissionada mostrando aviso falso de "template faltando"). Depois de usar em produção, o Luiz pediu refinamentos que **não estavam neste desenho original**:

- **UX de leitura**: ícones (emoji) em cada quadro, badge colorido pro status de parcela/comissão (antes era texto puro), borda de atenção (âmbar/vermelha) em Partes do Contrato/Financeiro quando algo precisa de ação, tooltips nos botões de "Verificar... agora" e no badge de etapa.
- **PDF do contrato**: o link discreto "Ver PDF" virou um grupo de 3 ações (Ver/Baixar de verdade com `Content-Disposition: attachment`/Copiar). Junto veio um achado maior, fora do escopo original desta spec: nada no sistema buscava de volta o PDF final com certificado que a Assinafy gera depois que todos assinam — o link sempre mostrava a versão sem assinatura. Corrigido no webhook `document_ready` (baixa o artifact "certificated" e sobrescreve o mesmo arquivo no Storage).
- **Parcela financeira**: ganhou o mesmo modelo Ver+Copiar do link de cobrança (boleto/Pix ou checkout do cartão) — sem "Baixar", que não se aplica (é uma página de cobrança, não um arquivo).
- **Reorganização de hierarquia**: Pacote de Documentos deixou de ser um quadro próprio (como esta spec desenhou originalmente na seção 5.5) e virou uma seção dentro de Dados da Venda — o Luiz observou que é dado do serviço contratado (`produtos.exige_lista_documentos`), não da venda em si, e devia ficar visualmente junto do produto, não separado.

Nenhuma dessas mudanças alterou o princípio da seção 8 (drill-down por item) — continua só registrado, não implementado.
