# Captura de detalhe de pagamento no fechamento — Design

**Status:** Validado com Luiz em 18/08/2026, por conversa direta (não teve rodada de mockup visual — é só bot de texto). Ainda não implementado. Prioridade: primeira frente do CRM, antes do Kanban (ver `docs/COORDENACAO_AGENTES_ARRUDACRED.md`, seção 3/4).

**Como chegou aqui:** Vendas (outro agente/módulo, sub-frente Contrato) registrou um pedido no quadro de coordenação — a sub-frente de Contrato precisa de forma de pagamento detalhada, quantidade de parcelas, valor de cada parcela e data de vencimento de cada uma pra gerar contrato + tabela de vencimentos. Hoje o bot (`fluxo-limpeza-nome.ts`) só salva `forma_pagamento: "avista" | "parcelado"` em `conversas.dados` — nada estruturado. Enquanto isso não sai, Vendas construiu uma tela de "Fechamento de Venda" como solução paliativa.

---

## 1. Regra de negócio (definida pelo Luiz, 18/08/2026)

Considerando a data de hoje como exemplo de referência (18/08/2026):

- **Forma de pagamento:** só duas opções — **Boleto/Pix** (tratadas como uma coisa só, sem distinguir qual das duas) ou **Cartão**. Padrão assumido: Boleto/Pix.
- **Vencimento da 1ª parcela:** por padrão é a **data da venda** (hoje). O lead pode pedir pra adiar, **no máximo +15 dias** a partir de hoje. Passou disso, não é possível.
- **Vencimento das parcelas seguintes (2ª em diante):** caem sempre num **dia-âncora fixo do mês — 01, 10 ou 20**. Padrão sugerido: dia 10. O lead pode pedir 01 ou 20 no lugar; não existe uma 4ª opção.
- **A 2ª parcela vence no dia-âncora escolhido do mês *seguinte ao mês da 1ª parcela*** — não do mês seguinte a hoje. Se a 1ª parcela foi adiada pra outro mês (dentro do limite de 15 dias), a contagem parte do mês em que ela caiu, não do mês da venda.
- Da 2ª parcela em diante, **todas caem no mesmo dia-âncora**, avançando um mês por parcela (rolando o ano quando necessário — ex. dezembro → janeiro).
- **Quantidade de parcelas e valor de cada uma:** já vêm do cálculo de precificação existente (`combinarFaixasPacote`/`combinarParcelas`/`formatarParcelas`, pacote Fase 4 de 17/08/2026) — não é uma decisão nova, é reaproveitamento.

**Exemplo (venda fechada em 18/08/2026, 6x, âncora dia 10):**

```
18/08/26 - R$ XX   (1ª parcela = data da venda)
10/09/26 - R$ XX   (mês seguinte ao da 1ª)
10/10/26 - R$ XX
10/11/26 - R$ XX
10/12/26 - R$ XX
10/01/27 - R$ XX   (rola o ano)
```

---

## 2. Interação com o lead — mensagem de confirmação + negociação natural

**Não é uma sequência de perguntas fechadas.** Depois que o lead escolhe à vista/parcelado (pergunta que já existe, sem mudança), a Malala **já assume os padrões** (Boleto/Pix, 1ª parcela hoje, âncora dia 10) e manda direto uma mensagem de confirmação com tudo calculado:

```
Valor do Contrato:
R$ XX

Pagamento:
À Vista no Boleto/Pix

Vencimento:
HOJE (18/08)
```

ou, se parcelado:

```
Valor do Contrato: R$ XX

Pagamento:
em 6 vezes - Parcelado no Boleto/Pix

Valor da Parcela:
R$ XX

Vencimentos:
18/08/26 - R$ XX
10/09/26 - R$ XX
10/10/26 - R$ XX
10/11/26 - R$ XX
10/12/26 - R$ XX
10/01/27 - R$ XX
```

**Se o lead pedir pra mudar algo** (forma de pagamento, data da 1ª parcela, dia-âncora): a Malala **conversa** — pode ser várias trocas de mensagem, explicando o que é possível dentro do que ele pediu (ex.: "posso adiar até 15 dias — hoje já são 10, dá pra ir até o dia X" ou "só temos os dias 01, 10 ou 20 como opção"), negociando de forma natural, **não robótica**. Só quando a negociação chegar a um resultado válido, a Malala reenvia a mensagem de confirmação atualizada, e volta a esperar "confirmo"/objeção.

**Quando o lead confirmar:** segue pro próximo passo já existente do fluxo (dados pra emissão do contrato, `ln_passo17a`), com o detalhe completo salvo.

---

## 3. Arquitetura — reaproveita o padrão de interpretador especializado já existente

O motor já tem esse formato pra checkpoints que precisam de negociação em várias mensagens, não um menu fechado: `tipo_resposta: "lista_documentos" | "faixas_documentos"` (`tipos.ts`, usados na Fase 2 de captura de documentos, 17/08/2026) — interpretador especializado com **3 saídas** (completo / parcial-com-esclarecimento / não-reconhecido), em vez do `InterpretadorIA` genérico binário. Este design usa o mesmo formato:

- **Novo `tipo_resposta: "negociacao_pagamento"`** em `tipos.ts`, com seu próprio interpretador especializado (arquivo novo, ao lado de `interpretacao-ia.ts` — nome sugerido `interpretacao-ia-pagamento.ts`, seguindo o padrão de arquivo dedicado por especialidade já usado no projeto).
- **Estado do checkpoint:** substitui o `ln_passo16_1` atual (hoje pergunta "qual a melhor data" em texto livre e sem validação) — vira o checkpoint que monta e reenvia a confirmação. Não precisa de checkpoint novo separado pra forma de pagamento nem pra âncora — tudo dentro deste único checkpoint em loop, no mesmo espírito do que já foi feito nos passos `ln_passo4`/`ln_passo6` (Fase 2e, reformulados pra loop).
- **Entrada do interpretador:** mensagem do lead + estado atual da negociação (`detalhe_pagamento` provisório, já com os padrões aplicados na primeira vez que o checkpoint roda).
- **Saída do interpretador:**
  - `confirmado`: lead aceitou o que está na tela — motor grava `detalhe_pagamento` final em `dados` e segue pra `ln_passo17a`.
  - `ajuste_valido`: lead pediu uma mudança dentro das regras (forma, data ≤15 dias, âncora 01/10/20) — motor recalcula parcelas/vencimentos, monta nova mensagem de confirmação, mensagem de retomada custom explica a mudança feita, permanece no checkpoint.
  - `negociando`: lead pediu algo fora das regras ou ambíguo — a IA gera uma mensagem explicando o limite/opções (não uma mensagem fixa), permanece no checkpoint. Sem contador de tentativas (`opcional_apos_tentativas`) — não faz sentido desistir de fechar uma venda por causa de negociação de data.
- **Cálculo de vencimentos:** função pura nova (testável isolada, TDD) que recebe data da 1ª parcela + dia-âncora + quantidade de parcelas e devolve o array de vencimentos, aplicando a regra da seção 1 (mês seguinte ao da 1ª parcela, rolando ano). Reaproveita `combinarParcelas`/`formatarParcelas` já existentes pra quantidade/valor — só adiciona a coluna de datas que hoje não existe.

## 4. Persistência

**Correção sobre a primeira versão deste documento:** `conversas.dados` é jsonb no banco, mas o motor nunca escreve objeto aninhado nele — o tipo `DadosConversa = Record<string, string>` (`tipos.ts`) só aceita string por chave. O padrão já estabelecido pra listas (`documentos_tipos`/`documentos_valores`, CSV em campos paralelos, mesma ordem/tamanho — ver `oportunidade-documentos.ts`) é o que este design segue, não um objeto `detalhe_pagamento` novo:

| Campo em `dados` | Formato | Exemplo |
|---|---|---|
| `forma_pagamento` | `"avista"` \| `"parcelado"` (já existe, sem mudança) | `"parcelado"` |
| `forma_pagamento_detalhe` | `"boleto_pix"` \| `"cartao"` (novo) | `"boleto_pix"` |
| `data_primeira_parcela` | ISO date — **reaproveita o campo que já existe**, mas passa a guardar data normalizada/validada em vez de texto livre cru | `"2026-08-18"` |
| `dia_ancora_parcelas` | `"1"` \| `"10"` \| `"20"` (novo, só quando `parcelado`) | `"10"` |
| `parcelas_valores` | CSV, mesma ordem/tamanho de `parcelas_vencimentos` (novo) | `"500.00,500.00,500.00"` |
| `parcelas_vencimentos` | CSV de datas ISO, mesma ordem/tamanho de `parcelas_valores` (novo) | `"2026-08-18,2026-09-10,2026-10-10"` |

Sem migration — todos os campos cabem no jsonb genérico já existente. Se depois o Vendas precisar consultar isso via SQL de forma mais pesada (relatório, filtro), migra pra tabela própria (mesmo caminho que `oportunidade_documentos` já percorreu).

## 5. Testes

TDD, seguindo o padrão do resto do motor (`motor-followup.test.ts`, `engine.test.ts`):
- Função pura de cálculo de vencimentos: 1ª parcela hoje, 1ª parcela adiada dentro do limite, tentativa de adiar acima de 15 dias (rejeitada), troca de âncora 01/10/20, rolagem de ano (dezembro → janeiro), parcela única (à vista).
- Interpretador especializado: mock da chamada de IA (mesmo padrão já usado nos testes de `lista_documentos`/`faixas_documentos`) cobrindo as 3 saídas.
- Sem teste unitário pra render de mensagem (é I/O de apresentação) — verificação manual no simulador, mesmo critério já usado no resto do projeto.

## 6. Fora de escopo deste design

- Registrar/cobrar pagamento de verdade (isso é Asaas, integração do Vendas — aqui só capturamos a intenção pra gerar contrato).
- Tabela dedicada de parcelas (fica pra quando/se Vendas precisar consultar via SQL).
- Mudar a pergunta à vista/parcelado em si (`ln_passo15_normal`/`ln_passo15_selfservice`) — continua igual.
