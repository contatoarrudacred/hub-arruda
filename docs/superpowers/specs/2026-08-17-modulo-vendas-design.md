# Design — Módulo Vendas
**Status:** Spec validada com Luiz em 17/08/2026, pronta para virar plano de implementação.
**Referências:** `PLANO_MESTRE_SISTEMA_ARRUDACRED.md` (seções 1.1, 1.5, 3, 7.3, 8.10, 9, 11), `MODELAGEM_DADOS_ARRUDACRED.md` (Pessoa/Papel, convenções, Camada Multi-Canal), `KANBAN_COMERCIAL_LIMPANOME.md` (etapas 3.x/4.x, regra de pacote), `PARCEIROS_AFILIADOS_ARRUDACRED.md` (`ordens_servico`, `afiliado_produtos`), `SEGURANCA_E_AUDITORIA_ARRUDACRED.md`, `TELA_ATENDIMENTO_ARRUDACRED.md`, `REGUA_COBRANCA_ARRUDACRED.md`, `AGENDA_POS_VENDA_ARRUDACRED.md`.

**Convenção obrigatória, valendo para toda tabela/coluna nova desta spec:** nomenclatura de `MODELAGEM_DADOS_ARRUDACRED.md` (snake_case, tabela plural, PK sempre `id`, FK `<tabela_singular>_id`) e `COMMENT ON TABLE`/`COMMENT ON COLUMN` em tudo — RLS + trigger de auditoria genérico (`fn_auditoria`, captura `auth.uid()`) seguem marcados tabela a tabela abaixo, por reforço.

---

## 1. Objetivo e fronteiras

O módulo Vendas cobre o processo comercial do **fechamento** (dados para contrato) até a **entrega pro módulo Operação** (execução do serviço) — continuação direta do funil que o CRM já constrói. Não é um sistema paralelo ao CRM: reaproveita o núcleo Pessoa/Papel e a entidade `oportunidades` já existentes, e toda interação com o cliente neste processo aparece na mesma Tela de Atendimento.

**Fronteira de entrada:** uma `oportunidade` chega na subetapa `dados_contrato` — seja avançando pelo funil normal do CRM, seja criada diretamente ali quando a venda nasce sem histórico prévio de atendimento (ex.: fechada por telefone/presencial).

**Fronteira de saída:** a `oportunidade` chega em `etapa_kanban = 'ganha'` pronta pro handoff — produtos próprios/subcontratados sinalizam a necessidade de uma Ordem de Serviço (schema e criação de fato ficam pro módulo Operação, ver seção 3.5), produtos comissionados ficam registrados só como venda confirmada com comissão a receber. O módulo Operação (execução, acompanhamento, lote de fornecedor) fica **fora de escopo desta frente**, propositalmente.

**Sem entidade nova de "venda":** a própria `oportunidade` carrega o processo do início ao fim. Isso evita duplicar/sincronizar dado entre "funil" e "venda formal" — é a mesma linha, do primeiro contato até virar Ordem de Serviço.

**Atualiza deliberadamente o escopo do MVP1:** `PLANO_MESTRE_SISTEMA_ARRUDACRED.md` seção 8.10 registrava contrato/Assinafy/Asaas como manuais "por enquanto". Esta spec **substitui** essa limitação por decisão explícita de Luiz nesta sessão — geração de contrato e as duas integrações (Assinafy, Asaas) nascem automatizadas de ponta a ponta, no mesmo nível já entregue para WhatsApp/Zapster.

---

## 2. Os 3 modelos de Serviço (Produto)

Hoje `produtos.tipo` é `proprio`/`terceiro`, com `parceiro_executor` em **texto livre**. Isso não é suficiente — existem 3 modelos de negócio reais, com fluxos de venda e de dinheiro diferentes:

| Tipo | Quem fatura o cliente | Passa por Contrato/Assinafy/Asaas? | Gera Ordem de Serviço? | O que entra no Financeiro |
|---|---|---|---|---|
| **`proprio`** | ArrudaCred | Sim, completo | Sim | Só receita (parcelas do cliente) |
| **`subcontratado`** | ArrudaCred | Sim, completo | Sim | Receita agora (parcelas do cliente); despesa ao fornecedor **não nasce aqui** — só quando a OS for enviada ao fornecedor, no módulo Operação (fora de escopo) |
| **`comissionado`** | Fornecedor/administradora (fora do sistema) | Não — sem contrato ArrudaCred×cliente | Não | Comissão a receber do fornecedor (parcela única ou parcelada, conforme `fornecedor_produtos`) |

**Exemplos:** Limpeza de Nome/Score/Bacen = `proprio`. Um serviço que a ArrudaCred vende mas subcontrata execução = `subcontratado`. Consórcio, crédito/empréstimo/financiamento = `comissionado`.

**Granularidade:** se a regra de comissão variar dentro do "mesmo" produto (ex.: tipo de consórcio dentro da mesma administradora), a saída é criar Produtos mais específicos (ex.: "Consórcio Imóvel" vs. "Consórcio Veículo") — mantém o princípio já fechado de Produto ser a unidade configurável, sem introduzir uma camada nova de "sub-variante".

---

## 3. Modelo de dados

### 3.1 Cadastro

- **Serviço = `produtos`** (mesma entidade, sem nova tabela). Ajustes na tabela existente:
  - `tipo`: check constraint passa a aceitar `'proprio' | 'subcontratado' | 'comissionado'` (migração do dado existente: `terceiro` → decidir caso a caso entre `subcontratado`/`comissionado` ao migrar).
  - `fornecedor_id` (novo, FK → `pessoas`, nullable) — substitui `parceiro_executor` (texto livre). **Só faz sentido pra `tipo = 'comissionado'`**, onde o Produto já nasce atrelado a um único fornecedor/administradora (é o próprio motivo de fragmentar o catálogo por operadora, seção 2 "Granularidade") — é essa FK que resolve `fornecedor_produtos` pra calcular a comissão.
  - `fornecedor_definido_em` (novo, `'venda' | 'ordem_servico'`, nullable — só relevante quando `tipo = 'subcontratado'`) — controla se a tela de Vendas exige escolher o fornecedor no fechamento, ou deixa em aberto pro módulo Operação decidir depois. **Diferente do comissionado, aqui não há fornecedor fixo no Produto** (o mesmo Serviço subcontratado pode ir pra fornecedores diferentes venda a venda) — quando `= 'venda'`, quem guarda a escolha é `contratos.fornecedor_id` (ver 3.2), não uma coluna em `produtos`.

- **`fornecedores`** (nova, extensão de `pessoa_papeis.tipo_papel = 'fornecedor'`, mesmo padrão de `afiliados` em `PARCEIROS_AFILIADOS_ARRUDACRED.md`): `id`, `pessoa_id` (FK, único), `categoria` (ex.: `consorcio`, `credito`, `subcontratado_servico`, `administrativo` — livre pra crescer), `dados_bancarios` (jsonb — pra pagamento futuro, quando Operação/Financeiro existirem), `ativo`, `created_at`, `updated_at`. Trigger de auditoria + RLS.
  - Escopo amplo confirmado por Luiz: qualquer fornecedor do negócio, não só os de produto comissionado/subcontratado — mas **só cadastro nesta frente**, contas a pagar administrativas ficam pro módulo Financeiro futuro.
  - Sem coluna própria de `unidade_negocio_id` — o escopo por empresa (ArrudaCred/Aetria) já vem de `pessoa_papeis`, que é quem carrega essa dimensão no núcleo Pessoa/Papel.

- **`fornecedor_produtos`** (nova, espelha `afiliado_produtos` mas na direção inversa — comissão que a ArrudaCred **recebe**, não paga): `id`, `fornecedor_id` (FK), `produto_id` (FK), `percentual_comissao`, `forma_comissao` (`'parcela_unica' | 'parcelado'`), `comissao_parcelas_qtd` (nullable, relevante quando `forma_comissao = 'parcelado'`), `comissao_dias_primeira_parcela` (int — dias entre a data de referência informada na confirmação e o vencimento da 1ª parcela de comissão; regra explícita de Luiz: "geralmente X dias após o cliente assinar contrato" com o fornecedor), `comissao_intervalo_dias_parcelas` (int, nullable — intervalo entre parcelas subsequentes, quando parcelado), `condicoes` (jsonb, nullable — escape hatch só pra exceção que genuinamente não couber nas colunas acima, ex.: regra escalonada por faixa de valor), `ativo`, `created_at`, `updated_at`. Editável pelo admin sem deploy. Trigger de auditoria + RLS.
  - Cada operadora/fornecedor tem sua própria política (e pode variar até por tipo de consórcio dentro do mesmo operador) — por isso são colunas reais (não jsonb) por par fornecedor+produto: dá pra somar/filtrar/ordenar num relatório do Financeiro sem precisar tratar jsonb, e ainda cobre "cada tipo de consórcio tem sua regra" fragmentando o catálogo de Produtos (seção 2, "Granularidade") quando necessário.
  - **Data de referência da regra:** é sempre a data em que o **cliente assinou com o fornecedor** (não a data em que o admin registra a confirmação no sistema, que pode ser posterior) — capturada como input manual no momento da confirmação (ver 3.4), pois hoje não há integração automatizada que informe isso de outra forma.

- **Cliente** = papel `cliente` em `pessoa_papeis`, já suportado hoje. Tela de Vendas precisa de dois caminhos:
  1. Buscar Pessoa existente por CPF/CNPJ (dedup — evita duplicar quem já é Lead/Cliente no CRM).
  2. Cadastrar Pessoa do zero (venda sem histórico prévio de atendimento) — mesmo formulário usado hoje internamente, sem tela própria de "criar cliente" separada do fluxo de venda.
  - **Promoção a `cliente`:** automática, disparada pelo mesmo evento que confirma a 1ª parcela (webhook Asaas) — sem botão manual à parte. **Enquanto a integração real não estiver no ar, o mesmo botão que hoje confirma manualmente a parcela inicial é o gatilho** — é o mesmo evento, dois jeitos de acioná-lo (efêmero até a integração existir).

- **Venda sem funil prévio:** cria a `oportunidade` já na subetapa `dados_contrato`, com Pessoa + Produto + valor definidos na hora — sem passar pelas subetapas de triagem/qualificação/negociação que não existiram.

- **Lacuna de segurança a fechar nesta frente (achado real, não específico de Vendas mas destampado por ela):** `pessoa_papeis`, `pessoa_representantes`, `enderecos`, `entidades_legais`, `identidades_canal`, `unidades_negocio` não têm RLS nem trigger de auditoria hoje (`SEGURANCA_E_AUDITORIA_ARRUDACRED.md` seção 2.6 — gap conhecido, só nunca apareceu porque nenhuma tela usava o cliente autenticado nelas). Vendas é a primeira frente a escrever de verdade em `pessoa_papeis`/`pessoa_representantes`/`enderecos` a partir do admin autenticado — a migration desta frente **precisa** adicionar RLS + trigger de auditoria a essas 6 tabelas, não deixar mais uma lacuna "descoberta por acidente" depois.

### 3.1.1 Convenções de cadastro de Pessoa (UX e dados) — decidido com Luiz em 17/08/2026

Vale pra **qualquer** tela que cadastra/edita uma Pessoa neste sistema (Fornecedor, Cliente, e futuramente qualquer outra), não só as desta sub-frente:

- **Texto sempre em caixa alta, exceto e-mail.** Aplica a `pessoas.nome_razao_social` e aos campos de texto de `enderecos` (logradouro, bairro, cidade, complemento). Não aplica a `documento` (só dígitos), `whatsapp` (só dígitos), `email` (exceção explícita), nem a campos que são código fixo de um `check` constraint (ex.: `fornecedores.categoria`) — colocar esses em caixa alta quebraria a constraint, que é minúscula por convenção do projeto. UF já nasce em 2 letras maiúsculas (select fechado, não texto livre — ver abaixo).
- **Máscaras de input padrão** para CPF/CNPJ, CEP e telefone/WhatsApp — aplicadas na tela (formatação visual), não no dado salvo (o dado salvo continua normalizado/sem máscara, mesmo padrão já usado em `documento.ts`).
- **Endereço sempre CEP-primeiro:** o formulário pede o CEP antes dos demais campos e autopreenche logradouro/bairro/cidade/UF via **ViaCEP** (`https://viacep.com.br/ws/{cep}/json/`, API pública brasileira, sem chave/custo) assim que o CEP tem 8 dígitos — os campos autopreenchidos continuam editáveis (o autopreenchimento é conveniência, não trava o campo). UF é select fechado (27 estados), não texto livre.
- **Upload de documento com identificação de tipo:** cliente e fornecedor podem anexar documentos (RG, CNH, comprovante de residência, contrato social, cartão CNPJ, etc.) — cada upload exige escolher o tipo de um select (lista fixa + "Outro" com campo livre). Nova tabela `pessoa_documentos` (ver 3.1.2).
- **Leitura de documento por IA (opcional, botão explícito, nunca automático):** upload ou colagem de imagem(ns)/PDF de um documento → Claude (visão) extrai nome/documento/endereço → **pré-preenche o formulário, nunca salva sozinho** — segue o mesmo princípio já registrado no lema do projeto ("IA sempre que possível, com verificação sempre"). Reaproveita o mesmo padrão de cliente Anthropic já usado em `src/lib/motor-fluxo/interpretacao-ia.ts` (SDK oficial, `ANTHROPIC_API_KEY`, tool-use para saída estruturada) — Haiku 4.5 (já usado pra extração/classificação no projeto, seção 2.1 do plano mestre), que já suporta visão.
- **Foto da pessoa:** reaproveita a tabela `pessoa_fotos` já existente (migration 031, construída originalmente pra foto de perfil do WhatsApp na Tela de Atendimento — mesmo formato, `pessoa_id` + `url` + timestamp, "mais recente vale") — cadastro manual só insere mais uma linha, sem tabela nova.

### 3.1.2 Novas entidades de suporte ao cadastro

- **`pessoa_documentos`** (nova): `id`, `pessoa_id` (FK), `tipo_documento` (texto — lista sugerida na UI: `rg`, `cnh`, `comprovante_residencia`, `contrato_social`, `cartao_cnpj`, `outro`, mas campo livre no banco pra não travar em uma lista fechada), `descricao` (nullable, usado quando `tipo_documento = 'outro'`), `url` (Supabase Storage, bucket `pessoa-documentos`), `nome_arquivo`, `enviado_em`, `created_at`. Trigger de auditoria + RLS.
- **Endereço** não ganha tabela nova — `enderecos` já existe no núcleo (seção 3.1, lacuna de RLS já fechada). Fornecedor e Cliente passam a ter tela de captura de verdade sobre essa tabela já existente.

### 3.2 Contrato

- **`contrato_templates`** (nova, 1 por Produto — só faz sentido pra `tipo` `proprio`/`subcontratado`): `id`, `produto_id` (FK), `conteudo_markdown` (texto com placeholders: `{{nome_cliente}}`, `{{documento_cliente}}`, `{{valor_total}}`, `{{valor_total_extenso}}`, `{{tabela_vencimentos}}`, `{{forma_pagamento}}`...), `versao`, `ativo`, `created_at`, `updated_at`. Editável pelo admin sem deploy — mesmo padrão do editor de fluxo de atendimento. Trigger de auditoria + RLS.

- **`contratos`** (nova): `id`, `oportunidade_id` (FK, único — reforça a regra já fechada em `KANBAN_COMERCIAL_LIMPANOME.md`/seção 11 do plano mestre: **1 Oportunidade = 1 contrato, mesmo em pacote de vários documentos**), `contrato_template_id` (FK), `pessoa_signatario_id` (FK → `pessoas` — o cliente, ou o representante legal via `pessoa_representantes` quando PJ), `pessoa_arrudacred_signatario_id` (FK → `pessoas` — configurável, não hardcoded), `fornecedor_id` (FK → `pessoas`, nullable — só preenchido quando o Produto é `subcontratado` **e** `fornecedor_definido_em = 'venda'`; é aqui que a escolha por venda fica registrada, não em `produtos`, ver 3.1), `pdf_url` (Supabase Storage), `status` (`'gerado' | 'enviado' | 'assinado' | 'recusado' | 'cancelado'`), `assinafy_document_id`, `forma_pagamento`, `parcelas_qtd` (`1` = à vista), `valor_total` (snapshot de `oportunidades.valor_estimado` no momento da geração — inclui a soma de `oportunidade_documentos` quando é pacote), `enviado_em`, `assinado_em`, `created_at`, `updated_at`. Trigger de auditoria + RLS.
  - **Correção importante (achado ao conferir o código real):** `forma_pagamento` **não é calculado por Vendas nem lido de `precos_por_faixa`** — `precos_por_faixa` é território exclusivo do CRM/atendimento, usado pela Malala pra apresentar preço ao lead (Passo 15 do script), e esta spec não mexe nele. A escolha de forma de pagamento **já é capturada durante a negociação**: o checkpoint `ln_passo15_normal`/`ln_passo15_selfservice` (`src/lib/motor-fluxo/fluxo-limpeza-nome.ts`) já tem `campoSalvo: "forma_pagamento"`, ou seja, o valor escolhido pelo lead já fica salvo em `conversas.dados` antes da Oportunidade chegar em `dados_contrato`. Vendas só **lê e normaliza** esse dado já existente pra dentro de `contratos` — não decide nem recalcula nada de preço/parcelamento. **Pendência de implementação:** confirmar contra `conversas.dados` real o formato exato do valor salvo hoje em `forma_pagamento`, pra mapear certo pro `parcelas_qtd`/valor de cada parcela.
  - Template ganha um placeholder `{{lista_documentos}}` (a partir de `oportunidade_documentos`) para listar cada CPF/CNPJ do pacote no corpo do contrato, quando houver mais de um.

- **`contrato_parcelas`** (nova): `id`, `contrato_id` (FK), `numero`, `valor`, `vencimento_previsto`, `asaas_payment_id` (nullable), `status` (`'previsto' | 'gerado' | 'pago' | 'atrasado' | 'cancelado'`), `pago_em` (nullable), `created_at`, `updated_at`. O plano (quantidade/valor de cada parcela) vem do `forma_pagamento`/`parcelas_qtd` já confirmados com o lead (ver acima) — **não é recálculo de preço**, é só transcrever em linhas individuais o que já foi negociado, pra alimentar a tabela de vencimentos do PDF e depois ser **reaproveitado**, sem recalcular, quando a cobrança real é criada na Asaas após a assinatura. Trigger de auditoria + RLS.
  - Preparado para consumo futuro pela `REGUA_COBRANCA_ARRUDACRED.md` (Financeiro, fora de escopo aqui) — os campos `vencimento_previsto`/`status` já são o que uma régua de atraso precisaria ler.

- **Geração do PDF:** `conteudo_markdown` (com placeholders resolvidos) → HTML (layout fixo: cabeçalho/rodapé/bloco de assinatura) → PDF via Chromium headless (Puppeteer + `@sparticuz/chromium`, rodando em Function na Vercel — pacote de até 5GB já suporta). PDF sobe pro Supabase Storage (mesmo padrão já usado pra mídia do editor de fluxo/Tela de Atendimento).
  - **Valor por extenso:** função utilitária de conversão número→texto em R$ (ex.: `R$ 1.500,00 (mil e quinhentos reais)`).
  - **Tabela de vencimentos:** renderizada a partir de `contrato_parcelas`, só quando `parcelas_qtd > 1` (à vista não precisa de tabela).

- **2 signatários via Assinafy:** cliente (ou representante legal PJ) + ArrudaCred (pessoa fixa, configurável via `configuracoes`, não hardcoded no código).

- **Geração e envio automáticos, sem revisão humana antes de disparar pra Assinafy** — decisão explícita de Luiz (a etapa de verificação humana do lema do projeto vale pra conteúdo *gerado por IA*; aqui é merge determinístico de template + dado, sem IA envolvida).

- **Webhook `/api/webhooks/assinafy`** — mesmo padrão de segurança já corrigido no Zapster (falha fechada se `ASSINAFY_WEBHOOK_SECRET` não estiver configurada, comparação em tempo constante). Atualiza `contratos.status` e avança `oportunidades.etapa_kanban` (`assinatura_digital` → `pagamento`).

### 3.3 Financeiro da venda (produtos `proprio`/`subcontratado`)

- Assim que `contratos.status = 'assinado'` (webhook Assinafy), o sistema cria as cobranças reais na Asaas **a partir do plano já existente em `contrato_parcelas`** (não recalcula) — preenche `asaas_payment_id`, `status = 'gerado'`.
- Link de pagamento reenviado por WhatsApp, passando pela Camada de Adaptadores de Canal já definida em `MODELAGEM_DADOS_ARRUDACRED.md` (hoje só o adaptador Zapster existe de fato, mas a chamada é contra a abstração, não contra a Zapster diretamente — mesmo princípio já seguido pelo motor de fluxo) — isso já registra a mensagem em `mensagens`/`conversas`, cobrindo a regra "toda interação com cliente aparece no CRM" sem mecanismo novo de log pro canal em si.
- **Webhook `/api/webhooks/asaas`** (mesmo padrão de segurança) confirma pagamento → `contrato_parcelas.status = 'pago'`, `pago_em` preenchido.
- **Quando a 1ª parcela é confirmada:**
  1. `oportunidades.etapa_kanban = 'ganha'`
  2. Promove a Pessoa a `cliente` (`pessoa_papeis`)
  3. Fica pronta pro handoff — ver 3.5 (a criação de fato da Ordem de Serviço é do módulo Operação, fora de escopo)

### 3.4 Financeiro da venda (produtos `comissionado`)

- **`comissoes_fornecedor_receber`** (nova): `id`, `oportunidade_id` (FK), `fornecedor_id` (FK), `produto_id` (FK), `numero`, `valor`, `data_prevista`, `status` (`'previsto' | 'recebido'`), `recebido_em`, `created_at`, `updated_at`. Trigger de auditoria + RLS.
  - `valor` de cada parcela = `fornecedor_produtos.percentual_comissao` aplicado sobre `oportunidades.valor_estimado` (o valor do crédito/consórcio vendido, já capturado no funil), dividido em `comissao_parcelas_qtd` partes iguais quando `forma_comissao = 'parcelado'`.
  - `data_prevista` de cada parcela = data de referência informada na confirmação (ver abaixo) **+** `comissao_dias_primeira_parcela` **+** `comissao_intervalo_dias_parcelas` × (número da parcela − 1).
- **Ação "Confirmar venda"** (produtos comissionados): hoje não existe integração automatizada com cada administradora/banco que avise a ArrudaCred sozinha — é uma ação manual do admin, que precisa informar **a data em que o cliente assinou com o fornecedor** (o dado real que baseia o cálculo de vencimento — pode ser anterior a hoje, se o fornecedor demorou pra avisar). Ao confirmar, o sistema gera de uma vez todas as parcelas de `comissoes_fornecedor_receber` a partir da regra em `fornecedor_produtos`. Fica registrado como suposição a validar quando a frente for implementada — se algum fornecedor específico expuser API própria no futuro, isso vira automatizável sem redesenhar o modelo (só passa a preencher a data de referência sozinho, em vez de pedir pro admin).
- **"Ganha" da Oportunidade comissionada = confirmação do fornecedor**, não o recebimento da comissão em si (diferente do modelo `proprio`/`subcontratado`, onde Ganha = dinheiro do cliente confirmado).
- **Sem handoff pra Operação** — sem execução da ArrudaCred, não há o que rastrear em Operação.
- **Sem Contrato/Assinafy** — o contrato de verdade é entre cliente e fornecedor, fora do sistema.

### 3.5 Handoff — sinal para o módulo Operação

- **Schema de `ordens_servico` fica fora desta spec** — decisão de Luiz: os campos, o formato de lote/individual, o fluxo de envio ao fornecedor e o acompanhamento de execução são detalhados junto com o desenho do módulo Operação, não aqui. O rascunho em `PARCEIROS_AFILIADOS_ARRUDACRED.md` continua sendo só um rascunho, não confirmado nem estendido por esta spec.
- **O que Vendas garante:** quando `oportunidades.etapa_kanban = 'ganha'` (produtos `proprio`/`subcontratado`), a Oportunidade já carrega tudo que uma futura `ordens_servico` vai precisar consumir — Pessoa (via `oportunidades.pessoa_id`), Produto (via `oportunidades.produto_id`), e o Fornecedor já escolhido na venda quando aplicável (via `contratos.fornecedor_id`, ver 3.2). Isso é suficiente pro módulo Operação, quando existir, migrar/consumir sem depender de retrabalho em Vendas.
- Produtos `comissionado` **não** entram nesse handoff (seção 3.4) — sem execução da ArrudaCred, não há OS a criar.

---

## 4. Integração com o CRM (Tela de Atendimento)

- Nenhum canal de comunicação novo — tudo que envolve contato com o cliente (link de assinatura, link de pagamento) passa pela **mesma Camada de Adaptadores de Canal** já usada no Comercial (hoje resolve pra WhatsApp/Zapster, mas Vendas não fala com o provedor diretamente), o que automaticamente aparece na timeline da conversa (mesma tabela `mensagens`).
- Eventos internos (contrato gerado/enviado/assinado, cobrança gerada, parcela paga, comissão confirmada) aparecem na timeline como **anotação de sistema** — reaproveitando o mesmo mecanismo já usado hoje pra "e-mail enviado" e "trilha de atividade" (`TELA_ATENDIMENTO_ARRUDACRED.md` seção 3). **Dependência em aberto:** esse mecanismo (`mensagens.remetente` hoje só aceita `malala`/`lead`/`supervisor`) já está registrado como decisão de implementação pendente na própria Tela de Atendimento (seção 9) — Vendas consome o que for decidido lá, não redesenha isso aqui.
- Cabeçalho da conversa já mostra "Cliente desde [data] — [produto]" cruzando `pessoa_papeis` — nenhuma mudança necessária, só passa a ser alimentado de verdade quando a promoção a cliente acontecer.

---

## 5. Fluxo ponta a ponta (produtos `proprio`/`subcontratado`)

```
dados_contrato completo (nome, documento, endereço, forma de pagamento)
  → gera contrato (PDF com valor por extenso + tabela de vencimentos)
  → envia à Assinafy (cliente + ArrudaCred assinam)
  → [webhook Assinafy: assinado] → etapa_kanban = 'assinatura_digital' → 'pagamento'
     → cria cobrança(s) na Asaas a partir de contrato_parcelas
     → reenvia link por WhatsApp
  → [webhook Asaas: 1ª parcela paga] → contrato_parcelas.status = 'pago'
     → etapa_kanban = 'ganha'
     → promove Pessoa a cliente
     → pronta pro handoff (Operação cria a OS — fora de escopo, ver seção 3.5)
```

## 6. Fluxo ponta a ponta (produtos `comissionado`)

```
dados_contrato completo (nome, documento — fornecedor já é implícito via produtos.fornecedor_id)
  → registra venda (sem contrato/Assinafy)
  → aguarda confirmação do fornecedor (manual, hoje)
  → [confirmação registrada] → gera comissoes_fornecedor_receber (a partir de fornecedor_produtos)
     → etapa_kanban = 'ganha'
     → promove Pessoa a cliente
     → (sem handoff pra Operação)
```

**Nova subetapa de Kanban necessária:** `aguardando_confirmacao_fornecedor` (entre `dados_contrato` e `ganha`, substituindo `assinatura_digital`/`pagamento` no caminho comissionado).

---

## 7. Fora de escopo desta frente (registrado para não esquecer)

- Módulo Operação inteiro — inclusive o **schema da tabela `ordens_servico`** (campos, lote vs. individual, envio ao fornecedor, acompanhamento de execução, contas a pagar ao fornecedor subcontratado). Vendas só garante que a Oportunidade "ganha" carrega o dado que esse módulo vai precisar (seção 3.5).
- Contas a pagar administrativas a fornecedores em geral (módulo Financeiro futuro).
- Régua de cobrança para parcelas em atraso pós-1ª (`REGUA_COBRANCA_ARRUDACRED.md`) — só garantimos que o dado fica pronto pra ela.
- Agenda de comunicação pós-venda (`AGENDA_POS_VENDA_ARRUDACRED.md`) — só garantimos que o evento "Dia Zero" (contrato assinado + 1ª parcela paga) fica identificável via `etapa_kanban = 'ganha'`.
- Portal do cliente (`cliente.arrudacred.com.br`, mencionado por Luiz como PHP/subdomínio futuro) — o modelo de dados proposto (contratos/parcelas presos à Pessoa via Oportunidade) já é compatível, sem redesenho necessário quando chegar a vez.
- Split payment automático via subconta Asaas de afiliado — módulo Afiliados ainda não construído; quando existir, a criação de cobrança na Asaas (seção 3.3) precisa checar se a Oportunidade tem origem em afiliado e configurar o split — fica registrado aqui como acoplamento futuro, não implementado agora.
- Governança de custo (`PLANO_MESTRE_SISTEMA_ARRUDACRED.md` seção 9) e o "Painel de status de integrações externas" (registrado, ainda não construído) — Assinafy e Asaas são as próximas APIs pagas de terceiro depois da Zapster/Resend; quando esses painéis existirem, precisam passar a contar as chamadas feitas por Vendas. Não bloqueia esta frente, só fica registrado como consumidor futuro.
- Tela de Kanban visual (ainda não construída, é a próxima grande peça combinada com Luiz após a Tela de Atendimento) — a implementação desta frente precisa de alguma superfície pra operar (lista/detalhe de oportunidades em fechamento), mesmo que não seja o board completo; decisão de forma exata fica pro plano de implementação, não bloqueia esta spec.

## 8. Pendências / decisões a confirmar durante a implementação

1. Migração do dado existente `produtos.tipo = 'terceiro'` para `subcontratado`/`comissionado` — precisa decidir caso a caso (Consórcio/Crédito → comissionado; se algum "terceiro" hoje for na real subcontratado, mover).
2. Texto exato dos templates de contrato por produto — ainda não escrito, fica para quando a frente entrar em implementação.
3. Confirmação do fornecedor em produto comissionado é manual nesta fase (sem API por administradora) — revalidar se algum fornecedor específico expõe integração própria antes de implementar.
4. Superfície de tela pra operar oportunidades em fechamento (lista simples vs. esperar o Kanban visual) — decisão de implementação, não de produto.
