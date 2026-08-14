# Kanban Comercial — Funil de Oportunidade (Limpeza de Nome Serasa/SPC)
**Status:** Estrutura de 2 níveis (etapa/subetapa) definida com Luiz em 11/08/2026 — modelo-base para os demais produtos.

---

## Estrutura de etapas e subetapas

| Etapa | Subetapa | Checkpoint de entrada | Passo do script correspondente |
|---|---|---|---|
| **1. Novo Lead** | 1.1 Triagem | Primeira mensagem recebida de número não reconhecido; produto ainda não identificado | Parte 1 → Parte 2 |
| | 1.2 Qualificação | Produto identificado = Limpeza de Nome; CPF/CNPJ (ou lista) capturado | Parte 3, Passos 1-5 |
| **2. Negociação** | 2.1 Faixa de Dívida | Faixa de valor da restrição capturada (com refinamentos, se houver) | Passos 6-7 |
| | 2.2 Envio Proposta | Bloco de proposta disparado (varia se ≤ ou > R$ 500 mil) | Passo 15 (ou desvio para call, se alto valor) |
| | 2.3 Negociação / Dúvidas | Lead engajado em FAQ e/ou negociação de data de pagamento, ainda sem forma de pagamento definida | Passos 16, 16.1 |
| **3. Fechamento** | 3.1 Dados para o Contrato | Forma de pagamento confirmada; coleta de dados pessoais/documentos em andamento | Passos 17-18 |
| | 3.2 Assinatura Digital | PDF gerado e enviado à Assinafy; aguardando assinatura(s) | Passos 19-20 |
| | 3.3 Pagamento | Contrato assinado (webhook Assinafy); parcelas geradas, link enviado, aguardando confirmação Asaas | Passos 21-22 |
| **4. Conclusão** | 4.1 Oportunidade Ganha | Pagamento confirmado (webhook Asaas) | Passo 23 |
| | 4.2 Oportunidade Perdida | Resposta negativa explícita, fim da agenda de follow-up sem resposta, ou lead optou por negociar dívida direto | Regra geral de follow-up / Passo 7 (baixo valor) |

**Visão de tela sugerida:** o quadro Kanban opera nas 4 macro-etapas por padrão (visão executiva rápida), com possibilidade de expandir cada uma nas subetapas (visão operacional detalhada) — a definir na fase de design de interface.

---

## Previsibilidade de receita — DECIDIDO em 11/08/2026

A partir da subetapa **2.1 (Faixa de Dívida)**, já existe uma estimativa de valor de negócio (a faixa de restrição já permite estimar o valor da proposta). A partir daqui:

- **Cada card exibe o valor estimado** da oportunidade (proposta estimada, com base na faixa capturada — ou, depois de 2.2, o valor real da proposta enviada)
- **Cada coluna/subetapa exibe, no topo:** soma total de valor das oportunidades ali + quantidade de oportunidades
- Isso vale a partir de 2.1 em diante (1.1 e 1.2 ainda não têm valor estimável)

**Dependência já registrada — RESOLVIDA em 11/08/2026:** o valor exibido depende da **tabela de preço por faixa**, já preenchida com valores reais em `SCRIPT_LIMPANOME_SERASA_SPC.md` (seção "Estrutura da tabela de preços por faixa"). Cada card já pode calcular o valor estimado a partir dela.

**Fórmula para leads de alto valor — DECIDIDO em 11/08/2026:** para oportunidades acima de R$ 500 mil, o valor de previsibilidade de receita exibido no card é calculado por fórmula: **R$ 7.680 + 1,5% do valor das restrições informado pelo lead**. Tanto o valor fixo (R$ 7.680) quanto o percentual (1,5%) precisam ser **campos configuráveis pelo admin do sistema** — mesma lógica já aplicada aos demais valores monetários do sistema (preço mínimo, taxa do seguro-garantia, tabela de preço por faixa).

---

## Regras visuais do quadro Kanban

- **Ordenação dos cards dentro de cada subetapa:** por ordem de chegada, **mais recentes no topo**.
- **Indicador de "card parado há muito tempo" (aging):** sinalizador de cor no card conforme o tempo que ele está naquela subetapa sem avançar (padrão tipo farol — verde/amarelo/vermelho, faixas de tempo a definir com o admin).
- **Alto valor:** badge/destaque visual no card (não é subetapa própria).
- **Cards sob atenção de supervisor:** exibidos num bloco/quadro separado, destacado visualmente, no **topo da subetapa** onde já estariam — acima dos cards conduzidos normalmente pela Malala.
- **Valor e contagem:** soma de valor + quantidade de oportunidades no topo de cada subetapa, a partir de 2.1 (ver seção acima).

**Implicação de arquitetura:** o card carrega, além dos dados de negócio: tempo na subetapa atual (farol de aging), flag "sob supervisor", flag "alto valor", e valor estimado/real da oportunidade (a partir de 2.1). Tudo isso é requisito de UI para a fase de desenho de telas do módulo Comercial.

---

## Regra de estagnação com engajamento (subetapa 2.3 — Negociação/Dúvidas)

**Problema identificado:** a subetapa 2.3 já tem cobertura para o caso de **silêncio** (agenda padrão de follow-up + timeout → Perdida). O que faltava cobrir era o padrão oposto: lead **engajado, fazendo pergunta atrás de pergunta (FAQ)**, mas sem nunca avançar pro checkpoint de forma de pagamento — "atividade sem avanço".

**Decisão fechada em 11/08/2026:**
- **Limite:** 5 perguntas/interações de FAQ dentro da subetapa 2.3 sem avançar o checkpoint de pagamento
- **Comportamento ao bater o limite:** Malala tenta um **fechamento ativo** primeiro ("vi que você tem bastante interesse, posso te ajudar a decidir agora entre à vista ou parcelado?"); **só escala para supervisor se esse fechamento ativo também não resultar em avanço**
- **Motivo de escalonamento usado neste caso:** distinto do escalonamento por erro/grosseria — sinaliza como "lead engajado sem fechamento" (oportunidade quente para o supervisor, não problema)
- **Pendente (não bloqueante):** se esse contador reseta quando o lead dá sinal de avanço (ex.: pergunta sobre como assinar) mesmo sem responder formalmente o checkpoint — pode ficar pra quando o comportamento for testado na prática

---

## Motivos de "Oportunidade Perdida" (lista aberta, a crescer)
- `LEAD DESISTIU`
- `LEAD PAROU DE RESPONDER`
- `LEAD OPTOU POR NEGOCIAR DÍVIDA DIRETAMENTE`
- *(mais motivos a adicionar conforme a operação real trouxer casos)*

---

## Reaproveitamento para outros produtos
Esta estrutura (4 etapas / subetapas) é o **modelo-base** para os outros produtos do menu (Score, BACEN/SCR/CCF, Jusbrasil/Escavador, Conta Protegida, Consórcio, Crédito, Outro assunto). As etapas 1 (Novo Lead) e 4 (Conclusão) tendem a se repetir quase iguais entre produtos; as etapas 2 (Negociação) e 3 (Fechamento) tendem a variar mais, principalmente a qualificação de valor (2.1), que é específica de cada produto.
