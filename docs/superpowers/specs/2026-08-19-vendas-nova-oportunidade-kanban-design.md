# Vendas — Nova Oportunidade + Kanban de Vendas (redesenho) — Design

**Status:** ✅ implementado, mesclado em `main` e testado em produção (19-20/08/2026). Ver seção 9 pra tudo que mudou em relação a este desenho original, e `docs/PLANO_MESTRE_SISTEMA_ARRUDACRED.md` seção 11 pra o diário completo da construção e dos bugs reais encontrados no teste ao vivo.
**Decidido com:** Luiz, 19/08/2026, numa sessão de brainstorming depois de um bug real de produção (ver seção 1).

## 1. Contexto e motivação

Depois que o módulo de Contrato/Assinatura/Financeiro foi ao ar, o Luiz testou de ponta a ponta e achou dois problemas reais:

1. **Uma venda criada em "Nova Venda" nunca aparecia no Painel de Vendas**, mesmo confirmada no Supabase (`oportunidades` tinha a linha, `contratos` continuava vazia). Causa: `listarVendas()` só lê de `contratos`, e essa tabela só ganha uma linha depois que alguém completa a tela de **Fechamento de Venda** — nada é criado antes disso. Se esse passo falhar silenciosamente (ou nunca for até o fim), a venda simplesmente não existe em lugar nenhum visível.
2. **A tela "Nova Venda" (do cadastro básico, anterior a esta sub-frente) ficou desatualizada** — não coleta os dados que a spec original de Contrato precisa (RG/estado civil/profissão do signatário, pacote de documentos, forma de pagamento/parcelas), não indica próximo passo depois de criar o registro, e tem UX inconsistente com o resto do módulo (campos soltos, nomes desalinhados como "Valor Estimado" quando na verdade já é o valor do contrato).

Essas duas coisas, discutidas juntas, levaram a um redesenho maior: uma tela única "Nova Oportunidade" que substitui o par atual (Nova Venda + Fechamento de Venda) no caminho sem funil prévio, e um Kanban de Vendas com uma etapa nova no início — que **resolve o problema 1 pela raiz**: toda Oportunidade que entra no fluxo de venda ganha um registro visível desde o primeiro instante, antes mesmo do contrato existir.

## 2. Escopo

**Entra nesta spec:**
- Tela "Nova Oportunidade" (renomeada de "Nova Venda") — formulário único, substitui Nova Venda + Fechamento de Venda **só no caminho sem funil prévio**.
- Novo vocabulário do Kanban de Vendas (`contratos.status`), com progressão automática, tratamento de erro e atualização ao vivo (Realtime).
- Ajuste na tela de Fechamento de Venda (caminho CRM) pra também criar o registro cedo — sem tocar em nenhum código do CRM/motor de fluxo.
- Pagamento por cartão via Asaas Checkout (ao invés do tratamento atual, que trata cartão igual boleto/pix).
- Novo campo em Produto: "aceita pacote de documentos" (sim/não).

**Fica de fora, registrado como pendência futura separada:**
- Rastreamento de custo/taxas da Asaas como conta a pagar — o Luiz confirmou que isso é um tema diferente (gestão de custo de integrações, que já estava registrado como pendência futura ampla — Assinafy, Asaas, WhatsApp, Resend juntos) e não deve travar esta spec.
- O caminho comissionado **não muda** — continua sem passar pela nova etapa "Nova Oportunidade" nem pelas etapas de contrato, porque só vira registro depois que o fornecedor aprova (decisão já tomada e documentada na spec do módulo original, seção 3.4).
- Venda vinda do CRM/Malala continua entrando pela tela de Fechamento de Venda existente — a tela "Nova Oportunidade" é exclusiva do caminho sem funil prévio.

## 3. Tela "Nova Oportunidade"

Renomeia "Nova Venda" → **"Nova Oportunidade"** em todo lugar visível (link na barra lateral, título da tela, botão no Painel de Vendas) — reflete que o registro só vira "venda" de fato quando o contrato é assinado e a 1ª parcela é paga; até lá, se cair, o destino é "Cancelada", não uma venda perdida.

Formulário único, rolável (sem wizard), nesta ordem:

### 3.1. Serviço
Dropdown de produto — como já existe hoje. **Se o produto escolhido for do tipo `comissionado`**, as seções 3.2 a 3.4 (dados do signatário, pacote, financeiro/parcelas) **não fazem sentido e não aparecem** — nenhum desses dados existe pra esse tipo de produto (sem contrato com a ArrudaCred). Nesse caso a tela se comporta como a "Nova Venda" simples de hoje: só cria a Oportunidade (nenhuma linha em `contratos` ainda — comissionado só ganha registro depois que o fornecedor aprova, ação "Confirmar venda" já existente). Segue direto pra seção 3.5 (documentos, opcional) e confirma.

### 3.2. Quem assina o contrato (PF ou PJ)
- Campo de CPF/CNPJ com busca: se já existir na base (`pessoas`), preenche todos os campos com o dado atual (nome, RG, estado civil, profissão, endereço) e deixa **tudo editável** — sem tela de "confirmar atualização" à parte, salva por cima ao confirmar a Oportunidade.
- **CNPJ**: busca automática da razão social numa API pública oficial (candidata: BrasilAPI, `GET /api/cnpj/v1/{cnpj}` — a confirmar contra a documentação deles antes de implementar, regra de ouro do projeto).
- **CPF**: preenchimento manual do nome. Não existe API pública legítima de busca de nome por CPF no Brasil (LGPD) — confirmado com o Luiz, não é uma limitação técnica, é uma limitação real do que existe no mercado.
- Se PJ: os mesmos campos, mas do representante legal (que é uma Pessoa Física em `pessoa_representantes`, como já funciona hoje).
- Leitura de documento por IA (`LeitorDocumentoIA`, já existe): continua só pré-preenchendo os campos. Ganha um indicador visual ("veio do documento") nos campos que a IA preencheu, mas **não trava a edição** — o vendedor pode digitar por cima livremente, o indicador só some quando ele mexe.

### 3.3. Pacote de documentos
Só aparece quando o produto escolhido em 3.1 tiver o novo campo `produtos.exige_lista_documentos = true` (ver seção 7). Array de `{documento, nome_razao_social}` — mesmo padrão já existente em `oportunidade_documentos`, sem limite de itens. CNPJ busca razão social automática, CPF manual — mesma regra da seção 3.2.

### 3.4. Financeiro
- Valor total do contrato.
- Forma: à vista / parcelado.
- Espécie: Boleto/Pix ou Cartão.
- **Boleto/Pix**: reaproveita exatamente a lógica que já existe (`calculo-parcelas.ts`, regra de dia-âncora 1/10/20, 1ª parcela com data livre) — gera a tabela de parcelas automaticamente, editável linha a linha, única validação é soma das parcelas = valor total. Essa tabela é o que vai pro contrato e é o que vira cobrança na Asaas — sem mudança de comportamento aqui.
- **Cartão**: sem tabela de parcelas editável aqui — só um campo pra definir o máximo de parcelas que a Asaas deve oferecer ao cliente (ver seção 6). Os "títulos a receber" (`contrato_parcelas`) são preenchidos depois, com o dado real que a Asaas devolver por parcela (não uma estimativa nossa).

### 3.5. Documentos do cliente
Opcional, não bloqueia a criação da Oportunidade — mesmo componente que já existe (`UploadDocumentosPessoa`).

### 3.6. Ao confirmar
Pra produto `proprio`/`subcontratado`: cria a Oportunidade **e** o registro em `contratos` na mesma ação, com `status = 'nova_oportunidade'` — todos os dados coletados (signatário, pacote, financeiro) já salvos. A geração do PDF/envio à Assinafy roda como próximo passo automático (ver seção 4), não bloqueia a resposta ao usuário nem impede o registro de existir se falhar.

Pra produto `comissionado` (ver 3.1): cria só a Oportunidade, sem `contratos` — segue o fluxo já existente até a ação "Confirmar venda".

## 4. Kanban de Vendas — novo vocabulário

```
Nova Oportunidade → Emitindo Contrato → Aguardando Assinaturas
  → Gerando Financeiro → Aguardando Pagamento → Concluída
                                                        ↘
                                                     Cancelada (motivo livre, fora da progressão linear)
```

> ⚠️ **Atualizado em 20/08/2026** (ver seção 9): o desenho original desta seção previa 7 etapas, com "Envelopando Assinaturas" separada de "Emitindo Contrato". No teste em produção ficou claro que as duas sempre rodavam automáticas em sequência, sem nenhuma pausa humana real no meio — foram fundidas numa etapa só. A tabela abaixo já reflete o vocabulário final (6 etapas + cancelada), migration `20260820120000_vendas_remove_etapa_envelopando.sql`.

| # | Etapa (rótulo) | `status` (valor interno) | Como avança |
|---|---|---|---|
| 1 | Nova Oportunidade | `nova_oportunidade` | Automático — tenta gerar o contrato assim que criado |
| 2 | Emitindo Contrato | `emitindo_contrato` | Automático — PDF gerado **e** enviado à Assinafy, as duas em sequência, avança sozinho |
| 3 | Aguardando Assinaturas | `aguardando_assinaturas` | **Humano** (assinatura real) — webhook da Assinafy confirma, aí avança sozinho |
| 4 | Gerando Financeiro | `gerando_financeiro` | Automático — cobrança criada na Asaas, avança sozinho |
| 5 | Aguardando Pagamento | `aguardando_pagamento` | **Humano** (pagamento real) — webhook da Asaas confirma, aí avança sozinho |
| 6 | Concluída | `concluida` | Terminal |
| — | Cancelada | `cancelada` | Terminal, motivo em `motivo_cancelamento` |

Comparado ao vocabulário anterior à sub-frente Contrato: ganha 1 etapa nova (`nova_oportunidade` no início) e perde a etapa `assinado` como parada visível — o momento "todo mundo assinou" dispara direto pra `gerando_financeiro`, sem parar numa etapa própria.

**Comissionado não usa nada disso** — continua pulando direto pra `aguardando_pagamento` só depois que `confirmarVendaComissionada` roda (fornecedor já aprovou), como já decidido antes.

### 4.1. Erros nas etapas automáticas (2, 4)
- Se uma etapa automática falhar (ex.: Puppeteer não gera o PDF, Assinafy retorna erro), o sistema **tenta de novo sozinho até 3 vezes**.
- Depois da 3ª tentativa falhada, o card fica parado na etapa atual com um sinal de erro visível — a mensagem do erro fica acessível na tela de Detalhes da Venda (mesmo lugar do histórico/timeline que já existe).
- Retentativa manual: botão "Tentar novamente" por card individual, e uma ação em lote no Painel pra retentar todos os cards travados numa mesma etapa de uma vez.
- Campos novos em `contratos` pra isso: `ultimo_erro` (texto, nulo quando não há erro) e `tentativas_erro` (contador, resetado a cada tentativa manual ou quando o passo dá certo).

### 4.2. Atualização ao vivo
Kanban aberto reflete mudança de etapa sem precisar recarregar — via Supabase Realtime na tabela `contratos` (o projeto já usa Realtime numa tabela do Marketing, `pautas_execucao_log`, então não é integração nova pra infra, só mais uma tabela publicada). Card se move de coluna sozinho quando o status muda.

## 5. Visibilidade de venda vinda do CRM (sem tocar no motor de fluxo)

Hoje, uma Oportunidade que chega em `dados_contrato` pelo funil da Malala só ganha uma linha em `contratos` quando alguém completa a tela de Fechamento de Venda — mesmo problema de fundo do item 1 da seção 1, só que nesse caminho a tela de coleta de dados continua sendo a de Fechamento de Venda (não a Nova Oportunidade).

**Solução, sem mexer em nada do CRM**: a tela de Fechamento de Venda, ao ser aberta pela primeira vez pra uma Oportunidade, cria o registro em `contratos` com `status = 'nova_oportunidade'` antes mesmo do formulário ser preenchido — mesmo padrão da Nova Oportunidade, só que disparado pela abertura da tela em vez de pela submissão de um formulário maior. Garante visibilidade no Painel assim que alguém do time começa a tratar aquela Oportunidade, sem exigir nenhuma mudança em `src/lib/motor-fluxo`.

**Limite reconhecido**: se uma Oportunidade chega em `dados_contrato` e ninguém nunca abre a tela de Fechamento, ela não aparece no Painel de Vendas. Isso não é pior do que a situação de hoje (ela já não aparece em lugar nenhum de qualquer forma) — fica registrado como limite conhecido, não como algo que esta spec resolve por completo.

## 6. Asaas — cartão via Checkout, boleto/pix sem mudança

- **Boleto/Pix continua exatamente como está** — uma cobrança individual por parcela (`criarCobranca`), com o valor/data exatos que a gente já calculou (dia-âncora), link de pagamento indo direto por WhatsApp. Decisão do Luiz: o cliente do boleto já negociou e fechou com o vendedor — mandar ele escolher algo numa página externa é dar chance de desistência à toa. Não vale o risco pra 90-95% dos casos.
- **Cartão passa a usar o Asaas Checkout** (`POST /v3/checkouts`, `chargeTypes: ["INSTALLMENT"]`, `billingType: "CREDIT_CARD"`, `maxInstallmentCount` configurável na tela) — gera um link único. O cliente escolhe quantas vezes parcelar (até o máximo definido) e digita o cartão **na página da Asaas**, nunca no nosso sistema — evita qualquer exigência de compliance PCI-DSS que teríamos se coletássemos dado de cartão no nosso formulário.
- **Títulos a receber pro cartão**: `contrato_parcelas` é preenchido com o valor e a data que a própria Asaas informa por parcela (campos `estimatedCreditDate`/`creditDate` existem na API deles), não com uma estimativa nossa — é a Asaas/bandeira que decide o cronograma real de cartão parcelado, e não adianta tentar prever isso com uma regra própria.

### 6.1. Pendência de pesquisa (não bloqueia o desenho, bloqueia a implementação desta parte)
Falta confirmar, direto na documentação da Asaas antes de codar (regra de ouro): exatamente **onde/como** a Asaas expõe o detalhe de cada parcela de um Checkout com cartão depois que o cliente paga — se vem tudo de uma vez no webhook do Checkout, se precisa consultar `GET /v3/installments/:id/payments` separadamente, e se o `externalReference` do Checkout permite religar isso à nossa Oportunidade. Fica registrado aqui pra ser resolvido durante a implementação, não durante o desenho.

## 7. Schema novo (migrations a escrever)

- `produtos.exige_lista_documentos` — boolean, not null default false. Controla se a seção 3.3 aparece.
- `contratos.status` — CHECK constraint substituído pelo vocabulário da seção 4 (`nova_oportunidade`, `emitindo_contrato`, `envelopando_assinaturas`, `aguardando_assinaturas`, `gerando_financeiro`, `aguardando_pagamento`, `concluida`, `cancelada`). Remap de dado existente: como a tabela está vazia em produção (confirmado com o Luiz), não precisa de UPDATE de remapeamento de valor antigo — só trocar a constraint.
- `contratos.ultimo_erro` — text, nullable.
- `contratos.tentativas_erro` — integer, not null default 0.
- Realtime habilitado em `contratos` (`alter publication supabase_realtime add table contratos`).

Todas aditivas ou substituição de constraint numa tabela vazia — sem risco de perda de dado.

## 8. Fora de escopo (registrado, não implementado agora)

- Custo/taxa da Asaas como conta a pagar — vira spec própria, futura, cobrindo todas as integrações pagas juntas (Assinafy, Asaas, WhatsApp, Resend), não só Asaas isolado.
- Qualquer mudança no motor de fluxo do CRM — item explicitamente fora de alcance, tratado com o cuidado combinado desde o início desta sub-frente.

## 9. Atualizações pós-implementação (19-20/08/2026)

Esta spec foi implementada via SDD (18 tasks) e depois passou por um teste real em produção com o Luiz, que trouxe coisas que não estavam previstas aqui. Registro resumido — o detalhe completo, dia a dia, está no diário de produção (`docs/PLANO_MESTRE_SISTEMA_ARRUDACRED.md`, seção 11).

**Fusão de etapas do Kanban** (já refletida na seção 4 acima): "Emitindo Contrato" e "Envelopando Assinaturas" viraram uma etapa só, porque na prática sempre rodavam automáticas em sequência, sem pausa humana real no meio — a coluna "Envelopando Assinaturas" nunca representou um estado real intermediário no Kanban, só ficava sempre vazia.

**Construído fora do previsto nesta spec** (foram pedidos do Luiz durante o teste ao vivo, não estavam em nenhuma spec anterior):
- Tela **Produtos & Serviços** (`/admin/configuracoes/produtos`) — CRUD de produto que esta spec e a spec anterior (`2026-08-17-modulo-vendas-design.md`) davam por já existente/fora de escopo.
- Tela **Template de Documentos** (`/admin/configuracoes/templates-documentos`) — generalizada a partir do editor de `contrato_templates` (que a spec do Contrato previa como editor único) para suportar 3 tipos de documento (`contrato`, `termo_acordo`, `ficha_associativa`), com editor de texto rico (TipTap).
- **Placeholders granulares** nos templates: além de `{{nome_cliente}}` etc. já previstos, ganhou `cliente_*`/`empresa_*` separados por campo, `{{tabela_contratante}}` (tabela formatada com os dados do signatário) e `{{tabela_documentos}}` (renomeado de `{{lista_documentos}}`, mesma função).
- **Fonte Carlito embutida no PDF** (`src/lib/vendas/fonte-carlito.ts`, base64 WOFF2 via `@font-face`) — achado real: o Chromium serverless (`@sparticuz/chromium`) não tem nenhuma fonte de sistema instalada na Vercel, cai pra "Open Sans" por padrão, então qualquer `font-family` do template que não fosse embutida divergia silenciosamente entre o preview no navegador e o PDF real gerado no servidor.
- Melhorias de CSS de impressão no PDF, botões de Sanitizar/Preview no editor de template.
- Reskin visual do Kanban do Painel de Vendas (inspirado em Kibo UI) e correção de um bug de UI real: o menu suspenso do card ficava preso dentro dos limites da coluna (`overflow-y-auto` força `overflow-x` implícito por spec CSS) — corrigido com `createPortal` + `position: fixed`.

**Bugs reais de integração achados só em produção** (nenhum teste automatizado os pega, porque dependem do comportamento real das APIs externas):
- `POST /accounts/:id/documents` (upload) da Assinafy devolve resposta **envelopada** (`{status, message, data: {...}}`), diferente do que a doc local (`docs/api_reference/Assinafy-API-Reference.md`) mostrava pra esse endpoint específico.
- Assinafy rejeita (`400`) criar um signatário com e-mail já existente na conta — como o e-mail do signatário da ArrudaCred é o mesmo em todo contrato, isso seria falha garantida a partir do 2º contrato. Corrigido com busca idempotente por e-mail antes de criar.
- Assinafy rejeita (`400 "signatários duplicados"`) mandar o mesmo `signerId` duas vezes num `assignment` — acontece quando cliente e signatário da ArrudaCred resolvem pra mesma Pessoa (configuração errada ou dado de teste). Corrigido com deduplicação + mensagem de erro citando os nomes/e-mails envolvidos.
- Nome do arquivo do PDF virou `contrato-arrudacred-<CLIENTE>-<SERVICO>-<timestamp>.pdf` (sem espaço/acentuação/caractere especial) em vez do UUID cru do contrato — pedido do Luiz, pra dar pra identificar o contrato só olhando o nome do arquivo na Assinafy.

**Não mudou de comportamento**, mas vale registrar: a "regra de ouro" do projeto (nunca codar API externa sem doc em mãos) segurou bem durante a implementação inicial, mas todos os 4 bugs acima só apareceram porque a doc levantada antes de codar (Task 0, ver plano) não cobria esses comportamentos específicos — reforça que doc externa é ponto de partida, não substitui teste real contra a API de verdade.
