# Parceiros e Afiliados — ArrudaCred
**Status:** Primeira versão, 12/08/2026 — Motores 5 e 6 do plano de marketing original, desenhados como sistema.

---

## 1. A distinção central — DECIDIDO em 12/08/2026

Dois modelos comerciais diferentes, que **não devem ser confundidos no sistema**, apesar de convergirem na mesma execução operacional:

### PARCEIRO — atacado/revenda
- **Compra** o serviço da ArrudaCred e **revende** para os próprios clientes
- O cliente final **não tem vínculo nenhum com a ArrudaCred** — o vínculo contratual é só Parceiro ↔ ArrudaCred
- **Contrato guarda-chuva**: um contrato só com o Parceiro, sem contrato individual por cliente final/serviço
- **ArrudaCred não fatura contra o cliente final** — quem paga é o Parceiro
- **Mas o serviço, uma vez contratado, entra na mesma esteira operacional interna** (ordem de serviço) que qualquer outro — a execução do trabalho (ex.: limpar o nome) é idêntica, só a relação comercial/faturamento muda

### AFILIADO/INFLUENCER — indicação por comissão
- Só **indica** — não revende, não tem contrato guarda-chuva
- Comissiona por **percentual configurável**, sempre **sobre parcelas efetivamente recebidas** (não sobre contrato assinado) — split payment é o mecanismo ideal pra isso
- Recebe **link único de página de venda + checkout por produto** que estiver habilitado a oferecer
- O contrato gerado a partir desse link já nasce **vinculado ao afiliado** — o sistema sabe automaticamente que deve pagar comissão

**O que os dois têm em comum:** precisam de um **dashboard/portal próprio** — material de apoio, downloads, abertura de tickets, controle das próprias operações.

---

## 2. Modelagem de dados

### Núcleo compartilhado
Tanto Parceiro quanto Afiliado são **papéis** de uma Pessoa (reaproveita o núcleo Pessoa/Papel já definido em `MODELAGEM_DADOS_ARRUDACRED.md`) — `pessoa_papeis.tipo_papel = 'parceiro'` ou `'afiliado'`.

### Específico de Parceiro
- **CONTRATOS_PARCEIRO** — o contrato guarda-chuva. `id`, `pessoa_id` (FK), `condicoes_gerais`, `status` (`ativo`/`inativo`), `vigencia_inicio`, `vigencia_fim`, `created_at`, `updated_at`.
- **PARCEIRO_PRODUTOS** — quais produtos o parceiro pode revender e em que condição. `id`, `contrato_parceiro_id` (FK), `produto_id` (FK), `preco_negociado` (o preço de atacado, diferente do preço de varejo em `precos_por_faixa`), `ativo`.

### Específico de Afiliado
- **AFILIADOS** — `id`, `pessoa_id` (FK), `percentual_comissao_padrao`, `status`, `created_at`, `updated_at`.
- **AFILIADO_PRODUTOS** — produtos habilitados, com link de venda próprio. `id`, `afiliado_id` (FK), `produto_id` (FK), `percentual_comissao` (nullable — se vazio, usa o padrão do afiliado), `link_unico` (slug/token da URL de venda+checkout), `ativo`.
- **COMISSOES** — o razão de comissão, sempre atrelado a pagamento recebido, nunca a contrato assinado. `id`, `afiliado_id` (FK), `contrato_id` (FK — o contrato do cliente final gerado pelo link), `parcela_id` (FK — a parcela específica paga, liga ao módulo Financeiro), `valor_comissao`, `percentual_aplicado`, `status` (`pendente`/`pago`), `pago_em`, `created_at`.
  - `COMMENT`: *"Uma linha por parcela paga que gera comissão — nunca por contrato assinado. Se o cliente não pagar, não há comissão a pagar."*

### Peça que unifica os dois modelos com a execução operacional
- **ORDENS_SERVICO** — desacopla "quem executa o serviço" de "quem paga por ele". `id`, `produto_id` (FK), `pessoa_beneficiaria_id` (FK → `pessoas` — quem recebe o serviço, ex.: o CPF sendo limpo), `origem_comercial` (`direto` / `parceiro` / `afiliado`), `parceiro_contrato_id` (FK, nullable — preenchido se `origem_comercial = parceiro`), `oportunidade_id` (FK, nullable — preenchido se `origem_comercial = direto` ou `afiliado`, liga ao funil comercial normal), `etapa_operacional` (o mesmo Kanban de execução, independente da origem comercial), `created_at`, `updated_at`.
  - `COMMENT`: *"Toda execução de serviço passa por aqui, venha de venda direta, de um parceiro (contrato guarda-chuva) ou de um afiliado (comissão). A operação (ordem de serviço) é sempre a mesma; só a origem comercial muda."*

### Portal — dashboard de Parceiro/Afiliado
- **USUARIOS_PORTAL** — login separado de `usuarios_sistema` (que é só para equipe interna) — fronteira de segurança diferente. `id`, `pessoa_id` (FK), `email`, `senha_hash`, `tipo_portal` (`parceiro`/`afiliado`), `ativo`, `created_at`.
- **MATERIAIS_APOIO** — `id`, `produto_id` (FK, nullable), `tipo` (`parceiro`/`afiliado`/`ambos`), `nome`, `url_arquivo`, `categoria`, `ativo`.
- **TICKETS_SUPORTE** — `id`, `pessoa_id` (FK — quem abriu), `assunto`, `descricao`, `status` (`aberto`/`em_andamento`/`resolvido`), `prioridade`, `created_at`, `updated_at`.
- **TICKET_MENSAGENS** — thread de cada ticket. `id`, `ticket_id` (FK), `remetente`, `conteudo`, `created_at`.

---

## 3. Sugestões e pontos a decidir (incrementando o que Luiz trouxe)

1. **Split payment via Asaas — provável caminho certo.** A Asaas (já escolhida como plataforma financeira) tem funcionalidade de split de pagamento — quando formos detalhar o módulo Financeiro, vale confirmar exatamente como configurar isso pra comissão de afiliado cair automaticamente, em vez de calcular e pagar manualmente depois.

2. **LGPD no modelo Parceiro — ponto de atenção, não resolvido ainda.** Mesmo sem contrato direto com o cliente final, os dados dele (ex.: CPF sendo limpo) ainda passam pela ArrudaCred pra executar o serviço — a base legal de tratamento desses dados provavelmente precisa vir **através do Parceiro** (ele coleta o consentimento do cliente dele, e garante isso pra ArrudaCred no contrato guarda-chuva). Vale formalizar isso como cláusula do contrato guarda-chuva quando chegarmos no módulo Jurídico.

3. ✅ **Auto-indicação (self-referral) — DECIDIDO em 12/08/2026:** permitida sem restrição. Luiz optou por tratar como um bônus adicional pro afiliado — se ele quiser usar o próprio link pra se indicar, não há problema (nem desconto, nem comissão associados a isso viram motivo de bloqueio).

4. **Sugestão de unificação parcial:** Parceiro e Afiliado têm **portal compartilhado** (mesma tabela `usuarios_portal`, mesmo sistema de materiais/tickets) mesmo com mecânica comercial diferente — assim não duplicamos a infraestrutura de portal, só a lógica comercial por trás muda.

---

## 4. Site parceiro.arrudacred.com.br — DECIDIDO em 12/08/2026

**Arquitetura:** novo site, hospedado na Hostinger (reserva já disponível, ver seção 2 do plano mestre), construído por Luiz + Claude. Páginas dinâmicas geradas a partir de parâmetros recebidos via querystring (ex.: `parceiro.arrudacred.com.br/checkout?afiliado=XYZ&produto=limpanome`) — um template serve qualquer combinação de afiliado/produto, sem precisar gerar página estática por link.

**Fluxo de dados:** o site captura os dados do pedido e envia para uma **API própria** (a construir), que valida (confere se o `link_unico` do afiliado está ativo, monta os registros corretos — Pessoa, Oportunidade vinculada ao afiliado) antes de gravar no Supabase. **Nunca escrita direta e aberta no banco a partir do site público** — a validação mora na API, não no cliente.

**Checkout — DECIDIDO:** o site **não processa pagamento diretamente** — captura os dados do pedido e **redireciona para o checkout da Asaas**, mesmo padrão já usado no fluxo de atendimento via WhatsApp (link de pagamento). Evita lidar com conformidade de segurança de cartão (PCI) diretamente — a Asaas já resolve isso.

**Pendências técnicas deste site (a detalhar):**
- Desenho exato da API de recebimento (endpoint, validações, autenticação do lado do site)
- Template(s) de página — quantas variações por produto, conteúdo dinâmico
- Como o retorno da Asaas (pagamento confirmado) fecha o ciclo — mesma lógica de webhook já usada no fluxo comercial principal

---

## Pendências deste documento
- Contrato guarda-chuva do Parceiro (onboarding/assinatura) — **deixado como pendente, por decisão de Luiz** (12/08/2026)
- Cláusula LGPD do contrato guarda-chuva (ponto 2 da seção 3) — depende do módulo Jurídico
- Pendências técnicas do site parceiro.arrudacred.com.br — ver seção 4 acima
