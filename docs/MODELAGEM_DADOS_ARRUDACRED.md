# Modelagem de Dados — Núcleo do Sistema ArrudaCred
**Status:** Núcleo e módulo Comercial já implementados e em produção (migrations 001-004, ver `PLANO_MESTRE_SISTEMA_ARRUDACRED.md` seção 10) — este documento descreve o desenho; para o schema exato como está hoje, ver `supabase/migrations/` no repositório. Discutido originalmente com Luiz em 11/08/2026.
**Objetivo:** definir a estrutura de dados central que sustenta Lead, Cliente, Fornecedor, Parceiro/Afiliado, e a convivência de múltiplas unidades de negócio (ArrudaCred, Aetria, futuras) — pensada para crescer sem precisar ser refeita.

---

## O problema que este desenho resolve

Luiz identificou que Lead, Cliente, Fornecedor e Parceiro/Afiliado têm estrutura de dados parecida, podem ser PF ou PJ, e no caso de PJ precisam dos dados da pessoa física que assina pela empresa (para os módulos de contrato). Além disso, o sistema precisa conviver com múltiplas unidades de negócio (ArrudaCred, Aetria, e possíveis futuras) desde já.

**Se cada um desses "tipos" virar uma tabela separada** (tabela Lead, tabela Cliente, tabela Fornecedor, tabela Parceiro), surgem dois problemas sérios conforme o sistema cresce:
1. **Duplicação e dessincronia:** o mesmo CPF pode aparecer em várias tabelas sem o sistema saber que é a mesma pessoa (ex.: um cliente que também é parceiro/afiliado vira dois registros desconectados)
2. **Migração dolorosa:** quando um Lead vira Cliente, os dados precisam ser copiados/movidos de uma tabela pra outra — e esse é exatamente o tipo de evento que acontece o tempo todo no negócio

## A solução: padrão Pessoa/Papel ("Party Model")

Uma pessoa (física ou jurídica) **não é** "um lead" ou "um cliente" — ela é uma **Pessoa** que, em determinado momento e dentro de uma unidade de negócio específica, **assume o papel** de Lead, Cliente, Fornecedor ou Parceiro/Afiliado. Uma mesma Pessoa pode assumir mais de um papel ao mesmo tempo (ex.: cliente que também é parceiro indicador), e o histórico de mudança de papel fica registrado (quando virou cliente, por exemplo).

## Entidades principais

- **PESSOA** — o núcleo: identidade única, PF ou PJ, com nome/razão social, documento (CPF/CNPJ), e-mail, WhatsApp. Existe uma vez só por identidade, não importa quantos papéis ela assuma.
- **PESSOA_PAPEL** — liga uma Pessoa a um papel (Lead/Cliente/Fornecedor/Parceiro-Afiliado) **dentro de uma Unidade de Negócio específica**. Isso permite que a mesma Pessoa seja Cliente na ArrudaCred e Lead na Aetria, de forma independente. Guarda `data_inicio`/`data_fim`, o que dá histórico e auditoria de quando cada papel começou.
- **PESSOA_REPRESENTANTE** — resolve o requisito de "PJ precisa dos dados de quem assina": liga uma Pessoa do tipo PJ a uma Pessoa do tipo PF (o representante/assinante), em vez de duplicar os dados do representante dentro do registro da empresa. Como o representante também é só uma Pessoa, se ele próprio um dia virar Lead ou Cliente individualmente, não há duplicação de cadastro — é o mesmo registro. É exatamente o dado que já mapeamos no script (Passo 17 — "Dados de quem vai assinar contrato").
- **ENDERECO** — separado da Pessoa porque ela pode ter mais de um (residencial, comercial, cobrança).
- **ENTIDADE_LEGAL** — a razão social/CNPJ que existe hoje (L.H. DE ARRUDA D. DO VALLE SERVIÇOS LTDA).
- **UNIDADE_NEGOCIO** — ArrudaCred, Aetria, e futuras. Hoje todas sob a mesma Entidade Legal, mas o modelo já suporta cada unidade ter seu próprio CNPJ no futuro, se algum dia se tornarem empresas separadas de fato.
- **PRODUTO** — já vinculado à Unidade de Negócio (decisão anterior, seção 8.8 do plano mestre) — assim os produtos da Aetria (Música Personalizada, etc.) convivem naturalmente com os da ArrudaCred no mesmo sistema, sem se misturar.
- **OPORTUNIDADE** — o registro do CRM/Kanban, ligando Pessoa + Produto + etapa do funil + valor estimado (já desenhado em `KANBAN_COMERCIAL_LIMPANOME.md`).

## O que isso resolve, na prática

- Um cliente da ArrudaCred que também indica outros clientes (parceiro/afiliado) é **uma Pessoa com dois papéis**, não dois cadastros
- Um fornecedor de crédito (banco) que também vira parceiro comissionado é a mesma lógica
- Uma empresa (PJ) contratando Limpeza de Nome tem seu representante legal capturado como Pessoa própria, reutilizável se esse representante interagir com o sistema individualmente depois
- Quando a Aetria entrar no sistema, não é preciso redesenhar nada — só criar a Unidade de Negócio "Aetria" e seus Produtos; a base de Pessoas já é compartilhada entre as duas empresas do grupo (útil, por exemplo, se um cliente da ArrudaCred também vier a contratar uma música personalizada na Aetria)

## Convenção de Nomenclatura — DECIDIDO em 11/08/2026

Padrão baseado nas convenções mais universais do ecossistema Postgres/Supabase (que é justamente o stack já escolhido), pensado para deixar relacionamentos óbvios só de olhar o nome da coluna — importante tanto para humano quanto para um agente de IA (Claude Code) trabalhando no schema.

1. **snake_case em tudo** (tabelas e colunas) — é o padrão nativo do Postgres; evita os problemas de case-sensitivity que aparecem quando se mistura maiúsculas em identificadores não citados.

2. **Nome de tabela: plural, snake_case** — `pessoas`, `produtos`, `oportunidades`, `pessoa_papeis`, `unidades_negocio`, `enderecos`. Plural porque é o padrão que o Supabase/PostgREST assume por convenção na API gerada automaticamente.

3. **Chave primária: sempre `id` (uuid)** — nunca `pessoa_id` como PK da própria tabela `pessoas`, por exemplo. Consistência total aqui elimina ambiguidade em qualquer join.

4. **Chave estrangeira: `<tabela_referenciada_no_singular>_id`** — `pessoa_id`, `produto_id`, `unidade_negocio_id`. Só de ler o nome da coluna já se sabe pra qual tabela ela aponta — é exatamente o que facilita relacionamento futuro sem precisar consultar documentação toda vez.

5. **Campos técnicos/estruturais sempre em inglês:** `id`, `created_at`, `updated_at`, `deleted_at` (soft delete). Não é sobre preferência de idioma — é que absolutamente toda ferramenta, ORM, framework de migration e agente de IA espera esses nomes por padrão. Lutar contra essa convenção gera atrito para sempre.

6. **Campos de negócio em português:** `nome`, `documento`, `valor_estimado`, `tipo_pessoa`, `data_inicio`. Mantém o código legível na mesma linguagem que usamos aqui nos documentos e que você usa no dia a dia do negócio.

7. **Enums em snake_case minúsculo:** `tipo_pessoa`: `pf` | `pj`; `tipo_papel`: `lead` | `cliente` | `fornecedor` | `parceiro_afiliado`.

8. **Booleanos como adjetivo direto, sem prefixo redundante:** `ativo` (não `is_ativo`) — já fica claro pelo tipo da coluna.

9. **Valores monetários:** `numeric(12,2)`, nunca `float`/`double` (arredondamento pode gerar erro de centavos em cálculo financeiro).

10. **Evitar abreviação** — `unidade_negocio_id`, não `un_id` — nome completo custa pouco e economiza confusão depois.

**Aplicando isso às entidades já desenhadas:** os nomes usados no diagrama anterior já seguem quase tudo isso; os ajustes formais são: toda tabela ganha `created_at`/`updated_at` (e `deleted_at` se fizer sentido soft-delete), e a tabela seria `pessoas` (plural), `pessoa_papeis`, `pessoa_representantes`, `enderecos`, `entidades_legais`, `unidades_negocio`, `produtos`, `oportunidades`.

## Documentação embutida no banco — DECIDIDO em 11/08/2026

**Requisito de Luiz:** documentar "para que serve" cada campo não só nos documentos de projeto, mas **dentro do próprio Supabase**, de forma que quem estiver olhando o banco (Table Editor ou qualquer ferramenta) já veja o propósito do campo sem precisar consultar documentação externa.

**Mecanismo:** usar `COMMENT ON TABLE` e `COMMENT ON COLUMN` do Postgres — esses comentários ficam armazenados no próprio schema do banco (não se perdem, não é comentário de código) e **aparecem automaticamente no Table Editor do Supabase**, junto de cada tabela/coluna.

**Exemplo de aplicação (ilustrativo, tabela `pessoas`):**
```sql
COMMENT ON TABLE pessoas IS
  'Identidade única de qualquer pessoa física ou jurídica que o sistema conhece — antes de assumir qualquer papel (lead, cliente, fornecedor, parceiro). Ver pessoa_papeis para os papéis assumidos.';

COMMENT ON COLUMN pessoas.tipo_pessoa IS
  'pf = pessoa física, pj = pessoa jurídica. Define se documento é CPF ou CNPJ.';

COMMENT ON COLUMN pessoas.documento IS
  'CPF (pf) ou CNPJ (pj), somente números, sem máscara. Chave de identificação única da pessoa no sistema.';

COMMENT ON TABLE pessoa_papeis IS
  'Liga uma pessoa a um papel (lead/cliente/fornecedor/parceiro_afiliado) dentro de uma unidade de negócio específica. Uma mesma pessoa pode ter múltiplos papéis simultâneos, inclusive em unidades de negócio diferentes.';

COMMENT ON COLUMN pessoa_papeis.data_inicio IS
  'Data em que a pessoa passou a ocupar este papel — permite reconstruir o histórico (ex.: quando um lead virou cliente).';
```

**Regra permanente:** toda migration que cria tabela ou coluna nova **precisa incluir os `COMMENT ON` correspondentes** — isso vira uma regra de processo para o Claude Code seguir ao construir o schema, não uma tarefa opcional de documentação posterior.

---

## Módulo Comercial / Atendimento — Entidades do MVP1

Este bloco conecta ao núcleo Pessoa/Papel e realiza, em estrutura de dados, os requisitos já fechados no `SCRIPT_LIMPANOME_SERASA_SPC.md`, `FAQ_LIMPANOME_SERASA_SPC.md` e `KANBAN_COMERCIAL_LIMPANOME.md`.

- **PRODUTOS** — já vinculado à unidade de negócio (decisão anterior). `tipo_receita` distingue produto próprio vs. comissão de terceiro.
- **FLUXOS** — um fluxo de atendimento por produto (o script inteiro do Limpeza de Nome Serasa/SPC vira um registro aqui).
- **ETAPAS_FLUXO** — **esta é a tabela que realiza o "editor de fluxo" exigido na seção 8.9 do plano mestre.** Cada linha é um checkpoint/mensagem do script (cada "Passo" que documentamos vira uma linha aqui). `conteudo` em `jsonb` guarda o texto (com variações), mídia, e as regras de ramificação — assim o admin edita uma linha em vez de mexer em código. `campo_salvo` implementa a persistência de resposta configurável (seção 8.12... referenciada no script). `agenda_followup_id` é opcional — se nulo, usa a agenda padrão; se preenchido, usa uma agenda específica daquele checkpoint (ex.: a mensagem de proposta).
  - **Formato de `conteudo` implementado (13-14/08/2026)** — não mudou a coluna (continua um `jsonb` livre), mas o formato interno que o motor de fluxo interpreta ficou concreto: `mensagens` é uma lista de itens tipados (`texto`/`imagem`/`audio`/`video`/`documento`/`localizacao`/`contato`/`pix` — formato canal-agnóstico, ver Camada de Adaptadores abaixo), mais `aguarda_resposta`, `tipo_resposta`, `opcoes`/`proximo_codigo`/`proximo_condicional`/`proximo_por_dado` (regras de ramificação), `kanban_subetapa` (toda etapa carrega a sua, não só as terminais), `digitando`/`delay`, `interpretacao_ia` (toggle + instrução, encaixe pronto pra Fase 5), `posicao_canvas` (layout do editor visual). Código de referência: `src/lib/motor-fluxo/tipos.ts`.
- **AGENDAS_FOLLOWUP / AGENDA_ITENS** — realiza a régua de follow-up (a "Agenda padrão" que já preenchemos vira o primeiro registro aqui; a agenda da proposta, quando vier, é o segundo).
- **FAQS** — a base de conhecimento por produto, com CRUD completo (editar/desativar/excluir/criar) já exigido.
- **OPORTUNIDADES** — liga Pessoa + Produto, com `etapa_kanban` (a etapa/subetapa que desenhamos) e `alto_valor` (a badge, não uma coluna separada — decisão já tomada).
- **CONVERSAS** — uma conversa de WhatsApp ligada a uma Pessoa (e opcionalmente a uma Oportunidade). O campo `sob_supervisor` é exatamente o mecanismo de destaque visual que desenhamos no Kanban (bloco separado no topo da coluna) — não é uma etapa, é uma flag.
  - **Colunas acrescentadas pela Tela de Atendimento (Blocos A+B, 16-17/08/2026):** `atendente_id` (FK → `usuarios_sistema`, opcional — atendente humano específico com a conversa, distinto de "sob supervisão" genérico), `etapa_fluxo_atual_id` (FK → `etapas_fluxo` — etapa em que a conversa está parada, usada pelo atalho "Próxima etapa" do composer pra reaproveitar a mensagem literal do script), `agenda_followup_id`/`aguardando_resposta_desde`/`proximo_item_agenda` (motor de follow-up, Fase 6), `followup_manual_ativo` (boolean, migration `20260817030000` — atendente humano ativou follow-up manualmente numa conversa que ele controla; sem isso o cron só cuida de conversas com a Malala no controle).
- **MENSAGENS** — histórico de toda mensagem trocada, ligada à etapa do fluxo que a originou (`etapa_fluxo_id`) — isso dá rastreabilidade completa (auditoria) e é o que permite ao supervisor retomar uma conversa sabendo exatamente o que já foi dito.
- **NOTAS_INTERNAS** (nova, migration `20260817010000`) — nota visível só pra equipe, ligada a uma `conversa_id`, nunca enviada pro lead no WhatsApp; `texto` pode conter `@PrimeiroNome` pra mencionar um colega. Campos: `id`, `conversa_id` (FK), `autor_id` (FK → `usuarios_sistema`), `texto`, `created_at`. Trigger de auditoria.
- **NOTIFICACOES** (nova, migration `20260817010000`) — notificação in-app pro sino da Tela de Atendimento (@menção numa nota, ou atribuição de conversa recebida de outro atendente). Campos: `id`, `usuario_id` (FK), `tipo` (`mencao`/`atribuicao`), `conversa_id` (FK), `nota_id` (FK, opcional), `lida`, `created_at`. Sem trigger de auditoria de propósito (estado operacional efêmero, não registro de negócio).
- **RESPOSTAS_PRONTAS** (nova, migration `20260817020000`) — mensagens pré-escritas reaproveitáveis pelo atendente (atalho "/" no composer). Campos: `id`, `atalho` (único), `texto`, `ativo`, `created_at`, `updated_at`. Trigger de auditoria.
- **CRON_LOCKS** (nova, migration `20260816040000`) — lock genérico via upsert pra evitar disparo duplicado quando duas execuções do cron de follow-up se sobrepõem (`fn_tentar_lock_cron`/`fn_liberar_lock_cron`). Estado efêmero, sem trigger de auditoria.

**Fora deste diagrama por enquanto (para não sobrecarregar), mas ainda pendentes de desenho:**
- **RBAC/usuários admin** — quem pode editar o quê (supervisor vs. admin completo), ligado à seção 2 do plano mestre
- **Tabela de valores configuráveis** (preço mínimo, taxa de seguro, fórmula de alto valor, etc.) — provavelmente uma tabela de configurações chave-valor com histórico, para não precisar criar coluna nova a cada novo valor configurável que aparecer
- **Entidades de Jurídico** (processos, contratos) e **Financeiro** (parcelas, comissões, régua de cobrança) — ainda não desenhadas, se conectam a Pessoa/Oportunidade mas ficam para quando detalharmos esses módulos

---

## Camada Multi-Canal — Agente Maestro agnóstico de canal (novo, 11/08/2026)

Motivado pela possibilidade de diversificar canais (WhatsApp, Instagram Direct, Messenger, widget do site) caso o custo da API oficial do WhatsApp em escala justifique — ver seção 2.3 do plano mestre.

**Princípio:** o Agente Maestro, o motor de fluxo (`etapas_fluxo`) e os agentes especializados **nunca sabem em qual canal estão conversando** — isso é responsabilidade de uma camada isolada.

- **Camada de Adaptadores de Canal** — um adaptador por canal (WhatsApp, Instagram, Messenger, Widget), que traduz o formato nativo de cada plataforma para um formato interno único (texto, mídia, remetente, canal, identificador externo) na entrada, e faz o caminho inverso na saída. Isola toda particularidade de canal (templates do WhatsApp, limites da API do Instagram, sessão do widget) do resto do sistema.
- **IDENTIDADES_CANAL** — tabela nova que resolve identidade multi-canal: liga um identificador específico de canal (número de WhatsApp, ID do Instagram, PSID do Messenger, sessão/cookie do widget) a uma única `pessoa`. Uma mesma Pessoa pode ter várias `identidades_canal` (uma por canal já usado) — evita cadastro duplicado quando a mesma pessoa usa canais diferentes ao longo do tempo.
  - Campos: `id`, `pessoa_id` (FK), `canal`, `identificador_externo`, `verificado` (boolean — relevante porque a confiabilidade da identidade varia MUITO por canal, ver nota abaixo), `created_at`
- **Resolução de Identidade** — antes do Agente Maestro processar qualquer mensagem, o sistema busca `identidades_canal` pelo par (canal, identificador_externo). Se encontrar, já sabe quem é a Pessoa (mesmo raciocínio de "checkpoint já respondido" que já usamos no script). Se não encontrar, trata como identidade nova a resolver.

**Nota sobre confiabilidade de identidade por canal:**
- **WhatsApp:** identificador é o número de telefone — confiável e já disponível de cara
- **Instagram/Messenger:** identificador é o ID da plataforma — confiável dentro da própria plataforma, mas não conecta automaticamente com telefone/e-mail
- **Widget do site:** o canal **menos confiável** — não tem identificador persistente até a pessoa se identificar (por isso os checkpoints de nome e e-mail que já desenhamos no script deixam de ser "só mais um passo" e viram a única forma de reconhecer a pessoa entre visitas nesse canal)

**Implicação para o checkpoint de WhatsApp (pendência já registrada na seção 8.10 do plano mestre):** vira condicional — dispara apenas quando `canal != whatsapp` **e** a Pessoa ainda não possui uma `identidade_canal` do tipo WhatsApp registrada.

### Extensibilidade — "contrato de adaptador" (novo, 11/08/2026)

Luiz apontou o Telegram como mais um canal possível — o que reforça o princípio de fundo: a lista de canais **não pode ser fechada** (WhatsApp, Instagram, Messenger, Widget hoje; Telegram ou qualquer outro amanhã). Para isso funcionar de verdade, todo adaptador de canal precisa cumprir o mesmo **contrato mínimo**, independente da plataforma:

- **Entrada:** traduzir o payload nativo do canal (webhook, polling, etc.) para o formato interno único (texto, mídia, remetente, canal, identificador_externo)
- **Saída:** traduzir uma mensagem do formato interno para o formato de envio nativo daquele canal (respeitando limitações específicas — ex.: WhatsApp exige template pra iniciar conversa fora da janela de 24h; Telegram e Widget não têm essa restrição)
- **Identidade:** informar qual é o identificador externo daquele canal, para alimentar `identidades_canal`
- **Registro:** o canal se cadastra numa tabela/config de "canais habilitados" — ativar um canal novo é adicionar um registro + implementar o adaptador, **nunca alterar o Agente Maestro, o motor de fluxo ou os agentes especializados**

Isso é o que garante que adicionar Telegram (ou qualquer canal futuro) seja um trabalho isolado e previsível, não um retrabalho na arquitetura central.

---

## RBAC — Nível único por enquanto (DECIDIDO em 11/08/2026)

Luiz definiu: por ora, um único nível de acesso — **ADMIN/MASTER**, com permissão total. Níveis mais granulares (Financeiro, Operacional, Relatórios Gerenciais) só entram quando esses módulos existirem de verdade — não faz sentido desenhar RBAC fino para módulos que ainda não foram especificados.

**USUARIOS_SISTEMA** — reaproveita o núcleo Pessoa/Papel em vez de duplicar identidade: um usuário do sistema é uma Pessoa (já cadastrada) que ganha credencial de acesso.
- `id`
- `pessoa_id` (FK, único — liga ao registro já existente em `pessoas`)
- `email` (login — cópia de conveniência, fonte de verdade é `auth.users.email`)
- `auth_user_id` (FK → `auth.users`, único) — **corrigido em 13/08/2026, migration 003**: login/senha/sessão passaram a ser geridos pelo **Supabase Auth** em vez de um `senha_hash` próprio (a ideia original nesta seção). Motivo: evitar reinventar hashing/reset de senha/sessão com pouca gente no time — Supabase Auth já resolve isso testado em produção.
- `nivel_acesso` (enum — hoje só `admin`, campo já pronto para crescer: `financeiro`, `operacional`, `relatorios`, etc.)
- `ativo`
- `ultimo_login_at`
- `created_at`, `updated_at`
- `cor_badge` (acrescentada na migration `20260816050000` — cor do badge/painel do atendente na Tela de Atendimento, paleta fechada de 7 cores, `check` constraint. Definida pelo admin em `/admin/atendentes`, não é escolha do próprio atendente — decisão revisada depois da primeira versão, que era self-service.)

## Valores Configuráveis — modelo de dados (DECIDIDO em 11/08/2026)

Cobre todos os valores/parâmetros que já marcamos como "configuráveis pelo admin" ao longo do levantamento (preço mínimo, taxa de seguro-garantia, fórmula de alto valor, faixas de preço, janela comercial, limite de escalonamento, etc.). Duas tabelas, porque os valores têm naturezas diferentes:

**CONFIGURACOES** — chave-valor genérico, para valores escalares (um número, texto ou booleano isolado):
- `id`
- `unidade_negocio_id` (FK, opcional — alguns valores são globais, outros por unidade de negócio)
- `produto_id` (FK, opcional — alguns valores são por produto, ex.: taxa do seguro-garantia é do Limpeza de Nome especificamente)
- `chave` (ex.: `limpanome_investimento_minimo_avista`, `limpanome_formula_alto_valor`, `followup_janela_comercial_inicio`)
- `valor` (`jsonb` — suporta número, texto ou estrutura, como o caso da fórmula de alto valor: `{"valor_fixo": 7680, "percentual": 0.015}`)
- `descricao` (**obrigatório preencher** — é o "para que serve" que Luiz pediu; junto com `COMMENT ON COLUMN`, cobre tanto quem olha o schema quanto quem olha os dados)
- `atualizado_por` (FK → `usuarios_sistema`, para auditoria de quem mudou o quê)
- `updated_at`

**PRECOS_POR_FAIXA** — tabela dedicada (não cabe bem em chave-valor, é estruturalmente tabular), realiza a tabela de preços que já preenchemos no script:
- `id`
- `produto_id` (FK)
- `faixa_min`, `faixa_max` (numeric — `faixa_max` nulo representa faixa aberta, tipo "acima de")
- `preco_cheio`, `preco_avista`
- `parcelas_boleto_qtd`, `parcelas_boleto_valor`
- `parcelas_cartao_max`
- `voucher_avista`, `voucher_parcelas_qtd`, `voucher_parcelas_valor`
- `ativo`
- `updated_at`

**Nota de design:** como as próprias faixas (não só os preços) precisam ser editáveis (requisito já registrado quando Luiz preencheu a tabela), `faixa_min`/`faixa_max` ficam como colunas editáveis normais — o admin edita a linha inteira (faixa + preços) pelo mesmo painel.

---

## Pendências deste desenho (a aprofundar)

- Definir a lista fechada (ou configurável) de `tipo_papel` — hoje sabemos de Lead, Cliente, Fornecedor, Parceiro/Afiliado; pode crescer
- ~~Definir se RBAC (controle de acesso) e log de auditoria vivem como tabelas próprias ligadas a Pessoa~~ ✅ Resolvido — `usuarios_sistema` liga a `pessoas`, nível único ADMIN/MASTER por enquanto
- Este é o núcleo — ainda faltam as entidades específicas de Jurídico (processos, contratos) e Financeiro (parcelas, comissões), que se conectam a este núcleo mas não foram desenhadas ainda
- ~~Detalhar o formato exato do "formato interno único" que a Camada de Adaptadores produz~~ ✅ Parcialmente resolvido (13/08/2026) — o formato de mensagem canal-agnóstica já existe e é usado pelo motor de fluxo (`src/lib/motor-fluxo/tipos.ts`, tipo `MensagemEtapa`). Falta ainda implementar os adaptadores de canal em si (WhatsApp é o primeiro, Fase 7) — o formato existe, quem traduz pra cada canal não.
